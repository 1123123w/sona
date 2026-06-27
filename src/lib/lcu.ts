/**
 * LCUManager - Sona's LCU API manager.
 *
 * In Pengu Loader, the plugin runs inside the League Client embedded browser,
 * so it can call LCU APIs through fetch without port/token/https handling.
 * WebSocket events are observed through PenguContext.socket.observe.
 *
 * @see https://pengu.lol/guide/lcu-request
 * @see https://pengu.lol/runtime-api
 */

import type {
  SummonerInfo,
  LobbyConfig,
  Lobby,
  MatchSearchState,
  MatchSearchResult,
  ReadyCheck,
  GameflowPhase,
  GameflowSession,
  ChampSelectSession,
  ChampSelectPlayerDetail,
  ChatConversation,
  ChatMessage,
  ChatMe,
  Availability,
  SendChatMessageBody,
  QueueId,
  LCUEventMessage,
  MatchHistoryResponse,
  MatchDetail,
  MatchGame,
  MatchTeam,
  Participant,
  ParticipantIdentity,
  ChatFriend,
  SpectatorLaunchPayload,
  SummonerSpellData,
  ChampionSummaryData,
  GameQueue,
  ChampSelectSummoner,
} from '@/types/lcu'
import { createLogger } from '@/lib/logger'
import { SGP_SERVERS, TENCENT_MATCH_HISTORY_INTEROP } from '@/types/sgp'
import type { SgpEntitlementsToken, SgpGameSummaryLol, SgpMatchHistoryLol, SgpParticipantLol, SgpPerks, SgpTeam } from '@/types/sgp'
import { store } from '@/lib/store'

const logger = createLogger({ name: 'Sona-E LCU', version: '' })

// Re-export types for convenience
export type { SummonerInfo, LobbyConfig, Lobby, GameflowPhase, GameflowSession, LCUEventMessage, ChatConversation, ChatMessage, ChatMe, Availability, SendChatMessageBody, ReadyCheck, ChampSelectSession, ChampSelectPlayerDetail, MatchHistoryResponse, MatchDetail, ChatFriend, SpectatorLaunchPayload, ChampSelectSummoner }
export type { SgpEntitlementsToken, SgpMatchHistoryLol } from '@/types/sgp'
export { SGP_SERVERS, TENCENT_MATCH_HISTORY_INTEROP, TENCENT_SERVER_NAMES, queueIdToTag } from '@/types/sgp'

export { LcuEventUri, QueueId } from '@/types/lcu'

type GameSettingsBackup = {
  general?: unknown
  input?: unknown
  timestamp: number
}

interface SgpSummonerLite {
  puuid?: string
  gameName?: string
  tagLine?: string
  name?: string
}

// ==================== Low-Level Request Helper ====================

/**
 * Send an LCU REST API request.
 * @param endpoint API endpoint, e.g. '/lol-summoner/v1/current-summoner'
 * @param options fetch options
 */
async function request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`[LCU] 请求失败: ${options.method ?? 'GET'} ${url} → ${response.status} ${response.statusText}`)
  }

  // 204 No Content and similar responses do not need body parsing.
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T)
}

function get<T = unknown>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'GET' })
}

function post<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

function put<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'PUT',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

export interface RunePagePayload {
  name: string
  primaryStyleId: number
  subStyleId: number
  selectedPerkIds: number[]
  current: boolean
}

export interface RunePage extends RunePagePayload {
  id: number
  isActive?: boolean
  isDeletable?: boolean
  isEditable?: boolean
  order?: number
}

export interface ItemSetEntry {
  id: string
  count: number
}

export interface ItemSetBlock {
  type: string
  items: ItemSetEntry[]
}

export interface ItemSet {
  uid: string
  title: string
  type: string
  mode: string
  map: string
  associatedChampions: number[]
  associatedMaps: number[]
  blocks: ItemSetBlock[]
  preferredItemSlots: unknown[]
  sortrank: number
  startedFrom: string
}

export interface ItemSetWrapper {
  accountId: number
  itemSets: ItemSet[]
  timestamp: number
}

export interface RegaliaBannerInventoryItem {
  assetPath: string
  id: string
  idSecondary: string
  isSelectable: boolean
  isTencentOnly: boolean
  localizedDescription: string
  localizedName: string
  regaliaType: string
}

export interface RegaliaBannerInventoryEntry {
  isOwned: boolean
  items: RegaliaBannerInventoryItem[]
  purchaseDate?: string
}

export type RegaliaBannerInventory = RegaliaBannerInventoryEntry[]

function isRegaliaBannerInventoryEntry(value: unknown): value is RegaliaBannerInventoryEntry {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
}

function normalizeRegaliaBannerInventory(raw: unknown): RegaliaBannerInventory {
  if (Array.isArray(raw)) {
    return raw.filter(isRegaliaBannerInventoryEntry)
  }

  // Tencent client versions may return either an array or an object keyed by inventory item ID.
  // Normalize both shapes to arrays for callers.
  if (raw && typeof raw === 'object') {
    return Object.values(raw).filter(isRegaliaBannerInventoryEntry)
  }

  return []
}

export interface RegaliaInfo {
  bannerType: string
  crestType: string
  highestRankedEntry: unknown | null
  lastSeasonHighestRank: unknown | null
  preferredBannerType: string
  preferredCrestType: string
  profileIconId: number
  selectedPrestigeCrest: number
  summonerLevel: number
}

export interface ChallengePlayerPreferencesPayload {
  bannerAccent?: string
  challengeIds?: Array<string | number>
}

function patch<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'PATCH',
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

function del<T = unknown>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'DELETE' })
}

// ==================== SGP Server ID Mapping ====================

/**
 * Map platformId / issuer subdomain to SGP_SERVERS key.
 *
 * Handles platformId and SGP_SERVERS key mismatches:
 * - EUW1 (platformId) → EUW (SGP_SERVERS key)
 * - RU1 → RU
 * - NA to NA1 because command-line --region can omit the number
 *
 * Based on LeagueAkari region/rsoPlatformId versus SGP_SERVERS config.
 * @see resources/builtin-config/sgp/league-servers.json
 */
const PLATFORM_ID_TO_SGP_KEY: Record<string, string> = {
  // Non-Tencent platformId has numeric suffix but SGP_SERVERS key does not.
  EUW1: 'EUW',
  EUN: 'EUN1',
  EUNE: 'EUN1',
  EUN1: 'EUN1',
  RU1: 'RU',
  // Command-line --region can omit the number while SGP_SERVERS key includes it.
  NA: 'NA1',
  OCE: 'OC1',
  // These platformIds match SGP_SERVERS keys, listed explicitly to avoid omissions.
  BR1: 'BR1',
  JP1: 'JP1',
  KR: 'KR',
  LA1: 'LA1',
  LA2: 'LA2',
  OC1: 'OC1',
  TR1: 'TR1',
  TW2: 'TW2',
  SG2: 'SG2',
  PH2: 'PH2',
  VN2: 'VN2',
  TH2: 'TH2',
  PBE: 'PBE',
}

function normalizeSgpServerKey(rawCode: string): string {
  const code = rawCode.toUpperCase()
  const mapped = PLATFORM_ID_TO_SGP_KEY[code] ?? code
  return SGP_SERVERS[mapped] ? mapped : ''
}

