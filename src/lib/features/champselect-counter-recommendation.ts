import { logger } from '@/index'
import { CounterRecommendationModal, type CounterRecommendationItem } from '@/components/ui/CounterRecommendationModal'
import { getChampionById } from '@/lib/assets'
import { registerDebugHandle } from '@/lib/debug'
import { injector } from '@/lib/InjectorManager'
import { lcu, LcuEventUri, type ChampSelectSession, type LCUEventMessage } from '@/lib/lcu'
import {
  OPGG_CACHE_CLEARED_EVENT,
  OPGG_DATA_REGION,
  opggApi,
  type OpggRankedChampionsSummary,
  type OpggRankedDataItem,
  type OpggRankedPosition,
  type OpggTier,
} from '@/lib/opgg-api'
import { SETTING_KEYS, store } from '@/lib/store'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GameflowPhase } from '@/types/lcu'

type RankedLane = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

interface CounterSuggestion extends CounterRecommendationItem {
  championId: number
  score: number
  matchups: Array<{
    enemyId: number
    enemyWinRate: number
    play: number
  }>
}

const DEFAULT_COUNTER_TIER: OpggTier = 'emerald_plus'
const SELECTABLE_OPGG_TIERS: OpggTier[] = [
  'all',
  'challenger',
  'grandmaster',
  'master_plus',
  'master',
  'diamond_plus',
  'diamond',
  'emerald_plus',
  'emerald',
  'platinum_plus',
  'platinum',
  'gold_plus',
  'gold',
  'silver',
  'bronze',
  'iron',
]
const MIN_COUNTER_PLAY = 100
const MAX_COUNTERS_PER_ENEMY = 8
const MAX_SUGGESTIONS = 10
const CHAMP_SELECT_REARM_INTERVAL_MS = 1000
const COUNTER_CLICK_ATTR = 'data-sonaenhance-counter-click'
const COUNTER_CHAMPION_ATTR = 'data-sonaenhance-counter-champion-id'
type CounterDataState = 'loading' | 'ready' | 'error'

let phaseUnsub: (() => void) | null = null
let champSelectUnsub: (() => void) | null = null
let injectRegistered = false
let rankedSummaryPromise: Promise<OpggRankedChampionsSummary> | null = null
let rankedSummaryCache: OpggRankedChampionsSummary | null = null
let rankedSummaryCacheTier: OpggTier | null = null
let lastSuggestionSignature = ''
let currentSession: ChampSelectSession | null = null
let suggestionsByEnemyId = new Map<number, CounterSuggestion[]>()
let counterDataState: CounterDataState = 'loading'
let counterDataMessage = ''
let counterModalRoot: Root | null = null
let counterModalContainer: HTMLDivElement | null = null
let rearmTimer: number | null = null
let cacheClearListenerInstalled = false
const boundEnemyIcons: Array<{ el: HTMLElement; handler: EventListener }> = []

function getElementRect(el: Element) {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
  }
}

function getCounterDebugSnapshot() {
  const visibleEnemyWrappers = document.querySelectorAll('.party.visible .summoner-wrapper.visible.right')
  const allEnemyWrappers = document.querySelectorAll('.summoner-wrapper.visible.right')
  const boundAttrWrappers = document.querySelectorAll(`[${COUNTER_CLICK_ATTR}="true"]`)
  const suggestionCounts = Array.from(suggestionsByEnemyId.entries()).map(([enemyId, suggestions]) => ({
    enemyId,
    count: suggestions.length,
  }))

  return {
    enabled: Boolean(phaseUnsub),
    hasChampSelectListener: Boolean(champSelectUnsub),
    injectRegistered,
    rearmActive: rearmTimer != null,
    hasCurrentSession: Boolean(currentSession),
    queueId: currentSession?.queueId ?? 0,
    localPlayerCellId: currentSession?.localPlayerCellId ?? -1,
    enemySignature: currentSession ? getEnemySignature(currentSession) : '',
    enemies: currentSession?.theirTeam.map((player) => ({
      cellId: player.cellId,
      championId: player.championId,
      championPickIntent: player.championPickIntent,
      assignedPosition: player.assignedPosition || '',
      selectedChampionId: getSelectedChampionId(player),
    })) ?? [],
    dataState: counterDataState,
    message: counterDataMessage,
    suggestionCounts,
    rankedSummary: {
      cached: Boolean(rankedSummaryCache),
      tier: rankedSummaryCacheTier,
      inFlight: Boolean(rankedSummaryPromise),
    },
    dom: {
      visibleEnemyWrappers: visibleEnemyWrappers.length,
      allEnemyWrappers: allEnemyWrappers.length,
      boundAttrs: boundAttrWrappers.length,
      modalRoot: Boolean(document.getElementById('sonaenhance-counter-recommendation-modal-root')),
      modalOpen: Boolean(document.querySelector('[data-sonaenhance-counter-modal="true"]')),
    },
    bound: boundEnemyIcons.map(({ el }) => ({
      connected: el.isConnected,
      championId: Number(el.getAttribute(COUNTER_CHAMPION_ATTR) || 0),
      hasAttr: el.getAttribute(COUNTER_CLICK_ATTR) === 'true',
      rect: getElementRect(el),
    })),
  }
}

