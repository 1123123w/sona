/**
 * LCU (League Client Update) interface types.
 *
 * Checked against LCU Swagger definitions for client 26.05 and LeagueAkari types.
 * @see https://lcu.kebs.dev/swagger.html
 */

// ==================== Summoner ====================

/** ARAM reroll points. */
export interface RerollPoints {
  currentPoints: number
  maxRolls: number
  numberOfRolls: number
  pointsCostToRoll: number
  pointsToReroll: number
}

/** Current summoner info from GET /lol-summoner/v1/current-summoner. */
export interface SummonerInfo {
  accountId: number
  displayName: string
  gameName: string
  tagLine: string
  internalName: string
  nameChangeFlag: boolean
  percentCompleteForNextLevel: number
  privacy: 'PUBLIC' | 'PRIVATE' | (string & {})
  profileIconId: number
  puuid: string
  rerollPoints: RerollPoints
  summonerId: number
  summonerLevel: number
  unnamed: boolean
  xpSinceLastLevel: number
  xpUntilNextLevel: number
}

// ==================== Lobby ====================

/** Lobby config used by POST /lol-lobby/v2/lobby. */
export interface LobbyConfig {
  queueId?: number
  gameConfig?: {
    gameMode: string
    mapId: number
    gameType?: string
  }
  customGameLobby?: {
    configuration: {
      gameMode: string
      gameMutator: string
      gameServerRegion: string
      mapId: number
      mutators: { id: number }
      spectatorPolicy: string
      teamSize: number
    }
    lobbyName: string
    lobbyPassword: string
  }
  isCustom?: boolean
}

/** Lobby gameConfig field from GET /lol-lobby/v2/lobby. */
export interface LobbyGameConfig {
  allowablePremadeSizes: number[]
  customLobbyName: string
  customMutatorName: string
  customSpectatorPolicy: string
  customSpectators: unknown[]
  customTeam100: unknown[]
  customTeam200: unknown[]
  gameMode: string
  isCustom: boolean
  isLobbyFull: boolean
  isTeamBuilderManaged: boolean
  mapId: number
  maxHumanPlayers: number
  maxLobbySize: number
  maxTeamSize: number
  pickType: string
  premadeSizeAllowed: boolean
  queueId: number
  shouldForceScarcePositionSelection: boolean
  showPositionSelector: boolean
  showQuickPlaySlotSelection: boolean
}

/** Lobby info from GET /lol-lobby/v2/lobby. */
export interface Lobby {
  canStartActivity: boolean
  gameConfig: LobbyGameConfig
  invitations: LobbyInvitation[]
  localMember: LobbyMember
  members: LobbyMember[]
  mucJwtDto: {
    channelClaim: string
    domain: string
    jwt: string
    targetRegion: string
  }
  multiUserChatId: string
  multiUserChatPassword: string
  partyId: string
  partyType: string
  restrictions: unknown[]
  scarcePositions: string[]
  warnings: unknown[]
}

/** Lobby invitation. */
export interface LobbyInvitation {
  invitationId: string
  invitationType: string
  state: string
  timestamp: string
  toSummonerId: number
  toSummonerName: string
}

/** Lobby member from GET /lol-lobby/v2/lobby/members. */
export interface LobbyMember {
  allowedChangeActivity: boolean
  allowedInviteOthers: boolean
  allowedKickOthers: boolean
  allowedStartActivity: boolean
  allowedToggleInvite: boolean
  autoFillEligible: boolean
  autoFillProtectedForPromos: boolean
  autoFillProtectedForSoloing: boolean
  autoFillProtectedForStreaking: boolean
  botChampionId: number
  botDifficulty: string
  botId: string
  firstPositionPreference: string
  intraSubteamPosition: number
  isBot: boolean
  isLeader: boolean
  isSpectator: boolean
  puuid: string
  ready: boolean
  secondPositionPreference: string
  showGhostedBanner: boolean
  subteamIndex: number
  summonerIconId: number
  summonerId: number
  summonerInternalName: string
  summonerLevel: number
  summonerName: string
  teamId: number
}

// ==================== Friends ====================

export type LolGameMode =
  | 'CLASSIC'
  | 'ARAM'
  | 'CHERRY'
  | 'STRAWBERRY'
  | 'TFT'
  | 'KIWI'
  | 'URF'
  | 'ARURF'
  | (string & {})

