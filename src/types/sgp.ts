/**
 * SGP (Service Gateway Proxy) type declarations.
 *
 * SGP is Riot's external match-history / summoner / ranked query API.
 * Compared with LCU APIs, it supports cross-region queries, queue tag filtering,
 * and bypasses the 100-game LCU cap.
 *
 * Type definitions reference LeagueAkari's src/shared/data-sources/sgp/types.ts
 * and add fields observed from real responses.
 */

// ==================== Match History List ====================

export interface SgpMatchHistoryLol {
  games: SgpGameSummaryLol[]
}

export interface SgpGameSummaryLol {
  metadata: SgpGameMetadataLol
  json: SgpGameSummaryJsonLol
}

export interface SgpGameMetadataLol {
  product: string
  tags: string[]
  participants: string[]
  timestamp: string
  data_version: string
  info_type: string
  match_id: string
  private: boolean
}

export interface SgpGameSummaryJsonLol {
  endOfGameResult: string
  gameCreation: number
  gameDuration: number
  gameEndTimestamp: number
  gameId: number
  gameMode: string
  /** Mode variant, such as ARAM "mapskin_ha_bilgewater". */
  gameModeMutators: string[]
  gameName: string
  gameStartTimestamp: number
  gameType: string
  gameVersion: string
  mapId: number
  participants: SgpParticipantLol[]
  platformId: string
  queueId: number
  seasonId: number
  teams: SgpTeam[]
  tournamentCode: string
}

// ==================== Teams ====================

export interface SgpTeam {
  bans: SgpBan[]
  objectives: SgpObjectives
  teamId: number
  win: boolean
}

export interface SgpBan {
  championId: number
  pickTurn: number
}

export interface SgpObjectives {
  baron: SgpObjectiveStat
  champion: SgpObjectiveStat
  dragon: SgpObjectiveStat
  horde: SgpObjectiveStat
  inhibitor: SgpObjectiveStat
  riftHerald: SgpObjectiveStat
  tower: SgpObjectiveStat
}

export interface SgpObjectiveStat {
  first: boolean
  kills: number
}

// ==================== Participants ====================

export interface SgpParticipantLol {
  /** Behavior flags such as whether the champion is in combat. */
  PlayerBehavior: {
    PlayerBehavior_IsHeroInCombat: number
  }
  /** Score fields 0-11 from the in-game scoreboard. */
  PlayerScore0: number
  PlayerScore1: number
  PlayerScore2: number
  PlayerScore3: number
  PlayerScore4: number
  PlayerScore5: number
  PlayerScore6: number
  PlayerScore7: number
  PlayerScore8: number
  PlayerScore9: number
  PlayerScore10: number
  PlayerScore11: number
  allInPings: number
  assistMePings: number
  assists: number
  baronKills: number
  basicPings: number
  bountyLevel?: number
  challenges: SgpChallenges
  champExperience: number
  champLevel: number
  championId: number
  championName: string
  championTransform: number
  commandPings: number
  consumablesPurchased: number
  damageDealtToBuildings: number
  damageDealtToEpicMonsters: number
  damageDealtToObjectives: number
  damageDealtToTurrets: number
  damageSelfMitigated: number
  dangerPings: number
  deaths: number
  detectorWardsPlaced: number
  doubleKills: number
  dragonKills: number
  eligibleForProgression: boolean
  enemyMissingPings: number
  enemyVisionPings: number
  firstBloodAssist: boolean
  firstBloodKill: boolean
  firstTowerAssist: boolean
  firstTowerKill: boolean
  gameEndedInEarlySurrender: boolean
  gameEndedInSurrender: boolean
  getBackPings: number
  goldEarned: number
  goldSpent: number
  holdPings: number
  individualPosition: string
  inhibitorKills: number
  inhibitorTakedowns: number
  inhibitorsLost: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  itemsPurchased: number
  killingSprees: number
  kills: number
  lane: string
  largestCriticalStrike: number
  largestKillingSpree: number
  largestMultiKill: number
  longestTimeSpentLiving: number
  magicDamageDealt: number
  magicDamageDealtToChampions: number
  magicDamageTaken: number
  /** Mission progress data with keys that vary by event/version. */
  missions: Record<string, number>
  needVisionPings: number
  neutralMinionsKilled: number
  nexusKills: number
  nexusLost: number
  nexusTakedowns: number
  objectivesStolen: number
  objectivesStolenAssists: number
  onMyWayPings: number
  participantId: number
  pentaKills: number
  perks: SgpPerks
  physicalDamageDealt: number
  physicalDamageDealtToChampions: number
  physicalDamageTaken: number
  placement: number
  playerAugment1: number
  playerAugment2: number
  playerAugment3: number
  playerAugment4: number
  playerAugment5: number
  playerAugment6: number
  playerSubteamId: number
  profileIcon: number
  pushPings: number
  puuid: string
  quadraKills: number
  retreatPings: number
  riotIdGameName: string
  riotIdTagline: string
  role: string
  roleBoundItem: number
  sightWardsBoughtInGame: number
  spell1Casts: number
  spell1Id: number
  spell2Casts: number
  spell2Id: number
  spell3Casts: number
  spell4Casts: number
  subteamPlacement: number
  summoner1Casts: number
  summoner2Casts: number
  summonerId: number
  summonerLevel: number
  summonerName: string
  teamEarlySurrendered: boolean
  teamId: number
  teamPosition: string
  timeCCingOthers: number
  timePlayed: number
  totalAllyJungleMinionsKilled: number
  totalDamageDealt: number
  totalDamageDealtToChampions: number
  totalDamageShieldedOnTeammates: number
  totalDamageTaken: number
  totalEnemyJungleMinionsKilled: number
  totalHeal: number
  totalHealsOnTeammates: number
  totalMinionsKilled: number
  totalTimeCCDealt: number
  totalTimeSpentDead: number
  totalUnitsHealed: number
  tripleKills: number
  trueDamageDealt: number
  trueDamageDealtToChampions: number
  trueDamageTaken: number
  turretKills: number
  turretTakedowns: number
  turretsLost: number
  unrealKills: number
  visionClearedPings: number
  visionScore: number
  visionWardsBoughtInGame: number
  wardsKilled: number
  wardsPlaced: number
  win: boolean
}