function installCounterDebugHandle() {
  registerDebugHandle('counter', getCounterDebugSnapshot)
}

function normalizeOpggTier(value: string): OpggTier {
  return SELECTABLE_OPGG_TIERS.includes(value as OpggTier) ? value as OpggTier : DEFAULT_COUNTER_TIER
}

function mapAssignedPosition(position: string | undefined): RankedLane | null {
  switch (position) {
    case 'top':
      return 'top'
    case 'jungle':
      return 'jungle'
    case 'middle':
    case 'mid':
      return 'mid'
    case 'bottom':
    case 'bot':
      return 'adc'
    case 'utility':
    case 'support':
      return 'support'
    default:
      return null
  }
}

function getSelectedChampionId(player: ChampSelectSession['theirTeam'][number]): number {
  return player.championId > 0 ? player.championId : player.championPickIntent > 0 ? player.championPickIntent : 0
}

function getUnavailableChampionIds(session: ChampSelectSession): Set<number> {
  const ids = new Set<number>()
  for (const player of [...session.myTeam, ...session.theirTeam]) {
    const championId = getSelectedChampionId(player)
    if (championId > 0) ids.add(championId)
  }
  for (const championId of [...session.bans.myTeamBans, ...session.bans.theirTeamBans]) {
    if (championId > 0) ids.add(championId)
  }
  return ids
}

function getLaneLabel(lane: RankedLane | null): string {
  switch (lane) {
    case 'top':
      return '上路'
    case 'jungle':
      return '打野'
    case 'mid':
      return '中路'
    case 'adc':
      return '下路'
    case 'support':
      return '辅助'
    default:
      return '未知分路'
  }
}

function getChampionName(championId: number): string {
  const champion = getChampionById(championId)
  return champion ? `${champion.title}${champion.name ? ` ${champion.name}` : ''}` : `英雄${championId}`
}

function getBestPosition(champion: OpggRankedDataItem | undefined, lane: RankedLane | null): OpggRankedPosition | null {
  if (!champion) return null
  if (!Array.isArray(champion.positions) || champion.positions.length === 0) return null

  const exact = lane ? champion.positions.find((position) => position.name === lane) : undefined
  if (exact) return exact

  return [...champion.positions]
    .filter((position) => Array.isArray(position.counters) && position.counters.length > 0)
    .sort((left, right) => {
      const leftPlay = left.roles.reduce((sum, role) => sum + (role.stats.play || 0), 0)
      const rightPlay = right.roles.reduce((sum, role) => sum + (role.stats.play || 0), 0)
      return rightPlay - leftPlay
    })[0] ?? null
}

function getEnemySignature(session: ChampSelectSession): string {
  return session.theirTeam
    .map((player) => `${player.cellId}:${getSelectedChampionId(player)}:${player.assignedPosition || ''}`)
    .join('|')
}

async function ensureRankedSummary(): Promise<OpggRankedChampionsSummary> {
  const tier = normalizeOpggTier(store.get(SETTING_KEYS.opggBuildRecommendationTier))
  if (rankedSummaryCache && rankedSummaryCacheTier === tier) return rankedSummaryCache
  if (rankedSummaryPromise) return rankedSummaryPromise

  rankedSummaryPromise = opggApi.getChampionsTier({
    region: OPGG_DATA_REGION,
    mode: 'ranked',
    tier,
  }) as Promise<OpggRankedChampionsSummary>

  rankedSummaryPromise = rankedSummaryPromise
    .then((summary) => {
      rankedSummaryCache = summary
      rankedSummaryCacheTier = tier
      logger.info('[CounterPick] OP.GG counter 数据已缓存: tier=%s, champions=%d', tier, summary.data.length)
      return summary
    })
    .finally(() => {
      rankedSummaryPromise = null
    })

  return rankedSummaryPromise
}

