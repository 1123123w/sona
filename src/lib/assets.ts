/**
 * Global game asset mappings.
 *
 * Loads item, spell, queue, and map mappings from LCU JSON endpoints.
 * initAssets() is called from load(), then other modules can import query helpers directly.
 *
 * Champion icons can be addressed directly with /lol-game-data/assets/v1/champion-icons/{id}.png.
 */

import { lcu } from '@/lib/lcu'
import { logger } from '@/index'
import type { GameQueue } from '@/types/lcu'
import balanceData from '@/data/champion-balance.json'

/** Normalizes paths to lowercase because LCU asset paths are case-insensitive. */
function normalizePath(raw: string): string {
  return raw.toLowerCase()
}

/** Converts Riot HTML descriptions into plain text suitable for tooltips. */
function normalizeDescription(raw: unknown): string {
  if (typeof raw !== 'string') return ''

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|p|div)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickDescription(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const description = normalizeDescription(source[key])
    if (description) return description
  }
  return ''
}

// ==================== Mappings ====================

const itemMap = new Map<number, string>()
const itemNameMap = new Map<number, string>()
const itemDescriptionMap = new Map<number, string>()
const itemPriceMap = new Map<number, number>()
const spellMap = new Map<number, string>()
const spellNameMap = new Map<number, string>()
const spellDescriptionMap = new Map<number, string>()
const perkMap = new Map<number, string>()
const perkNameMap = new Map<number, string>()
const perkDescriptionMap = new Map<number, string>()
const perkStyleMap = new Map<number, string>()
const perkStyleNameMap = new Map<number, string>()
const augmentMap = new Map<number, { name: string; iconPath: string; rarity: string; description: string }>()
const queueMap = new Map<number, GameQueue>()
const mapDataMap = new Map<number, { id: number; name: string; gameModeName: string; [key: string]: unknown }>()

/** Champion info keyed by champion id. */
export interface ChampionInfo {
  id: number
  /** Champion display name. */
  name: string
  /** Champion title. */
  title: string
  /** Champion English alias, such as "Annie". */
  alias: string
}
const championMap = new Map<number, ChampionInfo>()

/**
 * Champion balance modifiers in special modes.
 *
 * Source: LoL Wiki Module:ChampionData/data.
 * Sparse structure: omitted fields have no modifier.
 *
 * Example value semantics:
 * - dmg_dealt = 1.05 means damage dealt x1.05.
 * - dmg_taken = 0.97 means damage taken x0.97.
 * - ability_haste = 10 means +10 flat ability haste.
 */
export type ChampionBalanceStats = {
  dmg_dealt?: number        // Damage dealt multiplier.
  dmg_taken?: number        // Damage taken multiplier.
  healing?: number          // Healing multiplier.
  shielding?: number        // Shielding multiplier.
  ability_haste?: number    // Flat ability haste.
  mana_regen?: number       // Mana regeneration multiplier.
  energy_regen?: number     // Energy regeneration multiplier.
  attack_speed?: number     // Attack speed multiplier.
  movement_speed?: number   // Movement speed multiplier.
  tenacity?: number         // Tenacity multiplier.
}

/** Supported special-mode keys. */
export type BalanceMode = 'aram' | 'urf' | 'ofa' | 'nb' | 'ar' | 'usb'

export interface ChampionBalance {
  id: number
  alias: string
  /** Balance modifiers by mode. Only modes with modifiers are present. */
  stats: Partial<Record<BalanceMode, ChampionBalanceStats>>
}
const championBalanceMap = new Map<number, ChampionBalance>()

let initialized = false

// ==================== Current Account PUUID ====================

/** Current account PUUID, fetched once during plugin load. */
let currentPuuid = ''

/** Returns the current account PUUID. */
export function getPuuid(): string {
  return currentPuuid
}

// ==================== Initialization ====================

/**
 * Fetches item, spell, queue, and map data, then builds global mappings.
 * Should be called once during plugin load. Failures do not block startup.
 */
