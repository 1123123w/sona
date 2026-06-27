/**
 * Feature management module.
 *
 * Watches store changes and toggles plugin features automatically.
 * Call initFeatures() from index.tsx load().
 */

import { logger } from '@/index'
import { SETTING_KEYS, store } from '@/lib/store'
import { lcu, LcuEventUri, queueIdToTag } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase, ChampSelectSession } from '@/lib/lcu'
import { injector } from '@/lib/InjectorManager'
import { sleep } from '@/lib/utils'
import { updateBalanceBuffTooltip } from '@/lib/features/balance-buff-viewer'
import { updateChampSelectQuitButton } from '@/lib/features/champselect-quit-button'
import { updateAutoAccept } from '@/lib/features/auto-accept'
import { updateAllowDeclineAfterAccept } from '@/lib/features/ready-check-control'
import { updateDebugGameflow } from '@/lib/features/debug-gameflow'
import { updateUnlockStatus } from '@/lib/features/unlock-status'
import { updateBenchNoCooldown } from '@/lib/features/bench-no-cooldown'
import { updateFriendSmartGroup } from '@/lib/features/friend-smart-group'
import { updateEnhancedFriendGameStatus } from '@/lib/features/enhanced-friend-game-status'
import { updateLobbyMemberMatchHistory } from '@/lib/features/lobby-member-match-history'
import { updateAutoHonor } from '@/lib/features/auto-honor'
import { updateAutoLockChampion } from '@/lib/features/auto-lock-champion'
import { updateAutoBanChampion } from '@/lib/features/auto-ban-champion'
import { updateGameAnalysisPopup } from '@/lib/features/game-analysis-popup'
import { updateAutoReturnToLobby } from '@/lib/features/auto-return-to-lobby'
import { updateGameModeFilter } from '@/lib/features/game-mode-filter'
import { updateHideEsportsPopup } from '@/lib/features/hide-esports-popup'
import { updateQuickLobbyMode } from '@/lib/features/quick-lobby-mode'
import { installOpggBuildCacheClearHandler, updateOpggBuildRecommendation } from '@/lib/features/opgg-build-recommendation'
import { installOpggBanCacheClearHandler, updateOpggBanRecommendation } from '@/lib/features/opgg-ban-recommendation'
import { installOpggCounterCacheClearHandler, updateChampSelectCounterRecommendation } from '@/lib/features/champselect-counter-recommendation'
import { installOpggTierCacheClearHandler, preloadChampSelectTierBadgeData, updateChampSelectTierBadge } from '@/lib/features/champselect-tier-badge'
import {
  refreshOfficialEntryHiding,
  setAvailabilityHijackEnabled,
  setHideAramModeEnabled,
  setHideArenaModeEnabled,
  setHideCustomGameSectionEnabled,
  setHideRightNavTextEnabled,
  setHideTFTPlayCardEnabled,
  setHideSummonerRiftModesEnabled,
  setHideTFTEnabled,
} from '@/lib/injections'
import { calculateSonaPlayerStrengthScore, type SonaPlayerStrengthScore } from '@/lib/player-strength-score'
import { initRuntimeState } from '@/lib/runtime-state'

// ==================== Shared Teammate Win-Rate Query ====================

type ChampSelectTeamPlayer = ChampSelectSession['myTeam'][number]

interface TeammateStats {
  floor: number
  summonerId: number
  puuid: string
  gameName: string
  tagLine: string
  winRate: number | null  // null = 查询失败或无战绩
  wins: number
  total: number
  avgK: number
  avgD: number
  avgA: number
  kdaNum: number
  strengthScore: SonaPlayerStrengthScore | null
}

interface TeamStatsResult {
  isBlue: boolean
  stats: TeammateStats[]
  queueId: number
  fetchCount: number
}

function getPlayerStatsKey(player: Pick<ChampSelectTeamPlayer, 'puuid' | 'summonerId' | 'cellId'>): string {
  if (player.puuid) return `puuid:${player.puuid}`
  if (player.summonerId) return `summoner:${player.summonerId}`
  return `cell:${player.cellId}`
}

function getTeammateStatsKey(stat: TeammateStats): string {
  if (stat.puuid) return `puuid:${stat.puuid}`
  if (stat.summonerId) return `summoner:${stat.summonerId}`
  return `floor:${stat.floor}`
}