export type LolGameStatus =
  | 'outOfGame'
  | 'inQueue'
  | 'championSelect'
  | 'inGame'
  | 'spectating'
  | (string & {})

export type LolIconOverride = '' | 'summonerIcon' | 'companion' | (string & {})

export type LolRankedDivision = 'I' | 'II' | 'III' | 'IV' | 'NA' | (string & {})

export type LolRankedTier =
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'EMERALD'
  | 'DIAMOND'
  | 'MASTER'
  | 'GRANDMASTER'
  | 'CHALLENGER'
  | 'NONE'
  | 'NA'
  | (string & {})

/**
 * LOL sub-state fields shared by friends and ChatMe.
 *
 * Notes:
 *   1. All fields are strings, even numeric IDs or booleans, due to XMPP presence history.
 *   2. Fields are sparse; many are missing or empty when the player is not in game.
 *   3. Riot may add fields over time, so unknown fields should not be treated as errors.
 */
export interface LolSubStatus {
  /** Selected banner ID. */
  bannerIdSelected?: string
  /** Challenge crystal level. */
  challengeCrystalLevel?: string
  /** Challenge points as string. */
  challengePoints?: string
  /** Three selected challenge tokens, comma-separated. */
  challengeTokensSelected?: string
  /** Current champion ID; TFT usually uses an empty string. */
  championId?: string
  /** Companion ID; in TFT this represents the current Little Legend. */
  companionId?: string
  /** Kill effect skin ID, often board/effect decoration in TFT. */
  damageSkinId?: string
  /** Current game ID; empty or undefined means not in game. */
  gameId?: string
  /** Game mode such as CLASSIC/ARAM/CHERRY/TFT/KIWI/URF/ARURF. */
  gameMode?: LolGameMode
  /** Queue type, sometimes present instead of queueId. */
  gameQueueType?: string
  /** Game status such as outOfGame, inQueue, championSelect, inGame, or spectating. */
  gameStatus?: LolGameStatus
  /** Icon override; regular LoL often uses summonerIcon, TFT often companion. */
  iconOverride?: LolIconOverride
  /** Spectator permission: ALL / FRIENDS / NONE. */
  isObservable?: string
  /** Legendary mastery score. */
  legendaryMasteryScore?: string
  /** Summoner level. */
  level?: string
  /** Map ID. */
  mapId?: string
  /** Map skin ID. */
  mapSkinId?: string
  /** Selected title UUID. */
  playerTitleSelected?: string
  /** Icon ID as string. */
  profileIcon?: string
  /** Party information, usually empty. */
  pty?: string
  /** Party availability: open / closed. */
  ptyType?: string
  /** Player PUUID. */
  puuid?: string
  /** Queue ID as numeric string. */
  queueId?: string
  /** Current season ranked division. */
  rankedLeagueDivision?: LolRankedDivision
  /** Current season ranked queue. */
  rankedLeagueQueue?: string
  /** Current season ranked tier. */
  rankedLeagueTier?: LolRankedTier
  /** Current season loss streak as string. */
  rankedLosses?: string
  /** Previous season ranked division. */
  rankedPrevSeasonDivision?: LolRankedDivision
  /** Previous season tier. */
  rankedPrevSeasonTier?: LolRankedTier
  /** Split reward level. */
  rankedSplitRewardLevel?: string
  /** Current season win streak as string. */
  rankedWins?: string
  /** Regalia JSON string. */
  regalia?: string
  /** Skin variant ID; TFT usually uses an empty string. */
  skinVariant?: string
  /** Skin name, usually an English short name; TFT usually empty. */
  skinname?: string
  /** Spectator key in base64, used to enter spectator mode. */
  spectatorKey?: string
  /** Timestamp for entering current game, milliseconds as string. */
  timeStamp?: string
}