export async function initAssets() {
  if (initialized) return

  // Fetch PUUID first because account-scoped features depend on it.
  try {
    const summoner = await lcu.getSummonerInfo()
    currentPuuid = summoner.puuid || ''
    logger.info('[Assets] 当前账号 puuid=%s', currentPuuid)
  } catch (err) {
    logger.warn('[Assets] 获取 puuid 失败:', err)
  }

  // Load local champion balance data bundled at build time.
  loadChampionBalance()

  // Each resource fails independently; missing critical resources are retried.
  await tryInit(0)
}

// ==================== Bundled Champion Balance Data ====================

/**
 * Loads champion balance data from local JSON into championBalanceMap.
 *
 * scripts/update-champion-balance.ts fetches the data from LoL Wiki.
 * It is imported into the bundle at build time, so runtime performs no network request.
 */
function loadChampionBalance() {
  try {
    const champions = balanceData.champions as Record<string, ChampionBalance>
    for (const [id, balance] of Object.entries(champions)) {
      championBalanceMap.set(Number(id), balance)
    }
    logger.info(
      '[Assets] 英雄平衡数据加载完成 → %d 个英雄 (数据更新于 %s)',
      championBalanceMap.size,
      balanceData._meta?.updatedAt ?? '未知',
    )
  } catch (err) {
    logger.error('[Assets] 英雄平衡数据加载失败:', err)
  }
}

/**
 * Attempts initialization. Missing critical resources are retried.
 * @param attempt Current retry attempt.
 */
async function tryInit(attempt: number) {
  const MAX_RETRY = 3
  const RETRY_DELAY = 2000

  const [items, spells, queues, maps, perks, perkStyles, champions, augments] = await Promise.all([
    lcu.getItems().catch((e) => { logger.warn('[Assets] getItems 失败:', e); return [] }),
    lcu.getSummonerSpells().catch((e) => { logger.warn('[Assets] getSummonerSpells 失败:', e); return [] }),
    lcu.getQueues().catch((e) => { logger.warn('[Assets] getQueues 失败:', e); return [] }),
    lcu.getMapAssets().catch((e) => { logger.warn('[Assets] getMapAssets 失败:', e); return [] }),
    lcu.getPerks().catch((e) => { logger.warn('[Assets] getPerks 失败:', e); return [] }),
    lcu.getPerkStyles().catch((e) => { logger.warn('[Assets] getPerkStyles 失败:', e); return { styles: [] } }),
    lcu.getChampionSummary().catch((e) => { logger.warn('[Assets] getChampionSummary 失败:', e); return [] }),
    lcu.getAugments().catch((e) => { logger.warn('[Assets] getAugments 失败:', e); return [] }),
  ])

  // Fill only data that was fetched successfully.
  for (const item of items) {
    if (item.id > 0 && item.iconPath) itemMap.set(item.id, normalizePath(item.iconPath))
    if (item.id > 0 && item.name) itemNameMap.set(item.id, item.name)
    if (item.id > 0) {
      const description = pickDescription(item as Record<string, unknown>, [
        'description',
        'shortDescription',
        'longDescription',
        'tooltip',
        'tooltipText',
      ])
      if (description) itemDescriptionMap.set(item.id, description)
      const price = item.priceTotal ?? item.price ?? 0
      if (Number.isFinite(price) && price > 0) itemPriceMap.set(item.id, price)
    }
  }
  for (const spell of spells) {
    if (spell.id > 0 && spell.iconPath) spellMap.set(spell.id, normalizePath(spell.iconPath))
    if (spell.id > 0 && spell.name) spellNameMap.set(spell.id, spell.name)
    if (spell.id > 0) {
      const description = pickDescription(spell as unknown as Record<string, unknown>, [
        'description',
        'shortDescription',
        'longDescription',
        'tooltip',
        'tooltipText',
      ])
      if (description) spellDescriptionMap.set(spell.id, description)
    }
  }
  for (const queue of queues) {
    queueMap.set(queue.id, queue)
  }
  for (const map of maps as Array<{ id: number; name: string; gameModeName: string }>) {
    if (map.id != null) mapDataMap.set(map.id, map)
  }
  for (const perk of perks) {
    if (perk.id > 0 && perk.iconPath) perkMap.set(perk.id, normalizePath(perk.iconPath))
    if (perk.id > 0 && perk.name) perkNameMap.set(perk.id, perk.name)
    if (perk.id > 0) {
      const description = pickDescription(perk as Record<string, unknown>, [
        'shortDesc',
        'longDesc',
        'description',
        'tooltip',
        'tooltipText',
      ])
      if (description) perkDescriptionMap.set(perk.id, description)
    }
  }
  for (const style of perkStyles.styles) {
    if (style.id > 0 && style.iconPath) perkStyleMap.set(style.id, normalizePath(style.iconPath))
    if (style.id > 0 && style.name) perkStyleNameMap.set(style.id, style.name)
  }
  for (const champ of champions) {
    if (champ.id > 0) {
      championMap.set(champ.id, {
        id: champ.id,
        name: champ.description || '',
        title: champ.name || '',
        alias: champ.alias,
      })
    }
  }
  for (const augment of augments) {
    if (augment.id > 0) {
      augmentMap.set(augment.id, {
        name: augment.nameTRA || String(augment.id),
        iconPath: augment.augmentSmallIconPath ? normalizePath(augment.augmentSmallIconPath) : '',
        rarity: augment.rarity || '',
        // cherry-augments.json currently exposes name, icon, and rarity only.
        description: '',
      })
    }
  }

  logger.info(
    '[Assets] 资源映射初始化 (attempt %d) → 装备 %d, 技能 %d, 符文 %d, 符文系 %d, 强化符文 %d, 队列 %d, 地图 %d, 英雄 %d',
    attempt + 1,
    itemMap.size, spellMap.size, perkMap.size, perkStyleMap.size, augmentMap.size, queueMap.size, mapDataMap.size, championMap.size,
  )

  // Retry when critical resources are missing.
  const missing = [
    itemMap.size === 0 && 'items',
    spellMap.size === 0 && 'spells',
    queueMap.size === 0 && 'queues',
    championMap.size === 0 && 'champions',
  ].filter(Boolean)

  if (missing.length > 0 && attempt < MAX_RETRY) {
    logger.warn('[Assets] 关键资源缺失: %s，%d 秒后重试 (%d/%d)', missing.join(','), RETRY_DELAY / 1000, attempt + 1, MAX_RETRY)
    setTimeout(() => tryInit(attempt + 1), RETRY_DELAY)
    return
  }

  initialized = true
  if (missing.length > 0) {
    logger.error('[Assets] 重试 %d 次后仍有资源缺失: %s', MAX_RETRY, missing.join(','))
  } else {
    logger.info('[Assets] 资源映射初始化完成 ✓')
  }
}

