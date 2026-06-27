/**
 * Balance adjustment tooltip.
 *
 * Shows mode-specific balance adjustments when hovering champion avatars in special modes.
 *
 * Design:
 * - Reuse the client's native <lol-uikit-tooltip> for native styling.
 * - Extract championId from DOM background-image on hover and query data live.
 * - Avoid cached arrays so indices cannot drift.
 * - Let the injector guard injection points and restore them after client rerenders.
 *
 * Data source: LoL Wiki. Field names use underscores and sparse objects.
 */

import { logger } from '@/index'
import { lcu, LcuEventUri, type LCUEventMessage } from '@/lib/lcu'
import type { GameflowPhase } from '@/types/lcu'
import { injector } from '@/lib/InjectorManager'
import { getAllChampions, getChampionBalance, getQueueName, type BalanceMode, type ChampionBalanceStats } from '@/lib/assets'

// ==================== Icon Assets Inlined At Build Time ====================

import iconDmgDealt from '@/../assets/balance-icons/dmg_dealt.png'
import iconDmgTaken from '@/../assets/balance-icons/dmg_taken.png'
import iconHealing from '@/../assets/balance-icons/healing.png'
import iconShielding from '@/../assets/balance-icons/shielding.png'
import iconTenacity from '@/../assets/balance-icons/tenacity.png'
import iconAbilityHaste from '@/../assets/balance-icons/ability_haste.png'
import iconAttackSpeed from '@/../assets/balance-icons/attack_speed.png'
import iconEnergyRegen from '@/../assets/balance-icons/energy_regen.png'
import iconManaRegen from '@/../assets/balance-icons/mana_regen.png'
import iconMovementSpeed from '@/../assets/balance-icons/movement_speed.png'

/** Wiki field name to icon asset. */
const ICON_MAP: Record<string, string> = {
  dmg_dealt: iconDmgDealt,
  dmg_taken: iconDmgTaken,
  healing: iconHealing,
  shielding: iconShielding,
  tenacity: iconTenacity,
  ability_haste: iconAbilityHaste,
  attack_speed: iconAttackSpeed,
  energy_regen: iconEnergyRegen,
  mana_regen: iconManaRegen,
  movement_speed: iconMovementSpeed,
}

/** Wiki field name to localized label. */
const LABEL_MAP: Record<string, string> = {
  dmg_dealt: '造成伤害',
  dmg_taken: '承受伤害',
  healing: '治疗效果',
  shielding: '护盾效果',
  tenacity: '韧性',
  ability_haste: '技能急速',
  attack_speed: '成长攻速',
  energy_regen: '能量回复',
  mana_regen: '法力回复',
  movement_speed: '移动速度',
}

/** Display order. A fixed order is more readable than dictionary order. */
const DISPLAY_ORDER: Array<keyof ChampionBalanceStats> = [
  'dmg_dealt',
  'dmg_taken',
  'healing',
  'shielding',
  'attack_speed',
  'ability_haste',
  'movement_speed',
  'tenacity',
  'mana_regen',
  'energy_regen',
]

// ==================== Mode Mapping ====================

/**
 * LCU gameMode string to balance-data key.
 * Handles variants such as ARURF using urf data and KIWI using aram data.
 * Display names come from LCU getQueueName(queueId), not from this map.
 */
function getBalanceKey(gameMode: string): BalanceMode | null {
  const mode = gameMode.toLowerCase()
  // ARAM family: all ARAM variants.
  if (mode === 'aram' || mode === 'kiwi') return 'aram'
  // URF family: URF / ARURF.
  if (mode === 'urf' || mode === 'arurf') return 'urf'
  // One For All.
  if (mode === 'oneforall' || mode === 'ofa') return 'ofa'
  // Nexus Blitz.
  if (mode === 'nexusblitz' || mode === 'nb') return 'nb'
  // Arena.
  if (mode === 'cherry' || mode === 'arena') return 'ar'
  // Ultimate Spellbook.
  if (mode === 'ultbook' || mode === 'usb') return 'usb'
  return null
}

// ==================== Tooltip UI ====================

class BalanceTooltip {
  private manager: HTMLElement
  private root: HTMLDivElement
  private container: HTMLDivElement
  private tooltip: HTMLElement
  private caption: HTMLDivElement
  private content: HTMLDivElement