/** Friend object returned by /lol-chat/v1/friends. */
export interface ChatFriend {
  /** Friend ID, chat-system internal ID in `{puuid}@pvp.net` format. */
  id: string
  /** Summoner ID. */
  summonerId: number
  /** Player unique universal ID. */
  puuid: string
  /** Riot ID game name. */
  gameName: string
  /** Riot ID Tag */
  gameTag: string
  /** Legacy summoner name, usually empty now. */
  name: string
  /** Icon ID. */
  icon: number
  /** Availability. */
  availability: Availability
  /** Current product, such as 'league_of_legends' or 'valorant'. */
  product: string
  /** Product display name, usually empty. */
  productName: string
  /** Client patchline, usually empty. */
  patchline: string
  /** Process/session ID used internally by XMPP. */
  pid: string
  /** Platform ID such as HN1, EUW1, NA1. */
  platformId: string
  /** Display group ID. */
  displayGroupId: number
  /** Display group name. */
  displayGroupName: string
  /** Real group ID. */
  groupId: number
  /** Real group name. */
  groupName: string
  /** Note. */
  note: string
  /** Status message. */
  statusMessage: string
  /** Summary, usually empty. */
  summary: string
  /** Last online time; null when unknown, 0 or timestamp when online. */
  lastSeenOnlineTimestamp: string | number | null
  /** XMPP timestamp in milliseconds. */
  time: number
  /** Whether P2P voice is muted for this friend. */
  isP2PConversationMuted: boolean
  /** Riot-level relationship with this player. */
  relationshipOnRiot: string
  /** Discord account ID, null when unbound. */
  discordId: string | null
  /** Discord account details, null when unbound. */
  discordInfo: unknown | null
  /** Discord availability, null when unbound. */
  discordOnlineStatus: string | null
  /** Sparse LOL sub-state with string fields. */
  lol: LolSubStatus
}

/** Request body for POST /lol-spectator/v1/spectate/launch. */
export interface SpectatorLaunchPayload {
  allowObserveMode: 'ALL' | 'FRIENDS' | 'NONE' | (string & {})
  dropInSpectateGameId: string
  gameQueueType: string
  puuid: string
  spectatorKey?: string
}

// ==================== Matchmaking ====================


/** Matchmaking search state. */
export type MatchSearchState = 'Invalid' | 'AbandonedLowPriorityQueue' | 'Canceled' | 'Searching' | 'Found' | 'Error'

/** Dodge penalty data. */
export interface DodgeData {
  dodgerId: number
  state: string
}

/** Low-priority penalty data. */
export interface LowPriorityData {
  bustedLeaverAccessToken: string
  penalizedSummonerIds: number[]
  penaltyTime: number
  penaltyTimeRemaining: number
  reason: string
}

/** Matchmaking search details from GET /lol-matchmaking/v1/search. */
export interface MatchSearchResult {
  dodgeData: DodgeData
  errors: unknown[]
  estimatedQueueTime: number
  isCurrentlyInQueue: boolean
  lobbyId: string
  lowPriorityData: LowPriorityData
  queueId: number
  readyCheck: ReadyCheck
  searchState: MatchSearchState
  timeInQueue: number
}

/** Ready Check state from GET /lol-matchmaking/v1/ready-check. */
export interface ReadyCheck {
  declinerIds: number[]
  dodgeWarning: string
  playerResponse: 'None' | 'Accepted' | 'Declined'
  state: 'Invalid' | 'InProgress' | 'EveryoneReady' | 'StrangerNotReady' | 'PartyNotReady'
  suppressUx: boolean
  timer: number
}

// ==================== Gameflow ====================

/** Gameflow phase from GET /lol-gameflow/v1/gameflow-phase. */
export type GameflowPhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'GameStart'
  | 'InProgress'
  | 'Reconnect'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'
  | 'WatchInProgress'
  | 'TerminatedInError'

/** Game client connection info. */
export interface GameClient {
  running: boolean
  visible: boolean
  serverIp: string
  serverPort: number
  observerServerIp: string
  observerServerPort: number
}

/** Gameflow session from GET /lol-gameflow/v1/session. */
export interface GameflowSession {
  phase: GameflowPhase
  gameClient: GameClient
  gameData: {
    gameId: number
    gameName: string
    isCustomGame: boolean
    password: string
    playerChampionSelections: PlayerChampionSelection[]
    queue: GameQueue
    spectatorKey: string
    spectatorsAllowed: boolean
    teamOne: GameflowTeamPlayer[]
    teamTwo: GameflowTeamPlayer[]
  }
  gameDodge: {
    dodgeIds: number[]
    phase: string
    state: string
  }
  map: {
    id: number
    name: string
    description: string
    gameMode: string
    gameModeName: string
    gameModeShortName: string
    gameMutator: string
    isRGM: boolean
    mapStringId: string
    platformId: string
    platformName: string
    assets: Record<string, string>
    categorizedContentBundles: Record<string, unknown>
    perPositionDisallowedSummonerSpells: Record<string, unknown>
    perPositionRequiredSummonerSpells: Record<string, unknown>
    properties: Record<string, unknown>
  }
}

