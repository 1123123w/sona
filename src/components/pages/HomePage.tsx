import { useState } from 'react'
import '@/styles/HomePage.css'
import '@/styles/SettingsPage.css'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { useI18n } from '@/lib/i18n'
import sonaIcon from '@/../assets/Champie_Sona_profileicon.png'

export function HomePage() {
  const { t } = useI18n()
  const [searchRiotId, setSearchRiotId] = useState('')
  const [searchError, setSearchError] = useState('')
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [matchModalPuuid, setMatchModalPuuid] = useState('')
  const [matchModalName, setMatchModalName] = useState('')
  const [replayGameId, setReplayGameId] = useState('')
  const [replayState, setReplayState] = useState<'idle' | 'downloading' | 'ready' | 'launching' | 'error'>('idle')

  const handleSearchMatch = async () => {
    const parts = searchRiotId.trim().split('#')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setSearchError(t('home.matchFormatError'))
      return
    }

    setSearchError('')
    try {
      const summoner = await lcu.getSummonerByRiotId(parts[0], parts[1])
      if (!summoner?.puuid) {
        setSearchError(t('home.matchNotFound'))
        return
      }
      setMatchModalPuuid(summoner.puuid)
      setMatchModalName(`${parts[0]}#${parts[1]}`)
      setMatchModalOpen(true)
    } catch {
      setSearchError(t('home.matchFailed'))
    }
  }

  const handleWatchReplay = async () => {
    const id = Number(replayGameId)
    if (!id) return

    setReplayState('downloading')
    try {
      const metaRes = await fetch(`/lol-replays/v1/metadata/${id}`)
      if (!metaRes.ok) {
        logger.error('[Replay] 获取元数据失败:', metaRes.status)
        setReplayState('error')
        return
      }
      const meta = await metaRes.json() as { state: string; downloadProgress: number; gameId: number }

      if (meta.state === 'watch') {
        setReplayState('launching')
        const res = await fetch(`/lol-replays/v1/rofls/${id}/watch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
        })
        setReplayState(res.ok ? 'ready' : 'error')
        if (res.ok) logger.info('[Replay] 开始播放 #%d ✓', id)
        else logger.error('[Replay] 播放失败:', await res.text())
        return
      }

      if (meta.state !== 'downloading') {
        await fetch(`/lol-replays/v1/rofls/${id}/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
        })
      }

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const checkRes = await fetch(`/lol-replays/v1/metadata/${id}`)
        if (!checkRes.ok) continue
        const checkMeta = await checkRes.json() as { state: string; downloadProgress: number }
        logger.info('[Replay] 下载中... %d%%', checkMeta.downloadProgress)

        if (checkMeta.state === 'watch') {
          setReplayState('launching')
          const res = await fetch(`/lol-replays/v1/rofls/${id}/watch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ componentType: 'replay', contextData: 'match-history' }),
          })
          setReplayState(res.ok ? 'ready' : 'error')
          if (res.ok) logger.info('[Replay] 下载完成，开始播放 #%d ✓', id)
          else logger.error('[Replay] 播放失败:', await res.text())
          return
        }
      }
      logger.warn('[Replay] 等待超时')
      setReplayState('error')
    } catch (err) {
      logger.error('[Replay] 异常:', err)
      setReplayState('error')
    }
  }

  return (
    <div className="sonaenhance-home">
      {/* SONA title */}
      <h1 className="sonaenhance-home-brand">
        <span className="sonaenhance-home-brand-text">SONA-E</span>
      </h1>

      {/* Avatar */}
      <div className="sonaenhance-home-avatar-wrap">
        <div className="sonaenhance-home-avatar-glow" />
        <img
          className="sonaenhance-home-avatar"
          src={sonaIcon}
          alt="Sona-E"
          draggable={false}
        />
      </div>

      {/* Welcome copy */}
      <div className="sonaenhance-home-welcome">
        <h2 className="sonaenhance-home-heading">{t('home.welcome')}</h2>
        <p className="sonaenhance-home-subtitle">
          {t('home.subtitle')}
        </p>
      </div>

      <section className="sonaenhance-home-search">
        <p className="sonaenhance-home-search-title">{t('home.matchTitle')}</p>
        <div className="sonaenhance-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={searchRiotId}
              onChange={(v) => { setSearchRiotId(v); setSearchError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchMatch() }}
              placeholder={t('home.matchPlaceholder')}
            />
          </div>
          <SonaButton variant="primary" onClick={handleSearchMatch}>
            {t('home.search')}
          </SonaButton>
        </div>
        {searchError && <p className="sonaenhance-home-search-error">{searchError}</p>}
      </section>

      <section className="sonaenhance-home-search">
        <p className="sonaenhance-home-search-title">{t('home.replayTitle')}</p>
        <p className="sonaenhance-home-search-hint">{t('home.replayHint')}</p>
        <div className="sonaenhance-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SonaInput
              value={replayGameId}
              onChange={(v) => { setReplayGameId(v); setReplayState('idle') }}
              placeholder={t('home.replayPlaceholder')}
            />
          </div>
          <SonaButton onClick={handleWatchReplay}>
            {{ idle: t('home.replayIdle'), downloading: t('home.replayDownloading'), ready: t('home.replayReady'), launching: t('home.replayLaunching'), error: t('home.replayError') }[replayState]}
          </SonaButton>
        </div>
      </section>

      <MatchHistoryModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        puuid={matchModalPuuid}
        playerName={matchModalName}
      />

      {/* Sona quote */}
      <p className="sonaenhance-home-quote">
        {t('home.quote')}
        <br />
        &nbsp;{t('home.quoteAuthor')}
      </p>
    </div>
  )
}