  constructor(manager: HTMLElement) {
    this.manager = manager

    const root = document.createElement('div')
    // Match the reference project's z-index so this tooltip stays above the native client tooltip.
    root.setAttribute('style', 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:19001;')
    this.root = root

    const container = document.createElement('div')
    container.setAttribute('style', 'position:absolute;opacity:0;pointer-events:none;transition:opacity 0.2s;')
    root.appendChild(container)
    this.container = container

    // Reuse the native tooltip Web Component for its arrow indicator and native styling.
    const tooltip = document.createElement('lol-uikit-tooltip')
    tooltip.setAttribute('data-tooltip-position', 'right')
    container.appendChild(tooltip)
    this.tooltip = tooltip

    const view = document.createElement('div')
    view.setAttribute('style', 'background:#1a1c21;direction:ltr;width:240px;font-family:var(--font-body);-webkit-font-smoothing:subpixel-antialiased;color:#a09b8c;font-size:12px;font-weight:400;letter-spacing:.025em;line-height:16px;')
    tooltip.appendChild(view)

    const body = document.createElement('div')
    body.setAttribute('style', 'min-width:200px;padding:14px 18px;')
    view.appendChild(body)

    const caption = document.createElement('div')
    caption.setAttribute('style', 'margin-bottom:10px;color:#f0e6d2;font-size:13px;font-weight:700;letter-spacing:.075em;line-height:18px;text-transform:uppercase;border-bottom:1px solid #3c3c41;padding-bottom:6px;')
    body.appendChild(caption)
    this.caption = caption

    const content = document.createElement('div')
    body.appendChild(content)
    this.content = content
  }

  show(anchor: Element, position: 'right' | 'bottom', caption: string, contentHtml: string) {
    this.caption.textContent = caption
    this.content.innerHTML = contentHtml
    if (!this.root.isConnected) this.manager.appendChild(this.root)
    this.tooltip.setAttribute('data-tooltip-position', position)

    const rect = anchor.getBoundingClientRect()
    let left = 0
    let top = 0

    if (position === 'right') {
      left = rect.right + 5
      top = rect.bottom - (rect.height + this.container.offsetHeight) / 2
    } else {
      // Bench context: fully cover the native tooltip because it adds little useful information.
      top = rect.bottom
      left = rect.right - (rect.width + this.container.offsetWidth) / 2
    }

    this.container.style.left = `${left}px`
    this.container.style.top = `${top}px`
    this.container.style.opacity = '1'
  }

  hide() {
    this.container.style.opacity = '0'
  }

  destroy() {
    this.container.style.opacity = '0'
    this.root.remove()
  }
}

// ==================== Data Rendering ====================

/** 1.1 → "+10%"；0.95 → "-5%" */
function ratioToText(n: number): string {
  const bonus = ((n - 1) * 100)
  const text = parseFloat(bonus.toFixed(2)) + '%'
  return n >= 1 ? '+' + text : text
}

/** Show ability_haste as an additive value and other fields as multipliers. */
function isAbilityHasteField(key: string): boolean {
  return key === 'ability_haste'
}

/** Decide whether the value is a buff or nerf. */
function isBuff(key: string, value: number): boolean {
  if (key === 'dmg_taken') return value < 1   // Less damage taken is a buff.
  if (isAbilityHasteField(key)) return value >= 0 // Ability haste is additive; positive values are buffs.
  return value >= 1
}

/** Generate the adjustment list HTML. Wiki stats are sparse and only include changed fields. */
function buildStatsHtml(stats: ChampionBalanceStats): string {
  // Sort by DISPLAY_ORDER.
  const entries: Array<[string, number]> = []
  for (const key of DISPLAY_ORDER) {
    const value = stats[key]
    if (typeof value === 'number') {
      entries.push([key, value])
    }
  }

  if (entries.length === 0) {
    return '<div style="color:#746e64;font-style:italic;">无平衡调整（原版数值）</div>'
  }

  const rows = entries.map(([key, value]) => {
    const label = LABEL_MAP[key] ?? key
    const icon = ICON_MAP[key]
    const color = isBuff(key, value) ? '#5bbd72' : '#e84749'
    // ability_haste is additive (+N); other fields are percentage multipliers (+N%).
    const text = isAbilityHasteField(key)
      ? (value >= 0 ? `+${value}` : `${value}`)
      : ratioToText(value)
    const iconHtml = icon
      ? `<img src="${icon}" width="14" height="14" alt="" style="margin-right:6px;vertical-align:middle;" />`
      : ''
    return `
      <div style="display:flex;align-items:center;margin-bottom:4px;line-height:18px;">
        <span style="display:flex;align-items:center;flex:1;">
          ${iconHtml}<span>${label}</span>
        </span>
        <span style="color:${color};font-weight:bold;">${text}</span>
      </div>
    `
  })

  return rows.join('')
}

// ==================== Module State ====================

let tooltip: BalanceTooltip | null = null
/** Current mode. dataKey queries balance data; displayName comes from LCU getQueueName(queueId). */
let currentMode: { dataKey: BalanceMode; displayName: string } | null = null
let phaseUnsub: (() => void) | null = null
let injectRegistered = false
let cardHoverObserver: MutationObserver | null = null
let lastCardDiag = ''
let lastHoverChampId = -2

// ==================== Data Rendering On Hover ====================

function buildTooltipData(champId: number): { caption: string; content: string } | null {
  if (champId <= 0 || !currentMode) return null
  const balance = getChampionBalance(champId)
  if (!balance) return null

  // Wiki data is sparse: modes without adjustments are absent.
  const stats = balance.stats?.[currentMode.dataKey] ?? {}
  return {
    caption: `${currentMode.displayName} · 平衡调整`,
    content: buildStatsHtml(stats),
  }
}

// ==================== Idempotent DOM Binding ====================

const BOUND_ATTR = 'data-sonaenhance-balance-hover'
const GRID_SELECTOR = [
  '.champion-grid-champion',
  '.champion-grid-champion-thumbnail',
  '.champion-grid-item',
].join(',')

/**
 * Extract champion ID from summoner-container-wrapper.
 * Supports:
 * 1. <img> src
 * 2. CSS background-image
 * URL format: /lol-game-data/assets/v1/champion-icons/102.png
 */
function extractChampionIdFromWrapper(wrapper: Element): number | null {
  // Prefer <img> tags.
  const img = wrapper.querySelector('img[src*="champion-icons"]')
  if (img) {
    const src = img.getAttribute('src') || ''
    const match = src.match(/champion-icons\/(\d+)\.png/)
    if (match) {
      logger.debug('[BalanceBuff] extractFromWrapper: 从<img>提取 championId=%s (src=%s)', match[1], src)
      return Number(match[1])
    }
    logger.debug('[BalanceBuff] extractFromWrapper: 找到<img>但src不匹配 (src=%s)', src)
  } else {
    logger.debug('[BalanceBuff] extractFromWrapper: 未找到 img[src*=champion-icons]')
  }

  // Fallback: extract from background-image.
  // The actual icon is on child elements such as .portrait-icon / .fit-icon.
  const iconContainer = wrapper.querySelector('.champion-icon-container') as HTMLElement | null
    ?? wrapper.querySelector('.champion-icon') as HTMLElement | null
  if (iconContainer) {
    // 1) Check the element itself first.
    let bg = iconContainer.style.backgroundImage || ''
    // 2) Then search child elements whose background-image contains champion-icons.
    if (!bg || !bg.includes('champion-icons')) {
      const bgEl = iconContainer.querySelector('[style*="champion-icons"]') as HTMLElement | null
      bg = bgEl?.style.backgroundImage || ''
    }
    logger.debug('[BalanceBuff] extractFromWrapper: 找到iconContainer (class=%s, bg=%s)', iconContainer.className, bg)
    const match = bg.match(/champion-icons\/(\d+)\.png/)
    if (match) {
      logger.debug('[BalanceBuff] extractFromWrapper: 从background-image提取 championId=%s', match[1])
      return Number(match[1])
    }
    logger.debug('[BalanceBuff] extractFromWrapper: iconContainer内background-image不匹配')
  } else {
    logger.debug('[BalanceBuff] extractFromWrapper: 未找到 .champion-icon-container 或 .champion-icon')
  }

  // Final fallback: inspect images and background-image elements inside the wrapper.
  const allImgs = wrapper.querySelectorAll('img')
  if (allImgs.length > 0) {
    logger.debug('[BalanceBuff] extractFromWrapper: wrapper内所有img: %o', Array.from(allImgs).map(i => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') })))
  }
  logger.debug('[BalanceBuff] extractFromWrapper: 无法提取championId，wrapper.innerHTML片段=%s', wrapper.innerHTML.substring(0, 300))
  return null
}

function extractChampionIdFromChampionIconUrl(raw: string): number | null {
  const match = raw.match(/champion-icons\/(\d+)\.png/i)
  return match ? Number(match[1]) : null
}

function normalizeChampionLookupText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/['’.\-]/g, '')
    .trim()
    .toLowerCase()
}

function resolveChampionIdByText(text: string): number | null {
  const normalized = normalizeChampionLookupText(text)
  if (!normalized) return null

  const champion = getAllChampions().find((item) => {
    return [
      item.name,
      item.title,
      item.alias,
      `${item.title} ${item.name}`,
      `${item.name} ${item.title}`,
    ].some((candidate) => normalizeChampionLookupText(candidate) === normalized)
  })
  return champion?.id ?? null
}

function extractChampionIdFromElement(el: Element): number | null {
  const attrs = ['data-champion-id', 'champion-id', 'data-id', 'data-champion']
  for (const attr of attrs) {
    const value = el.getAttribute(attr)
    const id = value ? Number(value) : 0
    if (Number.isFinite(id) && id > 0) return id
  }

  const img = el.querySelector('img[src*="champion-icons"]') ?? (el.matches('img[src*="champion-icons"]') ? el : null)
  if (img) {
    const id = extractChampionIdFromChampionIconUrl(img.getAttribute('src') || '')
    if (id) return id
  }

  const elements = [el, ...Array.from(el.querySelectorAll<HTMLElement>('[style*="champion-icons"]'))]
  for (const element of elements) {
    const style = element instanceof HTMLElement ? element.style.backgroundImage : ''
    const id = extractChampionIdFromChampionIconUrl(style)
    if (id) return id
  }

  const textCandidates = [
    el.getAttribute('title') || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('alt') || '',
    el.textContent || '',
  ]
  for (const candidate of textCandidates) {
    const id = resolveChampionIdByText(candidate)
    if (id) return id
  }

  return null
}

function logCardDiag(message: string): void {
  if (message === lastCardDiag) return
  lastCardDiag = message
  logger.info('[BalanceBuff] %s', message)
}

function extractChampionNameFromCard(card: Element): string | null {
  const direct = card.textContent?.trim()
  if (direct && direct.length > 1 && direct.length < 25) return direct

  for (const selector of ['[class*="name"]', '[class*="label"]', 'span', 'p']) {
    const text = card.querySelector<HTMLElement>(selector)?.textContent?.trim()
    if (text && text.length > 1 && text.length < 25) return text
  }
  return null
}

function resolveChampionIdByCard(card: Element): { championId: number | null; name: string | null } {
  const idFromDom = extractChampionIdFromElement(card)
  if (idFromDom) return { championId: idFromDom, name: null }

  const name = extractChampionNameFromCard(card)
  if (!name) return { championId: null, name: null }
  return { championId: resolveChampionIdByText(name), name }
}

function ensureCardHoverObserver(): void {
  if (!tooltip || !currentMode) {
    logCardDiag(`网格观察者未就绪 → tooltip=${!!tooltip}, currentMode=${currentMode ? currentMode.dataKey : 'null'}`)
    return
  }

  const wrapper = document.querySelector('.champion-cards-component-wrapper')
  if (!wrapper) {
    const cardCount = document.querySelectorAll('.champion-card-component').length
    if (cardCount > 0) {
      logCardDiag(`有 ${cardCount} 张英雄卡片，但未找到网格容器`)
    } else {
      logCardDiag('英雄网格尚未渲染，等待 DOM 出现')
    }
    return
  }

  if (wrapper.hasAttribute(BOUND_ATTR)) return
  wrapper.setAttribute(BOUND_ATTR, 'cards-wrapper')

  const initialCards = wrapper.querySelectorAll('.champion-card-component').length
  logger.info('[BalanceBuff] 已绑定英雄网格 hover 观察者，初始卡片数=%d', initialCards)

  cardHoverObserver?.disconnect()
  cardHoverObserver = new MutationObserver(() => {
    if (!tooltip || !currentMode) return

    const hovered = wrapper.querySelector('.champion-card-component.card-hovered')
    if (!hovered) {
      if (lastHoverChampId !== -2) {
        lastHoverChampId = -2
        tooltip.hide()
      }
      return
    }

    const { championId, name } = resolveChampionIdByCard(hovered)
    if ((championId ?? -1) !== lastHoverChampId) {
      lastHoverChampId = championId ?? -1
      logger.info('[BalanceBuff] 网格 hover → %s (championId=%d)', name ?? '?', championId ?? -1)
    }

    if (!championId || championId <= 0) {
      tooltip.hide()
      return
    }
    const data = buildTooltipData(championId)
    if (data) tooltip.show(hovered, 'right', data.caption, data.content)
    else tooltip.hide()
  })
  cardHoverObserver.observe(wrapper, { subtree: true, attributes: true, attributeFilter: ['class'] })
}

/**
 * Extract champion ID from champion-bench-item.
 * Supports <img> tags and background-image.
 */
function extractChampionIdFromBench(item: Element): number | null {
  // Prefer <img> tags.
  const img = item.querySelector('img[src*="champion-icons"]')
  if (img) {
    const match = img.getAttribute('src')?.match(/champion-icons\/(\d+)\.png/)
    if (match) return Number(match[1])
  }

  // Fallback: extract from background-image.
  const bg = item.querySelector('.bench-champion-background') as HTMLElement | null
  if (bg) {
    const style = bg.style.backgroundImage || ''
    const match = style.match(/champion-icons\/(\d+)\.png/)
    if (match) return Number(match[1])
  }

  return null
}

function tryBindHover(): boolean {
  if (!tooltip || !currentMode) return true

  logger.debug('[BalanceBuff] tryBindHover: tooltip=%s, mode=%s', !!tooltip, currentMode.dataKey)

  // Allied team members. Use the same selector as features.ts to cover all positions.
  const party = document.querySelector('.summoner-array.your-party')
  if (party) {
    const wrappers = party.querySelectorAll('.summoner-container-wrapper')
    logger.debug('[BalanceBuff] tryBindHover: 找到party, wrappers=%d个', wrappers.length)
    wrappers.forEach((el) => {
      if (el.hasAttribute(BOUND_ATTR)) return
      el.setAttribute(BOUND_ATTR, 'team')
      el.addEventListener('mouseenter', () => {
        // Extract championId from the DOM live instead of relying on index alignment.
        const champId = extractChampionIdFromWrapper(el)
        logger.debug('[BalanceBuff] mouseenter: champId=%d', champId ?? -1)
        if (!champId || champId <= 0) return
        const data = buildTooltipData(champId)
        if (data) tooltip!.show(el, 'right', data.caption, data.content)
      })
      el.addEventListener('mouseleave', () => tooltip!.hide())
    })
  } else {
    logger.debug('[BalanceBuff] tryBindHover: 未找到 .summoner-array.your-party')
  }

  // Bench.
  const bench = document.querySelectorAll('.bench-container .champion-bench-item')
  logger.debug('[BalanceBuff] tryBindHover: bench元素=%d个', bench.length)
  bench.forEach((el) => {
    if (el.hasAttribute(BOUND_ATTR)) return
    el.setAttribute(BOUND_ATTR, 'bench')
    el.addEventListener('mouseenter', () => {
      const champId = extractChampionIdFromBench(el)
      logger.debug('[BalanceBuff] mouseenter bench: champId=%d', champId ?? -1)
      if (!champId || champId <= 0) return
      const data = buildTooltipData(champId)
      if (data) tooltip!.show(el, 'bottom', data.caption, data.content)
    })
    el.addEventListener('mouseleave', () => tooltip!.hide())
  })

  const gridItems = document.querySelectorAll(GRID_SELECTOR)
  logger.debug('[BalanceBuff] tryBindHover: champion grid元素=%d个', gridItems.length)
  gridItems.forEach((el) => {
    if (el.hasAttribute(BOUND_ATTR)) return
    el.setAttribute(BOUND_ATTR, 'grid')
    el.addEventListener('mouseenter', () => {
      const champId = extractChampionIdFromElement(el)
      logger.debug('[BalanceBuff] mouseenter grid: champId=%d', champId ?? -1)
      if (!champId || champId <= 0) return
      const data = buildTooltipData(champId)
      if (data) tooltip!.show(el, 'right', data.caption, data.content)
    })
    el.addEventListener('mouseleave', () => tooltip!.hide())
  })

  ensureCardHoverObserver()

  return true
}

// ==================== Lifecycle ====================

async function mountForChampSelect() {
  logger.debug('[BalanceBuff] mountForChampSelect 开始')
  // 1. Detect current mode: gameMode maps to data key, queueId resolves the official display name.
  let gameMode = ''
  let queueId = 0
  try {
    const gf = await lcu.getGameflowSession()
    gameMode = gf.gameData?.queue?.gameMode || ''
    queueId = gf.gameData?.queue?.id || 0
    logger.debug('[BalanceBuff] getGameflowSession: gameMode=%s, queueId=%d', gameMode, queueId)
  } catch (e) {
    logger.debug('[BalanceBuff] getGameflowSession 失败: %o', e)
  }

  const modeKey = getBalanceKey(gameMode)
  if (!modeKey) {
    logger.info('[BalanceBuff] 当前模式 %s 不支持，跳过', gameMode)
    return
  }

  // Use the official LCU queue display name instead of hardcoding it here.
  const displayName = queueId > 0 ? getQueueName(queueId) : gameMode
  currentMode = { dataKey: modeKey, displayName }
  logger.info('[BalanceBuff] 进入选人阶段 → %s (gameMode=%s, queueId=%d, dataKey=%s)', displayName, gameMode, queueId, modeKey)

  // 2. Create the tooltip.
  const manager = document.getElementById('lol-uikit-layer-manager-wrapper')
  if (!manager) {
    logger.warn('[BalanceBuff] 未找到 layer-manager-wrapper，延迟挂载')
    return
  }
  tooltip = new BalanceTooltip(manager)

  // 3. Register DOM binding injection. The injector restores bindings after client rerenders.
  injector.register(tryBindHover)
  injectRegistered = true
}

function unmountForChampSelect() {
  logger.debug('[BalanceBuff] unmountForChampSelect 执行')
  if (injectRegistered) {
    injector.unregister(tryBindHover)
    injectRegistered = false
  }
  if (cardHoverObserver) {
    cardHoverObserver.disconnect()
    cardHoverObserver = null
  }
  lastCardDiag = ''
  lastHoverChampId = -2
  if (tooltip) {
    tooltip.destroy()
    tooltip = null
  }
  // Clear DOM markers.
  document.querySelectorAll(`[${BOUND_ATTR}]`).forEach((el) => el.removeAttribute(BOUND_ATTR))
  currentMode = null
}

// ==================== Public API ====================

/**
 * Enable or disable balance adjustment tooltips.
 * Listen to gameflow-phase: mount in ChampSelect and unmount after leaving.
 */
export function updateBalanceBuffTooltip(enabled: boolean) {
  logger.debug('[BalanceBuff] updateBalanceBuffTooltip: enabled=%s, phaseUnsub=%s', enabled, !!phaseUnsub)
  if (enabled && !phaseUnsub) {
    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        // Defensive cleanup before mounting.
        unmountForChampSelect()
        mountForChampSelect()
      } else {
        unmountForChampSelect()
      }
    })

    // Mount immediately if the plugin starts while already in ChampSelect.
    lcu.getGameflowPhase().then((phase) => {
      logger.debug('[BalanceBuff] 启动时当前阶段=%s', phase)
      if (phase === 'ChampSelect') {
        unmountForChampSelect()
        mountForChampSelect()
      }
    }).catch(() => { /* ignore */ })

    logger.info('[BalanceBuff] 平衡性调整 buff 提示已启用 ✓')
  } else if (!enabled && phaseUnsub) {
    phaseUnsub()
    phaseUnsub = null
    unmountForChampSelect()
    logger.info('[BalanceBuff] 平衡性调整 buff 提示已禁用')
  }
}
