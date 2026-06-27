/**
 * Dynamic Play-page game mode visibility chips.
 *
 * The filter reads the currently rendered .game-type-card nodes and creates a
 * small chip for each mode. Chips persist hidden state by data-game-mode value.
 */

import { logger } from '@/index'
import { injector } from '@/lib/InjectorManager'
import { store } from '@/lib/store'

const FILTER_BAR_ID = 'sonaenhance-game-mode-filter-bar'
const CARD_PROCESSED_ATTR = 'data-sonaenhance-mode-filter'
const CARD_HIDDEN_ATTR = 'data-sonaenhance-mode-hidden'
const CARD_ANIMATION_STATE_ATTR = 'data-sonaenhance-mode-animation'
const CARD_ANIMATION_DIRECTION_ATTR = 'data-sonaenhance-mode-direction'
const CARD_HIDE_ANIMATION_MS = 240
const CARD_LAYOUT_ANIMATION_MS = 260
const CARD_GHOST_CLASS = 'sonaenhance-game-mode-card-ghost'

interface GameModeInfo {
  mode: string
  name: string
  activeIcon: string
  disabledIcon: string
}

function extractBgUrl(el: HTMLElement | null): string {
  if (!el) return ''
  const bg = el.style.backgroundImage || ''
  const match = bg.match(/url\(['"]?([^'")]+)['"]?\)/)
  return match ? match[1] : ''
}

function extractCardInfo(card: HTMLElement): GameModeInfo | null {
  const mode = card.getAttribute('data-game-mode')
  if (!mode) return null

  const nameEl = card.querySelector('.parties-game-type-card-name') as HTMLElement | null
  const activeEl = card.querySelector('.icon-bg-filler') as HTMLElement | null
  const disabledEl = card.querySelector('.icon-bg-disabled') as HTMLElement | null
  const defaultEl = card.querySelector('.icon-bg-default') as HTMLElement | null

  return {
    mode,
    name: nameEl?.textContent?.trim() || mode,
    activeIcon: extractBgUrl(activeEl) || extractBgUrl(defaultEl),
    disabledIcon: extractBgUrl(disabledEl) || extractBgUrl(defaultEl),
  }
}

function tryInjectGameModeFilter(): boolean {
  const navBar = document.querySelector('.parties-game-navs-list') as HTMLElement | null
  const navsHost = document.querySelector('.parties-game-navs') as HTMLElement | null
  const cardsHost = document.querySelector('.parties-game-type-select-wrapper') as HTMLElement | null

  if (!navBar || !navsHost || !cardsHost) {
    removeFilterBar()
    return true
  }

  if ((navBar.getAttribute('selectedindex') ?? '0') !== '0') {
    removeFilterBar()
    return true
  }

  const cards = Array.from(cardsHost.querySelectorAll<HTMLElement>('.game-type-card'))
  if (cards.length === 0) return false

  const infos = cards
    .map(extractCardInfo)
    .filter((info): info is GameModeInfo => Boolean(info))
  if (infos.length === 0) return false

  applyVisibility(cards)
  ensureFilterBar(navsHost, infos)
  return true
}

function applyVisibility(cards: HTMLElement[]) {
  const hidden = store.get('hiddenGameModes')
  const middleIndex = (cards.length - 1) / 2

  cards.forEach((card, index) => {
    card.setAttribute(CARD_ANIMATION_DIRECTION_ATTR, index <= middleIndex ? 'left' : 'right')
    const mode = card.getAttribute('data-game-mode') || ''
    if (hidden[mode] === true) {
      hideCard(card)
    } else {
      showCard(card)
    }
  })
}

function shouldCardBeHidden(card: HTMLElement): boolean {
  const mode = card.getAttribute('data-game-mode') || ''
  return store.get('hiddenGameModes')[mode] === true
}

function getLayoutCards(card: HTMLElement): HTMLElement[] {
  const host = card.closest('.parties-game-type-select-wrapper')
  if (!host) return []
  return Array.from(host.querySelectorAll<HTMLElement>('.game-type-card'))
}

function measureVisibleCards(cards: HTMLElement[], excludedCard?: HTMLElement): Map<HTMLElement, DOMRect> {
  const rects = new Map<HTMLElement, DOMRect>()
  cards.forEach((card) => {
    if (card === excludedCard || card.style.display === 'none') return
    rects.set(card, card.getBoundingClientRect())
  })
  return rects
}