/** Dedupe shared data requests within the same ChampSelect phase. */
let _fetchTeamStatsPromise: Promise<TeamStatsResult> | null = null

/**
 * Query recent match history for all teammates in the current ChampSelect.
 * Uses SGP with server-side tag filtering for the current game mode.
 * Returns { isBlue, queueId, stats[], fetchCount }.
 *
 * Concurrent calls reuse one request promise.
 */
async function fetchTeamStats(): Promise<TeamStatsResult> {
  if (_fetchTeamStatsPromise) return _fetchTeamStatsPromise

  _fetchTeamStatsPromise = _doFetchTeamStats()
  try {
    return await _fetchTeamStatsPromise
  } finally {
    _fetchTeamStatsPromise = null
  }
}

async function _doFetchTeamStats(): Promise<TeamStatsResult> {
  const session = await lcu.getChampSelectSession()
  const localPlayer = session.myTeam.find((p) => p.cellId === session.localPlayerCellId)
  const isBlue = localPlayer ? localPlayer.cellId < 5 : true

  // Read queueId directly from ChampSelectSession without an extra request.
  const currentQueueId = session.queueId
  logger.info('[TeamStats] 当前队列 ID: %d', currentQueueId)

  // Convert queueId to SGP tag.
  const tag = queueIdToTag(currentQueueId)

  // Use the larger query size required by shared features so one request has enough data.
  const FETCH_COUNT = Math.max(
    store.get('champSelectAssistFetchCount') || 50,
    store.get('analyzeTeamPowerFetchCount') || 50,
  )

  /** Build a placeholder for streamer-mode teammates whose puuid is empty. */
  const placeholder = (player: ChampSelectTeamPlayer, i: number): TeammateStats => ({
    floor: i + 1,
    summonerId: player.summonerId,
    puuid: player.puuid,
    gameName: player.gameName,
    tagLine: player.tagLine,
    winRate: null,
    wins: 0,
    total: 0,
    avgK: 0,
    avgD: 0,
    avgA: 0,
    kdaNum: 0,
    strengthScore: null,
  })

  // Query all teammate histories in parallel and preserve placeholders for floor alignment.
  const stats = await Promise.all(session.myTeam.map(async (player, i) => {
    // Streamer-mode teammate puuid is empty, so skip querying and return the placeholder.
    if (!player.puuid) {
      return placeholder(player, i)
    }

    try {
      const puuid = player.puuid
      const gameName = player.gameName
      const tagLine = player.tagLine

      // SGP query; tag filtering is handled server-side.
      const resp = await lcu.getSgpMatchHistory(puuid, {
        startIndex: 0,
        count: FETCH_COUNT,
        tag: tag || undefined,
      })
      const games = resp.games ?? []

      const matchStats: Array<{ kills: number; deaths: number; assists: number; win: boolean }> = []

      for (const game of games) {
        const p = game.json.participants.find((pt) => pt.puuid === puuid)
        if (!p) continue

        matchStats.push({
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          win: p.win,
        })
      }

      if (matchStats.length === 0) {
        return placeholder(player, i)
      }

      let wins = 0, totalKills = 0, totalDeaths = 0, totalAssists = 0
      for (const g of matchStats) {
        if (g.win) wins++
        totalKills += g.kills
        totalDeaths += g.deaths
        totalAssists += g.assists
      }

      const total = matchStats.length
      const strengthScore = calculateSonaPlayerStrengthScore(games, puuid)
      logger.info('[TeamStats] %s → SGP 拉取 %d 场 (tag=%s)', gameName, total, tag || '全部')

      return {
        floor: i + 1,
        summonerId: player.summonerId,
        puuid,
        gameName,
        tagLine,
        winRate: (wins / total) * 100,
        wins,
        total,
        avgK: totalKills / total,
        avgD: totalDeaths / total,
        avgA: totalAssists / total,
        kdaNum: totalDeaths === 0 ? totalKills + totalAssists : (totalKills + totalAssists) / totalDeaths,
        strengthScore,
      } as TeammateStats
    } catch {
      return placeholder(player, i)
    }
  }))

  return { isBlue, queueId: currentQueueId, stats, fetchCount: FETCH_COUNT }
}

// ==================== ChampSelect Avatar Win-Rate Assist ====================

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MatchHistoryModal } from '@/components/ui/MatchHistoryModal'