// ==================== Runes ====================

export interface SgpPerks {
  statPerks: SgpStatPerks
  styles: SgpPerkStyle[]
}

export interface SgpPerkStyle {
  description: string
  selections: SgpPerkSelection[]
  style: number
}

export interface SgpPerkSelection {
  perk: number
  var1: number
  var2: number
  var3: number
}

export interface SgpStatPerks {
  defense: number
  flex: number
  offense: number
}

// ==================== Challenges ====================

/**
 * The challenges field contains many in-game challenge / achievement stats.
 * Keys vary by version and event, so Record covers the dynamic core fields while
 * known common fields are listed for IDE hints.
 */
export interface SgpChallenges extends Record<string, number | number[]> {
  abilityUses: number
  acesBefore15Minutes: number
  baronTakedowns: number
  damagePerMinute: number
  damageTakenOnTeamPercentage: number
  deathsByEnemyChamps: number
  dragonTakedowns: number
  effectiveHealAndShielding: number
  goldPerMinute: number
  kda: number
  killParticipation: number
  killingSprees: number
  killsNearEnemyTurret: number
  legendaryCount: number
  legendaryItemUsed: number[]
  multikills: number
  outnumberedKills: number
  skillshotsDodged: number
  skillshotsHit: number
  soloKills: number
  takedowns: number
  teamDamagePercentage: number
  turretTakedowns: number
  visionScorePerMinute: number
  wardTakedowns: number
  wardsGuarded: number
}

// ==================== Entitlements Token ====================

export interface SgpEntitlementsToken {
  /** JWT access token used as Authorization: Bearer {accessToken} for SGP match APIs. */
  accessToken: string
  /** Entitlements JWT, a different format used by some SGP APIs. */
  token: string
  /** Entitlement list, usually empty. */
  entitlements: unknown[]
  /**
   * Issuer URL, e.g. `http://hn1-k8s-bcs-internal.lol.qq.com:28088`.
   * Current server can be inferred from it.
   */
  issuer: string
  /** Player PUUID. */
  subject: string
}

// ==================== SGP Server Config ====================

/**
 * SGP server URL mapping.
 *
 * Data source: LeagueAkari project, resources/builtin-config/sgp/league-servers.json.
 *
 * Tencent servers share one JWT token and support cross-server match-history queries.
 */
