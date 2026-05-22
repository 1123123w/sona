import { getRecentSonaLogs } from '@/lib/logger'
import {
  getHighRiskSettingDefinitions,
  HIGH_RISK_CONFIG_SETTING_KEYS,
  HIGH_RISK_FEATURE_SETTING_KEYS,
  SETTING_KEYS,
  store,
  type ConfigKey,
  type SonaConfig,
} from '@/lib/store'

type DebugKey = keyof SonaEnhanceDebugApi

const FEATURE_KEYS: ConfigKey[] = [
  ...HIGH_RISK_FEATURE_SETTING_KEYS,
  'champSelectAssist',
  'analyzeTeamPower',
  'sideIndicator',
  'benchNoCooldown',
  'friendSmartGroup',
  'enhancedFriendGameStatus',
  'lobbyEnhancement',
  'hideTFT',
  'hideRightNavText',
  'autoHonor',
  'autoLockChampion',
  'autoBanChampion',
  'balanceBuffTooltip',
  'champSelectQuitButton',
  'gameAnalysisPopup',
  'autoReturnToLobby',
  'developerMode',
]

const CONFIG_KEYS: ConfigKey[] = [
  ...FEATURE_KEYS,
  ...HIGH_RISK_CONFIG_SETTING_KEYS,
  'analyzeTeamPowerMsgType',
  'analyzeTeamPowerFetchCount',
  'champSelectAssistFetchCount',
  'gameAnalysisFetchCount',
  'sideIndicatorMsgType',
  'lobbyEnhancementFetchCount',
  'autoLockInstant',
  'autoReturnMode',
  'language',
  'hotkey',
  'ignoreProfilePrivacy',
  'unlockStatus',
  'unlockAvailability',
  'unlockChromas',
]

function getDebugApi(): SonaEnhanceDebugApi {
  const debug = window.__SONAENHANCE_DEBUG__ ?? {}
  window.__SONAENHANCE_DEBUG__ = debug
  return debug
}

function readConfigKeys(keys: ConfigKey[]) {
  const values: Partial<Record<ConfigKey, SonaConfig[ConfigKey]>> = {}
  keys.forEach((key) => {
    values[key] = store.get(key)
  })
  return values
}

function normalizeLogLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 50
  return Math.min(200, Math.max(1, Math.floor(limit)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function readRecordProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  const nested = readRecordProperty(value, key)
  return isRecord(nested) ? nested : null
}

function readBoolean(value: unknown, key: string): boolean {
  return readRecordProperty(value, key) === true
}

function readNumber(value: unknown, key: string, fallback = 0): number {
  const numberValue = readRecordProperty(value, key)
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : fallback
}

function readRuntimeSummary() {
  const runtime = getDebugApi().runtimeState?.()
  const readyCheck = readNestedRecord(runtime, 'readyCheck')
  const champSelect = readNestedRecord(runtime, 'champSelect')

  return {
    running: readBoolean(runtime, 'running'),
    gameflowPhase: readRecordProperty(runtime, 'gameflowPhase') ?? null,
    readyCheck: readyCheck ? {
      state: readyCheck.state ?? '',
      playerResponse: readyCheck.playerResponse ?? '',
      timer: typeof readyCheck.timer === 'number' ? readyCheck.timer : 0,
    } : null,
    champSelect: champSelect ? {
      queueId: typeof champSelect.queueId === 'number' ? champSelect.queueId : 0,
      localPlayerCellId: typeof champSelect.localPlayerCellId === 'number' ? champSelect.localPlayerCellId : -1,
      localChampionId: typeof champSelect.localChampionId === 'number' ? champSelect.localChampionId : 0,
      localChampionPickIntent: typeof champSelect.localChampionPickIntent === 'number' ? champSelect.localChampionPickIntent : 0,
      allies: Array.isArray(champSelect.myTeam) ? champSelect.myTeam.length : 0,
      enemies: Array.isArray(champSelect.theirTeam) ? champSelect.theirTeam.length : 0,
    } : null,
  }
}

function readOpggSummary() {
  const opgg = getDebugApi().opgg?.()
  const dom = readNestedRecord(opgg, 'dom')
  const inFlight = readNestedRecord(opgg, 'inFlight')

  return {
    enabled: readBoolean(opgg, 'enabled'),
    hasChampSelectListener: readBoolean(opgg, 'hasChampSelectListener'),
    hasRunePagesListener: readBoolean(opgg, 'hasRunePagesListener'),
    injectRegistered: readBoolean(opgg, 'injectRegistered'),
    rearmActive: readBoolean(opgg, 'rearmActive'),
    currentChampionLocked: readBoolean(opgg, 'currentChampionLocked'),
    panelOpen: readBoolean(opgg, 'panelOpen'),
    dom: {
      targets: readNumber(dom, 'targets'),
      hijackedTargets: readNumber(dom, 'hijackedTargets'),
      panel: readBoolean(dom, 'panel'),
    },
    inFlight: {
      itemSet: readNumber(inFlight, 'itemSet'),
      opggRune: readNumber(inFlight, 'opggRune'),
      runeApply: readNumber(inFlight, 'runeApply'),
      spellApply: readNumber(inFlight, 'spellApply'),
    },
  }
}

function readCounterSummary() {
  const counter = getDebugApi().counter?.()
  const dom = readNestedRecord(counter, 'dom')
  const rankedSummary = readNestedRecord(counter, 'rankedSummary')

  return {
    enabled: readBoolean(counter, 'enabled'),
    hasChampSelectListener: readBoolean(counter, 'hasChampSelectListener'),
    injectRegistered: readBoolean(counter, 'injectRegistered'),
    rearmActive: readBoolean(counter, 'rearmActive'),
    hasCurrentSession: readBoolean(counter, 'hasCurrentSession'),
    queueId: readNumber(counter, 'queueId'),
    localPlayerCellId: readNumber(counter, 'localPlayerCellId', -1),
    enemies: Array.isArray(readRecordProperty(counter, 'enemies'))
      ? (readRecordProperty(counter, 'enemies') as unknown[]).length
      : 0,
    dataState: readRecordProperty(counter, 'dataState') ?? '',
    rankedSummary: {
      cached: readBoolean(rankedSummary, 'cached'),
      tier: readRecordProperty(rankedSummary, 'tier') ?? '',
      inFlight: readBoolean(rankedSummary, 'inFlight'),
    },
    dom: {
      visibleEnemyWrappers: readNumber(dom, 'visibleEnemyWrappers'),
      allEnemyWrappers: readNumber(dom, 'allEnemyWrappers'),
      boundAttrs: readNumber(dom, 'boundAttrs'),
      modalRoot: readBoolean(dom, 'modalRoot'),
      modalOpen: readBoolean(dom, 'modalOpen'),
    },
  }
}

function readFeatureSummary() {
  return {
    autoAccept: store.get(SETTING_KEYS.autoAcceptMatch),
    opgg: store.get(SETTING_KEYS.opggBuildRecommendation),
    opggAutoApplyRunes: store.get(SETTING_KEYS.opggAutoApplyRunes),
    smartBuild: store.get(SETTING_KEYS.smartBuildRecommendation),
    counter: store.get(SETTING_KEYS.champSelectCounterRecommendation),
  }
}

function getDebugSummary() {
  return {
    updatedAt: Date.now(),
    features: readFeatureSummary(),
    runtime: readRuntimeSummary(),
    opgg: readOpggSummary(),
    counter: readCounterSummary(),
    logs: getRecentSonaLogs(10),
  }
}

export function registerDebugHandle<K extends DebugKey>(
  key: K,
  handler: NonNullable<SonaEnhanceDebugApi[K]>,
) {
  getDebugApi()[key] = handler
}

export function unregisterDebugHandle(key: DebugKey) {
  if (!window.__SONAENHANCE_DEBUG__) return
  delete window.__SONAENHANCE_DEBUG__[key]
}

export function installCoreDebugHandles() {
  registerDebugHandle('features', () => ({
    updatedAt: Date.now(),
    flags: readConfigKeys(FEATURE_KEYS),
    highRiskSettings: getHighRiskSettingDefinitions().map((definition) => ({
      key: definition.key,
      type: definition.type,
      feature: definition.feature,
      default: definition.default,
    })),
  }))

  registerDebugHandle('config', () => ({
    updatedAt: Date.now(),
    values: readConfigKeys(CONFIG_KEYS),
    highRiskSettings: getHighRiskSettingDefinitions().map((definition) => ({
      key: definition.key,
      type: definition.type,
      feature: definition.feature,
      default: definition.default,
    })),
  }))

  registerDebugHandle('logs', (limit?: number) => ({
    updatedAt: Date.now(),
    entries: getRecentSonaLogs(normalizeLogLimit(limit)),
  }))

  registerDebugHandle('summary', getDebugSummary)
}