function animateLayoutShift(beforeRects: Map<HTMLElement, DOMRect>, excludedCard?: HTMLElement) {
  beforeRects.forEach((beforeRect, card) => {
    if (card === excludedCard || !card.isConnected || card.style.display === 'none') return

    const afterRect = card.getBoundingClientRect()
    const deltaX = beforeRect.left - afterRect.left
    const deltaY = beforeRect.top - afterRect.top
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return

    card.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: CARD_LAYOUT_ANIMATION_MS,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    )
  })
}

function createHideGhost(card: HTMLElement) {
  const rect = card.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const direction = card.getAttribute(CARD_ANIMATION_DIRECTION_ATTR) === 'left' ? 'left' : 'right'
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add(CARD_GHOST_CLASS)
  ghost.removeAttribute('id')
  ghost.removeAttribute(CARD_HIDDEN_ATTR)
  ghost.setAttribute(CARD_ANIMATION_STATE_ATTR, 'visible')
  ghost.setAttribute(CARD_ANIMATION_DIRECTION_ATTR, direction)

  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '20',
  })

  document.body.appendChild(ghost)

  const translateX = direction === 'left' ? -32 : 32
  const animation = ghost.animate(
    [
      { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'blur(0)' },
      { opacity: 0, transform: `translateX(${translateX}px) scale(0.96)`, filter: 'blur(2px)' },
    ],
    {
      duration: CARD_HIDE_ANIMATION_MS,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    },
  )

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    ghost.remove()
  }
  animation.onfinish = cleanup
  animation.oncancel = cleanup
  window.setTimeout(cleanup, CARD_HIDE_ANIMATION_MS + 80)
}

function showCard(card: HTMLElement) {
  card.setAttribute(CARD_PROCESSED_ATTR, 'true')

  if (card.style.display === 'none' || card.hasAttribute(CARD_HIDDEN_ATTR)) {
    const beforeRects = measureVisibleCards(getLayoutCards(card), card)
    card.style.display = ''
    card.removeAttribute(CARD_HIDDEN_ATTR)
    card.setAttribute(CARD_ANIMATION_STATE_ATTR, 'showing')
    card.getBoundingClientRect()
    animateLayoutShift(beforeRects, card)

    requestAnimationFrame(() => {
      if (!card.isConnected || card.hasAttribute(CARD_HIDDEN_ATTR)) return
      card.setAttribute(CARD_ANIMATION_STATE_ATTR, 'visible')
    })
    return
  }

  if (card.getAttribute(CARD_ANIMATION_STATE_ATTR) !== 'visible') {
    card.setAttribute(CARD_ANIMATION_STATE_ATTR, 'visible')
  }
}

function hideCard(card: HTMLElement) {
  card.setAttribute(CARD_PROCESSED_ATTR, 'true')
  if (card.hasAttribute(CARD_HIDDEN_ATTR) && card.style.display === 'none') return
  if (!shouldCardBeHidden(card)) return

  const beforeRects = measureVisibleCards(getLayoutCards(card), card)
  createHideGhost(card)
  card.style.display = ''
  card.setAttribute(CARD_HIDDEN_ATTR, 'true')
  card.removeAttribute(CARD_ANIMATION_STATE_ATTR)
  card.style.display = 'none'
  card.getBoundingClientRect()
  animateLayoutShift(beforeRects, card)
}

function ensureFilterBar(navsHost: HTMLElement, infos: GameModeInfo[]) {
  let bar = document.getElementById(FILTER_BAR_ID) as HTMLDivElement | null
  const currentSig = bar?.getAttribute('data-sonaenhance-mode-sig') ?? ''
  const nextSig = infos.map((info) => info.mode).join(',')
  const tournamentContainer = navsHost.querySelector('.custom-game-tournament-code-container')

  if (!bar) {
    bar = document.createElement('div')
    bar.id = FILTER_BAR_ID
    bar.className = 'sonaenhance-game-mode-filter-bar'
    bar.setAttribute(CARD_PROCESSED_ATTR, 'true')
    if (tournamentContainer) {
      navsHost.insertBefore(bar, tournamentContainer)
    } else {
      navsHost.appendChild(bar)
    }
  } else if (tournamentContainer && bar.nextElementSibling !== tournamentContainer) {
    navsHost.insertBefore(bar, tournamentContainer)
  } else if (!bar.isConnected) {
    navsHost.appendChild(bar)
  }

  if (currentSig !== nextSig) {
    bar.innerHTML = ''
    bar.setAttribute('data-sonaenhance-mode-sig', nextSig)
    infos.forEach((info) => bar!.appendChild(buildChip(info)))
  } else {
    refreshChipsState(bar)
  }
}

