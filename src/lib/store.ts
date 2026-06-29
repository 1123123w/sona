/**
 * Sona plugin configuration manager.
 *
 * Persists settings with the Pengu Loader DataStore API.
 * All config keys are centralized with types and defaults.
 *
 * Usage:
 * ```ts
 * import { store } from '@/lib/store'
 *
 * // Read
 * const value = store.get('autoAcceptMatch')
 *
 * // Write and persist automatically
 * store.set('autoAcceptMatch', true)
 *
 * // Watch changes
 * store.onChange('autoAcceptMatch', (value) => { ... })
 * ```
 */

// ==================== Config Definitions ====================

/** All config keys and their value types. */
export interface SonaConfig {
  /** Auto-accept ready checks. */
  autoAcceptMatch: boolean
  /** Keep the opposite ReadyCheck action clickable after accepting or declining. */
  allowDeclineAfterAccept: boolean
  /** Minimum random auto-accept delay in milliseconds. */
  autoAcceptDelayMin: number
  /** Maximum random auto-accept delay in milliseconds. */
  autoAcceptDelayMax: number
  /** Disable auto accept after a configurable number of successful accepts. */
  restReminderEnabled: boolean
  /** Auto accept count that triggers rest reminder. */
  restReminderAcceptLimit: number
  /** Current auto accept count for rest reminder. */
  restReminderAcceptCount: number
  /** Developer mode. */
  developerMode: boolean
  /** Unlock custom status messages. */
  unlockStatus: boolean
  /** Unlock availability switching by hijacking the client status button. */
  unlockAvailability: boolean
  /** Remove ARAM bench swap cooldown. */
  benchNoCooldown: boolean
  /** Sidebar collapsed state. */
  sidebarCollapsed: boolean
  /** Availability state. */
  availability: string
  /** Custom status message stored per PUUID. */
  statusMessage: Record<string, string>
  /** Panel hotkey. */
  hotkey: string
  /** UI language. */
  language: 'zh-CN' | 'zh-TW' | 'en-US'
  /** Window visual effect. */
  /** Champ-select avatar interaction for player history. */
  champSelectAssist: boolean
  /** OP.GG build recommendation entry. */
  opggBuildRecommendation: boolean
  /** Auto-apply OP.GG recommended runes after locking a champion. */
  opggAutoApplyRunes: boolean
  champSelectCounterRecommendation: boolean
  /** Smart build configuration. */
  smartBuildRecommendation: boolean
  /** Smart runes saved by champion and mode. */
  smartRunePages: Record<string, {
    primaryStyleId: number
    subStyleId: number
    selectedPerkIds: number[]
    updatedAt: number
  }>
  /** Smart summoner spells saved by champion and mode. */
  smartSummonerSpells: Record<string, {
    spell1Id: number
    spell2Id: number
    updatedAt: number
  }>
  /** Game setting backups stored per PUUID. */
  gameSettingsBackups: Record<string, Record<string, {
    general?: unknown
    input?: unknown
    timestamp: number
  }>>
  /** OP.GG recommendation tier filter. */
  opggBuildRecommendationTier: string
  /** Default OP.GG recommendation position when champ select does not provide one. */
  opggBuildRecommendationDefaultPosition: string
  /** Analyze ally strength in champ select. */
  analyzeTeamPower: boolean
  /** Ally analysis message type. */
  analyzeTeamPowerMsgType: string
  /** Match-history fetch count for ally analysis. */
  analyzeTeamPowerFetchCount: number
  /** Match-history fetch count for champ-select assist. */
  champSelectAssistFetchCount: number
  /** Match-history fetch count for game analysis. */
  gameAnalysisFetchCount: number
  /** Side indicator shown in champ select. */
  sideIndicator: boolean
  /** Side indicator message type. */
  sideIndicatorMsgType: string
  /** Friend smart grouping. */
  friendSmartGroup: boolean
  /** Enhanced in-game friend status. */
  enhancedFriendGameStatus: boolean
  /** Lobby member match-history enhancement. */
  lobbyEnhancement: boolean
  /** Match-history fetch count for lobby enhancement. */
  lobbyEnhancementFetchCount: number
  /** Ignore profile privacy by rewriting XHR responses. Requires restart. */
  ignoreProfilePrivacy: boolean
  /** Hide the client TFT entry. */
  hideTFT: boolean
  /** Inject Play-page chips to hide/show rendered PVP mode cards. */
  gameModeFilter: boolean
  /** Hidden Play-page game mode cards by data-game-mode value. */
  hiddenGameModes: Record<string, boolean>
  hideTFTPlayCard: boolean
  hideSummonerRiftModes: boolean
  hideAramMode: boolean
  hideArenaMode: boolean
  hideCustomGameSection: boolean
  /** Hide right navigation text and keep icons only. */
  hideRightNavText: boolean
  /** Hide official esports livestream popup iframe. */
  hideEsportsPopup: boolean
  /** Click Play to directly create a lobby for a configured queue. */
  quickLobbyMode: boolean
  /** Target queue id for quick lobby mode. */
  quickLobbyQueueId: number
  /** Auto-honor after game end. */
  autoHonor: boolean
  /** Auto-lock champion feature toggle. */
  autoLockChampion: boolean
  /** Auto-lock champion priority list. */
  autoLockChampionIds: number[]
  /** Whether auto-lock should lock immediately instead of only selecting. */
  autoLockInstant: boolean
  /** Auto-ban champion feature toggle. */
  autoBanChampion: boolean
  /** Auto-ban champion priority list. */
  autoBanChampionIds: number[]
  /** Balance modifier tooltip shown on champion avatar hover. */
  balanceBuffTooltip: boolean
  /** Unlock chroma tab in the collection page. Requires restart. */
  unlockChromas: boolean
  /** Champ-select quit button for non-custom games. */
  champSelectQuitButton: boolean
  /** Show game analysis modal after entering a game. */
  gameAnalysisPopup: boolean
  /** Return to lobby after game end. */
  autoReturnToLobby: boolean
  /** Auto-return mode. */
  autoReturnMode: string
}