/** Tencent platformId set, requiring the TENCENT_ prefix. */
const TENCENT_PLATFORM_IDS = new Set([
  'HN1', 'HN2', 'HN3', 'HN4', 'HN5', 'HN6', 'HN7', 'HN8', 'HN9',
  'HN10', 'HN11', 'HN12', 'HN13', 'HN14', 'HN15', 'HN16', 'HN17', 'HN18', 'HN19',
  'WT1', 'WT2', 'WT3', 'WT4', 'WT5', 'WT6', 'WT7',
  'EDU1',
  'BGP1', 'BGP2',
  'NJ100', 'GZ100', 'CQ100', 'TJ100', 'TJ101',
  'PBE', 'PREPBE',
])

// ==================== LCUManager Class ====================

type EventCallback = (message: LCUEventMessage) => void

/**
 * LCUManager - centralizes LCU REST APIs and WebSocket events.
 *
 * Usage:
 * ```ts
 * import { lcu } from '@/lib/lcu'
 *
 * // REST API
 * const summoner = await lcu.getSummonerInfo()
 *
 * // WebSocket event listener
 * lcu.observe('/lol-gameflow/v1/gameflow-phase', (event) => {
 *   console.log('Gameflow phase:', event.data)
 * })
 * ```
 */
class LCUManager {
  private eventListeners = new Map<string, Set<EventCallback>>()
  /** URIs already observed on the current socket. */
  private observedUris = new Set<string>()
  private penguContext: PenguContext | null = null

  // -------------------- SGP Token Cache --------------------

  /**
   * Entitlements token cache.
   *
   * Kept fresh by the `/entitlements/v1/token` WS event.
   * LCU pushes a new token before expiry, so no local expiry math is needed.
   * Initial value is fetched once, then updated by WS events.
   */
  private _entitlementsToken: SgpEntitlementsToken | null = null

  /**
   * League Session token cache.
   *
   * Kept fresh by the `/lol-league-session/v1/league-session-token` WS event.
   */
  private _leagueSessionToken: string | null = null

  /** Whether both SGP tokens are ready. */
  get isSgpTokenReady(): boolean {
    return this._entitlementsToken !== null && this._leagueSessionToken !== null
  }

  /** Get cached Entitlements token without a network request. */
  get cachedEntitlementsToken(): SgpEntitlementsToken | null {
    return this._entitlementsToken
  }

  /** Get cached League Session token without a network request. */
  get cachedLeagueSessionToken(): string | null {
    return this._leagueSessionToken
  }


  // -------------------- Initialization --------------------

  /**
   * Bind PenguContext for WebSocket event observation.
   * Should be called during init(context).
   */
  bindContext(context: PenguContext) {
    this.penguContext = context

    // Context/socket changed, but existing business callbacks stay valid.
    // Clear only the low-level observed URI state and reattach existing callbacks to the new socket.
    const uris = Array.from(this.eventListeners.keys())
    this.observedUris.clear()

    logger.debug('[LCUManager] bindContext() replay %d observed uri(s)', uris.length)
    uris.forEach((uri) => this.observeUriOnSocket(uri))

    // Initialize SGP token keepalive immediately after context binding.
    this._initSgpTokenKeepAlive()
  }

  /**
   * SGP token keepalive.
   *
   * Based on LeagueAkari's _maintainEntitlementsToken / _maintainLeagueSessionToken.
   *
   * Strategy:
   * 1. Fetch tokens once at startup to fill cache.
   * 2. Listen to LCU WebSocket events and update cache when tokens change.
   *    - `/entitlements/v1/token` → Entitlements Token
   *    - `/lol-league-session/v1/league-session-token` → League Session Token
   * 3. LCU pushes new tokens before expiry, so no local expiry math is needed.
   */
  private _initSgpTokenKeepAlive() {
    // 1. Fetch initial tokens.
    this._fetchInitialTokens()

    // 2. Keep tokens fresh through WS events.
    this.observe('/entitlements/v1/token', (event) => {
      const token = event.data as SgpEntitlementsToken | null
      if (token) {
        this._entitlementsToken = token
        logger.debug('[LCUManager] Entitlements Token updated from WS event')
      } else {
        this._entitlementsToken = null
        logger.debug('[LCUManager] Entitlements Token cleared from WS event')
      }
    })

    this.observe('/lol-league-session/v1/league-session-token', (event) => {
      const token = event.data as string | null
      if (token) {
        this._leagueSessionToken = token
        logger.debug('[LCUManager] League Session Token updated from WS event')
      } else {
        this._leagueSessionToken = null
        logger.debug('[LCUManager] League Session Token cleared from WS event')
      }
    })
  }

  /** Fetch initial tokens and fill cache. */
  private async _fetchInitialTokens() {
    try {
      const [entToken, sessionToken] = await Promise.all([
        this.getEntitlementsToken().catch((e) => {
          console.warn('[LCUManager] 初始拉取 Entitlements Token 失败:', e)
          return null
        }),
        this.getLeagueSessionToken().catch((e) => {
          console.warn('[LCUManager] 初始拉取 League Session Token 失败:', e)
          return null
        }),
      ])
      if (entToken) {
        this._entitlementsToken = entToken
        logger.debug('[LCUManager] Initial Entitlements Token fetched')
      }
      if (sessionToken) {
        this._leagueSessionToken = sessionToken
        logger.debug('[LCUManager] Initial League Session Token fetched')
      }
    } catch (error) {
      console.warn('[LCUManager] 初始拉取 SGP Token 异常:', error)
    }
  }


  // -------------------- Low-Level Request (Public) --------------------

  /** Generic REST request. */
  request = request
  get = get
  post = post
  put = put
  patch = patch
  delete = del

  // ==================== Summoner ====================

  /** Get current logged-in summoner. */
  getSummonerInfo(): Promise<SummonerInfo> {
    return get<SummonerInfo>('/lol-summoner/v1/current-summoner')
  }

  /** Get summoner by summoner ID. */
  getSummonerById(summonerId: number): Promise<SummonerInfo> {
    return get<SummonerInfo>(`/lol-summoner/v1/summoners/${summonerId}`)
  }

  /** Get summoner by puuid. */
  getSummonerByPuuid(puuid: string): Promise<SummonerInfo> {
    return get<SummonerInfo>(`/lol-summoner/v2/summoners/puuid/${puuid}`)
  }

  /** Get summoner by gameName + tagLine (Riot ID). */
  getSummonerByRiotId(gameName: string, tagLine: string): Promise<SummonerInfo> {
    return get<SummonerInfo>(`/lol-summoner/v1/alias/lookup?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`)
  }