/** Team player in gameflow. */
export interface GameflowTeamPlayer {
  championId: number
  puuid: string
  profileIconId: number
  lastSelectedSkinIndex: number
  selectedPosition: string
  selectedRole: string
  summonerId: number
  /** During InProgress this is always empty; call getSummonerByPuuid for displayName. */
  summonerInternalName: string
  /** During InProgress this is always empty; call getSummonerByPuuid for displayName. */
  summonerName: string
  teamOwner: boolean
  teamParticipantId: number
  /**
   * Name visibility type:
   * - "HIDDEN": streamer mode with obfuscated identity
   * - "PUBLIC": normal visibility
   */
  nameVisibilityType?: 'HIDDEN' | 'PUBLIC' | (string & {})
  /** Obfuscated PUUID used instead of puuid in streamer mode. */
  obfuscatedPuuid?: string
}

/** Player champion selection info. */
export interface PlayerChampionSelection {
  championId: number
  puuid: string
  selectedSkinIndex: number
  spell1Id: number
  spell2Id: number
}

// ==================== ChampSelect ====================

/** Champ-select session from GET /lol-champ-select/v1/session. */
export interface ChampSelectSession {
  actions: ChampSelectAction[][][]
  allowBattleBoost: boolean
  allowDuplicatePicks: boolean
  allowLockedEvents: boolean
  allowPlayerPickSameChampion: boolean
  allowRerolling: boolean
  allowSkinSelection: boolean
  allowSubsetChampionPicks: boolean
  benchChampions: BenchChampion[] // ARAM 模式，共享池中的英雄
  benchEnabled: boolean
  boostableSkinCount: number
  chatDetails: {
    mucJwtDto: {
      channelClaim: string
      domain: string
      jwt: string
      targetRegion: string
    }
    multiUserChatId: string
    multiUserChatPassword: string
  }
  counter: number
  disallowBanningTeammateHoveredChampions: boolean
  gameId: number
  hasSimultaneousBans: boolean
  hasSimultaneousPicks: boolean
  id: string
  isCustomGame: boolean
  isLegacyChampSelect: boolean
  isSpectating: boolean
  localPlayerCellId: number
  lockedEventIndex: number
  myTeam: ChampSelectPlayer[]
  pickOrderSwaps: unknown[]
  positionSwaps: unknown[]
  queueId: number
  rerollsRemaining: number
  showQuitButton: boolean
  skipChampionSelect: boolean
  theirTeam: ChampSelectPlayer[]
  timer: {
    adjustedTimeLeftInPhase: number
    internalNowInEpochMs: number
    isInfinite: boolean
    phase: 'PLANNING' | 'BAN_PICK' | 'FINALIZATION' | 'GAME_STARTING' | (string & {})
    totalTimeInPhase: number
  }
  trades: ChampSelectTrade[]
  bans: {
    myTeamBans: number[]
    theirTeamBans: number[]
    numBans: number
  }
}

/** Bench champion for ARAM mode. */
export interface BenchChampion {
  championId: number
  isPriority: boolean
}

/** Champion trade state. */
export interface ChampSelectTrade {
  cellId: number
  id: number
  state: 'INVALID' | 'AVAILABLE' | 'BUSY' | 'RECEIVED' | 'SENT' | (string & {})
}