export type ConfigKey = keyof SonaConfig

export type SettingValueType = 'boolean' | 'number' | 'string'

export type SettingFeature = 'autoAccept' | 'opgg' | 'counter'

export interface SettingDefinition<K extends ConfigKey = ConfigKey> {
  key: K
  default: SonaConfig[K]
  type: SettingValueType
  feature: SettingFeature
}

export const SETTING_KEYS = {
  autoAcceptMatch: 'autoAcceptMatch',
  allowDeclineAfterAccept: 'allowDeclineAfterAccept',
  autoAcceptDelayMin: 'autoAcceptDelayMin',
  autoAcceptDelayMax: 'autoAcceptDelayMax',
  restReminderEnabled: 'restReminderEnabled',
  restReminderAcceptLimit: 'restReminderAcceptLimit',
  restReminderAcceptCount: 'restReminderAcceptCount',
  opggBuildRecommendation: 'opggBuildRecommendation',
  opggAutoApplyRunes: 'opggAutoApplyRunes',
  smartBuildRecommendation: 'smartBuildRecommendation',
  opggBuildRecommendationTier: 'opggBuildRecommendationTier',
  opggBuildRecommendationDefaultPosition: 'opggBuildRecommendationDefaultPosition',
  champSelectCounterRecommendation: 'champSelectCounterRecommendation',
} as const satisfies Record<string, ConfigKey>

function defineSetting<K extends ConfigKey>(definition: SettingDefinition<K>): SettingDefinition<K> {
  return definition
}

export const HIGH_RISK_SETTING_DEFINITIONS = [
  defineSetting({ key: SETTING_KEYS.autoAcceptMatch, default: false, type: 'boolean', feature: 'autoAccept' }),
  defineSetting({ key: SETTING_KEYS.autoAcceptDelayMin, default: 0, type: 'number', feature: 'autoAccept' }),
  defineSetting({ key: SETTING_KEYS.autoAcceptDelayMax, default: 0, type: 'number', feature: 'autoAccept' }),
  defineSetting({ key: SETTING_KEYS.opggBuildRecommendation, default: false, type: 'boolean', feature: 'opgg' }),
  defineSetting({ key: SETTING_KEYS.opggAutoApplyRunes, default: false, type: 'boolean', feature: 'opgg' }),
  defineSetting({ key: SETTING_KEYS.smartBuildRecommendation, default: true, type: 'boolean', feature: 'opgg' }),
  defineSetting({ key: SETTING_KEYS.opggBuildRecommendationTier, default: 'emerald_plus', type: 'string', feature: 'opgg' }),
  defineSetting({ key: SETTING_KEYS.opggBuildRecommendationDefaultPosition, default: 'mid', type: 'string', feature: 'opgg' }),
  defineSetting({ key: SETTING_KEYS.champSelectCounterRecommendation, default: false, type: 'boolean', feature: 'counter' }),
] as const

export type HighRiskSettingKey = typeof HIGH_RISK_SETTING_DEFINITIONS[number]['key']

export const HIGH_RISK_FEATURE_SETTING_KEYS = HIGH_RISK_SETTING_DEFINITIONS
  .filter((definition) => definition.type === 'boolean')
  .map((definition) => definition.key)

export const HIGH_RISK_CONFIG_SETTING_KEYS = HIGH_RISK_SETTING_DEFINITIONS.map((definition) => definition.key)

export function getHighRiskSettingDefinitions(): readonly SettingDefinition<HighRiskSettingKey>[] {
  return HIGH_RISK_SETTING_DEFINITIONS
}

function createHighRiskDefaultConfig(): Pick<SonaConfig, HighRiskSettingKey> {
  const defaults: Partial<Record<HighRiskSettingKey, SonaConfig[HighRiskSettingKey]>> = {}
  HIGH_RISK_SETTING_DEFINITIONS.forEach((definition) => {
    defaults[definition.key] = definition.default
  })
  return defaults as Pick<SonaConfig, HighRiskSettingKey>
}

const HIGH_RISK_DEFAULT_CONFIG = createHighRiskDefaultConfig()