  /**
   * Resolve a Riot ID to PUUID.
   *
   * Local lookup is always tried first. Cross-region collection is intentionally
   * limited to Tencent servers, because their SGP match-history token can query
   * the configured interop regions.
   */
  async resolveSummonerPuuidByRiotId(gameName: string, tagLine: string): Promise<string> {
    const name = gameName.trim()
    const tag = tagLine.trim()
    if (!name || !tag) return ''

    const local = await this.getSummonerByRiotId(name, tag).catch((err) => {
      logger.warn('[CrossRegion] 本区 Riot ID 查询失败: %o', err)
      return null
    })
    if (local?.puuid) return local.puuid

    const sgpServerId = (await this.getSgpServerId().catch(() => '')).toUpperCase()
    if (!sgpServerId.startsWith('TENCENT_')) {
      logger.info('[CrossRegion] 非国服环境，跳过跨大区 Riot ID 查询: %s', sgpServerId || 'unknown')
      return ''
    }

    const token = this._entitlementsToken ?? await this.getEntitlementsToken().catch((err) => {
      logger.warn('[CrossRegion] 获取 Entitlements Token 失败: %o', err)
      return null
    })
    if (!token?.accessToken) return ''
    this._entitlementsToken = token

    const wantTag = tag.toLowerCase()
    const wantName = name.toLowerCase()
    const results = await Promise.allSettled(
      TENCENT_MATCH_HISTORY_INTEROP.map((regionKey) => this._getSgpSummonerByName(regionKey, name, token.accessToken)),
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const regionKey = TENCENT_MATCH_HISTORY_INTEROP[i]
      if (result.status !== 'fulfilled') {
        logger.warn('[CrossRegion] %s 查询异常: %o', regionKey, result.reason)
        continue
      }

      const summoner = result.value
      if (!summoner?.puuid) continue

      const foundTag = (summoner.tagLine ?? '').trim().toLowerCase()
      const foundName = (summoner.gameName ?? summoner.name ?? '').trim().toLowerCase()
      if ((foundTag && foundTag === wantTag) || (!foundTag && foundName === wantName)) {
        logger.info('[CrossRegion] Riot ID 命中: %s#%s -> %s (%s)', name, tag, summoner.puuid, regionKey)
        return summoner.puuid
      }
    }

    logger.info('[CrossRegion] 未匹配到 Riot ID: %s#%s', name, tag)
    return ''
  }