const SONA_STATS_ATTR = 'data-sonaenhance-stats'
const SONA_CLICK_ATTR = 'data-sonaenhance-click'
const SONA_PLAYER_KEY_ATTR = 'data-sonaenhance-player-key'

/** Full stats cache for each floor. */
let floorStats: TeammateStats[] = []
/** puuid to TeammateStats map, used to rebuild floorStats after swaps. */
let statsByPuuid = new Map<string, TeammateStats>()
/** summonerId to TeammateStats fallback map when puuid is unavailable. */
let statsBySummonerId = new Map<number, TeammateStats>()
/** Current DOM order signature, used to trigger rebinding after position swaps. */
let currentChampSelectTeamSignature = ''
/** Current ChampSelect queue ID, used as the default match-history modal filter. */
let currentChampSelectQueueId = 0

/** Injected DOM references, cleaned directly on ChampSelect exit without querySelector. */
interface ChampSelectInjectedRef {
  /** Stats div created by us. */
  statsDiv: HTMLDivElement
  /** iconContainer whose style was modified. */
  iconContainer: HTMLElement
  /** summonerContainer whose overflow was modified, if present. */
  summonerContainer: HTMLElement | null
  /** playerDetails whose style was modified. */
  playerDetails: HTMLElement
  /** Click handler on iconContainer, removed during cleanup. */
  clickHandler: ((e: Event) => void) | null
}
let champSelectInjectedRefs: ChampSelectInjectedRef[] = []

/** Dedicated React root for the match-history modal. */
let matchModalRoot: Root | null = null
let matchModalContainer: HTMLDivElement | null = null

function showMatchHistoryModal(puuid: string, playerName: string, queueId?: number) {
  if (!matchModalContainer) {
    matchModalContainer = document.createElement('div')
    matchModalContainer.id = 'sonaenhance-match-history-modal-root'
    document.body.appendChild(matchModalContainer)
    matchModalRoot = createRoot(matchModalContainer)
  }

  const close = () => {
    matchModalRoot?.render(
      createElement(MatchHistoryModal, { open: false, onClose: close, puuid: '', playerName: '' }),
    )
  }

  matchModalRoot!.render(
    createElement(MatchHistoryModal, { open: true, onClose: close, puuid, playerName, queueId }),
  )
}

function cleanupMatchModal() {
  if (matchModalRoot) {
    matchModalRoot.unmount()
    matchModalRoot = null
  }
  if (matchModalContainer) {
    matchModalContainer.remove()
    matchModalContainer = null
  }
}

function getTeamDisplaySignature(session: ChampSelectSession): string {
  return session.myTeam
    .map((player) => `${getPlayerStatsKey(player)}:${player.cellId}`)
    .join('|')
}

function getCachedStatsForPlayer(player: ChampSelectTeamPlayer, floor: number): TeammateStats {
  const cached = (player.puuid ? statsByPuuid.get(player.puuid) : undefined)
    ?? (player.summonerId ? statsBySummonerId.get(player.summonerId) : undefined)

  if (cached) {
    return {
      ...cached,
      floor,
      gameName: player.gameName || cached.gameName,
      tagLine: player.tagLine || cached.tagLine,
      puuid: player.puuid || cached.puuid,
      summonerId: player.summonerId || cached.summonerId,
    }
  }

  return {
    floor,
    summonerId: player.summonerId,
    puuid: player.puuid,
    gameName: player.gameName,
    tagLine: player.tagLine,
    winRate: null,
    wins: 0,
    total: 0,
    avgK: 0,
    avgD: 0,
    avgA: 0,
    kdaNum: 0,
    strengthScore: null,
  }
}

function buildFloorStatsFromSession(session: ChampSelectSession): TeammateStats[] {
  return session.myTeam
    .map((player, index) => getCachedStatsForPlayer(player, index + 1))
}