export const SGP_SERVERS: Record<string, { matchHistory: string | null; common: string | null }> = {
  // ===== Tencent =====
  TENCENT_HN1:   { matchHistory: 'https://hn1-k8s-sgp.lol.qq.com:21019',   common: 'https://hn1-k8s-sgp.lol.qq.com:21019' },
  TENCENT_HN10:  { matchHistory: 'https://hn10-k8s-sgp.lol.qq.com:21019',  common: 'https://hn10-k8s-sgp.lol.qq.com:21019' },
  TENCENT_TJ100: { matchHistory: 'https://tj100-sgp.lol.qq.com:21019',     common: 'https://tj100-sgp.lol.qq.com:21019' },
  TENCENT_TJ101: { matchHistory: 'https://tj101-sgp.lol.qq.com:21019',     common: 'https://tj101-sgp.lol.qq.com:21019' },
  TENCENT_NJ100: { matchHistory: 'https://nj100-sgp.lol.qq.com:21019',     common: 'https://nj100-sgp.lol.qq.com:21019' },
  TENCENT_GZ100: { matchHistory: 'https://gz100-sgp.lol.qq.com:21019',     common: 'https://gz100-sgp.lol.qq.com:21019' },
  TENCENT_CQ100: { matchHistory: 'https://cq100-sgp.lol.qq.com:21019',     common: 'https://cq100-sgp.lol.qq.com:21019' },
  TENCENT_BGP2:  { matchHistory: 'https://bgp2-k8s-sgp.lol.qq.com:21019',  common: 'https://bgp2-k8s-sgp.lol.qq.com:21019' },
  TENCENT_PBE:   { matchHistory: 'https://pbe-sgp.lol.qq.com:21019',       common: 'https://pbe-sgp.lol.qq.com:21019' },
  TENCENT_PREPBE:{ matchHistory: 'https://prepbe-sgp.lol.qq.com:21019',    common: 'https://prepbe-sgp.lol.qq.com:21019' },

  // ===== Non-Tencent =====
  TW2:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://tw2-red.lol.sgp.pvp.net' },
  SG2:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://sg2-red.lol.sgp.pvp.net' },
  PH2:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://ph2-red.lol.sgp.pvp.net' },
  VN2:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://vn2-red.lol.sgp.pvp.net' },
  TH2:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://th2-red.lol.sgp.pvp.net' },
  JP1:  { matchHistory: 'https://apne1-red.pp.sgp.pvp.net',  common: 'https://jp-red.lol.sgp.pvp.net' },
  KR:   { matchHistory: 'https://apne1-red.pp.sgp.pvp.net',  common: 'https://kr-red.lol.sgp.pvp.net' },
  NA1:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: 'https://na-red.lol.sgp.pvp.net' },
  BR1:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: 'https://br-red.lol.sgp.pvp.net' },
  LA1:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: 'https://lan-red.lol.sgp.pvp.net' },
  LA2:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: 'https://las-red.lol.sgp.pvp.net' },
  OC1:  { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: 'https://oce-red.lol.sgp.pvp.net' },
  EUW:  { matchHistory: 'https://euc1-red.pp.sgp.pvp.net',   common: 'https://euw-red.lol.sgp.pvp.net' },
  EUN1: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net',   common: 'https://eun1-red.lol.sgp.pvp.net' },
  TR1:  { matchHistory: 'https://euc1-red.pp.sgp.pvp.net',   common: 'https://tr-red.lol.sgp.pvp.net' },
  RU:   { matchHistory: 'https://euc1-red.pp.sgp.pvp.net',   common: 'https://ru-red.lol.sgp.pvp.net' },
  PBE:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: 'https://pbe-red.lol.sgp.pvp.net' },

  // Issuer fallback can resolve only to a regional PP cluster. Keep match-history capability.
  EUC1:  { matchHistory: 'https://euc1-red.pp.sgp.pvp.net',   common: null },
  USW2:  { matchHistory: 'https://usw2-red.pp.sgp.pvp.net',   common: null },
  APSE1: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net',  common: null },
  APNE1: { matchHistory: 'https://apne1-red.pp.sgp.pvp.net',  common: null },
}

/** Tencent server interoperability list; one JWT token can query all listed servers. */
export const TENCENT_MATCH_HISTORY_INTEROP = [
  'TENCENT_HN1',
  'TENCENT_HN10',
  'TENCENT_NJ100',
  'TENCENT_GZ100',
  'TENCENT_CQ100',
  'TENCENT_TJ100',
  'TENCENT_TJ101',
  'TENCENT_BGP2',
  'TENCENT_PBE',
  'TENCENT_PREPBE',
] as const

// ==================== SGP Tag Filtering ====================

/**
 * Convert queueId to SGP tag.
 *
 * Prefix with `q_` directly without whitelist validation.
 */
export function queueIdToTag(queueId: number): string {
  return queueId > 0 ? `q_${queueId}` : ''
}

/** Tencent server localized name map. */
export const TENCENT_SERVER_NAMES: Record<string, string> = {
  TENCENT_HN1: '艾欧尼亚',
  TENCENT_HN10: '黑色玫瑰',
  TENCENT_TJ100: '联盟四区',
  TENCENT_TJ101: '联盟五区',
  TENCENT_NJ100: '联盟一区',
  TENCENT_GZ100: '联盟二区',
  TENCENT_CQ100: '联盟三区',
  TENCENT_BGP2: '峡谷之巅',
  TENCENT_PBE: 'PBE (腾讯)',
  TENCENT_PREPBE: 'PREPBE (腾讯)',
}