/** Single summoner state during ChampSelect from GET /lol-champ-select/v1/summoners/{cellId}. */
export interface ChampSelectSummoner {
  actingBackgroundAnimationState: string
  activeActionType: string
  areSummonerActionsComplete: boolean
  assignedPosition: string
  banIntentSquarePortratPath: string
  cellId: number
  championIconStyle: string
  championId: number
  championName: string
  currentChampionVotePercentInteger: number
  isActingNow: boolean
  isDonePicking: boolean
  isOnPlayersTeam: boolean
  isPickIntenting: boolean
  isPlaceholder: boolean
  isSelf: boolean
  nameVisibilityType: 'HIDDEN' | 'PUBLIC' | (string & {})
  obfuscatedPuuid: string
  obfuscatedSummonerId: number
  pickSnipedClass: string
  puuid: string
  shouldShowActingBar: boolean
  shouldShowBanIntentIcon: boolean
  shouldShowExpanded: boolean
  shouldShowRingAnimations: boolean
  shouldShowSelectedSkin: boolean
  shouldShowSpells: boolean
  showMuted: boolean
  showSwaps: boolean
  showTrades: boolean
  skinId: number
  skinSplashPath: string
  slotId: number
  spell1IconPath: string
  spell2IconPath: string
  statusMessageKey: string
  summonerId: number
  swapId: number
  tradeId: number
}

/** Champ-select action. */
export interface ChampSelectAction {
  actorCellId: number
  championId: number
  completed: boolean
  id: number
  isInProgress: boolean
  type: 'pick' | 'ban' | 'ten_bans_reveal' | (string & {})
}

/**
 * Player in ChampSelect.
 *
 * In streamer mode (nameVisibilityType === 'HIDDEN'):
 *   - puuid is empty, use obfuscatedPuuid instead
 *   - summonerId is 0, use obfuscatedSummonerId instead
 *   - gameName / tagLine / internalName / playerAlias are empty
 */
export interface ChampSelectPlayer {
  /** Assigned position such as top/jungle/mid/bot/utility, or empty when unassigned. */
  assignedPosition: string
  /** Cell ID, 0-4 allied side and 5-9 enemy side. */
  cellId: number
  /** Selected champion ID, 0 when unselected. */
  championId: number
  /** Intended champion ID, 0 when unselected. */
  championPickIntent: number
  /** Riot ID game name, empty in streamer mode. */
  gameName: string
  /** Internal name, empty in streamer mode. */
  internalName: string
  /** Whether the player is autofilled. */
  isAutofilled: boolean
  /** Whether this is a human player. */
  isHumanoid: boolean
  /**
   * Name visibility type:
   * - "HIDDEN": streamer mode with obfuscated identity
   * - "PUBLIC": normal visibility
   */
  nameVisibilityType: 'HIDDEN' | 'PUBLIC' | (string & {})
  /**
   * Obfuscated PUUID used instead of puuid in streamer mode.
   * Example format: "d6b1c306-6893-02eb-22a2-199bfd58f170"
   */
  obfuscatedPuuid: string
  /** Obfuscated summoner ID used instead of summonerId in streamer mode. */
  obfuscatedSummonerId: number
  /** Pick mode. */
  pickMode: number
  /** Pick turn. */
  pickTurn: number
  /** Player alias, empty in streamer mode. */
  playerAlias: string
  /** Player type. */
  playerType: string
  /**
   * Player PUUID, empty in streamer mode.
   * Use obfuscatedPuuid in streamer mode.
   */
  puuid: string
  /** Selected skin ID, 0 when unselected. */
  selectedSkinId: number
  /** Summoner spell 1 ID. */
  spell1Id: number
  /** Summoner spell 2 ID. */
  spell2Id: number
  /**
   * Summoner ID, 0 in streamer mode.
   * Use obfuscatedSummonerId in streamer mode.
   */
  summonerId: number
  /** Riot ID tag, empty in streamer mode. */
  tagLine: string
  /** Team: 1 = allied side, 2 = enemy side. */
  team: 1 | 2 | number
  /** Ward skin ID, -1 when unselected. */
  wardSkinId: number
}

/** Detailed ChampSelect player info from combined queries. */
export interface ChampSelectPlayerDetail {
  summonerId: number
  championId: number
  assignedPosition: string
  gameName: string
  tagLine: string
  summonerLevel: number
  puuid: string
  profileIconId: number
  ranked: unknown
  recentMatches: unknown
}

// ==================== Queues ====================