/** Mounted React root. */
/** Injection task: add right-side match stats during ChampSelect. */
function tryInjectChampSelectTier(): boolean {
  // Add left here because enemy player information is not visible and cannot be handled.
  const wrappers = document.querySelectorAll('.party.visible .summoner-wrapper.visible.left')
  if (wrappers.length === 0 || floorStats.length === 0) return true

  const hasMismatchedBinding = Array.from(wrappers).some((wrapper, i) => {
    const iconContainer = wrapper.querySelector('.champion-icon-container') as HTMLElement | null
    const stat = floorStats[i]
    if (!iconContainer || !stat) return false

    const expectedKey = getTeammateStatsKey(stat)
    const existingKey = iconContainer.getAttribute(SONA_PLAYER_KEY_ATTR)
    return Boolean(existingKey && existingKey !== expectedKey)
  })

  if (hasMismatchedBinding) {
    cleanupInjectedDOM()
  }

  wrappers.forEach((wrapper, i) => {
    const iconContainer = wrapper.querySelector('.champion-icon-container') as HTMLElement | null
    if (!iconContainer) return

    const stat = floorStats[i]
    if (!stat || stat.winRate == null) return
    const winRate = stat.winRate
    const playerKey = getTeammateStatsKey(stat)
    iconContainer.setAttribute(SONA_PLAYER_KEY_ATTR, playerKey)

    // ---- Avatar click: open match-history modal ----
    let clickHandler: ((e: Event) => void) | null = null
    if (!iconContainer.hasAttribute(SONA_CLICK_ATTR) && stat.puuid) {
      iconContainer.setAttribute(SONA_CLICK_ATTR, 'true')
      iconContainer.style.cursor = 'pointer'
      const boundPlayerKey = playerKey
      clickHandler = (e: Event) => {
        // Let clicks on internal controls such as swap buttons pass through.
        const target = e.target as HTMLElement
        if (target.closest('.swap-button-component, .swap-button-btn')) return

        e.stopPropagation()
        e.preventDefault()
        const current = floorStats.find((item) => getTeammateStatsKey(item) === boundPlayerKey)
        if (current?.puuid) {
          showMatchHistoryModal(current.puuid, `${current.gameName}#${current.tagLine}`, currentChampSelectQueueId || undefined)
        }
      }
      iconContainer.addEventListener('click', clickHandler, true)
    }

    // ---- Match stats below player-details ----
    const playerDetails = wrapper.querySelector('.player-details') as HTMLElement | null
    if (playerDetails && !playerDetails.querySelector(`[${SONA_STATS_ATTR}]`)) {
        playerDetails.style.position = 'relative'
        playerDetails.style.overflow = 'visible'
        const summonerContainer = playerDetails.closest('.summoner-container') as HTMLElement | null
        if (summonerContainer) summonerContainer.style.overflow = 'visible'

        const kdaStr = stat.kdaNum >= 99 ? 'Perfect' : stat.kdaNum.toFixed(1)
        const winColor = winRate >= 55 ? '#5bbd72' : winRate >= 45 ? '#c8aa6e' : '#e74c3c'

        const statsDiv = document.createElement('div')
        statsDiv.setAttribute(SONA_STATS_ATTR, 'true')
        statsDiv.style.cssText = 'position:absolute;left:0;top:100%;display:flex;align-items:center;font-size:11px;line-height:1;white-space:nowrap;margin-top:2px;'

        const winSpan = document.createElement('span')
        winSpan.style.cssText = `color:${winColor};font-weight:bold;display:inline-block;min-width:90px;`
        winSpan.textContent = `${winRate.toFixed(0)}% (${stat.wins}胜/${stat.total - stat.wins}负)`

        const kdaColor = stat.kdaNum >= 5 ? '#5bbd72' : stat.kdaNum >= 3 ? '#c8aa6e' : '#e74c3c'
        const kdaSpan = document.createElement('span')
        kdaSpan.style.cssText = `color:${kdaColor};margin-left:8px;font-weight:bold;text-shadow:0 0 4px rgba(200,170,110,0.6);`
        kdaSpan.textContent = `KDA ${kdaStr}`

        statsDiv.appendChild(winSpan)
        statsDiv.appendChild(kdaSpan)
        playerDetails.appendChild(statsDiv)

        // Record injected references for direct cleanup when leaving ChampSelect.
        champSelectInjectedRefs.push({ statsDiv, iconContainer, summonerContainer, playerDetails, clickHandler })
    }
  })

  return true
}



let tierInjectionRegistered = false

function registerTierInjection() {
  if (!tierInjectionRegistered) {
    injector.register(tryInjectChampSelectTier)
    tierInjectionRegistered = true
  }
}