function buildSuggestions(session: ChampSelectSession, summary: OpggRankedChampionsSummary): CounterSuggestion[] {
  const championsById = new Map(summary.data.map((champion) => [champion.id, champion]))
  const unavailable = getUnavailableChampionIds(session)
  const suggestions = new Map<number, CounterSuggestion>()

  for (const enemy of session.theirTeam) {
    const enemyId = getSelectedChampionId(enemy)
    if (enemyId <= 0) continue

    const enemyStats = championsById.get(enemyId)
    const enemyPosition = getBestPosition(enemyStats, mapAssignedPosition(enemy.assignedPosition))
    if (!enemyPosition) continue

    const counters = [...enemyPosition.counters]
      .filter((counter) => counter.champion_id > 0 && counter.play >= MIN_COUNTER_PLAY && !unavailable.has(counter.champion_id))
      .sort((left, right) => (left.win / left.play) - (right.win / right.play) || right.play - left.play)
      .slice(0, MAX_COUNTERS_PER_ENEMY)

    for (const counter of counters) {
      const enemyWinRate = counter.play > 0 ? counter.win / counter.play : 1
      const score = 1 - enemyWinRate
      const existing = suggestions.get(counter.champion_id)
      if (existing) {
        existing.score += score
        existing.matchups.push({ enemyId, enemyWinRate, play: counter.play })
      } else {
        suggestions.set(counter.champion_id, {
          championId: counter.champion_id,
          score,
          matchups: [{ enemyId, enemyWinRate, play: counter.play }],
        })
      }
    }
  }

  return Array.from(suggestions.values())
    .sort((left, right) => right.score - left.score || right.matchups.length - left.matchups.length)
    .slice(0, MAX_SUGGESTIONS)
}

function buildSuggestionsByEnemy(session: ChampSelectSession, summary: OpggRankedChampionsSummary): Map<number, CounterSuggestion[]> {
  const championsById = new Map(summary.data.map((champion) => [champion.id, champion]))
  const unavailable = getUnavailableChampionIds(session)
  const result = new Map<number, CounterSuggestion[]>()

  for (const enemy of session.theirTeam) {
    const enemyId = getSelectedChampionId(enemy)
    if (enemyId <= 0) continue

    const enemyStats = championsById.get(enemyId)
    const enemyPosition = getBestPosition(enemyStats, mapAssignedPosition(enemy.assignedPosition))
    if (!enemyPosition) {
      result.set(enemyId, [])
      continue
    }

    const suggestions = [...enemyPosition.counters]
      .filter((counter) => counter.champion_id > 0 && counter.play >= MIN_COUNTER_PLAY && !unavailable.has(counter.champion_id))
      .sort((left, right) => (left.win / left.play) - (right.win / right.play) || right.play - left.play)
      .slice(0, MAX_SUGGESTIONS)
      .map((counter) => {
        const enemyWinRate = counter.play > 0 ? counter.win / counter.play : 1
        return {
          championId: counter.champion_id,
          score: 1 - enemyWinRate,
          matchups: [{ enemyId, enemyWinRate, play: counter.play }],
        }
      })

    result.set(enemyId, suggestions)
  }

  return result
}

function getCounterMessage(enemyChampionId: number, suggestions: CounterSuggestion[]): string {
  if (counterDataState === 'loading') return ''
  if (counterDataState === 'error') return counterDataMessage
  if (suggestionsByEnemyId.has(enemyChampionId) && suggestions.length === 0) {
    return 'OP.GG 没有该英雄/分路的 counter 数据，或可推荐英雄已被选择/禁用。'
  }
  return '尚未读取到该敌方英雄的 OP.GG counter 数据。'
}

function showCounterModal(enemyChampionId: number, enemyLane: string, suggestions: CounterSuggestion[]) {
  if (!counterModalContainer) {
    counterModalContainer = document.createElement('div')
    counterModalContainer.id = 'sonaenhance-counter-recommendation-modal-root'
    document.body.appendChild(counterModalContainer)
    counterModalRoot = createRoot(counterModalContainer)
  }

  const close = () => {
    counterModalRoot?.render(
      createElement(CounterRecommendationModal, {
        open: false,
        onClose: close,
        enemyChampionId: 0,
        enemyLane: '',
        suggestions: [],
        state: 'ready',
      }),
    )
  }

  counterModalRoot!.render(
    createElement(CounterRecommendationModal, {
      open: true,
      onClose: close,
      enemyChampionId,
      enemyLane,
      suggestions,
      state: counterDataState,
      message: getCounterMessage(enemyChampionId, suggestions),
    }),
  )
}

