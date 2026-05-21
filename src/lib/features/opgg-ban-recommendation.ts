import { logger } from '@/index'
import type { BanRecommendationItem, RankedBanLane } from '@/components/ui/OpggBanRecommendationModal'
import { injector } from '@/lib/InjectorManager'
import {
  OPGG_CACHE_CLEARED_EVENT,
  OPGG_DATA_REGION,
  opggApi,
  type OpggRankedChampionsSummary,
  type OpggRankedDataItem,
  type OpggTier,
} from '@/lib/opgg-api'
import { SETTING_KEYS, store } from '@/lib/store'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const BAN_BUTTON_ID = 'sonaenhance-opgg-ban-recommendation-button'
const BAN_BUTTON_ATTR = 'data-sonaenhance-opgg-ban-button'
const BAN_MODAL_ROOT_ID = 'sonaenhance-opgg-ban-recommendation-root'
const DEFAULT_OPGG_TIER: OpggTier = 'emerald_plus'
const MAX_BAN_ITEMS = 10
const LANES: RankedBanLane[] = ['top', 'jungle', 'mid', 'adc', 'support']
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
const OPGG_TIER_LABELS: Record<OpggTier, string> = {
  all: '全部段位',
  ibsg: '黑铁-黄金',
  iron: '坚韧黑铁',
  bronze: '英勇黄铜',
  silver: '不屈白银',
  gold: '荣耀黄金',
  gold_plus: '荣耀黄金+',
  platinum: '华贵铂金',
  platinum_plus: '华贵铂金+',
  emerald: '流光翡翠',
  emerald_plus: '流光翡翠+',
  diamond: '璀璨钻石',
  diamond_plus: '璀璨钻石+',
  master: '超凡大师',
  master_plus: '超凡大师+',
  grandmaster: '傲世宗师',
  challenger: '最强王者',
}

type BanDataState = 'loading' | 'ready' | 'error'
type BanRecommendationsByLane = Record<RankedBanLane, BanRecommendationItem[]>

let injectRegistered = false
let modalRoot: Root | null = null
let modalContainer: HTMLDivElement | null = null
let rankedSummaryCache: OpggRankedChampionsSummary | null = null
let rankedSummaryCacheTier: OpggTier | null = null
let rankedSummaryPromise: Promise<OpggRankedChampionsSummary> | null = null
let banState: BanDataState = 'loading'
let banMessage = ''
let banRecommendations = createEmptyRecommendations()
let buttonEl: HTMLButtonElement | null = null
let buttonHandler: EventListener | null = null
let cacheClearListenerInstalled = false
let banModalLoadPromise: Promise<typeof import('@/components/ui/OpggBanRecommendationModal')['OpggBanRecommendationModal']> | null = null

function normalizeOpggTier(value: string): OpggTier {
  return SELECTABLE_OPGG_TIERS.includes(value as OpggTier) ? value as OpggTier : DEFAULT_OPGG_TIER
}

function getTierOptions() {
  return SELECTABLE_OPGG_TIERS.map((tier) => ({
    value: tier,
    label: OPGG_TIER_LABELS[tier],
    icon: getOpggTierIcon(tier),
  }))
}

function getOpggTierIcon(tier: OpggTier): string {
  if (tier === 'all' || tier === 'ibsg') return ''
  return `/fe/lol-static-assets/images/ranked-mini-crests/${tier.replace('_plus', '')}.svg`
}

function createEmptyRecommendations(): BanRecommendationsByLane {
  return {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }
}

async function ensureRankedSummary(
  tier = normalizeOpggTier(store.get(SETTING_KEYS.opggBuildRecommendationTier)),
): Promise<OpggRankedChampionsSummary> {
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
      return summary
    })
    .finally(() => {
      rankedSummaryPromise = null
    })

  return rankedSummaryPromise
}

function buildBanRecommendations(summary: OpggRankedChampionsSummary): BanRecommendationsByLane {
  const result = createEmptyRecommendations()

  for (const lane of LANES) {
    result[lane] = summary.data
      .map((champion) => getLaneBanItem(champion, lane))
      .filter((item): item is BanRecommendationItem => Boolean(item))
      .sort((left, right) => right.banRate - left.banRate || right.pickRate - left.pickRate)
      .slice(0, MAX_BAN_ITEMS)
  }

  return result
}

function getLaneBanItem(champion: OpggRankedDataItem, lane: RankedBanLane): BanRecommendationItem | null {
  const position = champion.positions?.find((entry) => entry.name.toLowerCase() === lane)
  if (!position) return null

  const stats = position.stats
  const banRate = toRate(stats?.ban_rate)
  if (banRate <= 0) return null

  return {
    championId: champion.id,
    banRate,
    pickRate: toRate(stats?.pick_rate),
    winRate: toRate(stats?.win_rate),
  }
}

function toRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function loadOpggBanRecommendationModal() {
  banModalLoadPromise ??= import('@/components/ui/OpggBanRecommendationModal')
    .then((module) => module.OpggBanRecommendationModal)
  return banModalLoadPromise
}

async function loadBanRecommendations(tier = normalizeOpggTier(store.get(SETTING_KEYS.opggBuildRecommendationTier))) {
  banState = 'loading'
  banMessage = ''
  void renderBanModal(true)

  try {
    const summary = await ensureRankedSummary(tier)
    banRecommendations = buildBanRecommendations(summary)
    banState = 'ready'
    banMessage = ''
  } catch (err) {
    banRecommendations = createEmptyRecommendations()
    banState = 'error'
    banMessage = err instanceof Error ? err.message : String(err)
    logger.warn('[OPGG Ban] Ban 推荐数据加载失败:', err)
  }

  void renderBanModal(true)
}

async function renderBanModal(open: boolean) {
  const OpggBanRecommendationModal = await loadOpggBanRecommendationModal()

  if (!modalContainer) {
    modalContainer = document.createElement('div')
    modalContainer.id = BAN_MODAL_ROOT_ID
    document.body.appendChild(modalContainer)
    modalRoot = createRoot(modalContainer)
  }

  const selectedTier = normalizeOpggTier(store.get(SETTING_KEYS.opggBuildRecommendationTier))
  const close = () => { void renderBanModal(false) }

  modalRoot?.render(
    createElement(OpggBanRecommendationModal, {
      open,
      state: banState,
      message: banMessage,
      selectedTier,
      tierOptions: getTierOptions(),
      recommendations: banRecommendations,
      onTierChange: (tier: OpggTier) => {
        const nextTier = normalizeOpggTier(tier)
        store.set(SETTING_KEYS.opggBuildRecommendationTier, nextTier)
        void loadBanRecommendations(nextTier)
      },
      onClose: close,
    }),
  )
}

function cleanupModal() {
  if (modalRoot) {
    modalRoot.unmount()
    modalRoot = null
  }
  if (modalContainer) {
    modalContainer.remove()
    modalContainer = null
  }
}

function findBanButtonHost(): HTMLElement | null {
  const selectors = [
    '.summoner-spells',
    '.summoner-spell-container',
    '.summoner-spell-selection',
    '.champion-select-summoner-spells',
    '.champion-select-ability-previews-show',
    '.toggle-ability-previews-button',
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement) return element
  }

  return null
}

function tryInjectBanButton(): boolean {
  if (document.getElementById(BAN_BUTTON_ID)) return true

  const host = findBanButtonHost()
  if (!host) return false

  const button = document.createElement('button')
  button.id = BAN_BUTTON_ID
  button.type = 'button'
  button.textContent = 'Ban 推荐'
  button.setAttribute(BAN_BUTTON_ATTR, 'true')
  button.style.cssText = [
    'display:block',
    'width:100%',
    'min-width:88px',
    'height:28px',
    'margin:0 0 6px 0',
    'border:1px solid rgba(200,170,110,.72)',
    'background:rgba(9,20,40,.92)',
    'color:#c8aa6e',
    'font-size:12px',
    'font-weight:700',
    'letter-spacing:0',
    'cursor:pointer',
  ].join(';')

  const handler = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
    void renderBanModal(true)
    void loadBanRecommendations()
  }

  button.addEventListener('click', handler, true)
  buttonHandler = handler
  buttonEl = button
  host.parentElement?.insertBefore(button, host)
  return true
}

function cleanupBanButton() {
  if (buttonEl && buttonHandler) {
    buttonEl.removeEventListener('click', buttonHandler, true)
  }
  buttonEl?.remove()
  buttonEl = null
  buttonHandler = null
}

export function updateOpggBanRecommendation(enabled: boolean) {
  if (enabled && !injectRegistered) {
    injector.register(tryInjectBanButton)
    injectRegistered = true
    tryInjectBanButton()
  } else if (!enabled && injectRegistered) {
    injector.unregister(tryInjectBanButton)
    injectRegistered = false
    cleanupBanButton()
    cleanupModal()
  }
}

function handleOpggCacheCleared() {
  rankedSummaryCache = null
  rankedSummaryCacheTier = null
  rankedSummaryPromise = null
  banRecommendations = createEmptyRecommendations()
  banState = 'loading'
  banMessage = ''
}

export function installOpggBanCacheClearHandler() {
  if (cacheClearListenerInstalled) return
  cacheClearListenerInstalled = true
  window.addEventListener(OPGG_CACHE_CLEARED_EVENT, handleOpggCacheCleared)
}