/** Default config values. */
const DEFAULT_CONFIG: SonaConfig = {
  ...HIGH_RISK_DEFAULT_CONFIG,
  allowDeclineAfterAccept: true,
  restReminderEnabled: false,
  restReminderAcceptLimit: 2,
  restReminderAcceptCount: 0,
  developerMode: false,
  unlockStatus: true,
  unlockAvailability: false,
  benchNoCooldown: false,
  sidebarCollapsed: false,
  availability: 'chat',
  statusMessage: {},
  hotkey: 'F1',
  language: 'zh-CN',
  champSelectAssist: false,
  smartRunePages: {},
  smartSummonerSpells: {},
  gameSettingsBackups: {},
  analyzeTeamPower: false,
  analyzeTeamPowerMsgType: 'celebration',
  analyzeTeamPowerFetchCount: 50,
  champSelectAssistFetchCount: 50,
  gameAnalysisFetchCount: 50,
  sideIndicator: false,
  sideIndicatorMsgType: 'celebration',
  friendSmartGroup: false,
  enhancedFriendGameStatus: true,
  lobbyEnhancement: false,
  lobbyEnhancementFetchCount: 50,
  hideTFT: false,
  gameModeFilter: false,
  hiddenGameModes: {},
  hideTFTPlayCard: false,
  hideSummonerRiftModes: false,
  hideAramMode: false,
  hideArenaMode: false,
  hideCustomGameSection: false,
  hideRightNavText: false,
  hideEsportsPopup: true,
  quickLobbyMode: false,
  quickLobbyQueueId: 430,
  ignoreProfilePrivacy: true,
  autoHonor: false,
  autoLockChampion: false,
  autoLockChampionIds: [],
  autoLockInstant: true,
  autoBanChampion: false,
  autoBanChampionIds: [],
  balanceBuffTooltip: false,
  unlockChromas: true,
  champSelectQuitButton: false,
  gameAnalysisPopup: false,
  autoReturnToLobby: false,
  autoReturnMode: 'queue',
}



// ==================== Store Implementation ====================

/** DataStore key prefix to avoid conflicts with other plugins. */
const KEY_PREFIX = 'sonaenhance:'

type ChangeListener<K extends ConfigKey = ConfigKey> = (value: SonaConfig[K], key: K) => void

class SonaStore {
  private listeners = new Map<ConfigKey, Set<ChangeListener>>()
  private cache: SonaConfig

  constructor() {
    // Load all config values into memory at startup.
    const loaded = { ...DEFAULT_CONFIG }
    for (const key of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
      (loaded as Record<string, unknown>)[key] = this.readFromDisk(key)
    }
    this.cache = loaded
  }

  /**
   * Gets a config value.
   */
  get<K extends ConfigKey>(key: K): SonaConfig[K] {
    return this.cache[key]
  }

  /**
   * Sets a config value, persists it, and notifies listeners.
   */
  set<K extends ConfigKey>(key: K, value: SonaConfig[K]) {
    const old = this.cache[key]
    if (old === value) return

    this.cache[key] = value
    DataStore.set(`${KEY_PREFIX}${key}`, value)

    // Notify change listeners.
    const keyListeners = this.listeners.get(key)
    if (keyListeners) {
      keyListeners.forEach((fn) => {
        try {
          (fn as ChangeListener<K>)(value, key)
        } catch {
          // ignore listener errors
        }
      })
    }
  }

  /**
   * Toggles a boolean config value.
   */
  toggle<K extends ConfigKey>(key: K): SonaConfig[K] {
    const current = this.get(key)
    if (typeof current !== 'boolean') return current
    const next = !current as SonaConfig[K]
    this.set(key, next)
    return next
  }

  /**
   * Watches config changes.
   * @returns Unsubscribe function.
   */
  onChange<K extends ConfigKey>(key: K, fn: ChangeListener<K>): () => void {
    let keyListeners = this.listeners.get(key)
    if (!keyListeners) {
      keyListeners = new Set()
      this.listeners.set(key, keyListeners)
    }
    keyListeners.add(fn as ChangeListener)

    return () => {
      keyListeners!.delete(fn as ChangeListener)
    }
  }

  /**
   * Resets all config values to defaults.
   */
  resetAll() {
    for (const key of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
      this.set(key, DEFAULT_CONFIG[key])
    }
  }

  /**
   * Resets one config value to its default.
   */
  reset<K extends ConfigKey>(key: K) {
    this.set(key, DEFAULT_CONFIG[key])
  }

  /**
   * Returns a snapshot of all config values.
   */
  getAll(): SonaConfig {
    const result = { ...DEFAULT_CONFIG }
    for (const key of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
      result[key] = this.get(key) as never
    }
    return result
  }

  // ---- Internals ----

  private readFromDisk<K extends ConfigKey>(key: K): SonaConfig[K] {
    const stored = DataStore.get<SonaConfig[K]>(`${KEY_PREFIX}${key}`)
    if (stored !== undefined) return stored

    return DEFAULT_CONFIG[key]
  }
}

// ==================== Singleton Export ====================

/** Sona config manager singleton. */
export const store = new SonaStore()