function cleanupCounterModal() {
  if (counterModalRoot) {
    counterModalRoot.unmount()
    counterModalRoot = null
  }
  if (counterModalContainer) {
    counterModalContainer.remove()
    counterModalContainer = null
  }
}

function cleanupEnemyIconBindings() {
  for (const { el, handler } of boundEnemyIcons) {
    el.removeEventListener('click', handler, true)
    el.removeAttribute(COUNTER_CLICK_ATTR)
    el.removeAttribute(COUNTER_CHAMPION_ATTR)
    el.style.cursor = ''
    el.title = ''
  }
  boundEnemyIcons.length = 0
}

function cleanupEnemyIconBinding(el: HTMLElement) {
  const index = boundEnemyIcons.findIndex((binding) => binding.el === el)
  if (index < 0) return

  const [binding] = boundEnemyIcons.splice(index, 1)
  binding.el.removeEventListener('click', binding.handler, true)
  binding.el.removeAttribute(COUNTER_CLICK_ATTR)
  binding.el.removeAttribute(COUNTER_CHAMPION_ATTR)
  binding.el.style.cursor = ''
  binding.el.title = ''
}

function pruneDisconnectedEnemyIconBindings() {
  for (let index = boundEnemyIcons.length - 1; index >= 0; index--) {
    const binding = boundEnemyIcons[index]
    if (binding.el.isConnected) continue

    binding.el.removeEventListener('click', binding.handler, true)
    binding.el.removeAttribute(COUNTER_CLICK_ATTR)
    binding.el.removeAttribute(COUNTER_CHAMPION_ATTR)
    boundEnemyIcons.splice(index, 1)
  }
}

function tryBindEnemyCounterIcons(): boolean {
  if (!currentSession) return true

  pruneDisconnectedEnemyIconBindings()

  const wrappers = document.querySelectorAll('.party.visible .summoner-wrapper.visible.right')
  if (wrappers.length === 0) return false

  wrappers.forEach((wrapper, index) => {
    if (!(wrapper instanceof HTMLElement)) return
    const iconContainer = wrapper.querySelector('.champion-icon-container') as HTMLElement | null
    if (!iconContainer) return

    const enemy = currentSession?.theirTeam[index]
    const enemyChampionId = enemy ? getSelectedChampionId(enemy) : 0
    if (!enemy || enemyChampionId <= 0) return

    const boundChampionId = Number(wrapper.getAttribute(COUNTER_CHAMPION_ATTR) || 0)
    if (wrapper.hasAttribute(COUNTER_CLICK_ATTR) && boundChampionId === enemyChampionId) return
    if (wrapper.hasAttribute(COUNTER_CLICK_ATTR)) cleanupEnemyIconBinding(wrapper)

    const laneLabel = getLaneLabel(mapAssignedPosition(enemy.assignedPosition))
    const handler = (event: Event) => {
      const target = event.target as HTMLElement
      if (target.closest('.swap-button-component, .swap-button-btn')) return

      event.stopPropagation()
      event.preventDefault()
      const suggestions = suggestionsByEnemyId.get(enemyChampionId) ?? []
      showCounterModal(enemyChampionId, laneLabel, suggestions)
    }

    wrapper.setAttribute(COUNTER_CLICK_ATTR, 'true')
    wrapper.setAttribute(COUNTER_CHAMPION_ATTR, String(enemyChampionId))
    wrapper.style.cursor = 'pointer'
    wrapper.title = `${getChampionName(enemyChampionId)} Counter 鎺ㄨ崘`
    iconContainer.style.cursor = 'pointer'
    iconContainer.title = `${getChampionName(enemyChampionId)} Counter 推荐`
    wrapper.addEventListener('click', handler, true)
    boundEnemyIcons.push({ el: wrapper, handler })
  })

  return true
}

function registerCounterInjection() {
  if (!injectRegistered) {
    injector.register(tryBindEnemyCounterIcons)
    injectRegistered = true
  }
  startRearmTimer()
}

function unregisterCounterInjection() {
  if (injectRegistered) {
    injector.unregister(tryBindEnemyCounterIcons)
    injectRegistered = false
  }
  stopRearmTimer()
  cleanupEnemyIconBindings()
}