// ==================== Queries ====================

/** Returns the champion icon path. */
export function getChampIcon(id: number): string {
  return `/lol-game-data/assets/v1/champion-icons/${id}.png`
}

/** Returns the item icon path. */
export function getItemIcon(id: number): string {
  return itemMap.get(id) ?? ''
}

/** Returns the item name. */
export function getItemName(id: number): string {
  return itemNameMap.get(id) ?? String(id)
}

/** Returns full item info. */
export function getItemInfo(id: number): { name: string; iconPath: string; description: string; price: number } {
  return {
    name: itemNameMap.get(id) ?? String(id),
    iconPath: itemMap.get(id) ?? '',
    description: itemDescriptionMap.get(id) ?? '',
    price: itemPriceMap.get(id) ?? 0,
  }
}

/** Returns the summoner spell icon path. */
export function getSpellIcon(id: number): string {
  return spellMap.get(id) ?? ''
}

/** Returns the summoner spell name. */
export function getSpellName(id: number): string {
  return spellNameMap.get(id) ?? String(id)
}

/** Returns full summoner spell info. */
export function getSpellInfo(id: number): { name: string; iconPath: string; description: string } {
  return {
    name: spellNameMap.get(id) ?? String(id),
    iconPath: spellMap.get(id) ?? '',
    description: spellDescriptionMap.get(id) ?? '',
  }
}

/** Returns a rune icon path. */
export function getPerkIcon(id: number): string {
  return perkMap.get(id) ?? ''
}

/** Returns a rune name. */
export function getPerkName(id: number): string {
  return perkNameMap.get(id) ?? String(id)
}

/** Returns full rune info. */
export function getPerkInfo(id: number): { name: string; iconPath: string; description: string } {
  return {
    name: perkNameMap.get(id) ?? String(id),
    iconPath: perkMap.get(id) ?? '',
    description: perkDescriptionMap.get(id) ?? '',
  }
}