function unregisterTierInjection() {
  if (tierInjectionRegistered) {
    injector.unregister(tryInjectChampSelectTier)
    tierInjectionRegistered = false
  }
  floorStats = []
  statsByPuuid.clear()
  statsBySummonerId.clear()
  currentChampSelectTeamSignature = ''
  currentChampSelectQueueId = 0

  cleanupInjectedDOM()
  cleanupMatchModal()
}


/** Query win rates and start avatar assist injection. */
async function applyChampSelectAssistStats() {
  try {
    // Clear leftovers from the previous game first.
    unregisterTierInjection()

    const { stats, queueId } = await fetchTeamStats()
    currentChampSelectQueueId = queueId
    floorStats = stats
    // Build puuid to stats mapping so swaps can rebuild floorStats in the new myTeam order.
    statsByPuuid.clear()
    statsBySummonerId.clear()
    for (const s of stats) {
      if (s.puuid) statsByPuuid.set(s.puuid, s)
      if (s.summonerId) statsBySummonerId.set(s.summonerId, s)
    }
    currentChampSelectTeamSignature = stats.map(getTeammateStatsKey).join('|')
    registerTierInjection()

    logger.info('头像特效数据就绪，%d 位队友，队列 ID: %d', stats.length, currentChampSelectQueueId)
  } catch (err) {
    logger.error('头像特效查询失败:', err)
  }
}

let champSelectAssistUnsub: (() => void) | null = null
/** CHAMP_SELECT session update listener for rebuilding floorStats after swaps. */
let champSelectUpdateUnsub: (() => void) | null = null

/**
 * When ChampSelect updates, check whether myTeam puuid order changed.
 * If it changed, rebuild floorStats in the new order and reinject.
 */
function onChampSelectUpdate(event: LCUEventMessage) {
  // Only handle Update events.
  if (event.eventType !== 'Update') return
  // Skip until data is ready.
  if (statsByPuuid.size === 0 && statsBySummonerId.size === 0) return

  const session = event.data as ChampSelectSession
  if (!session?.myTeam) return

  const nextSignature = getTeamDisplaySignature(session)
  if (nextSignature === currentChampSelectTeamSignature) return

  logger.info('[ChampSelect] 检测到队友展示顺序或分路变化，重建头像战绩绑定')

  // Clear old injections and rebuild.
  cleanupInjectedDOM()
  floorStats = buildFloorStatsFromSession(session)
  currentChampSelectTeamSignature = nextSignature
  tryInjectChampSelectTier()
}

/** Clean injected DOM without resetting floorStats, stats maps, or registration state. */
function cleanupInjectedDOM() {
  for (const ref of champSelectInjectedRefs) {
    ref.statsDiv.remove()
    // Remove click handler.
    if (ref.clickHandler) {
      ref.iconContainer.removeEventListener('click', ref.clickHandler, true)
    }
    ref.iconContainer.style.filter = ''
    ref.iconContainer.style.boxShadow = ''
    ref.iconContainer.removeAttribute(SONA_CLICK_ATTR)
    ref.iconContainer.removeAttribute(SONA_PLAYER_KEY_ATTR)
    ref.iconContainer.style.cursor = ''
    ref.playerDetails.removeAttribute(SONA_STATS_ATTR)
    ref.playerDetails.style.cursor = ''
    if (ref.summonerContainer) ref.summonerContainer.style.overflow = ''
  }
  champSelectInjectedRefs = []
}

function updateChampSelectAssist(enabled: boolean) {
  if (enabled && !champSelectAssistUnsub) {
    champSelectAssistUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        // Clear previous-game leftovers immediately so the new game starts clean.
        unregisterTierInjection()
        applyChampSelectAssistStats()
      } else {
        unregisterTierInjection()
      }
    })
    // Listen for ChampSelect session updates to detect floor swaps.
    champSelectUpdateUnsub = lcu.observe(LcuEventUri.CHAMP_SELECT, onChampSelectUpdate)
    logger.info('Champ select assist enabled ✓')
  } else if (!enabled && champSelectAssistUnsub) {
    champSelectAssistUnsub()
    champSelectAssistUnsub = null
    unregisterTierInjection()
    if (champSelectUpdateUnsub) {
      champSelectUpdateUnsub()
      champSelectUpdateUnsub = null
    }
    logger.info('Champ select assist disabled')
  }
}