function startRearmTimer() {
  if (rearmTimer != null) return

  rearmTimer = window.setInterval(() => {
    tryBindEnemyCounterIcons()
  }, CHAMP_SELECT_REARM_INTERVAL_MS)
}

function stopRearmTimer() {
  if (rearmTimer == null) return
  window.clearInterval(rearmTimer)
  rearmTimer = null
}

async function refreshCounterRecommendations(session: ChampSelectSession) {
  currentSession = session

  registerCounterInjection()
  tryBindEnemyCounterIcons()

  const signature = getEnemySignature(session)
  if (!signature || signature === lastSuggestionSignature) return
  lastSuggestionSignature = signature

  const hasEnemyPick = session.theirTeam.some((player) => getSelectedChampionId(player) > 0)
  if (!hasEnemyPick) return

  counterDataState = 'loading'
  counterDataMessage = ''
  suggestionsByEnemyId = new Map()
  registerCounterInjection()
  tryBindEnemyCounterIcons()

  try {
    const summary = await ensureRankedSummary()
    const globalSuggestions = buildSuggestions(session, summary)
    suggestionsByEnemyId = buildSuggestionsByEnemy(session, summary)
    counterDataState = 'ready'
    counterDataMessage = ''

    registerCounterInjection()
    tryBindEnemyCounterIcons()
    logger.info('[CounterPick] Counter 推荐已准备: enemies=%d, global=%d', suggestionsByEnemyId.size, globalSuggestions.length)
  } catch (err) {
    counterDataState = 'error'
    counterDataMessage = err instanceof Error ? err.message : String(err)
    registerCounterInjection()
    tryBindEnemyCounterIcons()
    logger.warn('[CounterPick] 生成 counter 建议失败:', err)
  }
}

function mount(session?: ChampSelectSession) {
  lastSuggestionSignature = ''
  currentSession = session ?? null
  suggestionsByEnemyId = new Map()
  counterDataState = 'loading'
  counterDataMessage = ''
  void ensureRankedSummary().catch((err) => {
    counterDataState = 'error'
    counterDataMessage = err instanceof Error ? err.message : String(err)
    logger.warn('[CounterPick] OP.GG counter 数据预取失败:', err)
  })
  if (session) void refreshCounterRecommendations(session)
}

function unmount() {
  lastSuggestionSignature = ''
  currentSession = null
  suggestionsByEnemyId = new Map()
  counterDataState = 'loading'
  counterDataMessage = ''
  unregisterCounterInjection()
  cleanupCounterModal()
}

export function updateChampSelectCounterRecommendation(enabled: boolean) {
  installCounterDebugHandle()

  if (enabled && !phaseUnsub) {
    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        lcu.getChampSelectSession()
          .then((session) => mount(session))
          .catch(() => mount())
      } else {
        unmount()
      }
    })

    champSelectUnsub = lcu.observe(LcuEventUri.CHAMP_SELECT, (event: LCUEventMessage) => {
      if (event.eventType !== 'Create' && event.eventType !== 'Update') return
      currentSession = event.data as ChampSelectSession
      void refreshCounterRecommendations(currentSession)
    })

    lcu.getGameflowPhase().then((phase) => {
      if (phase === 'ChampSelect') {
        lcu.getChampSelectSession()
          .then((session) => mount(session))
          .catch(() => mount())
      }
    }).catch(() => { /* ignore */ })

    logger.info('[CounterPick] 选人 counter 建议已启用')
  } else if (!enabled && phaseUnsub) {
    phaseUnsub()
    phaseUnsub = null
    if (champSelectUnsub) {
      champSelectUnsub()
      champSelectUnsub = null
    }
    unmount()
    logger.info('[CounterPick] 选人 counter 建议已禁用')
  }
}

function handleOpggCacheCleared() {
  rankedSummaryPromise = null
  rankedSummaryCache = null
  rankedSummaryCacheTier = null
  lastSuggestionSignature = ''
  suggestionsByEnemyId = new Map()
  counterDataState = 'loading'
  counterDataMessage = ''
  if (currentSession) void refreshCounterRecommendations(currentSession)
}

export function installOpggCounterCacheClearHandler() {
  if (cacheClearListenerInstalled) return
  cacheClearListenerInstalled = true
  window.addEventListener(OPGG_CACHE_CLEARED_EVENT, handleOpggCacheCleared)
}

installCounterDebugHandle()