function buildChip(info: GameModeInfo): HTMLDivElement {
  const checked = store.get('hiddenGameModes')[info.mode] !== true
  const chip = document.createElement('div')
  chip.className = `sonaenhance-mode-chip ${checked ? 'sonaenhance-mode-chip--on' : 'sonaenhance-mode-chip--off'}`
  chip.setAttribute('data-mode', info.mode)
  chip.title = checked ? `点击隐藏：${info.name}` : `点击显示：${info.name}`

  const icon = document.createElement('div')
  icon.className = 'sonaenhance-mode-chip__icon'
  icon.style.backgroundImage = `url('${checked ? info.activeIcon : info.disabledIcon}')`

  const name = document.createElement('div')
  name.className = 'sonaenhance-mode-chip__name'
  name.textContent = info.name

  chip.appendChild(icon)
  chip.appendChild(name)
  chip.addEventListener('mousedown', (e) => e.stopPropagation())
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    toggleMode(info.mode)
  })

  chip.dataset.activeIcon = info.activeIcon
  chip.dataset.disabledIcon = info.disabledIcon
  return chip
}

function toggleMode(mode: string) {
  const map = { ...store.get('hiddenGameModes') }
  if (map[mode]) {
    delete map[mode]
    logger.info('[GameModeFilter] show mode: %s', mode)
  } else {
    map[mode] = true
    logger.info('[GameModeFilter] hide mode: %s', mode)
  }
  store.set('hiddenGameModes', map)
  tryInjectGameModeFilter()
}

function refreshChipsState(bar: HTMLElement) {
  const hiddenMap = store.get('hiddenGameModes')
  const chips = bar.querySelectorAll<HTMLDivElement>('.sonaenhance-mode-chip')
  chips.forEach((chip) => {
    const mode = chip.getAttribute('data-mode') || ''
    const checked = hiddenMap[mode] !== true
    chip.classList.toggle('sonaenhance-mode-chip--on', checked)
    chip.classList.toggle('sonaenhance-mode-chip--off', !checked)

    const iconEl = chip.querySelector('.sonaenhance-mode-chip__icon') as HTMLElement | null
    if (iconEl) {
      iconEl.style.backgroundImage = `url('${checked ? chip.dataset.activeIcon || '' : chip.dataset.disabledIcon || ''}')`
    }

    const nameText = chip.querySelector('.sonaenhance-mode-chip__name')?.textContent ?? mode
    chip.title = checked ? `点击隐藏：${nameText}` : `点击显示：${nameText}`
  })
}

function removeFilterBar() {
  document.getElementById(FILTER_BAR_ID)?.remove()
}

function restoreAllCards() {
  document.querySelectorAll<HTMLElement>(`.game-type-card[${CARD_HIDDEN_ATTR}]`).forEach((card) => {
    card.style.display = ''
    card.removeAttribute(CARD_HIDDEN_ATTR)
    card.removeAttribute(CARD_ANIMATION_STATE_ATTR)
    card.removeAttribute(CARD_ANIMATION_DIRECTION_ATTR)
  })

  document.querySelectorAll<HTMLElement>(`.game-type-card[${CARD_ANIMATION_STATE_ATTR}]`).forEach((card) => {
    card.style.display = ''
    card.removeAttribute(CARD_HIDDEN_ATTR)
    card.removeAttribute(CARD_ANIMATION_STATE_ATTR)
    card.removeAttribute(CARD_ANIMATION_DIRECTION_ATTR)
  })

  document.querySelectorAll<HTMLElement>(`.${CARD_GHOST_CLASS}`).forEach((ghost) => ghost.remove())
}

let registered = false
let storeUnsub: (() => void) | null = null

export function updateGameModeFilter(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryInjectGameModeFilter)
    storeUnsub = store.onChange('hiddenGameModes', tryInjectGameModeFilter)
    logger.info('[GameModeFilter] enabled')
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryInjectGameModeFilter)
    storeUnsub?.()
    storeUnsub = null
    removeFilterBar()
    restoreAllCards()
    logger.info('[GameModeFilter] disabled')
  }
}