// ==================== ChampSelect Assist Info ====================

/**
 * Return a League-flavored short comment based on win rate and KDA.
 */
export function getRating(winRate: number, kda: number): string {
  if (winRate >= 75 && kda >= 4.5) return '👑 峡谷通天代'
  if (winRate >= 70) return '🚀 降维来炸鱼'
  if (winRate >= 65) return '🔥 绝对真大腿'
  if (winRate >= 60) return '⚔️ 绝活哥出列'
  if (winRate >= 56) return '✨ 稳健老司机'
  if (winRate >= 52) return '🛡️ 上分好帮手'
  if (winRate >= 48) return '🎲 峡谷摇摆人'
  if (winRate >= 45) return '🫠 默默抗压中'
  if (winRate >= 41) return '🍂 随缘在补位'
  if (winRate >= 37) return '💀 连败渡劫中'
  if (winRate >= 33) return '🤡 敌方突破口'
  if (winRate >= 28) return '💸 峡谷提款机'
  if (winRate >= 20) return '🏳️ 投降发起人'
  return '☠️ 演员已就位'
}

const TEAM_POWER_TITLES = ['🦄 独角马', '🏇 上等马', '🐎 中等马', '🐴 下等马', '🐂 纯牛马'] as const

function assignTeamPowerTitles(stats: TeammateStats[]): Map<string, string> {
  const ranked = [...stats]
    .filter((stat): stat is TeammateStats & { strengthScore: SonaPlayerStrengthScore } => Boolean(stat.strengthScore))
    .sort((a, b) => b.strengthScore.score - a.strengthScore.score)

  const titles = new Map<string, string>()
  ranked.forEach((stat, index) => {
    titles.set(getTeammateStatsKey(stat), TEAM_POWER_TITLES[Math.min(index, TEAM_POWER_TITLES.length - 1)])
  })

  return titles
}

async function analyzeTeammates() {
  try {
    const { stats, fetchCount } = await fetchTeamStats()

    logger.info('┌─── 队友战绩分析 ───')

    const chatLines: string[] = [`Sona-E助手 ♫   队友卡池一览(本模式近${fetchCount}场战绩):\n`]
    const teamPowerTitles = assignTeamPowerTitles(stats)

    for (const s of stats) {
      const floor = `${s.floor}楼`
      if (s.winRate == null) {
        logger.info('│ %s — %s#%s — 无近期战绩或查询失败', floor, s.gameName, s.tagLine)
        chatLines.push(`${floor}: 🆕 萌新上线|胜率--|综合评分--`)
        continue
      }

      const winRate = s.winRate.toFixed(1)
      const kdaStr = s.kdaNum >= 99 ? 'Perfect' : s.kdaNum.toFixed(2)
      const title = teamPowerTitles.get(getTeammateStatsKey(s)) ?? '🆕 萌新上线'
      const scoreText = s.strengthScore ? s.strengthScore.score.toFixed(1) : '--'

      logger.info(
        '│ %s — %s#%s — 近%d场 胜率: %s%% (%d胜%d负) | KDA: %s (%.1f/%.1f/%.1f) | 综合评分: %s | %s',
        floor, s.gameName, s.tagLine,
        s.total, winRate, s.wins, s.total - s.wins,
        kdaStr, s.avgK, s.avgD, s.avgA, scoreText, title,
      )

      chatLines.push(`${floor}: ${title}|胜率${winRate}%|KDA${kdaStr}|综合评分${scoreText}`)
    }

    logger.info('└────────────────────')

    // Wait until chat is ready before sending.
    const msg = chatLines.join('\n')
    const msgType = store.get('analyzeTeamPowerMsgType') || 'celebration'
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await lcu.sendChampSelectMessage(msg, msgType)
        logger.info('队友分析已发送到聊天框 ✓')
        break
      } catch {
        if (attempt < 9) {
          await sleep(1000)
        } else {
          logger.warn('聊天发送失败，聊天室始终未就绪')
        }
      }
    }
  } catch (err) {
    logger.error('队友战绩分析失败:', err)
  }
}

let analyzeTeamPowerUnsub: (() => void) | null = null