/** Returns the rune style icon path. */
export function getPerkStyleIcon(id: number): string {
  return perkStyleMap.get(id) ?? ''
}

/** Returns the rune style name. */
export function getPerkStyleName(id: number): string {
  return perkStyleNameMap.get(id) ?? String(id)
}

/** Returns Arena augment info. */
export function getAugmentInfo(id: number): { name: string; iconPath: string; rarity: string; description: string } | undefined {
  return augmentMap.get(id)
}

/** Returns the queue name by queue id. */
export function getQueueName(queueId: number): string {
  return queueMap.get(queueId)?.name ?? `队列${queueId}`
}

/** Returns the full queue record by queue id. */
export function getQueue(queueId: number): GameQueue | undefined {
  return queueMap.get(queueId)
}

/** Returns the map name by map id. */
export function getMapName(mapId: number): string {
  return mapDataMap.get(mapId)?.name ?? `地图${mapId}`
}

/** Returns the game mode by map id. */
export function getGameModeName(mapId: number): string {
  return mapDataMap.get(mapId)?.gameModeName ?? ''
}

/** Whether asset mappings are ready. */
export function isAssetsReady(): boolean {
  return initialized
}

/** Returns all champions. */
export function getAllChampions(): ChampionInfo[] {
  return Array.from(championMap.values()).filter(c => c.id > 0)
}

/** Returns champion info by id. */
export function getChampionById(id: number): ChampionInfo | undefined {
  return championMap.get(id)
}

/**
 * Fuzzy-searches champions by name, title, or alias.
 * @param keyword Search keyword.
 * @param limit Maximum number of results. Defaults to 8.
 */
export function searchChampions(keyword: string, limit = 8): ChampionInfo[] {
  if (!keyword.trim()) return []
  const kw = keyword.trim().toLowerCase()
  const results: ChampionInfo[] = []

  championMap.forEach((c) => {
    if (c.id <= 0) return
    if (
      c.name.toLowerCase().includes(kw) ||
      c.title.toLowerCase().includes(kw) ||
      c.alias.toLowerCase().includes(kw)
    ) {
      results.push(c)
    }
  })

  // Rank exact name matches first.
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === kw ? 0 : 1
    const bExact = b.name.toLowerCase() === kw ? 0 : 1
    return aExact - bExact
  })

  return results.slice(0, limit)
}

// ==================== Champion Balance Queries ====================

/** Returns balance data by champion id. */
export function getChampionBalance(id: number): ChampionBalance | undefined {
  return championBalanceMap.get(id)
}

/** Returns all champion balance data for diagnostics or export. */
export function getAllChampionBalances(): ChampionBalance[] {
  return Array.from(championBalanceMap.values())
}

/** Whether champion balance data is ready. */
export function isChampionBalanceReady(): boolean {
  return championBalanceMap.size > 0
}

/** Returns champion balance metadata. */
export function getChampionBalanceMeta() {
  return balanceData._meta
}

/**
 * Returns currently playable queues for match-history filtering.
 *
 * Filters to enabled, non-custom, available queues and excludes tutorial/practice/TFT/internal variants.
 */
export function getPlayableQueues(): { id: number; name: string }[] {
  const EXCLUDED_MODES = new Set([
    'TUTORIAL',
    'TUTORIAL_MODULE_1',
    'TUTORIAL_MODULE_2',
    'TUTORIAL_MODULE_3',
    'PRACTICETOOL',
    'SWIFTPLAY',
    'TFT',
  ])

  const EXCLUDED_TYPES = new Set([
    'CHERRY_UNRANKED',
  ])

  const result: { id: number; name: string }[] = []
  queueMap.forEach((q) => {
    if (q.id <= 0 || q.isCustom) return
    if (!q.isEnabled || q.queueAvailability !== 'Available') return
    if (EXCLUDED_MODES.has(q.gameMode)) return
    if (EXCLUDED_TYPES.has(q.type)) return
    result.push({ id: q.id, name: q.name || q.shortName || `队列${q.id}` })
  })
  // Sort by display name.
  result.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return result
}