/** Common queue IDs. */
export enum QueueId {
  /** TFT normal. */
  TFT_NORMAL = 1090,
  /** TFT ranked. */
  TFT_RANKED = 1100,
  /** TFT hyper roll. */
  TFT_HYPER_ROLL = 1130,
  /** TFT double up. */
  TFT_DOUBLE_UP = 1160,
  /** Ranked solo/duo. */
  RANKED_SOLO = 420,
  /** Ranked flex. */
  RANKED_FLEX = 440,
  /** Normal blind. */
  NORMAL_BLIND = 430,
  /** Normal draft. */
  NORMAL_DRAFT = 400,
  /** ARAM. */
  ARAM = 450,
}

// ==================== Match History ====================

/** Match-history list response from GET /lol-match-history/v1/products/lol/{puuid}/matches. */
export interface MatchHistoryResponse {
  accountId: number
  games: {
    gameBeginDate: string
    gameCount: number
    gameEndDate: string
    gameIndexBegin: number
    gameIndexEnd: number
    games: MatchGame[]
  }
  platformId: string
}

/** Match entry. */
export interface MatchGame {
  endOfGameResult: string
  gameCreation: number
  gameCreationDate: string
  gameDuration: number
  gameId: number
  gameMode: string
  gameModeMutators: string[]
  gameType: string
  gameVersion: string
  mapId: number
  participantIdentities: ParticipantIdentity[]
  participants: Participant[]
  platformId: string
  queueId: number
  seasonId: number
  teams: MatchTeam[]
}

/** Match details from GET /lol-match-history/v1/games/{gameId}. */
export type MatchDetail = MatchGame

/** Participant timeline data. */
export interface ParticipantTimeline {
  creepsPerMinDeltas: Record<string, number>
  csDiffPerMinDeltas: Record<string, number>
  damageTakenDiffPerMinDeltas: Record<string, number>
  damageTakenPerMinDeltas: Record<string, number>
  goldPerMinDeltas: Record<string, number>
  lane: string
  participantId: number
  role: string
  xpDiffPerMinDeltas: Record<string, number>
  xpPerMinDeltas: Record<string, number>
}

/** Match team data. */
export interface MatchTeam {
  bans: unknown[]
  baronKills: number
  dominionVictoryScore: number
  dragonKills: number
  firstBaron: boolean
  firstBlood: boolean
  firstDargon: boolean
  firstInhibitor: boolean
  firstTower: boolean
  hordeKills: number
  inhibitorKills: number
  riftHeraldKills: number
  teamId: number
  towerKills: number
  vilemawKills: number
  win: string
}

/** Participant identity. */
export interface ParticipantIdentity {
  participantId: number
  player: {
    accountId: number
    currentAccountId: number
    currentPlatformId: string
    gameName: string
    matchHistoryUri: string
    platformId: string
    profileIcon: number
    puuid: string
    summonerId: number
    summonerName: string
    tagLine: string
  }
}

/** Participant data. */
export interface Participant {
  championId: number
  highestAchievedSeasonTier: string
  participantId: number
  spell1Id: number
  spell2Id: number
  stats: ParticipantStats
  teamId: number
  timeline: ParticipantTimeline
}

