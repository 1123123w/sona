import { useState, useEffect } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { clearOpggCache } from '@/lib/opgg-api'
import { lcu } from '@/lib/lcu'
import { store } from '@/lib/store'
import { type AppLanguage, languageOptions, useI18n } from '@/lib/i18n'
import '@/styles/SettingsPage.css'

const hotkeyOptions = [
  { value: 'F1', label: 'F1' },
  { value: 'F2', label: 'F2' },
  { value: 'F3', label: 'F3' },
  { value: 'F4', label: 'F4' },
  { value: 'F5', label: 'F5' },
]

function BackupManager() {
  const { t } = useI18n()
  const [backupName, setBackupName] = useState('')
  const [backups, setBackups] = useState<{ name: string; timestamp: number }[]>([])
  const [status, setStatus] = useState('')

  const refreshList = async () => {
    const list = await lcu.listBackups()
    setBackups(list)
  }

  useEffect(() => { refreshList() }, [])

  const handleBackup = async () => {
    const name = backupName.trim()
    if (!name) { setStatus(`❌ ${t('settings.backup.needName')}`); return }
    setStatus(`⏳ ${t('settings.backup.saving')}`)
    const ok = await lcu.backupSettings(name)
    setStatus(ok ? `✅ ${t('settings.backup.success')}` : `❌ ${t('settings.backup.failed')}`)
    if (ok) { setBackupName(''); refreshList() }
  }

  const handleRestore = async (name: string) => {
    setStatus(`⏳ ${t('settings.backup.restoring', { name })}`)
    const ok = await lcu.restoreSettings(name)
    setStatus(ok ? `✅ ${t('settings.backup.restored', { name })}` : `❌ ${t('settings.backup.restoreFailed')}`)
  }

  const handleDelete = async (name: string) => {
    const ok = await lcu.deleteBackup(name)
    if (ok) {
      setStatus(t('settings.backup.deleted', { name }))
      refreshList()
    }
  }

  const formatTime = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <>
      <div className="sonaenhance-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SonaInput
            value={backupName}
            onChange={(v) => { setBackupName(v); setStatus('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBackup() }}
            placeholder={t('settings.backup.placeholder')}
          />
        </div>
        <SonaButton variant="primary" onClick={handleBackup}>
          {t('settings.backup.save')}
        </SonaButton>
      </div>
      {status && <p className="sonaenhance-subtitle" style={{ marginTop: 6 }}>{status}</p>}
      {backups.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {backups.map((b) => (
            <div key={b.name} className="sonaenhance-backup-item">
              <div className="sonaenhance-backup-info">
                <span className="sonaenhance-backup-name">{b.name}</span>
                <span className="sonaenhance-backup-time">{formatTime(b.timestamp)}</span>
              </div>
              <div className="sonaenhance-backup-actions">
                <SonaButton onClick={() => handleRestore(b.name)}>{t('settings.backup.restore')}</SonaButton>
                <SonaButton onClick={() => handleDelete(b.name)}>{t('settings.backup.delete')}</SonaButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export function SettingsPage() {
  const { language, setLanguage, t } = useI18n()
  const [hotkey, setHotkey] = useState(store.get('hotkey'))
  const [hideTFT, setHideTFT] = useState(store.get('hideTFT'))
  const [gameModeFilter, setGameModeFilter] = useState(store.get('gameModeFilter'))
  const [hideTFTPlayCard, setHideTFTPlayCard] = useState(store.get('hideTFTPlayCard'))
  const [hideSummonerRiftModes, setHideSummonerRiftModes] = useState(store.get('hideSummonerRiftModes'))
  const [hideAramMode, setHideAramMode] = useState(store.get('hideAramMode'))
  const [hideArenaMode, setHideArenaMode] = useState(store.get('hideArenaMode'))
  const [hideCustomGameSection, setHideCustomGameSection] = useState(store.get('hideCustomGameSection'))
  const [hideRightNavText, setHideRightNavText] = useState(store.get('hideRightNavText'))
  const [opggCacheStatus, setOpggCacheStatus] = useState('')

  useEffect(() => {
    const unsubs = [
      store.onChange('hotkey', setHotkey),
      store.onChange('hideTFT', setHideTFT),
      store.onChange('gameModeFilter', setGameModeFilter),
      store.onChange('hideTFTPlayCard', setHideTFTPlayCard),
      store.onChange('hideSummonerRiftModes', setHideSummonerRiftModes),
      store.onChange('hideAramMode', setHideAramMode),
      store.onChange('hideArenaMode', setHideArenaMode),
      store.onChange('hideCustomGameSection', setHideCustomGameSection),
      store.onChange('hideRightNavText', setHideRightNavText),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="sonaenhance-settings">
      <h2 className="sonaenhance-settings-title">{t('settings.title')}</h2>

      <SettingGroup title={t('settings.general')}>
        <SettingCard
          title={t('settings.language.title')}
          description={t('settings.language.desc')}
        >
          <SonaSelect
            options={languageOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={language}
            onChange={(v) => setLanguage(v as AppLanguage)}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hotkey.title')}
          description={t('settings.hotkey.desc')}
        >
          <SonaSelect
            options={hotkeyOptions}
            value={hotkey}
            onChange={(v) => { setHotkey(v); store.set('hotkey', v) }}
          />
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('settings.client')}>
        <SettingCard
          title={t('settings.hideTFT.title')}
          description={t('settings.hideTFT.desc')}
        >
          <SonaSwitch
            checked={hideTFT}
            onChange={(v) => { setHideTFT(v); store.set('hideTFT', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.gameModeFilter.title')}
          description={t('settings.gameModeFilter.desc')}
        >
          <SonaSwitch
            checked={gameModeFilter}
            onChange={(v) => { setGameModeFilter(v); store.set('gameModeFilter', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideTFTPlayCard.title')}
          description={t('settings.hideTFTPlayCard.desc')}
        >
          <SonaSwitch
            checked={hideTFTPlayCard}
            onChange={(v) => { setHideTFTPlayCard(v); store.set('hideTFTPlayCard', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideSummonerRiftModes.title')}
          description={t('settings.hideSummonerRiftModes.desc')}
        >
          <SonaSwitch
            checked={hideSummonerRiftModes}
            onChange={(v) => { setHideSummonerRiftModes(v); store.set('hideSummonerRiftModes', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideAramMode.title')}
          description={t('settings.hideAramMode.desc')}
        >
          <SonaSwitch
            checked={hideAramMode}
            onChange={(v) => { setHideAramMode(v); store.set('hideAramMode', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideArenaMode.title')}
          description={t('settings.hideArenaMode.desc')}
        >
          <SonaSwitch
            checked={hideArenaMode}
            onChange={(v) => { setHideArenaMode(v); store.set('hideArenaMode', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideCustomGameSection.title')}
          description={t('settings.hideCustomGameSection.desc')}
        >
          <SonaSwitch
            checked={hideCustomGameSection}
            onChange={(v) => { setHideCustomGameSection(v); store.set('hideCustomGameSection', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideRightText.title')}
          description={t('settings.hideRightText.desc')}
        >
          <SonaSwitch
            checked={hideRightNavText}
            onChange={(v) => { setHideRightNavText(v); store.set('hideRightNavText', v) }}
          />
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('settings.backup')}>
        <p className="sonaenhance-subtitle" style={{ marginBottom: 10 }}>{t('settings.backup.desc')}</p>
        <BackupManager />
      </SettingGroup>

      <SettingGroup title={t('settings.advanced')}>
        <SettingCard
          title={t('settings.clearOpgg.title')}
          description={t('settings.clearOpgg.desc')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SonaButton onClick={() => {
              const count = clearOpggCache()
              setOpggCacheStatus(count >= 0 ? t('settings.cacheCleared', { count }) : t('settings.cacheFailed'))
            }}>
              {t('settings.clear')}
            </SonaButton>
            {opggCacheStatus && <span className="sonaenhance-subtitle">{opggCacheStatus}</span>}
          </div>
        </SettingCard>
      </SettingGroup>
    </div>
  )
}