function updateAnalyzeTeamPower(enabled: boolean) {
  if (enabled && !analyzeTeamPowerUnsub) {
    analyzeTeamPowerUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        analyzeTeammates()
      }
    })
    logger.info('Analyze team power enabled ✓')
  } else if (!enabled && analyzeTeamPowerUnsub) {
    analyzeTeamPowerUnsub()
    analyzeTeamPowerUnsub = null
    logger.info('Analyze team power disabled')
  }
}

// ==================== ChampSelect Side Indicator ====================

async function sendSideIndicator() {
  try {
    const session = await lcu.getChampSelectSession()
    const localPlayer = session.myTeam.find((p) => p.cellId === session.localPlayerCellId)
    const isBlue = localPlayer ? localPlayer.cellId < 5 : true
    const sideText = isBlue ? '🔵 蓝方 (左下方)' : '🔴 红方 (右上方)'

    // ARAM map variants are not available during ChampSelect.
    // /lol-gameflow/v1/session returns empty map.gameMutator / mapMutator at this stage,
    // so the map name is intentionally not shown here.
    const msg = `Sona-E助手 ♫   本局${sideText}`
    const msgType = store.get('sideIndicatorMsgType') || 'celebration'
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await lcu.sendChampSelectMessage(msg, msgType)
        logger.info('红蓝方提示已发送 → %s', sideText)
        break
      } catch {
        if (attempt < 9) {
          await sleep(1000)
        } else {
          logger.warn('红蓝方提示发送失败，聊天室始终未就绪')
        }
      }
    }
  } catch (err) {
    logger.error('红蓝方提示失败:', err)
  }
}

let sideIndicatorUnsub: (() => void) | null = null

function updateSideIndicator(enabled: boolean) {
  if (enabled && !sideIndicatorUnsub) {
    sideIndicatorUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        sendSideIndicator()
      }
    })
    logger.info('Side indicator enabled ✓')
  } else if (!enabled && sideIndicatorUnsub) {
    sideIndicatorUnsub()
    sideIndicatorUnsub = null
    logger.info('Side indicator disabled')
  }
}

// ==================== Initialization ====================


/**
 * Initialize all features.
 * Enables features from current store values and watches future changes.
 */
let featuresInitialized = false

function installOpggCacheClearHandlers() {
  installOpggBuildCacheClearHandler()
  installOpggCounterCacheClearHandler()
  installOpggTierCacheClearHandler()
  installOpggBanCacheClearHandler()
}