  private async _getSgpSummonerByName(regionKey: string, gameName: string, accessToken: string): Promise<SgpSummonerLite | null> {
    const server = SGP_SERVERS[regionKey]
    const base = server?.common ?? server?.matchHistory
    if (!base) return null

    const regionCode = regionKey.replace(/^TENCENT_/, '')
    const url = `${base}/summoner-ledge/v1/regions/${regionCode}/summoners/name/${encodeURIComponent(gameName)}`
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'LeagueOfLegendsClient/14.13.596.7996 (rcp-be-lol-summoner)',
      },
    })

    if (!resp.ok) return null
    return resp.json()
  }

  /** Set current summoner icon. */
  setProfileIcon(profileIconId: number): Promise<unknown> {
    return put('/lol-summoner/v1/current-summoner/icon', { profileIconId })
  }

  /** Get the client item-set wrapper for a summoner. */
  getItemSets(summonerId: number): Promise<ItemSetWrapper> {
    return get<ItemSetWrapper>(`/lol-item-sets/v1/item-sets/${summonerId}/sets`)
  }

  /** Replace the client item-set wrapper for a summoner. */
  putItemSets(summonerId: number, wrapper: ItemSetWrapper): Promise<ItemSetWrapper> {
    return put<ItemSetWrapper>(`/lol-item-sets/v1/item-sets/${summonerId}/sets`, wrapper)
  }

  /** Build a base spectator payload; prefer spectatorKey from friend presence when available. */
  createSpectatorLaunchPayload(puuid: string, overrides: Partial<SpectatorLaunchPayload> = {}): SpectatorLaunchPayload {
    return {
      allowObserveMode: 'ALL',
      dropInSpectateGameId: '',
      gameQueueType: '',
      puuid,
      ...overrides,
    }
  }

  /**
   * Build a spectator payload from friend presence.
   *
   * spectatorKey is available at friend.lol.spectatorKey from `/lol-chat/v1/friends`.
   * It exists only for friends who are in-game and allow spectating.
   */
  async getSpectatorLaunchPayloadByPuuid(puuid: string): Promise<SpectatorLaunchPayload | null> {
    const friends = await this.getFriends()
    const target = friends.find((friend) => friend.puuid.toLowerCase() === puuid.toLowerCase())
    if (!target?.lol?.spectatorKey) return null

    return this.createSpectatorLaunchPayload(target.puuid, {
      gameQueueType: target.lol.gameQueueType || target.lol.gameMode || '',
      spectatorKey: target.lol.spectatorKey,
    })
  }

  /**
   * Spectate a specific player.
   *
   * Akari's LCU helper passes only puuid; the real client sometimes needs spectatorKey.
   * Pass the full payload from getSpectatorLaunchPayloadByPuuid when available.
   */
  launchSpectator(payload: string | SpectatorLaunchPayload): Promise<unknown> {
    return post(
      '/lol-spectator/v1/spectate/launch',
      typeof payload === 'string' ? this.createSpectatorLaunchPayload(payload) : payload,
    )
  }


  /** Get ranked stats for the current player. */
  getCurrentRankedStats(): Promise<unknown> {
    return get('/lol-ranked/v1/current-ranked-stats')
  }

  /** Get ranked stats by puuid. */
  getRankedStats(puuid: string): Promise<unknown> {
    return get(`/lol-ranked/v1/ranked-stats/${puuid}`)
  }

  // ==================== Lobby ====================

  /** Get current lobby. */
  getLobby(): Promise<Lobby> {
    return get<Lobby>('/lol-lobby/v2/lobby')
  }

  /** Create a lobby by queue ID. */
  createLobby(queueId: QueueId | number): Promise<unknown> {
    return post('/lol-lobby/v2/lobby', { queueId })
  }

  /** Create a lobby with a custom config. */
  createCustomLobby(config: LobbyConfig): Promise<unknown> {
    return post('/lol-lobby/v2/lobby', config)
  }

  /** Leave current lobby. */
  leaveLobby(): Promise<unknown> {
    return del('/lol-lobby/v2/lobby')
  }

  /**
   * Dodge ChampSelect.
   *
   * Uses the client's own TeamBuilder leave endpoint captured from custom-lobby traffic.
   * This is cleaner than the LCDS proxy endpoint:
   *   - no URL-encoded args or LCDS signature construction
   *   - no body, pure POST
   *   - path semantics are explicit
   *
   * Note: this can apply dodge penalties, so callers must confirm the scenario.
   */
  dodgeChampSelect(): Promise<unknown> {
    // Pure POST with no body.
    return post('/lol-lobby-team-builder/champ-select/v1/session/quit')
  }

  // ==================== Matchmaking ====================

  /** Start matchmaking. */
  startMatchmaking(): Promise<unknown> {
    return post('/lol-lobby/v2/lobby/matchmaking/search')
  }

  /** Stop matchmaking. */
  stopMatchmaking(): Promise<unknown> {
    return del('/lol-lobby/v2/lobby/matchmaking/search')
  }

  /** Get current matchmaking search state. */
  async getMatchSearchState(): Promise<MatchSearchState> {
    const result = await get<MatchSearchResult>('/lol-lobby/v2/lobby/matchmaking/search-state')
    return result.searchState
  }

  /** Accept Ready Check. */
  acceptMatch(): Promise<unknown> {
    return post('/lol-matchmaking/v1/ready-check/accept')
  }

  /** Decline Ready Check. */
  declineMatch(): Promise<unknown> {
    return post('/lol-matchmaking/v1/ready-check/decline')
  }

  /** Get Ready Check state. */
  getReadyCheck(): Promise<ReadyCheck> {
    return get<ReadyCheck>('/lol-matchmaking/v1/ready-check')
  }

  // ==================== Gameflow ====================

  /** Get current gameflow phase. */
  getGameflowPhase(): Promise<GameflowPhase> {
    return get<GameflowPhase>('/lol-gameflow/v1/gameflow-phase')
  }

  /** Get gameflow session details. */
  getGameflowSession(): Promise<GameflowSession> {
    return get<GameflowSession>('/lol-gameflow/v1/session')
  }

  /** Quit the game early by closing the game window. */
  earlyExitGame(): Promise<unknown> {
    return post('/lol-gameflow/v1/early-exit')
  }

  /** Surrender. */
  surrender(): Promise<unknown> {
    return post('/lol-gameflow/v1/surrender')
  }

  /** Play again after the game ends. */
  playAgain(): Promise<unknown> {
    return post('/lol-lobby/v2/play-again')
  }

  // ==================== ChampSelect ====================

  /** Get champ-select session. */
  getChampSelectSession(): Promise<ChampSelectSession> {
    return get<ChampSelectSession>('/lol-champ-select/v1/session')
  }

  /** Get summoner state for a champ-select cell. */
  getChampSelectSummoner(cellId: number): Promise<ChampSelectSummoner> {
    return get<ChampSelectSummoner>(`/lol-champ-select/v1/summoners/${cellId}`)
  }

  /** Get currently pickable champion IDs. */
  getPickableChampionIds(): Promise<number[]> {
    return get<number[]>('/lol-champ-select/v1/pickable-champion-ids')
  }

  /** Get currently bannable champion IDs. */
  getBannableChampionIds(): Promise<number[]> {
    return get<number[]>('/lol-champ-select/v1/bannable-champion-ids')
  }

  /** Get currently disabled champion IDs. */
  getDisabledChampionIds(): Promise<number[]> {
    return get<number[]>('/lol-champ-select/v1/disabled-champion-ids')
  }

  /**
   * Lock a champion, completing pick or ban action.
   *
   * Flow: find the local in-progress action in the current session,
   * PATCH the champion, then POST complete to lock.
   *
   * @param championId champion ID to lock
   * @param actionId optional action ID; omitted means auto-detect current in-progress action
   */
  async lockChampion(championId: number, actionId?: number): Promise<void> {
    let targetActionId = actionId

    if (targetActionId == null) {
      const session = await this.getChampSelectSession()
      const myAction = session.actions
        .flat(2)
        .find((a) => a.actorCellId === session.localPlayerCellId && a.isInProgress && !a.completed)

      if (!myAction) {
        throw new Error('[LCU] 找不到当前正在进行的选人/禁人动作')
      }
      targetActionId = myAction.id
    }

    // Select champion first.
    await patch(`/lol-champ-select/v1/session/actions/${targetActionId}`, { championId })
    // Then lock/confirm.
    await post(`/lol-champ-select/v1/session/actions/${targetActionId}/complete`)
  }

  /**
   * Select a champion without locking.
   * Only PATCHes champion selection and does not complete the action.
   */
  async pickChampion(championId: number, actionId?: number): Promise<void> {
    let targetActionId = actionId

    if (targetActionId == null) {
      const session = await this.getChampSelectSession()
      const myAction = session.actions
        .flat(2)
        .find((a) => a.actorCellId === session.localPlayerCellId && a.isInProgress && !a.completed)

      if (!myAction) {
        throw new Error('[LCU] 找不到当前正在进行的选人动作')
      }
      targetActionId = myAction.id
    }

    await patch(`/lol-champ-select/v1/session/actions/${targetActionId}`, { championId })
  }

  /**
   * Update own champ-select settings such as skin or summoner spells.
   * @param selection selection payload
   */
  updateMySelection(selection: { selectedSkinId?: number; spell1Id?: number; spell2Id?: number; wardSkinId?: number }): Promise<unknown> {
    return patch('/lol-champ-select/v1/session/my-selection', selection)
  }

  /**
   * Reroll champion in ARAM.
   * Consumes reroll points and gives a random new champion.
   */
  reroll(): Promise<unknown> {
    return post('/lol-champ-select/v1/session/my-selection/reroll')
  }

  /**
   * Take a champion from the ARAM bench.
   * Swaps the current champion into the bench for the requested champion.
   * @param championId champion ID to take from the bench
   */
  benchSwap(championId: number): Promise<unknown> {
    return post(`/lol-champ-select/v1/session/bench/swap/${championId}`)
  }

  /**
   * Get the current ARAM bench champions from session.benchChampions.
   */
  async getBenchChampions(): Promise<{ championId: number; isPriority: boolean }[]> {
    const session = await this.getChampSelectSession()
    return session.benchChampions
  }

  /**
   * Get detailed information for all players in current ChampSelect.
   * Includes summoner info, ranked data, and recent match history.
   * @returns allied and enemy player info arrays
   */
  async getChampSelectPlayers(): Promise<{
    myTeam: ChampSelectPlayerDetail[]
    theirTeam: ChampSelectPlayerDetail[]
  }> {
    const session = await this.getChampSelectSession()

    const fetchDetail = async (player: { summonerId: number; championId: number; assignedPosition: string }): Promise<ChampSelectPlayerDetail> => {
      try {
        const summoner = await this.getSummonerById(player.summonerId)
        const [ranked, matchHistory] = await Promise.all([
          this.getRankedStats(summoner.puuid).catch(() => null),
          this.getMatchHistory(summoner.puuid, 0, 19).catch(() => null),
        ])
        return {
          summonerId: player.summonerId,
          championId: player.championId,
          assignedPosition: player.assignedPosition,
          gameName: summoner.gameName,
          tagLine: summoner.tagLine,
          summonerLevel: summoner.summonerLevel,
          puuid: summoner.puuid,
          profileIconId: summoner.profileIconId,
          ranked,
          recentMatches: matchHistory,
        }
      } catch {
        return {
          summonerId: player.summonerId,
          championId: player.championId,
          assignedPosition: player.assignedPosition,
          gameName: 'Unknown',
          tagLine: '',
          summonerLevel: 0,
          puuid: '',
          profileIconId: 0,
          ranked: null,
          recentMatches: null,
        }
      }
    }

    const [myTeam, theirTeam] = await Promise.all([
      Promise.all(session.myTeam.map(fetchDetail)),
      Promise.all(session.theirTeam.map(fetchDetail)),
    ])

    return { myTeam, theirTeam }
  }

  // ==================== Chat ====================

  /** Get current user's chat state. */
  getChatMe(): Promise<ChatMe> {
    return get<ChatMe>('/lol-chat/v1/me')
  }

  /**
   * Change player availability.
   * @param availability availability state: 'chat' | 'away' | 'dnd' | 'offline' | 'mobile'
   * @param statusMessage optional custom status message
   */
  setAvailability(availability: Availability, statusMessage?: string): Promise<ChatMe> {
    const body: Partial<ChatMe> = { availability }
    if (statusMessage != null) {
      body.statusMessage = statusMessage
    }
    return put<ChatMe>('/lol-chat/v1/me', body)
  }

  /** Set custom status message. */
  setStatusMessage(statusMessage: string): Promise<ChatMe> {
    return put<ChatMe>('/lol-chat/v1/me', { statusMessage })
  }

  /** Get chat conversations. */
  getChatConversations(): Promise<ChatConversation[]> {
    return get<ChatConversation[]>('/lol-chat/v1/conversations')
  }

  /** Get messages for a conversation. */
  getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    return get<ChatMessage[]>(`/lol-chat/v1/conversations/${conversationId}/messages`)
  }

  /**
   * Send a message to a conversation.
   *
   * Note: LCU API messages are limited to 2696 characters including spaces.
   * This is an API-level limit; the frontend UI's 200-character limit is only client validation.
   *
   * @param conversationId conversation ID
   * @param message message content or full request body
   */
  sendChatMessage(conversationId: string, message: string | SendChatMessageBody): Promise<ChatMessage> {
    const body: SendChatMessageBody = typeof message === 'string'
      ? { body: message, type: 'chat' }
      : message
    return post<ChatMessage>(`/lol-chat/v1/conversations/${conversationId}/messages`, body)
  }

  /**
   * Get the current champ-select chat conversation.
   * Finds the conversation whose type is 'championSelect'.
   * @returns champ-select conversation, or null outside ChampSelect
   */
  async getChampSelectConversation(): Promise<ChatConversation | null> {
    const conversations = await this.getChatConversations()
    return conversations.find((c) => c.type === 'championSelect') ?? null
  }

  /**
   * Send a message in champ-select chat.
   * Automatically finds the champ-select conversation and sends the message.
   * @param message message content
   * @param type message type: 'chat', 'celebration', or 'system'
   * @throws when not in ChampSelect or no championSelect conversation exists
   */
  async sendChampSelectMessage(message: string, type?: 'chat' | 'celebration' | 'system' |'information' | string): Promise<ChatMessage> {
    const conversation = await this.getChampSelectConversation()
    if (!conversation) {
      throw new Error('[LCU] 当前不在英雄选择阶段，找不到 championSelect 会话')
    }
    return this.sendChatMessage(conversation.id, { body: message, type: type ?? 'chat' })
  }

  // ==================== Queue Info ====================

  /** Get all available queues, including localized names, game modes, maps, etc. */
  getQueues(): Promise<GameQueue[]> {
    return get<GameQueue[]>('/lol-game-queues/v1/queues')
  }

  /** Get current game mode info. */
  getCurrentGamemode(): Promise<unknown> {
    return get('/lol-lobby/v1/parties/gamemode')
  }

  /** Get all game modes. */
  getGameModes(): Promise<unknown[]> {
    return get<unknown[]>('/lol-game-queues/v1/game-type-config')
  }

  /** Get all map info. */
  getMaps(): Promise<unknown[]> {
    return get<unknown[]>('/lol-maps/v1/maps')
  }

  /** Get map asset data, including localized map-skin and mutator names. */
  getMapAssets(): Promise<unknown[]> {
    return get<unknown[]>('/lol-game-data/assets/v1/maps.json')
  }

  // ==================== Match History ====================

  /**
   * Get match-history list.
   * @param puuid omitted for current player, provided for a specific player
   * @param begIndex start index, default 0
   * @param endIndex end index, default 19 for 20 games
   */
  getMatchHistory(puuid?: string, begIndex = 0, endIndex = 19): Promise<MatchHistoryResponse> {
    const base = puuid
      ? `/lol-match-history/v1/products/lol/${puuid}/matches`
      : '/lol-match-history/v1/products/lol/current-summoner/matches'
    return get(`${base}?begIndex=${begIndex}&endIndex=${endIndex}`)
  }

  /**
   * Get match details.
   * @param gameId game ID
   */
  getMatchDetail(gameId: number): Promise<MatchDetail> {
    return get<MatchDetail>(`/lol-match-history/v1/games/${gameId}`)
  }

  /**
   * Get match timeline data.
   * @param gameId game ID
   */
  getMatchTimeline(gameId: number): Promise<unknown> {
    return get(`/lol-match-history/v1/game-timelines/${gameId}`)
  }

  /** Get recently played-with summoners. */
  getRecentlyPlayedSummoners(): Promise<unknown> {
    return get('/lol-match-history/v1/recently-played-summoners')
  }

  // ==================== SGP Token ====================

  /**
   * Get Entitlements token required for SGP match-history queries.
   *
   * Return fields:
   * - `accessToken`: JWT used as `Authorization: Bearer {accessToken}` for SGP match APIs
   * - `token`: Entitlements JWT, a different format used by some SGP APIs
   * - `issuer`: issuer URL, e.g. `http://hn1-k8s-bcs-internal.lol.qq.com:28088`
   * - `subject`: player PUUID
   * - `entitlements`: entitlement list, usually empty
   *
   * Akari refreshes this through `/entitlements/v1/token`; here it is fetched on demand.
   */
  getEntitlementsToken(): Promise<SgpEntitlementsToken> {
    return get('/entitlements/v1/token')
  }

  /**
   * Get League Session token required for general SGP queries.
   *
   * Returns a raw JWT string used as `Authorization: Bearer {token}` for general SGP APIs.
   */
  getLeagueSessionToken(): Promise<string> {
    return get('/lol-league-session/v1/league-session-token')
  }

  /**
   * Infer current SGP server ID from Entitlements token issuer.
   *
   * Resolution strategy:
   * 1. Prefer `/lol-chat/v1/me` platformId, the closest Pengu equivalent to Akari's
   *    `--region` / `--rso_platform_id` source.
   * 2. Fallback to Entitlements token issuer.
   * 3. Resolved values must exist in Akari-style `SGP_SERVERS`; otherwise continue fallback.
   *
   * Known differences from LeagueAkari:
   * - LeagueAkari reads official command-line args, but Pengu plugins cannot access them.
   * - Some Tencent issuers omit `k8s`, so old regexes can fail.
   * - Non-Tencent issuer subdomains may differ from SGP_SERVERS keys.
   */
  async getSgpServerId(): Promise<string> {
    // Akari uses client launch args; in Pengu, ChatMe.platformId is the closest source.
    const fromPlatformId = await this._parseSgpServerIdFromPlatformId()
    if (fromPlatformId) return fromPlatformId

    // Fallback: parse issuer. Some non-Tencent issuers are routing clusters rather than
    // SGP_SERVERS keys; normalizeSgpServerKey filters unsupported results.
    const fromIssuer = this._parseSgpServerIdFromIssuer()
    if (fromIssuer) return fromIssuer

    return ''
  }

  /** Parse SGP server ID from issuer URL. */
  private _parseSgpServerIdFromIssuer(): string {
    const tokenRes = this._entitlementsToken
    if (!tokenRes) return ''

    const issuer = tokenRes.issuer ?? ''

    // Tencent: match issuers under lol.qq.com.
    // Known formats:
    //   http://hn1-k8s-bcs-internal.lol.qq.com:28088  (with k8s)
    //   http://nj100-bcs-internal.lol.qq.com:28088     (without k8s)
    // Extract the first subdomain segment as server code and ignore middle segments like -k8s.
    const tencentMatch = issuer.match(/https?:\/\/([a-z0-9]+)(?:-[a-z0-9]+)*\.lol\.qq\.com/)
    if (tencentMatch) {
      const serverCode = tencentMatch[1].toUpperCase() // e.g. "HN1", "NJ100"
      return normalizeSgpServerKey(`TENCENT_${serverCode}`)
    }

    // Non-Tencent: match pvp.net domains.
    // Known formats:
    //   https://euw1-red.lol.sgp.pvp.net
    //   https://euw-red.lol.sgp.pvp.net
    //   https://na-red.lol.sgp.pvp.net
    //   https://kr-red.lol.sgp.pvp.net
    const externalMatch = issuer.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.lol\.sgp\.pvp\.net/)
      ?? issuer.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.(?:lol\.)?sgp\.pvp\.net/)
      ?? issuer.match(/https?:\/\/([a-z0-9]+)-/)
    if (externalMatch) {
      const rawCode = externalMatch[1].toUpperCase()
      // issuer subdomain may differ from SGP_SERVERS key and needs mapping.
      return normalizeSgpServerKey(rawCode)
    }

    return ''
  }

  /** Parse SGP server ID from /lol-chat/v1/me platformId as fallback. */
  private async _parseSgpServerIdFromPlatformId(): Promise<string> {
    try {
      const me = await this.getChatMe()
      const platformId = me.platformId?.toUpperCase() ?? ''
      if (!platformId) return ''

      // Tencent platformId such as HN1, HN10, NJ100, TJ100 needs TENCENT_ prefix.
      if (TENCENT_PLATFORM_IDS.has(platformId)) {
        return normalizeSgpServerKey(`TENCENT_${platformId}`)
      }

      // Non-Tencent platformId such as EUW1, NA1, KR, JP1 may need mapping.
      return normalizeSgpServerKey(platformId)
    } catch {
      return ''
    }
  }

  /**
   * Query match-history list through SGP.
   *
   * Advantages over LCU:
   * - supports `tag` queue filtering, such as `q_450` for ARAM
   * - avoids browser cache issues
   * - supports cross-server Tencent queries
   * - bypasses the LCU 100-game cap
   *
   * @param puuid player PUUID
   * @param options query options
   * @param options.startIndex start index, default 0; SGP uses startIndex instead of LCU begIndex
   * @param options.count result count, default 100; SGP uses count instead of LCU endIndex
   * @param options.tag queue filter such as `q_450`; omit to query all modes
   */
  async getSgpMatchHistory(puuid: string, options?: {
    startIndex?: number
    count?: number
    tag?: string
  }): Promise<SgpMatchHistoryLol> {
    const debugContext = {
      platformId: '',
      sgpServerId: '',
      matchHistoryBaseUrl: '',
      requestUrl: '',
      issuer: this._entitlementsToken?.issuer ?? '',
    }

    try {
      const chatMe = await this.getChatMe().catch(() => null)
      debugContext.platformId = chatMe?.platformId ?? ''

      const token = this._entitlementsToken ?? await this.getEntitlementsToken()
      if (!this._entitlementsToken) {
        this._entitlementsToken = token
      }
      debugContext.issuer = token.issuer ?? debugContext.issuer

      const sgpServerId = await this.getSgpServerId()
      debugContext.sgpServerId = sgpServerId
      const server = SGP_SERVERS[sgpServerId.toUpperCase()]
      debugContext.matchHistoryBaseUrl = server?.matchHistory ?? ''
      if (!server?.matchHistory) {
        throw new Error(`[SGP] 找不到服务器配置: ${sgpServerId}`)
      }

      const params = new URLSearchParams()
      params.set('startIndex', String(options?.startIndex ?? 0))
      params.set('count', String(options?.count ?? 100))
      if (options?.tag) {
        params.set('tag', options.tag)
      }

      const url = `${server.matchHistory}/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?${params}`
      debugContext.requestUrl = url

      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'User-Agent': 'LeagueOfLegendsClient/14.13.596.7996 (rcp-be-lol-match-history)',
        },
      })

      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        throw new Error(`[SGP] 请求失败: ${resp.status} ${resp.statusText} ${body.slice(0, 1000)}`)
      }

      return resp.json()
    } catch (err) {
      logger.warn('[SGP] 战绩查询失败，回退到客户端原生战绩接口: %o', {
        platformId: debugContext.platformId || 'unknown',
        sgpServerId: debugContext.sgpServerId || 'unknown',
        matchHistoryBaseUrl: debugContext.matchHistoryBaseUrl || 'unknown',
        issuer: debugContext.issuer || 'unknown',
        puuid,
        startIndex: options?.startIndex ?? 0,
        count: options?.count ?? 100,
        tag: options?.tag ?? '',
        requestUrl: debugContext.requestUrl || 'not-built',
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      return this.getNativeMatchHistoryAsSgp(puuid, options)
    }
  }

  private async getNativeMatchHistoryAsSgp(puuid: string, options?: {
    startIndex?: number
    count?: number
    tag?: string
  }): Promise<SgpMatchHistoryLol> {
    const startIndex = Math.max(0, options?.startIndex ?? 0)
    const count = Math.max(1, options?.count ?? 100)
    const queueId = this.parseQueueIdFromSgpTag(options?.tag)

    // Native LCU match history does not support SGP tags. When filtering by queue,
    // fetch the latest 100 games, filter locally, then apply SGP-like pagination.
    const begIndex = queueId ? 0 : startIndex
    const endIndex = queueId ? 99 : startIndex + count - 1
    const native = await this.getMatchHistory(puuid, begIndex, endIndex)
    const nativeGames = native.games?.games ?? []
    const filteredGames = queueId
      ? nativeGames.filter((game) => game.queueId === queueId).slice(startIndex, startIndex + count)
      : nativeGames

    return {
      games: filteredGames.map((game) => this.mapNativeMatchGameToSgpGame(game)),
    }
  }

  private parseQueueIdFromSgpTag(tag: string | undefined): number | null {
    const match = tag?.match(/^q_(\d+)$/)
    if (!match) return null

    const queueId = Number.parseInt(match[1], 10)
    return Number.isFinite(queueId) && queueId > 0 ? queueId : null
  }

  private mapNativeMatchGameToSgpGame(game: MatchGame): SgpGameSummaryLol {
    const identitiesByParticipantId = new Map<number, ParticipantIdentity>()
    game.participantIdentities.forEach((identity) => {
      identitiesByParticipantId.set(identity.participantId, identity)
    })

    const participants = game.participants.map((participant) => {
      return this.mapNativeParticipantToSgpParticipant(
        participant,
        identitiesByParticipantId.get(participant.participantId),
        game.gameDuration,
      )
    })

    return {
      metadata: {
        product: 'lol',
        tags: [`q_${game.queueId}`],
        participants: participants.map((participant) => participant.puuid).filter(Boolean),
        timestamp: new Date(game.gameCreation).toISOString(),
        data_version: '',
        info_type: 'SUMMARY',
        match_id: `${game.platformId}_${game.gameId}`,
        private: false,
      },
      json: {
        endOfGameResult: game.endOfGameResult,
        gameCreation: game.gameCreation,
        gameDuration: game.gameDuration,
        gameEndTimestamp: game.gameCreation + game.gameDuration * 1000,
        gameId: game.gameId,
        gameMode: game.gameMode,
        gameModeMutators: game.gameModeMutators ?? [],
        gameName: '',
        gameStartTimestamp: game.gameCreation,
        gameType: game.gameType,
        gameVersion: game.gameVersion,
        mapId: game.mapId,
        participants,
        platformId: game.platformId,
        queueId: game.queueId,
        seasonId: game.seasonId,
        teams: game.teams.map((team) => this.mapNativeTeamToSgpTeam(team)),
        tournamentCode: '',
      },
    }
  }

  private mapNativeTeamToSgpTeam(team: MatchTeam): SgpTeam {
    return {
      bans: [],
      objectives: {
        baron: { first: team.firstBaron, kills: team.baronKills },
        champion: { first: team.firstBlood, kills: 0 },
        dragon: { first: team.firstDargon, kills: team.dragonKills },
        horde: { first: false, kills: team.hordeKills },
        inhibitor: { first: team.firstInhibitor, kills: team.inhibitorKills },
        riftHerald: { first: false, kills: team.riftHeraldKills },
        tower: { first: team.firstTower, kills: team.towerKills },
      },
      teamId: team.teamId,
      win: team.win === 'Win',
    }
  }

  private mapNativeParticipantToSgpParticipant(
    participant: Participant,
    identity: ParticipantIdentity | undefined,
    gameDuration: number,
  ): SgpParticipantLol {
    const stats = participant.stats
    const player = identity?.player
    const timePlayed = gameDuration || 0
    const perks: SgpPerks = {
      statPerks: { defense: 0, flex: 0, offense: 0 },
      styles: [
        {
          description: 'primaryStyle',
          style: stats.perkPrimaryStyle || 0,
          selections: [
            { perk: stats.perk0 || 0, var1: stats.perk0Var1 || 0, var2: stats.perk0Var2 || 0, var3: stats.perk0Var3 || 0 },
            { perk: stats.perk1 || 0, var1: stats.perk1Var1 || 0, var2: stats.perk1Var2 || 0, var3: stats.perk1Var3 || 0 },
            { perk: stats.perk2 || 0, var1: stats.perk2Var1 || 0, var2: stats.perk2Var2 || 0, var3: stats.perk2Var3 || 0 },
            { perk: stats.perk3 || 0, var1: stats.perk3Var1 || 0, var2: stats.perk3Var2 || 0, var3: stats.perk3Var3 || 0 },
          ],
        },
        {
          description: 'subStyle',
          style: stats.perkSubStyle || 0,
          selections: [
            { perk: stats.perk4 || 0, var1: stats.perk4Var1 || 0, var2: stats.perk4Var2 || 0, var3: stats.perk4Var3 || 0 },
            { perk: stats.perk5 || 0, var1: stats.perk5Var1 || 0, var2: stats.perk5Var2 || 0, var3: stats.perk5Var3 || 0 },
          ],
        },
      ],
    }

    return {
      puuid: player?.puuid ?? '',
      riotIdGameName: player?.gameName ?? player?.summonerName ?? '',
      riotIdTagline: player?.tagLine ?? '',
      summonerName: player?.summonerName ?? player?.gameName ?? '',
      summonerId: player?.summonerId ?? 0,
      profileIcon: player?.profileIcon ?? 0,
      teamId: participant.teamId,
      participantId: participant.participantId,
      championId: participant.championId,
      championName: '',
      champLevel: stats.champLevel,
      spell1Id: participant.spell1Id,
      spell2Id: participant.spell2Id,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      totalMinionsKilled: stats.totalMinionsKilled,
      neutralMinionsKilled: stats.neutralMinionsKilled,
      goldEarned: stats.goldEarned,
      totalDamageDealtToChampions: stats.totalDamageDealtToChampions,
      win: stats.win,
      item0: stats.item0,
      item1: stats.item1,
      item2: stats.item2,
      item3: stats.item3,
      item4: stats.item4,
      item5: stats.item5,
      item6: stats.item6,
      perks,
      challenges: {
        damagePerMinute: timePlayed > 0 ? (stats.totalDamageDealtToChampions / timePlayed) * 60 : 0,
        goldPerMinute: timePlayed > 0 ? (stats.goldEarned / timePlayed) * 60 : 0,
        kda: stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : stats.kills + stats.assists,
        visionScorePerMinute: timePlayed > 0 ? (stats.visionScore / timePlayed) * 60 : 0,
      } as SgpParticipantLol['challenges'],
    } as SgpParticipantLol
  }

  // ==================== Friends ====================

  /**
   * Get friend list, including availability, game status, gameId, etc.
   */
  getFriends(): Promise<ChatFriend[]> {
    return get<ChatFriend[]>('/lol-chat/v1/friends')
  }

  // ==================== Game Assets ====================

  /** Get current client game version, such as "14.7.580.1234". */
  getGameVersion(): Promise<string> {
    return get<string>('/lol-patch/v1/game-version')
  }

  /** Get all item data, including iconPath / description. */
  getItems(): Promise<Array<{ id: number; iconPath: string; name: string; description?: string; shortDescription?: string; longDescription?: string; price?: number; priceTotal?: number }>> {
    return get('/lol-game-data/assets/v1/items.json')
  }

  /** Get all summoner spell data, including iconPath. */
  getSummonerSpells(): Promise<SummonerSpellData[]> {
    return get('/lol-game-data/assets/v1/summoner-spells.json')
  }

  /** Get all champion summary data, including squarePortraitPath. */
  getChampionSummary(): Promise<ChampionSummaryData[]> {
    return get('/lol-game-data/assets/v1/champion-summary.json')
  }

  /** Get all rune data, including iconPath / description for each rune ID. */
  getPerks(): Promise<Array<{ id: number; iconPath: string; name: string; shortDesc?: string; longDesc?: string; description?: string }>> {
    return get('/lol-game-data/assets/v1/perks.json')
  }

  /** Get all rune style data for perkPrimaryStyle / perkSubStyle. */
  getPerkStyles(): Promise<{ styles: Array<{ id: number; iconPath: string; name: string }> }> {
    return get('/lol-game-data/assets/v1/perkstyles.json')
  }

  /** Get Arena / hex-mode augment data. */
  getAugments(): Promise<Array<{ id: number; nameTRA: string; simpleNameTRA: string; augmentSmallIconPath: string; rarity: string }>> {
    return get('/lol-game-data/assets/v1/cherry-augments.json')
  }

  // ==================== Regalia / Challenges Identity ====================

  /** Get challenge-banner inventory owned by the current account. */
  async getRegaliaBannerInventory(): Promise<RegaliaBannerInventory> {
    const raw = await get<unknown>('/lol-regalia/v3/inventory/REGALIA_BANNER')
    return normalizeRegaliaBannerInventory(raw)
  }

  /** Get current summoner Regalia config. */
  getRegalia(): Promise<RegaliaInfo> {
    return get<RegaliaInfo>('/lol-regalia/v2/current-summoner/regalia')
  }

  /** Update challenge identity preferences such as banner and challenge tokens. */
  updateChallengePlayerPreferences(payload: ChallengePlayerPreferencesPayload): Promise<void> {
    return post<void>('/lol-challenges/v1/update-player-preferences', payload)
  }

  /** Apply challenge banner. */
  applyRegaliaBanner(bannerId: string): Promise<void> {
    return this.updateChallengePlayerPreferences({ bannerAccent: bannerId })
  }

  /** Get rune pages. */
  getRunePages(): Promise<RunePage[]> {
    return get<RunePage[]>('/lol-perks/v1/pages')
  }

  /** Create rune page. */
  createRunePage(page: RunePagePayload): Promise<RunePage> {
    return post<RunePage>('/lol-perks/v1/pages', page)
  }

  /** Update rune page. */
  updateRunePage(id: number, page: RunePagePayload): Promise<RunePage> {
    return put<RunePage>(`/lol-perks/v1/pages/${id}`, page)
  }

  /** Create or update a rune page with the same name and make it current. */
  async applyRunePage(page: Omit<RunePagePayload, 'current'>): Promise<RunePage> {
    const payload: RunePagePayload = {
      ...page,
      current: true,
    }
    const pages = await this.getRunePages()
    const existing = pages.find((p) => p.name === page.name && p.isEditable !== false)
    if (existing) {
      return this.updateRunePage(existing.id, payload)
    }

    try {
      return await this.createRunePage(payload)
    } catch (err) {
      const fallback = pages.find((p) => p.current && p.isEditable !== false) ?? pages.find((p) => p.isEditable !== false)
      if (fallback) {
        return this.updateRunePage(fallback.id, payload)
      }
      throw err
    }
  }


  // ==================== Notifications ====================


  /**
   * Send a native client notification.
   * @param title notification title
   * @param details notification details
   */
  sendNotification(title: string, details: string): Promise<unknown> {
    return post('/player-notifications/v1/notifications', {
      detailKey: 'pre_translated_details',
      titleKey: 'pre_translated_title',
      backgroundUrl: '',
      data: { title, details },
      iconUrl: '/lol-game-data/assets/v1/profile-icons/3867.jpg',// https://heimerdinger.lol/index.php/icon/sonaenhance-champie-icon-5s8jq
      source: 'sona',
      state: 'toast',
      type: 'string',
    })
  }

  // ==================== Client Settings Backup / Restore ====================

  private async getPuuid(): Promise<string> {
    const session = await get<{ puuid: string }>('/lol-login/v1/session')
    if (!session.puuid) throw new Error('未获取到 PUUID')
    return session.puuid
  }

  private loadAllBackups(puuid: string): Record<string, GameSettingsBackup> {
    const allBackups = store.get('gameSettingsBackups')
    return allBackups[puuid] ?? {}
  }

  private saveAllBackups(puuid: string, data: Record<string, GameSettingsBackup>) {
    store.set('gameSettingsBackups', {
      ...store.get('gameSettingsBackups'),
      [puuid]: data,
    })
  }

  /** Get general game settings such as graphics, sound, and HUD. */
  getGameSettings(): Promise<unknown> {
    return get('/lol-game-settings/v1/game-settings')
  }

  /** Get input settings from PersistedSettings.json. */
  getInputSettings(): Promise<unknown> {
    return get('/lol-game-settings/v1/input-settings')
  }

  /**
   * Create a named backup of game settings and input settings.
   * @param name user-defined backup name
   */
  async backupSettings(name: string): Promise<boolean> {
    try {
      const puuid = await this.getPuuid()
      const [general, input] = await Promise.all([
        this.getGameSettings(),
        this.getInputSettings(),
      ])
      const all = this.loadAllBackups(puuid)
      all[name] = { general, input, timestamp: Date.now() }
      this.saveAllBackups(puuid, all)
      return true
    } catch {
      return false
    }
  }

  /**
   * Restore a named backup and write it to disk.
   * @param name backup name
   */
  async restoreSettings(name: string): Promise<boolean> {
    try {
      const puuid = await this.getPuuid()
      const all = this.loadAllBackups(puuid)
      const backup = all[name]
      if (!backup) throw new Error(`备份 "${name}" 不存在`)

      // Step 1: restore general game settings.
      if (backup.general) {
        await patch('/lol-game-settings/v1/game-settings', backup.general)
      }

      // Step 2: restore input settings.
      if (backup.input) {
        await patch('/lol-game-settings/v1/input-settings', backup.input)
      }

      // Step 3: force write to disk.
      await post('/lol-game-settings/v1/save')
      return true
    } catch {
      return false
    }
  }

  /**
   * Delete a named backup.
   * @param name backup name
   */
  async deleteBackup(name: string): Promise<boolean> {
    try {
      const puuid = await this.getPuuid()
      const all = this.loadAllBackups(puuid)
      if (!(name in all)) return false
      delete all[name]
      this.saveAllBackups(puuid, all)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all backups, newest first.
   */
  async listBackups(): Promise<{ name: string; timestamp: number }[]> {
    try {
      const puuid = await this.getPuuid()
      const all = this.loadAllBackups(puuid)
      return Object.entries(all)
        .map(([name, data]) => ({ name, timestamp: data.timestamp ?? 0 }))
        .sort((a, b) => b.timestamp - a.timestamp)
    } catch {
      return []
    }
  }

  // ==================== WebSocket Events ====================

  private observeUriOnSocket(uri: string) {
    if (!this.penguContext) {
      console.warn('[LCUManager] PenguContext 未绑定，无法监听事件。请先调用 lcu.bindContext(context)')
      return
    }

    if (this.observedUris.has(uri)) {
      logger.debug('[LCUManager] URI already observed on socket, skip duplicate observe: %s', uri)
      return
    }

    this.observedUris.add(uri)
    logger.debug('[LCUManager] Observing URI on current socket: %s', uri)
    this.penguContext.socket.observe(uri, (data) => {
      logger.debug('[LCUManager] WS event received: uri=%s, data=%o', uri, data)
      const message = data as LCUEventMessage
      const cbs = this.eventListeners.get(uri)
      cbs?.forEach((cb) => {
        try {
          cb(message)
        } catch (err) {
          console.error('[LCUManager] event listener failed -> uri=%s', uri, err)
        }
      })
    })
  }

  /**
   * Observe an LCU WebSocket event.
   *
   * Implemented with Pengu Loader context.socket.observe.
   * Supports multiple callbacks for the same URI.
   *
   * @param uri event URI, e.g. '/lol-gameflow/v1/gameflow-phase'
   * @param callback event callback
   * @returns unsubscribe function
   *
   * @example
   * ```ts
   * const unsubscribe = lcu.observe('/lol-gameflow/v1/gameflow-phase', (event) => {
   *   console.log('Phase changed:', event.data)
   * })
   *
   * // unsubscribe later
   * unsubscribe()
   * ```
   */
  observe(uri: string, callback: EventCallback): () => void {
    logger.debug('[LCUManager] observe() called: uri=%s, hasContext=%s', uri, String(Boolean(this.penguContext)))
    logger.debug('[LCUManager] eventListeners has uri? %s, listeners count: %d', this.eventListeners.has(uri), this.eventListeners.get(uri)?.size ?? 0)

    let listeners = this.eventListeners.get(uri)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(uri, listeners)
    }

    listeners.add(callback)
    this.observeUriOnSocket(uri)

    // Return unsubscribe function.
    return () => {
      const currentListeners = this.eventListeners.get(uri)
      currentListeners?.delete(callback)
      if (currentListeners && currentListeners.size === 0) {
        this.eventListeners.delete(uri)
      }
    }
  }


  /**
   * Disconnect all WebSocket event listeners.
   * Should be called on plugin unload.
   */
  disconnect() {
    if (this.penguContext) {
      this.penguContext.socket.disconnect()
    }
    this.eventListeners.clear()
    this.observedUris.clear()
  }

}

// ==================== Singleton Export ====================

/** LCU manager singleton. */
export const lcu = new LCUManager()
