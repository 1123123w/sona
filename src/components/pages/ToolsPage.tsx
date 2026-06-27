import { useState, useEffect, useRef } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { searchChampions, getChampionById, getPlayableQueues, type ChampionInfo } from '@/lib/assets'
import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import { store } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import '@/styles/SettingsPage.css'

const toolSections = [
  { id: 'champ-select', labelKey: 'tools.nav.champSelect' },
  { id: 'opgg', labelKey: 'tools.nav.opgg' },
  { id: 'automation', labelKey: 'tools.nav.automation' },
  { id: 'social', labelKey: 'tools.nav.social' },
]

function scrollToToolSection(id: string) {
  document.getElementById(`tool-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function ChampionPriorityCards({
  championIds,
  emptyText,
  onRemove,
  removeLabel,
  championFallback,
}: {
  championIds: number[]
  emptyText: string
  onRemove: (championId: number) => void
  removeLabel: string
  championFallback: (championId: number) => string
}) {
  if (championIds.length === 0) {
    return <p className="sonaenhance-subtitle" style={{ margin: 0 }}>{emptyText}</p>
  }

  return (
    <div className="sonaenhance-champ-priority-list">
      {championIds.map((championId, index) => {
        const champion = getChampionById(championId)
        return (
          <div className="sonaenhance-champ-priority-card" key={championId}>
            <span className="sonaenhance-champ-priority-index">{index + 1}</span>
            <img
              className="sonaenhance-champ-priority-icon"
              src={`/lol-game-data/assets/v1/champion-icons/${championId}.png`}
              alt=""
            />
            <span className="sonaenhance-champ-priority-name">
              {champion ? `${champion.title} ${champion.name}` : championFallback(championId)}
            </span>
            <button
              className="sonaenhance-champ-priority-remove"
              type="button"
              onClick={() => onRemove(championId)}
              aria-label={removeLabel}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ToolsPage() {
  const { t } = useI18n()
  const [autoAccept, setAutoAccept] = useState(store.get('autoAcceptMatch'))
  // Keep delay inputs as strings so partial edits are not pushed back to the store.
  const [autoAcceptDelayMin, setAutoAcceptDelayMin] = useState(String(store.get('autoAcceptDelayMin')))
  const [autoAcceptDelayMax, setAutoAcceptDelayMax] = useState(String(store.get('autoAcceptDelayMax')))
  const [allowDeclineAfterAccept, setAllowDeclineAfterAccept] = useState(store.get('allowDeclineAfterAccept'))
  const [restReminderEnabled, setRestReminderEnabled] = useState(store.get('restReminderEnabled'))
  const [restReminderAcceptLimit, setRestReminderAcceptLimit] = useState(String(store.get('restReminderAcceptLimit')))
  const [unlockStatus, setUnlockStatus] = useState(store.get('unlockStatus'))
  const [unlockAvailability, setUnlockAvailability] = useState(store.get('unlockAvailability'))
  const [unlockChromas, setUnlockChromas] = useState(store.get('unlockChromas'))
  const [benchNoCooldown, setBenchNoCooldown] = useState(store.get('benchNoCooldown'))
  const [champSelectAssist, setChampSelectAssist] = useState(store.get('champSelectAssist'))
  const [opggBuildRecommendation, setOpggBuildRecommendation] = useState(store.get('opggBuildRecommendation'))
  const [opggAutoApplyRunes, setOpggAutoApplyRunes] = useState(store.get('opggAutoApplyRunes'))
  const [champSelectCounterRecommendation, setChampSelectCounterRecommendation] = useState(store.get('champSelectCounterRecommendation'))
  const [smartBuildRecommendation, setSmartBuildRecommendation] = useState(store.get('smartBuildRecommendation'))
  const [balanceBuffTooltip, setBalanceBuffTooltip] = useState(store.get('balanceBuffTooltip'))
  const [champSelectQuitButton, setChampSelectQuitButton] = useState(store.get('champSelectQuitButton'))
  const [gameAnalysisPopup, setGameAnalysisPopup] = useState(store.get('gameAnalysisPopup'))
  const [autoReturnToLobby, setAutoReturnToLobby] = useState(store.get('autoReturnToLobby'))
  const [autoReturnMode, setAutoReturnMode] = useState(store.get('autoReturnMode'))
  const [analyzeTeamPower, setAnalyzeTeamPower] = useState(store.get('analyzeTeamPower'))
  const [analyzeTeamPowerMsgType, setAnalyzeTeamPowerMsgType] = useState(store.get('analyzeTeamPowerMsgType'))
  const [analyzeTeamPowerFetchCount, setAnalyzeTeamPowerFetchCount] = useState(store.get('analyzeTeamPowerFetchCount'))
  const [champSelectAssistFetchCount, setChampSelectAssistFetchCount] = useState(store.get('champSelectAssistFetchCount'))
  const [gameAnalysisFetchCount, setGameAnalysisFetchCount] = useState(store.get('gameAnalysisFetchCount'))
  const [sideIndicator, setSideIndicator] = useState(store.get('sideIndicator'))
  const [sideIndicatorMsgType, setSideIndicatorMsgType] = useState(store.get('sideIndicatorMsgType'))
  const [friendSmartGroup, setFriendSmartGroup] = useState(store.get('friendSmartGroup'))
  const [enhancedFriendGameStatus, setEnhancedFriendGameStatus] = useState(store.get('enhancedFriendGameStatus'))
  const [lobbyEnhancement, setLobbyEnhancement] = useState(store.get('lobbyEnhancement'))
  const [lobbyEnhancementFetchCount, setLobbyEnhancementFetchCount] = useState(store.get('lobbyEnhancementFetchCount'))
  const [hideEsportsPopup, setHideEsportsPopup] = useState(store.get('hideEsportsPopup'))
  const [quickLobbyMode, setQuickLobbyMode] = useState(store.get('quickLobbyMode'))
  const [quickLobbyQueueId, setQuickLobbyQueueId] = useState(store.get('quickLobbyQueueId'))
  const [quickLobbyQueueOptions, setQuickLobbyQueueOptions] = useState<{ value: string; label: string }[]>([])
  const [autoHonor, setAutoHonor] = useState(store.get('autoHonor'))
  const [autoLockChampion, setAutoLockChampion] = useState(store.get('autoLockChampion'))
  const [autoLockChampionIds, setAutoLockChampionIds] = useState(store.get('autoLockChampionIds'))
  const [champSearchText, setChampSearchText] = useState('')
  const [champSuggestions, setChampSuggestions] = useState<ChampionInfo[]>([])
  const [showChampSuggestions, setShowChampSuggestions] = useState(false)
  const [autoLockInstant, setAutoLockInstant] = useState(store.get('autoLockInstant'))
  const champSuggestRef = useRef<HTMLDivElement>(null)
  const [autoBanChampion, setAutoBanChampion] = useState(store.get('autoBanChampion'))
  const [autoBanChampionIds, setAutoBanChampionIds] = useState(store.get('autoBanChampionIds'))
  const [banChampSearchText, setBanChampSearchText] = useState('')
  const [banChampSuggestions, setBanChampSuggestions] = useState<ChampionInfo[]>([])
  const [showBanChampSuggestions, setShowBanChampSuggestions] = useState(false)
  const banChampSuggestRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const unsubs = [
      store.onChange('autoAcceptMatch', setAutoAccept),
      store.onChange('autoAcceptDelayMin', (v) => setAutoAcceptDelayMin(String(v))),
      store.onChange('autoAcceptDelayMax', (v) => setAutoAcceptDelayMax(String(v))),
      store.onChange('allowDeclineAfterAccept', setAllowDeclineAfterAccept),
      store.onChange('restReminderEnabled', setRestReminderEnabled),
      store.onChange('restReminderAcceptLimit', (v) => setRestReminderAcceptLimit(String(v))),
      store.onChange('unlockStatus', setUnlockStatus),
      store.onChange('unlockAvailability', setUnlockAvailability),
      store.onChange('unlockChromas', setUnlockChromas),
      store.onChange('benchNoCooldown', setBenchNoCooldown),
      store.onChange('champSelectAssist', setChampSelectAssist),
      store.onChange('opggBuildRecommendation', setOpggBuildRecommendation),
      store.onChange('opggAutoApplyRunes', setOpggAutoApplyRunes),
      store.onChange('champSelectCounterRecommendation', setChampSelectCounterRecommendation),
      store.onChange('smartBuildRecommendation', setSmartBuildRecommendation),
      store.onChange('balanceBuffTooltip', setBalanceBuffTooltip),
      store.onChange('champSelectQuitButton', setChampSelectQuitButton),
      store.onChange('gameAnalysisPopup', setGameAnalysisPopup),
      store.onChange('autoReturnToLobby', setAutoReturnToLobby),
      store.onChange('autoReturnMode', setAutoReturnMode),
      store.onChange('analyzeTeamPower', setAnalyzeTeamPower),
      store.onChange('analyzeTeamPowerFetchCount', setAnalyzeTeamPowerFetchCount),
      store.onChange('champSelectAssistFetchCount', setChampSelectAssistFetchCount),
      store.onChange('gameAnalysisFetchCount', setGameAnalysisFetchCount),
      store.onChange('sideIndicator', setSideIndicator),
      store.onChange('friendSmartGroup', setFriendSmartGroup),
      store.onChange('enhancedFriendGameStatus', setEnhancedFriendGameStatus),
      store.onChange('lobbyEnhancement', setLobbyEnhancement),
      store.onChange('lobbyEnhancementFetchCount', setLobbyEnhancementFetchCount),
      store.onChange('hideEsportsPopup', setHideEsportsPopup),
      store.onChange('quickLobbyMode', setQuickLobbyMode),
      store.onChange('quickLobbyQueueId', setQuickLobbyQueueId),
      store.onChange('autoHonor', setAutoHonor),
      store.onChange('autoLockChampion', setAutoLockChampion),
      store.onChange('autoLockChampionIds', setAutoLockChampionIds),
      store.onChange('autoBanChampion', setAutoBanChampion),
      store.onChange('autoBanChampionIds', setAutoBanChampionIds),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    const loadQueues = () => {
      const queues = getPlayableQueues()
      if (queues.length === 0) return false
      setQuickLobbyQueueOptions(queues.map((queue) => ({
        value: String(queue.id),
        label: queue.name,
      })))
      return true
    }

    if (loadQueues()) return
    const timer = window.setInterval(() => {
      if (loadQueues()) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Close champion suggestions when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (champSuggestRef.current && !champSuggestRef.current.contains(e.target as Node)) {
        setShowChampSuggestions(false)
      }
      if (banChampSuggestRef.current && !banChampSuggestRef.current.contains(e.target as Node)) {
        setShowBanChampSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])


  const addAutoLockChampion = (champion: ChampionInfo) => {
    if (autoLockChampionIds.includes(champion.id)) {
      setChampSearchText('')
      setShowChampSuggestions(false)
      return
    }

    const next = [...autoLockChampionIds, champion.id]
    setAutoLockChampionIds(next)
    store.set('autoLockChampionIds', next)
    setChampSearchText('')
    setShowChampSuggestions(false)
    logger.info('[AutoLock] 已加入目标英雄队列: %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeAutoLockChampion = (championId: number) => {
    const next = autoLockChampionIds.filter((id) => id !== championId)
    setAutoLockChampionIds(next)
    store.set('autoLockChampionIds', next)
  }

  const addAutoBanChampion = (champion: ChampionInfo) => {
    if (autoBanChampionIds.includes(champion.id)) {
      setBanChampSearchText('')
      setShowBanChampSuggestions(false)
      return
    }

    const next = [...autoBanChampionIds, champion.id]
    setAutoBanChampionIds(next)
    store.set('autoBanChampionIds', next)
    setBanChampSearchText('')
    setShowBanChampSuggestions(false)
    logger.info('[AutoBan] 已加入目标英雄队列: %s %s (ID: %d)', champion.title, champion.name, champion.id)
  }

  const removeAutoBanChampion = (championId: number) => {
    const next = autoBanChampionIds.filter((id) => id !== championId)
    setAutoBanChampionIds(next)
    store.set('autoBanChampionIds', next)
  }

  return (
    <div className="sonaenhance-settings">
      <h2 className="sonaenhance-settings-title">{t('tools.title')}</h2>

      <div className="sonaenhance-tool-nav">
        {toolSections.map((section) => (
          <button key={section.id} type="button" onClick={() => scrollToToolSection(section.id)}>
            {t(section.labelKey)}
          </button>
        ))}
      </div>

      <section id="tool-section-champ-select" className="sonaenhance-tool-section">
      <SettingGroup title={t('tools.nav.champSelect')}>
        <SettingCard
          title={t('tools.autoAccept.title')}
          description={t('tools.autoAccept.desc')}
        >
          <SonaSwitch
            checked={autoAccept}
            onChange={(v) => { setAutoAccept(v); store.set('autoAcceptMatch', v) }}
          />
        </SettingCard>
        {autoAccept && (
          <SettingCard
            title={t('tools.autoAcceptDelay.title')}
            description={t('tools.autoAcceptDelay.desc')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 80 }}>
                <SonaInput
                  value={autoAcceptDelayMin}
                  onChange={(v) => {
                    // Accept integer milliseconds only.
                    const cleaned = v.replace(/[^\d]/g, '')
                    setAutoAcceptDelayMin(cleaned)
                    const n = parseInt(cleaned, 10)
                    store.set('autoAcceptDelayMin', Number.isFinite(n) ? n : 0)
                  }}
                  placeholder={t('tools.min')}
                />
              </div>
              <span style={{ color: '#a09b8c', fontSize: 13 }}>—</span>
              <div style={{ width: 80 }}>
                <SonaInput
                  value={autoAcceptDelayMax}
                  onChange={(v) => {
                    const cleaned = v.replace(/[^\d]/g, '')
                    setAutoAcceptDelayMax(cleaned)
                    const n = parseInt(cleaned, 10)
                    store.set('autoAcceptDelayMax', Number.isFinite(n) ? n : 0)
                  }}
                  placeholder={t('tools.max')}
                />
              </div>
              <span style={{ color: '#a09b8c', fontSize: 13 }}>{t('tools.ms')}</span>
            </div>
          </SettingCard>
        )}
        <SettingCard
          title={t('tools.allowDeclineAfterAccept.title')}
          description={t('tools.allowDeclineAfterAccept.desc')}
        >
          <SonaSwitch
            checked={allowDeclineAfterAccept}
            onChange={(v) => { setAllowDeclineAfterAccept(v); store.set('allowDeclineAfterAccept', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.quickLobby.title')}
          description={t('tools.quickLobby.desc')}
        >
          <SonaSelect
            value={String(quickLobbyQueueId)}
            onChange={(value) => {
              const queueId = Number(value)
              setQuickLobbyQueueId(queueId)
              store.set('quickLobbyQueueId', queueId)
            }}
            options={quickLobbyQueueOptions}
            placeholder={t('tools.quickLobby.placeholder')}
          />
          <SonaSwitch
            checked={quickLobbyMode}
            onChange={(v) => { setQuickLobbyMode(v); store.set('quickLobbyMode', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.restReminder.title')}
          description={t('tools.restReminder.desc')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80 }}>
              <SonaInput
                value={restReminderAcceptLimit}
                onChange={(v) => {
                  const cleaned = v.replace(/[^\d]/g, '')
                  setRestReminderAcceptLimit(cleaned)
                  const n = parseInt(cleaned, 10)
                  store.set('restReminderAcceptLimit', Number.isFinite(n) && n > 0 ? n : 1)
                }}
                placeholder={t('tools.restReminder.limitPlaceholder')}
              />
            </div>
            <span style={{ color: '#a09b8c', fontSize: 13 }}>{t('tools.restReminder.unit')}</span>
            <SonaSwitch
              checked={restReminderEnabled}
              onChange={(v) => {
                setRestReminderEnabled(v)
                store.set('restReminderEnabled', v)
                store.set('restReminderAcceptCount', 0)
              }}
            />
          </div>
        </SettingCard>
        <SettingCard
          title={t('tools.benchNoCooldown.title')}
          description={t('tools.benchNoCooldown.desc')}
        >
          <SonaSwitch
            checked={benchNoCooldown}
            onChange={(v) => { setBenchNoCooldown(v); store.set('benchNoCooldown', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.analyzeTeamPower.title')}
          description={t('tools.analyzeTeamPower.desc')}
        >
          <SonaSelect
            value={String(analyzeTeamPowerFetchCount)}
            onChange={(v) => { setAnalyzeTeamPowerFetchCount(Number(v)); store.set('analyzeTeamPowerFetchCount', Number(v)) }}
            options={[
              { value: '20', label: t('tools.recent20') },
              { value: '50', label: t('tools.recent50') },
              { value: '100', label: t('tools.recent100') },
            ]}
          />
          <SonaSelect
            value={analyzeTeamPowerMsgType}
            onChange={(v) => { setAnalyzeTeamPowerMsgType(v); store.set('analyzeTeamPowerMsgType', v) }}
            options={[
              { value: 'celebration', label: t('tools.selfVisible') },
              { value: 'chat', label: t('tools.teamVisible') },
            ]}
          />
          <SonaSwitch
            checked={analyzeTeamPower}
            onChange={(v) => { setAnalyzeTeamPower(v); store.set('analyzeTeamPower', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.sideIndicator.title')}
          description={t('tools.sideIndicator.desc')}
        >
          <SonaSelect
            value={sideIndicatorMsgType}
            onChange={(v) => { setSideIndicatorMsgType(v); store.set('sideIndicatorMsgType', v) }}
            options={[
              { value: 'celebration', label: t('tools.selfVisible') },
              { value: 'chat', label: t('tools.teamVisible') },
            ]}
          />
          <SonaSwitch
            checked={sideIndicator}
            onChange={(v) => { setSideIndicator(v); store.set('sideIndicator', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.champSelectAssist.title')}
          description={t('tools.champSelectAssist.desc')}
        >
          <SonaSelect
            value={String(champSelectAssistFetchCount)}
            onChange={(v) => { setChampSelectAssistFetchCount(Number(v)); store.set('champSelectAssistFetchCount', Number(v)) }}
            options={[
              { value: '20', label: t('tools.recent20') },
              { value: '50', label: t('tools.recent50') },
              { value: '100', label: t('tools.recent100') },
            ]}
          />
          <SonaSwitch
            checked={champSelectAssist}
            onChange={(v) => { setChampSelectAssist(v); store.set('champSelectAssist', v) }}
          />
        </SettingCard>
      </SettingGroup>
      </section>

      <section id="tool-section-opgg" className="sonaenhance-tool-section">
      <SettingGroup title={t('tools.nav.opgg')}>
        <SettingCard
          title={t('tools.opggBuild.title')}
          description={t('tools.opggBuild.desc')}
        >
          <SonaSwitch
            checked={opggBuildRecommendation}
            onChange={(v) => { setOpggBuildRecommendation(v); store.set('opggBuildRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoRunes.title')}
          description={t('tools.autoRunes.desc')}
        >
          <SonaSwitch
            checked={opggAutoApplyRunes}
            onChange={(v) => { setOpggAutoApplyRunes(v); store.set('opggAutoApplyRunes', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.counter.title')}
          description={t('tools.counter.desc')}
        >
          <SonaSwitch
            checked={champSelectCounterRecommendation}
            onChange={(v) => { setChampSelectCounterRecommendation(v); store.set('champSelectCounterRecommendation', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.smartBuild.title')}
          description={t('tools.smartBuild.desc')}
        >
          <SonaSwitch
            checked={smartBuildRecommendation}
            onChange={(v) => { setSmartBuildRecommendation(v); store.set('smartBuildRecommendation', v) }}
          />
        </SettingCard>
      </SettingGroup>
      </section>

      <section id="tool-section-automation" className="sonaenhance-tool-section">
      <SettingGroup title={t('tools.nav.automation')}>
        <SettingCard
          title={t('tools.balanceBuff.title')}
          description={t('tools.balanceBuff.desc')}
        >
          <SonaSwitch
            checked={balanceBuffTooltip}
            onChange={(v) => { setBalanceBuffTooltip(v); store.set('balanceBuffTooltip', v) }}
          />
        </SettingCard>
        {/* Champ-select quit is disabled until a reliable LCU endpoint is available. */}
        {/* <SettingCard
          title="选人阶段退出按钮"
          description="非自定义对局的英雄选择里客户端不会显示退出按钮，Sona 帮你补一个。点击后会弹确认窗，秒退会扣逃跑分。"
        >
          <SonaSwitch
            checked={champSelectQuitButton}
            onChange={(v) => { setChampSelectQuitButton(v); store.set('champSelectQuitButton', v) }}
          />
        </SettingCard> */}
        <SettingCard
          title={t('tools.gameAnalysis.title')}
          description={t('tools.gameAnalysis.desc')}
        >
          <SonaSelect
            value={String(gameAnalysisFetchCount)}
            onChange={(v) => { setGameAnalysisFetchCount(Number(v)); store.set('gameAnalysisFetchCount', Number(v)) }}
            options={[
              { value: '20', label: t('tools.recent20') },
              { value: '50', label: t('tools.recent50') },
              { value: '100', label: t('tools.recent100') },
            ]}
          />
          <SonaSwitch
            checked={gameAnalysisPopup}
            onChange={(v) => { setGameAnalysisPopup(v); store.set('gameAnalysisPopup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoReturn.title')}
          description={t('tools.autoReturn.desc')}
        >
          <SonaSelect
            value={autoReturnMode}
            onChange={(v) => { setAutoReturnMode(v); store.set('autoReturnMode', v) }}
            options={[
              { value: 'queue', label: t('tools.autoQueue') },
              { value: 'lobby', label: t('tools.returnLobbyOnly') },
            ]}
          />
          <SonaSwitch
            checked={autoReturnToLobby}
            onChange={(v) => { setAutoReturnToLobby(v); store.set('autoReturnToLobby', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoHonor.title')}
          description={t('tools.autoHonor.desc')}
        >
          <SonaSwitch
            checked={autoHonor}
            onChange={(v) => { setAutoHonor(v); store.set('autoHonor', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.autoLock.title')}
          description={t('tools.autoLock.desc')}
        >
          <SonaSwitch
            checked={autoLockChampion}
            onChange={(v) => { setAutoLockChampion(v); store.set('autoLockChampion', v) }}
          />
        </SettingCard>
        {autoLockChampion && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sonaenhance-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={champSuggestRef}>
                <SonaInput
                  value={champSearchText}
                  onChange={(v) => {
                    setChampSearchText(v)
                    const results = searchChampions(v)
                    setChampSuggestions(results)
                    setShowChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoLock.placeholder')}
                />
                {showChampSuggestions && champSuggestions.length > 0 && (
                  <div className="sonaenhance-champ-suggest">
                    {champSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sonaenhance-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoLockChampion(c)}
                      >
                        <img className="sonaenhance-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sonaenhance-champ-suggest-title">{c.title}</span>
                        <span className="sonaenhance-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SonaButton
                variant={autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(true); store.set('autoLockInstant', true) }}
              >
                {t('tools.autoLock.lock')}{autoLockInstant ? t('tools.selected') : ''}
              </SonaButton>
              <SonaButton
                variant={!autoLockInstant ? 'primary' : undefined}
                onClick={() => { setAutoLockInstant(false); store.set('autoLockInstant', false) }}
              >
                {t('tools.autoLock.pick')}{!autoLockInstant ? t('tools.selected') : ''}
              </SonaButton>
            </div>
            <ChampionPriorityCards
              championIds={autoLockChampionIds}
              emptyText={t('tools.autoLock.empty')}
              onRemove={removeAutoLockChampion}
              removeLabel={t('tools.removeChampion')}
              championFallback={(id) => t('tools.championFallback', { id })}
            />
          </div>
        )}
        <SettingCard
          title={t('tools.autoBan.title')}
          description={t('tools.autoBan.desc')}
        >
          <SonaSwitch
            checked={autoBanChampion}
            onChange={(v) => { setAutoBanChampion(v); store.set('autoBanChampion', v) }}
          />
        </SettingCard>
        {autoBanChampion && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sonaenhance-debug-actions" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }} ref={banChampSuggestRef}>
                <SonaInput
                  value={banChampSearchText}
                  onChange={(v) => {
                    setBanChampSearchText(v)
                    const results = searchChampions(v)
                    setBanChampSuggestions(results)
                    setShowBanChampSuggestions(results.length > 0)
                  }}
                  placeholder={t('tools.autoBan.placeholder')}
                />
                {showBanChampSuggestions && (
                  <div className="sonaenhance-champ-suggest">
                    {banChampSuggestions.map((c) => (
                      <button
                        key={c.id}
                        className="sonaenhance-champ-suggest-item"
                        type="button"
                        onClick={() => addAutoBanChampion(c)}
                      >
                        <img className="sonaenhance-champ-suggest-icon" src={`/lol-game-data/assets/v1/champion-icons/${c.id}.png`} alt="" />
                        <span className="sonaenhance-champ-suggest-title">{c.title}</span>
                        <span className="sonaenhance-champ-suggest-name">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <ChampionPriorityCards
              championIds={autoBanChampionIds}
              emptyText={t('tools.autoBan.empty')}
              onRemove={removeAutoBanChampion}
              removeLabel={t('tools.removeChampion')}
              championFallback={(id) => t('tools.championFallback', { id })}
            />
          </div>
        )}
      </SettingGroup>
      </section>

      <section id="tool-section-social" className="sonaenhance-tool-section">
      <SettingGroup title={t('tools.nav.social')}>
        <SettingCard
          title={t('tools.unlockStatus.title')}
          description={t('tools.unlockStatus.desc')}
        >
          <SonaSwitch
            checked={unlockStatus}
            onChange={(v) => { setUnlockStatus(v); store.set('unlockStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockAvailability.title')}
          description={t('tools.unlockAvailability.desc')}
        >
          <SonaSwitch
            checked={unlockAvailability}
            onChange={(v) => { setUnlockAvailability(v); store.set('unlockAvailability', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.unlockChromas.title')}
          description={t('tools.unlockChromas.desc')}
        >
          <SonaSwitch
            checked={unlockChromas}
            onChange={(v) => { setUnlockChromas(v); store.set('unlockChromas', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.removeBorder.title')}
          description={t('tools.removeBorder.desc')}
        >
          <SonaButton onClick={async () => {
            try {
              await fetch('/lol-regalia/v2/current-summoner/regalia', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferredCrestType: 'prestige', preferredBannerType: 'blank', selectedPrestigeCrest: 0 }),
              })
              logger.info('头像边框已卸下 ✓')
            } catch (err) {
              logger.error('卸下头像边框失败:', err)
            }
          }}>
            {t('tools.remove')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.removeAvatar.title')}
          description={t('tools.removeAvatar.desc')}
        >
          <SonaButton onClick={async () => {
            try {
              await lcu.setProfileIcon(29)
              logger.info('头像已恢复为默认头像 ✓')
            } catch (err) {
              logger.error('恢复默认头像失败:', err)
            }
          }}>
            {t('tools.remove')}
          </SonaButton>
        </SettingCard>
        <SettingCard
          title={t('tools.friendGroup.title')}
          description={t('tools.friendGroup.desc')}
        >
          <SonaSwitch
            checked={friendSmartGroup}
            onChange={(v) => { setFriendSmartGroup(v); store.set('friendSmartGroup', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.friendStatus.title')}
          description={t('tools.friendStatus.desc')}
        >
          <SonaSwitch
            checked={enhancedFriendGameStatus}
            onChange={(v) => { setEnhancedFriendGameStatus(v); store.set('enhancedFriendGameStatus', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.lobbyEnhancement.title')}
          description={t('tools.lobbyEnhancement.desc')}
        >
          <SonaSelect
            value={String(lobbyEnhancementFetchCount)}
            onChange={(v) => { setLobbyEnhancementFetchCount(Number(v)); store.set('lobbyEnhancementFetchCount', Number(v)) }}
            options={[
              { value: '20', label: t('tools.recent20') },
              { value: '50', label: t('tools.recent50') },
              { value: '100', label: t('tools.recent100') },
            ]}
          />
          <SonaSwitch
            checked={lobbyEnhancement}
            onChange={(v) => { setLobbyEnhancement(v); store.set('lobbyEnhancement', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('tools.hideEsportsPopup.title')}
          description={t('tools.hideEsportsPopup.desc')}
        >
          <SonaSwitch
            checked={hideEsportsPopup}
            onChange={(v) => { setHideEsportsPopup(v); store.set('hideEsportsPopup', v) }}
          />
        </SettingCard>
      </SettingGroup>
      </section>

    </div>
  )
}