export function initFeatures() {
  if (featuresInitialized) {
    logger.debug('initFeatures() skipped because features are already initialized')
    return
  }
  featuresInitialized = true

  installOpggCacheClearHandlers()
  preloadChampSelectTierBadgeData()

  updateAutoAccept(store.get(SETTING_KEYS.autoAcceptMatch))
  store.onChange(SETTING_KEYS.autoAcceptMatch, updateAutoAccept)

  updateAllowDeclineAfterAccept(store.get('allowDeclineAfterAccept'))
  store.onChange('allowDeclineAfterAccept', updateAllowDeclineAfterAccept)

  updateDebugGameflow(store.get('developerMode'))
  store.onChange('developerMode', updateDebugGameflow)

  updateUnlockStatus(store.get('unlockStatus'))
  store.onChange('unlockStatus', updateUnlockStatus)

  updateBenchNoCooldown(store.get('benchNoCooldown'))
  store.onChange('benchNoCooldown', updateBenchNoCooldown)

  updateAnalyzeTeamPower(store.get('analyzeTeamPower'))
  store.onChange('analyzeTeamPower', updateAnalyzeTeamPower)

  updateSideIndicator(store.get('sideIndicator'))
  store.onChange('sideIndicator', updateSideIndicator)

  updateChampSelectAssist(store.get('champSelectAssist'))
  updateChampSelectTierBadge(store.get('champSelectAssist'))
  store.onChange('champSelectAssist', (enabled) => {
    updateChampSelectAssist(enabled)
    updateChampSelectTierBadge(enabled)
  })

  const updateOpggLifecycle = () => {
    updateOpggBuildRecommendation(
      store.get(SETTING_KEYS.opggBuildRecommendation) || store.get(SETTING_KEYS.smartBuildRecommendation),
    )
  }
  updateOpggLifecycle()
  updateOpggBanRecommendation(store.get(SETTING_KEYS.opggBuildRecommendation))
  store.onChange(SETTING_KEYS.opggBuildRecommendation, () => {
    updateOpggLifecycle()
    updateOpggBanRecommendation(store.get(SETTING_KEYS.opggBuildRecommendation))
  })
  store.onChange(SETTING_KEYS.smartBuildRecommendation, updateOpggLifecycle)

  updateChampSelectCounterRecommendation(store.get(SETTING_KEYS.champSelectCounterRecommendation))
  store.onChange(SETTING_KEYS.champSelectCounterRecommendation, updateChampSelectCounterRecommendation)

  updateFriendSmartGroup(store.get('friendSmartGroup'))
  store.onChange('friendSmartGroup', updateFriendSmartGroup)

  updateEnhancedFriendGameStatus(store.get('enhancedFriendGameStatus'))
  store.onChange('enhancedFriendGameStatus', updateEnhancedFriendGameStatus)

  updateLobbyMemberMatchHistory(store.get('lobbyEnhancement'))
  store.onChange('lobbyEnhancement', updateLobbyMemberMatchHistory)

  updateAutoHonor(store.get('autoHonor'))
  store.onChange('autoHonor', updateAutoHonor)

  updateAutoLockChampion(store.get('autoLockChampion'))
  store.onChange('autoLockChampion', updateAutoLockChampion)

  updateAutoBanChampion(store.get('autoBanChampion'))
  store.onChange('autoBanChampion', updateAutoBanChampion)

  updateBalanceBuffTooltip(store.get('balanceBuffTooltip'))
  store.onChange('balanceBuffTooltip', updateBalanceBuffTooltip)

  updateChampSelectQuitButton(store.get('champSelectQuitButton'))
  store.onChange('champSelectQuitButton', updateChampSelectQuitButton)

  updateGameAnalysisPopup(store.get('gameAnalysisPopup'))
  store.onChange('gameAnalysisPopup', updateGameAnalysisPopup)

  updateAutoReturnToLobby(store.get('autoReturnToLobby'))
  store.onChange('autoReturnToLobby', updateAutoReturnToLobby)
  store.onChange('autoReturnMode', () => {
    // Re-register when mode changes so enabled features apply the new mode.
    if (store.get('autoReturnToLobby')) {
      updateAutoReturnToLobby(false)
      updateAutoReturnToLobby(true)
    }
  })

  // Unlock availability switching by taking over the client button with a custom menu.
  setAvailabilityHijackEnabled(store.get('unlockAvailability'))
  store.onChange('unlockAvailability', setAvailabilityHijackEnabled)

  // Hide TFT entry points.
  setHideTFTEnabled(store.get('hideTFT'))
  store.onChange('hideTFT', (enabled) => {
    setHideTFTEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  updateGameModeFilter(store.get('gameModeFilter'))
  store.onChange('gameModeFilter', updateGameModeFilter)

  updateQuickLobbyMode(store.get('quickLobbyMode'))
  store.onChange('quickLobbyMode', updateQuickLobbyMode)

  setHideTFTPlayCardEnabled(store.get('hideTFTPlayCard'))
  store.onChange('hideTFTPlayCard', (enabled) => {
    setHideTFTPlayCardEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  setHideSummonerRiftModesEnabled(store.get('hideSummonerRiftModes'))
  store.onChange('hideSummonerRiftModes', (enabled) => {
    setHideSummonerRiftModesEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  setHideAramModeEnabled(store.get('hideAramMode'))
  store.onChange('hideAramMode', (enabled) => {
    setHideAramModeEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  setHideArenaModeEnabled(store.get('hideArenaMode'))
  store.onChange('hideArenaMode', (enabled) => {
    setHideArenaModeEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  setHideCustomGameSectionEnabled(store.get('hideCustomGameSection'))
  store.onChange('hideCustomGameSection', (enabled) => {
    setHideCustomGameSectionEnabled(enabled)
    refreshOfficialEntryHiding()
  })

  // Hide home right-nav text.
  setHideRightNavTextEnabled(store.get('hideRightNavText'))
  store.onChange('hideRightNavText', (enabled) => {
    setHideRightNavTextEnabled(enabled)
    refreshOfficialEntryHiding()
  })
  refreshOfficialEntryHiding()

  updateHideEsportsPopup(store.get('hideEsportsPopup'))
  store.onChange('hideEsportsPopup', updateHideEsportsPopup)

  initRuntimeState()

  logger.info('Features initialized ✓')
}