/** Participant stats. */
export interface ParticipantStats {
  assists: number
  causedEarlySurrender: boolean
  champLevel: number
  combatPlayerScore: number
  damageDealtToObjectives: number
  damageDealtToTurrets: number
  damageSelfMitigated: number
  deaths: number
  doubleKills: number
  earlySurrenderAccomplice: boolean
  firstBloodAssist: boolean
  firstBloodKill: boolean
  firstInhibitorAssist: boolean
  firstInhibitorKill: boolean
  firstTowerAssist: boolean
  firstTowerKill: boolean
  gameEndedInEarlySurrender: boolean
  gameEndedInSurrender: boolean
  goldEarned: number
  goldSpent: number
  inhibitorKills: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  killingSprees: number
  kills: number
  largestCriticalStrike: number
  largestKillingSpree: number
  largestMultiKill: number
  longestTimeSpentLiving: number
  magicDamageDealt: number
  magicDamageDealtToChampions: number
  magicalDamageTaken: number
  neutralMinionsKilled: number
  neutralMinionsKilledEnemyJungle: number
  neutralMinionsKilledTeamJungle: number
  objectivePlayerScore: number
  participantId: number
  pentaKills: number
  perk0: number
  perk0Var1: number
  perk0Var2: number
  perk0Var3: number
  perk1: number
  perk1Var1: number
  perk1Var2: number
  perk1Var3: number
  perk2: number
  perk2Var1: number
  perk2Var2: number
  perk2Var3: number
  perk3: number
  perk3Var1: number
  perk3Var2: number
  perk3Var3: number
  perk4: number
  perk4Var1: number
  perk4Var2: number
  perk4Var3: number
  perk5: number
  perk5Var1: number
  perk5Var2: number
  perk5Var3: number
  perkPrimaryStyle: number
  perkSubStyle: number
  physicalDamageDealt: number
  physicalDamageDealtToChampions: number
  physicalDamageTaken: number
  playerAugment1: number
  playerAugment2: number
  playerAugment3: number
  playerAugment4: number
  playerAugment5: number
  playerAugment6: number
  playerScore0: number
  playerScore1: number
  playerScore2: number
  playerScore3: number
  playerScore4: number
  playerScore5: number
  playerScore6: number
  playerScore7: number
  playerScore8: number
  playerScore9: number
  playerSubteamId: number
  quadraKills: number
  roleBoundItem: number
  sightWardsBoughtInGame: number
  subteamPlacement: number
  teamEarlySurrendered: boolean
  timeCCingOthers: number
  totalDamageDealt: number
  totalDamageDealtToChampions: number
  totalDamageTaken: number
  totalHeal: number
  totalMinionsKilled: number
  totalPlayerScore: number
  totalScoreRank: number
  totalTimeCrowdControlDealt: number
  totalUnitsHealed: number
  tripleKills: number
  trueDamageDealt: number
  trueDamageDealtToChampions: number
  trueDamageTaken: number
  turretKills: number
  unrealKills: number
  visionScore: number
  visionWardsBoughtInGame: number
  wardsKilled: number
  wardsPlaced: number
  win: boolean
}

// ==================== Queue Details ====================

/** Queue game-type config. */
export interface GameTypeConfig {
  advancedLearningQuests: boolean
  allowTrades: boolean
  banMode: string
  banTimerDuration: number
  battleBoost: boolean
  crossTeamChampionPool: boolean
  deathMatch: boolean
  doNotRemove: boolean
  duplicatePick: boolean
  exclusivePick: boolean
  gameModeOverride: string | null
  id: number
  learningQuests: boolean
  mainPickTimerDuration: number
  maxAllowableBans: number
  name: string
  numPlayersPerTeamOverride: number | null
  onboardCoopBeginner: boolean
  pickMode: string
  postPickTimerDuration: number
  reroll: boolean
  teamChampionPool: boolean
}

/** Queue reward config. */
export interface QueueRewards {
  isChampionPointsEnabled: boolean
  isIpEnabled: boolean
  isXpEnabled: boolean
  partySizeIpRewards: unknown[]
}

/** Queue data from GET /lol-game-queues/v1/queues. */
export interface GameQueue {
  allowablePremadeSizes: number[]
  areFreeChampionsAllowed: boolean
  assetMutator: string
  category: string
  championsRequiredToPlay: number
  description: string
  detailedDescription: string
  gameMode: string
  gameSelectCategory: string
  gameSelectModeGroup: string
  gameSelectPriority: number
  gameTypeConfig: GameTypeConfig
  hidePlayerPosition: boolean
  id: number
  isBotHonoringAllowed: boolean
  isCustom: boolean
  isEnabled: boolean
  isLimitedTimeQueue: boolean
  isRanked: boolean
  isSkillTreeQueue: boolean
  isTeamBuilderManaged: boolean
  isVisible: boolean
  lastToggledOffTime: number
  lastToggledOnTime: number
  mapId: number
  maxDivisionForPremadeSize2: string
  maxLobbySpectatorCount: number
  maxTierForPremadeSize2: string
  maximumParticipantListSize: number
  minLevel: number
  minimumParticipantListSize: number
  name: string
  numPlayersPerTeam: number
  numberOfTeamsInLobby: number
  queueAvailability: string
  queueRewards: QueueRewards
  removalFromGameAllowed: boolean
  removalFromGameDelayMinutes: number
  shortName: string
  showPositionSelector: boolean
  showQuickPlaySlotSelection: boolean
  spectatorEnabled: boolean
  type: string
}

// ==================== Game Assets ====================

/** Summoner spell data from GET /lol-game-data/assets/v1/summoner-spells.json. */
export interface SummonerSpellData {
  id: number
  name: string
  description: string
  summonerLevel: number
  cooldown: number
  gameModes: string[]
  iconPath: string
}

/** Champion summary data from GET /lol-game-data/assets/v1/champion-summary.json. */
export interface ChampionSummaryData {
  id: number
  /** Champion title. */
  name: string
  /** English alias such as "Annie". */
  alias: string
  /** Champion display name. */
  description: string
  contentId: string
  roles: string[]
  squarePortraitPath: string
}

// ==================== WebSocket Events ====================

/** LCU WebSocket event message. */
export interface LCUEventMessage {
  uri: string
  eventType: 'Create' | 'Update' | 'Delete'
  data: unknown
}

/** Common LCU event URIs. */
export enum LcuEventUri {
  /** Ready Check accept/decline. */
  READY_CHECK = '/lol-matchmaking/v1/ready-check',
  /** Gameflow session. */
  GAMEFLOW_PHASE = '/lol-gameflow/v1/session',
  /** ChampSelect session. */
  CHAMP_SELECT = '/lol-champ-select/v1/session',
  /** TFT battle pass update, usable for detecting game end. */
  TFT_BATTLE_PASS = '/lol-tft-pass/v1/battle-pass',
  /** Gameflow phase change, phase string only. */
  GAMEFLOW_PHASE_CHANGE = '/lol-gameflow/v1/gameflow-phase',
  /** Lobby state. */
  LOBBY = '/lol-lobby/v2/lobby',
  /** Current player's chat state, including availability / statusMessage. */
  CHAT_ME = '/lol-chat/v1/me',
}

// ==================== Chat ====================

/** Chat conversation from GET /lol-chat/v1/conversations. */
export interface ChatConversation {
  gameName: string
  gameTag: string
  id: string
  inviterId: string
  isMuted: boolean
  lastMessage: unknown
  multiUserChatJWT: string
  name: string
  password: string
  pid: string
  targetRegion: string
  type: 'chat' | 'customGame' | 'championSelect' | 'postGame' | (string & {})
  unreadMessageCount: number
}

/** Chat message from GET/POST /lol-chat/v1/conversations/{id}/messages. */
export interface ChatMessage {
  body: string
  fromId: string
  fromObfuscatedSummonerId: number
  fromPid: string
  fromSummonerId: number
  id: string
  isHistorical: boolean
  timestamp: string
  type: 'chat' | 'celebration' | 'system' | (string & {})
}

/** Request body for sending a chat message. */
export interface SendChatMessageBody {
  body: string
  type?: 'chat' | 'celebration' | (string & {})
}

/** Player availability. */
export type Availability = 'chat' | 'away' | 'dnd' | 'offline' | 'mobile' | (string & {})

/** Current user chat state from GET /lol-chat/v1/me. */
export interface ChatMe {
  /** Availability: chat / away / dnd / offline / mobile. */
  availability: Availability
  /** Riot ID game name. */
  gameName: string
  /** Riot ID tag. */
  gameTag: string
  /** Icon ID. */
  icon: number
  /** Chat-system internal ID in `{puuid}@pvp.net` format. */
  id: string
  /** Sparse LOL sub-state with string fields. */
  lol: LolSubStatus
  /** Legacy summoner name, usually empty. */
  name: string
  /** Obfuscated summoner ID; 0 means unavailable. */
  obfuscatedSummonerId: number
  /** Client patchline, usually empty. */
  patchline: string
  /** Process/session ID, same format as id. */
  pid: string
  /** Platform ID such as HN1, EUW1, NA1. */
  platformId: string
  /** Product such as league_of_legends or valorant. */
  product: string
  /** Product display name, usually empty. */
  productName: string
  /** Player PUUID. */
  puuid: string
  /** Status message. May be null when never set or XMPP is not ready. */
  statusMessage: string | null
  /** Summary, usually empty. */
  summary: string
  /** Summoner ID. */
  summonerId: number
  /** XMPP timestamp in milliseconds; 0 means unavailable. */
  time: number
  /** Last online time, usually null. */
  lastSeenOnlineTimestamp?: string | number | null
}
