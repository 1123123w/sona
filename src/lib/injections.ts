/**
 * Injection registry.
 *
 * All League Client DOM injection points are defined here.
 * Each injection point is a tryInjectXxx function scheduled by InjectorManager.
 *
 * To add a new injection point:
 * 1. Write a tryInjectXxx(): boolean function.
 * 2. Register it in registerAllInjections().
 */

import { logger } from '@/index'
import { injector } from '@/lib/InjectorManager'
import { store } from '@/lib/store'
import { openModal, onModalVisibilityChange } from '@/lib/modal'
import sonaIcon from '../../assets/Champie_Sona_profileicon.png'
import { lcu, LcuEventUri, type LCUEventMessage } from '@/lib/lcu'
import type { Availability, ChatMe } from '@/lib/lcu'
import { sleep } from '@/lib/utils'
import { getPuuid } from '@/lib/assets'
import { getUpdateState, onUpdateStateChange } from '@/lib/update-checker'

/** Shared marker for DOM elements already handled by Sona. */
const HIJACKED_ATTR = 'data-sonaenhance-hijacked'

function hideOfficialEntries(selectors: readonly string[], attr: string): boolean {
  let matched = false
  selectors.forEach((selector) => {
    document.querySelectorAll(`${selector}:not([${attr}])`).forEach((el) => {
      if (document.getElementById('sonaenhance-root')?.contains(el)) return
      matched = true
      el.setAttribute(attr, 'true')
      ;(el as HTMLElement).style.display = 'none'
    })
  })
  return matched
}

function hideOfficialEntriesByText(labels: string[], attr: string): boolean {
  let matched = false
  document.querySelectorAll('body *:not(script):not(style)').forEach((el) => {
    if (document.getElementById('sonaenhance-root')?.contains(el)) return
    if (el.hasAttribute(attr)) return

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!labels.some((label) => text === label || text.includes(label))) return

    const target = el.closest('[data-game-mode], .parties-game-mode-card, .game-mode-card, lol-uikit-card, button, li, a') as HTMLElement | null
    if (!target || document.getElementById('sonaenhance-root')?.contains(target)) return
    if (target.hasAttribute(attr)) return

    target.setAttribute(attr, 'true')
    target.style.display = 'none'
    matched = true
  })
  return matched
}

function restoreOfficialEntries(attr: string) {
  document.querySelectorAll(`[${attr}]`).forEach((el) => {
    (el as HTMLElement).style.display = ''
    el.removeAttribute(attr)
  })
}

function upsertStyleNode(id: string, css: string) {
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = css
}

function removeStyleNode(id: string) {
  document.getElementById(id)?.remove()
}

function countSelector(selector: string): number {
  return document.querySelectorAll(selector).length
}

function countSelectors(selectors: readonly string[]): number {
  return selectors.reduce((total, selector) => total + countSelector(selector), 0)
}

// ==================== Sona Entry Button ====================

const BUTTON_ID = 'sonaenhance-entry-btn'

/**
 * Create the Sona entry button DOM element.
 */
function createEntryButton(): HTMLElement {
  const btn = document.createElement('div')
  btn.id = BUTTON_ID
  btn.className = 'sonaenhance-entry-btn'

  btn.innerHTML = `
    <img class="sonaenhance-entry-icon" src="${sonaIcon}" alt="Sona" />
    <span class="sonaenhance-entry-update-badge" aria-hidden="true">!</span>
  `

  // Prevent underlying client mousedown/mouseup handlers from leaking through.
  btn.addEventListener('mousedown', (e) => e.stopPropagation())
  btn.addEventListener('mouseup', (e) => e.stopPropagation())

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    openModal()
    logger.info('Modal opened')
  })

  // Sync active state when the modal closes.
  onModalVisibilityChange((visible) => {
    btn.classList.toggle('sonaenhance-entry-btn--active', visible)
  })

  const syncUpdateBadge = () => {
    btn.classList.toggle('sonaenhance-entry-btn--has-update', getUpdateState().status === 'available')
  }
  syncUpdateBadge()
  onUpdateStateChange(syncUpdateBadge)

  return btn
}

/**
 * Injection task: Sona entry button.
 * Injects to the left of the Play button and restores itself after rerenders.
 */
function tryInjectSonaButton(): boolean {
  if (document.getElementById(BUTTON_ID)?.isConnected) return true

  const playButtonContainer = document.querySelector('.play-button-container')
  if (!playButtonContainer?.parentElement) return false

  const parent = playButtonContainer.parentElement
  parent.insertBefore(createEntryButton(), playButtonContainer)

  logger.info('Entry button injected ✓ (beside play button)')
  return true
}


// ==================== Availability Button Hijack ====================




const MENU_ID = 'sonaenhance-availability-menu'

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'chat', label: '在线' },
  { value: 'away', label: '离开' },
  //{ value: 'dnd', label: 'dnd' }, dnd looks the same as away, so keep one option.
  { value: 'offline', label: '隐身' },
  { value: 'mobile', label: '手机在线' },
]

/** Current availability cache, initialized from store. */
let currentAvailability: Availability = store.get('availability') as Availability

/** Get the saved status message for the current account. */
function getSavedStatus(): string {
  return store.get('statusMessage')[getPuuid()] ?? ''
}

/** Save the status message for the current account. */
function setSavedStatus(msg: string) {
  const map = { ...store.get('statusMessage') }
  if (msg) {
    map[getPuuid()] = msg
  } else {
    delete map[getPuuid()]
  }
  store.set('statusMessage', map)
}

/**
 * Restore persisted availability and status message at startup.
 *
 * Important guard: restore only while the gameflow is idle (None / Lobby), otherwise it can
 * conflict with the Riot state machine. During ChampSelect / InProgress / EndOfGame, the
 * client owns the lol presence payload and writes game-state text into it. Forcing
 * availability=chat there can create mixed states.
 *
 * Also, early during LCU startup the XMPP server may not be connected yet, and getChatMe
 * can report a temporary offline state. Restore once and avoid periodic correction.
 */
async function restoreAvailabilityAndStatus() {
  try {
    logger.info('[Availability] 开始恢复持久化状态...')

    // If already in or near a game, leave the client state untouched.
    const phase = await lcu.getGameflowPhase()
    if (phase !== 'None' && phase !== 'Lobby') {
      logger.info('[Availability] 当前阶段 %s，跳过状态恢复（避免与底层状态机冲突）', phase)
      return
    }

    const me = await lcu.getChatMe()
    const savedAvailability = store.get('availability') as Availability
    const savedStatus = getSavedStatus()

    logger.info(
      '[Availability] 当前状态快照: client.availability=%s, client.statusMessage=%s | saved.availability=%s, saved.statusMessage=%s',
      me.availability, JSON.stringify(me.statusMessage),
      savedAvailability, JSON.stringify(savedStatus),
    )

    // 2. Restore availability. Do not restore away because the client sets it automatically.
    if (savedAvailability && savedAvailability !== 'away' && savedAvailability !== me.availability) {
      try {
        await lcu.setAvailability(savedAvailability)
        logger.info('[Availability] 已写入 availability: %s', savedAvailability)
      } catch (err) {
        logger.warn('[Availability] availability 写入失败（稍后会再校验一次）:', err)
      }
      currentAvailability = savedAvailability
    } else {
      logger.info('[Availability] availability 无需恢复（已与 store 一致 / 未配置）')
      currentAvailability = me.availability
    }

    // 3. Status message handling with the same one-shot strategy.
    //    - client has no message and store has a valid one: write it
    //    - client has a valid message: sync it to store
    //    - invalid or empty values never write to store, avoiding empty-value pollution
    const clientStatus = hasContent(me.statusMessage) ? (me.statusMessage as string) : ''
    if (clientStatus === '' && hasContent(savedStatus)) {
      try {
        await lcu.setStatusMessage(savedStatus)
        logger.info('[Availability] 已写入 statusMessage: %s', savedStatus)
      } catch (err) {
        logger.warn('[Availability] statusMessage 写入失败（稍后会再校验一次）:', err)
      }
    } else if (clientStatus !== '') {
      if (clientStatus !== savedStatus) {
        setSavedStatus(clientStatus)
        logger.info('[Availability] 客户端签名与 store 不一致，已回写到 store: %s', clientStatus)
      } else {
        logger.info('[Availability] statusMessage 无需恢复（客户端与 store 一致）')
      }
    } else {
      logger.info('[Availability] 客户端无签名且 store 也无签名，跳过')
    }
  } catch (err) {
    logger.warn('[Availability] Failed to restore availability/status:', err)
  }
}

/**
 * Delayed verification after subscribing to WS.
 *
 * Background:
 *   On a full client restart, there is a timing window:
 *     T0: Sona restore writes the status message and the client PUT succeeds.
 *     T1: Our WS listener is attached.
 *     T2: The client's delayed XMPP initialization pushes a clean chat/me state and clears it.
 *   T2 should be observable through WS, but the client can use local sync paths instead of
 *   event delivery, so the listener may never fire.
 *
 * Solution:
 *   After attaching WS, wait for startup presence sync to settle, then fetch /lol-chat/v1/me:
 *     - if it still differs from store, write once more
 *     - if it matches, restore succeeded and no action is needed
 */
async function verifyAfterSubscribe() {
  // Give the client enough time to finish startup presence sync.
  await sleep(2000)

  try {
    const phase = await lcu.getGameflowPhase()
    if (phase !== 'None' && phase !== 'Lobby') {
      logger.info('[Availability] 延迟校验时阶段为 %s，跳过', phase)
      return
    }

    const me = await lcu.getChatMe()
    const savedAvailability = store.get('availability') as Availability
    const savedStatus = getSavedStatus()

    const clientStatus = hasContent(me.statusMessage) ? (me.statusMessage as string) : ''

    logger.info(
      '[Availability] 延迟校验快照: client.availability=%s, client.statusMessage=%s | saved.availability=%s, saved.statusMessage=%s',
      me.availability, JSON.stringify(me.statusMessage),
      savedAvailability, JSON.stringify(savedStatus),
    )

    // Verify availability.
    if (savedAvailability && savedAvailability !== me.availability) {
      logger.warn('[Availability] 延迟校验发现 availability 被客户端回退，再次写入: %s', savedAvailability)
      await lcu.setAvailability(savedAvailability).catch((err) => {
        logger.warn('[Availability] 延迟校验写 availability 失败:', err)
      })
    }

    // Verify statusMessage.
    if (hasContent(savedStatus) && clientStatus !== savedStatus) {
      logger.warn('[Availability] 延迟校验发现 statusMessage 被客户端回退（"%s" → "%s"），再次写入', savedStatus, clientStatus)
      await lcu.setStatusMessage(savedStatus).catch((err) => {
        logger.warn('[Availability] 延迟校验写 statusMessage 失败:', err)
      })
    }
  } catch (err) {
    logger.warn('[Availability] 延迟校验失败:', err)
  }
}

/** Check whether a value is valid status message content. */
function hasContent(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Subscribe to /lol-chat/v1/me changes and sync client availability/statusMessage to store.
 *
 * Solves the case where the user edits the status message in the native client input.
 * Without this listener, store would not update until Sona restarts.
 *
 * Sync strategy:
 *   - like restoreAvailabilityAndStatus, sync only in None/Lobby to avoid automatic game-state messages
 *   - availability writes already happen through menu clicks, so this handles client-originated changes
 */
let chatMeUnsub: (() => void) | null = null

function subscribeChatMeSync() {
  if (chatMeUnsub) return // 已订阅

  chatMeUnsub = lcu.observe(LcuEventUri.CHAT_ME, async (event: LCUEventMessage) => {
    const me = event.data as ChatMe | null
    if (!me) return

    // Sync only in idle phases to avoid storing automatic game-state messages.
    try {
      const phase = await lcu.getGameflowPhase()
      if (phase !== 'None' && phase !== 'Lobby') return
    } catch {
      // If phase cannot be fetched, skip syncing conservatively.
      return
    }

    // Sync statusMessage only when it is a valid non-empty string,
    // avoiding null/undefined/empty payloads overwriting a valid saved message.
    if (hasContent(me.statusMessage)) {
      const savedStatus = getSavedStatus()
      if (me.statusMessage !== savedStatus) {
        setSavedStatus(me.statusMessage as string)
        logger.info('[Availability] 签名变化 → 已持久化: %s', me.statusMessage)
      }
    }

    // Sync availability as a fallback for external changes outside our menu.
    // Do not persist away because the client sets it automatically after inactivity.
    if (me.availability && me.availability !== 'away' && store.get('availability') !== me.availability) {
      store.set('availability', me.availability)
      currentAvailability = me.availability
      logger.info('[Availability] 在线状态变化 → 已持久化: %s', me.availability)
    }
  })

  logger.info('[Availability] 已订阅 /lol-chat/v1/me 实时同步')
}

function unsubscribeChatMeSync() {
  if (chatMeUnsub) {
    chatMeUnsub()
    chatMeUnsub = null
    logger.info('[Availability] 已取消订阅 /lol-chat/v1/me')
  }
}

/** Close any existing menu. */
function closeAvailabilityMenu() {
  document.getElementById(MENU_ID)?.remove()
}

/** Create and show the availability selection menu. */
function showAvailabilityMenu(anchor: HTMLElement) {
  closeAvailabilityMenu()

  const menu = document.createElement('div')
  menu.id = MENU_ID
  menu.className = 'sonaenhance-availability-menu'

  for (const option of AVAILABILITY_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = `sonaenhance-availability-option${currentAvailability === option.value ? ' sonaenhance-availability-option--active' : ''}`
    btn.type = 'button'
    btn.innerHTML = `
      <span class="sonaenhance-availability-dot sonaenhance-availability-dot--${option.value}"></span>
      <span>${option.label}</span>
    `

    btn.addEventListener('mousedown', (e) => e.stopPropagation())
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.stopImmediatePropagation()

      if (option.value !== currentAvailability) {
        currentAvailability = option.value

        // Persist only during idle phases (None/Lobby).
        // Temporary changes during games, champ select, or post-game should not become startup defaults.
        // Also do not persist away because the client sets it automatically after inactivity.
        lcu.getGameflowPhase()
          .then((phase) => {
            if ((phase === 'None' || phase === 'Lobby') && option.value !== 'away') {
              store.set('availability', option.value)
              logger.info('[Availability] 持久化: %s (phase=%s)', option.value, phase)
            } else {
              logger.info('[Availability] 仅临时切换（阶段 %s，不持久化）', phase)
            }
          })
          .catch(() => {
            // If phase cannot be fetched, skip writing store conservatively.
            logger.warn('[Availability] 无法获取 gameflow phase，跳过持久化')
          })

        // The PUT itself is not phase-limited; a user click should apply immediately.
        lcu.setAvailability(option.value)
          .then(() => logger.info('[Availability] 已切换: %s', option.value))
          .catch((err) => logger.error('[Availability] 切换失败:', err))
      }
      closeAvailabilityMenu()
    }, true)

    menu.appendChild(btn)
  }

  // Compute fixed-position coordinates from the anchor.
  const rect = anchor.getBoundingClientRect()
  menu.style.top = `${rect.bottom + 6}px`
  menu.style.left = `${rect.left + rect.width / 2 - 6}px` // 60 ≈ min-width/2

  document.body.appendChild(menu)

  // Close on outside click.
  const onOutsideClick = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      closeAvailabilityMenu()
      document.removeEventListener('mousedown', onOutsideClick, true)
    }
  }
  // Bind one frame later so the current click does not close the menu immediately.
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', onOutsideClick, true)
  })
}

/** Whether availability switching is enabled by the features.ts toggle. */
let availabilityHijackEnabled = false

/** Set toggle state, called from features.ts. */
export function setAvailabilityHijackEnabled(enabled: boolean) {
  availabilityHijackEnabled = enabled
  if (enabled) {
    // When enabled, register the menu hijack task. Restore is handled by registerAllInjections.
    injector.register(tryHijackAvailabilityHitbox)
  } else {
    // When disabled, unregister the task and close any open menu.
    injector.unregister(tryHijackAvailabilityHitbox)
    closeAvailabilityMenu()
  }
}

/**
 * Injection task: hijack clicks on .lol-social-availability-hitbox.
 * Replaces the native behavior with our custom availability menu.
 *
 * The event listener is attached once using HIJACKED_ATTR for idempotency.
 * When disabled, availabilityHijackEnabled lets native client behavior pass through.
 */
function tryHijackAvailabilityHitbox(): boolean {
  const hitbox = document.querySelector(`.social-identity-block .lol-social-availability-hitbox:not([${HIJACKED_ATTR}])`) as HTMLElement | null
  if (!hitbox) return true

  hitbox.setAttribute(HIJACKED_ATTR, 'true')

  hitbox.addEventListener('click', (e) => {
    // If disabled, pass through to the native client behavior.
    if (!availabilityHijackEnabled) return

    e.stopPropagation()
    e.stopImmediatePropagation()
    e.preventDefault()
    logger.debug('Availability hitbox clicked')
    // Toggle the menu.
    if (document.getElementById(MENU_ID)) {
      closeAvailabilityMenu()
      logger.debug('Availability menu closed')
    } else {
      showAvailabilityMenu(hitbox)
      logger.debug('Availability menu shown')
    }
  }, true)

  logger.info('Availability hitbox hijacked ✓')
  return true
}

// ==================== Hide TFT Entry ====================

/** Whether hiding the TFT entry is enabled. */
let hideTFTEnabled = false

/** Set toggle state, called from features.ts. */
export function setHideTFTEnabled(enabled: boolean) {
  hideTFTEnabled = enabled
  if (enabled) {
    injector.register(tryRemoveTFT)
  } else {
    injector.unregister(tryRemoveTFT)
    // Restore hidden elements by removing our hidden marker.
    restoreOfficialEntries(TFT_HIDDEN_ATTR)
  }
}

const TFT_HIDDEN_ATTR = `${HIJACKED_ATTR}-tft`
const TFT_SELECTORS = [
  '.menu_item_navbar_tft',
]

/**
 * Injection task: hide TFT entry points.
 * Hides the top-navbar TFT menu item.
 */
function tryRemoveTFT(): boolean {
  if (!hideTFTEnabled) return true
  hideOfficialEntries(TFT_SELECTORS, TFT_HIDDEN_ATTR)

  return true
}

// ==================== Hide original client game mode entries ====================

let hideSummonerRiftModesEnabled = false
let hideAramModeEnabled = false
let hideArenaModeEnabled = false
let hideCustomGameSectionEnabled = false
let hideTFTPlayCardEnabled = false

const SUMMONER_RIFT_HIDDEN_ATTR = `${HIJACKED_ATTR}-summoner-rift`
const ARAM_HIDDEN_ATTR = `${HIJACKED_ATTR}-aram`
const ARENA_HIDDEN_ATTR = `${HIJACKED_ATTR}-arena`
const CUSTOM_GAME_HIDDEN_ATTR = `${HIJACKED_ATTR}-custom-game`
const TFT_PLAY_CARD_HIDDEN_ATTR = `${HIJACKED_ATTR}-tft-play-card`
const ARAM_STYLE_ID = 'sonaenhance-hide-aram-style'

const SUMMONER_RIFT_SELECTORS = [
  'div[data-game-mode="CLASSIC"]',
  'div[data-game-mode="SWIFTPLAY"]',
  '[data-game-mode="CLASSIC"]',
  '[data-game-mode="SWIFTPLAY"]',
  'lol-uikit-navigation-item[data-category="kVersusAI"]',
  'lol-uikit-navigation-item[data-category="kTraining"]',
]
const ARAM_SELECTORS = [
  '[data-game-mode="ARAM"]',
  '[data-game-mode*="ARAM"]',
  '[data-game-mode="KIWI"]',
  '[data-game-mode*="KIWI"]',
]
const ARAM_TEXT_LABELS = ['极地大乱斗', '大乱斗', 'ARAM', '하울링', 'Howling Abyss']
const ARENA_SELECTORS = ['div[data-game-mode="CHERRY"]', '[data-game-mode="CHERRY"]']
const CUSTOM_GAME_SELECTORS = [
  'lol-uikit-navigation-item[data-category="CreateCustom"]',
  'lol-uikit-navigation-item[data-category="JoinCustom"]',
]
const TFT_PLAY_CARD_SELECTORS = ['[data-game-mode="TFT"]', '[data-game-mode*="TFT"]']
export function setHideSummonerRiftModesEnabled(enabled: boolean) {
  hideSummonerRiftModesEnabled = enabled
  if (enabled) {
    injector.register(tryHideSummonerRiftModes)
  } else {
    injector.unregister(tryHideSummonerRiftModes)
    restoreOfficialEntries(SUMMONER_RIFT_HIDDEN_ATTR)
  }
}

export function setHideAramModeEnabled(enabled: boolean) {
  hideAramModeEnabled = enabled
  if (enabled) {
    injector.register(tryHideAramMode)
  } else {
    injector.unregister(tryHideAramMode)
    removeStyleNode(ARAM_STYLE_ID)
    restoreOfficialEntries(ARAM_HIDDEN_ATTR)
  }
}

export function setHideArenaModeEnabled(enabled: boolean) {
  hideArenaModeEnabled = enabled
  if (enabled) {
    injector.register(tryHideArenaMode)
  } else {
    injector.unregister(tryHideArenaMode)
    restoreOfficialEntries(ARENA_HIDDEN_ATTR)
  }
}

export function setHideCustomGameSectionEnabled(enabled: boolean) {
  hideCustomGameSectionEnabled = enabled
  if (enabled) {
    injector.register(tryHideCustomGameSection)
  } else {
    injector.unregister(tryHideCustomGameSection)
    restoreOfficialEntries(CUSTOM_GAME_HIDDEN_ATTR)
  }
}

export function setHideTFTPlayCardEnabled(enabled: boolean) {
  hideTFTPlayCardEnabled = enabled
  if (enabled) {
    injector.register(tryHideTFTPlayCard)
  } else {
    injector.unregister(tryHideTFTPlayCard)
    restoreOfficialEntries(TFT_PLAY_CARD_HIDDEN_ATTR)
  }
}

function tryHideSummonerRiftModes(): boolean {
  if (!hideSummonerRiftModesEnabled) return true
  hideOfficialEntries(SUMMONER_RIFT_SELECTORS, SUMMONER_RIFT_HIDDEN_ATTR)
  return true
}

function tryHideAramMode(): boolean {
  if (!hideAramModeEnabled) return true
  upsertStyleNode(ARAM_STYLE_ID, `
    [data-game-mode="ARAM"],
    [data-game-mode*="ARAM"],
    [data-game-mode="KIWI"],
    [data-game-mode*="KIWI"] {
      display: none !important;
    }
  `)
  hideOfficialEntries(ARAM_SELECTORS, ARAM_HIDDEN_ATTR)
  hideOfficialEntriesByText(ARAM_TEXT_LABELS, ARAM_HIDDEN_ATTR)
  return true
}

function tryHideArenaMode(): boolean {
  if (!hideArenaModeEnabled) return true
  hideOfficialEntries(ARENA_SELECTORS, ARENA_HIDDEN_ATTR)
  return true
}

function tryHideCustomGameSection(): boolean {
  if (!hideCustomGameSectionEnabled) return true
  hideOfficialEntries(CUSTOM_GAME_SELECTORS, CUSTOM_GAME_HIDDEN_ATTR)
  return true
}

function tryHideTFTPlayCard(): boolean {
  if (!hideTFTPlayCardEnabled) return true
  hideOfficialEntries(TFT_PLAY_CARD_SELECTORS, TFT_PLAY_CARD_HIDDEN_ATTR)
  return true
}

export function refreshOfficialEntryHiding() {
  tryRemoveTFT()
  tryHideSummonerRiftModes()
  tryHideAramMode()
  tryHideArenaMode()
  tryHideCustomGameSection()
  tryHideTFTPlayCard()
  tryHideRightNavText()
}

export function getOfficialEntryHidingDebug() {
  return {
    flags: {
      hideTFTEnabled,
      hideSummonerRiftModesEnabled,
      hideAramModeEnabled,
      hideArenaModeEnabled,
      hideCustomGameSectionEnabled,
      hideTFTPlayCardEnabled,
      hideRightNavTextEnabled,
    },
    styleNodes: [ARAM_STYLE_ID]
      .filter((id) => Boolean(document.getElementById(id))),
    counts: {
      tftTopNav: countSelectors(TFT_SELECTORS),
      tftPlayCard: countSelectors(TFT_PLAY_CARD_SELECTORS),
      aramMode: countSelectors(ARAM_SELECTORS),
      hidden: {
        tft: countSelector(`[${TFT_HIDDEN_ATTR}]`),
        tftPlayCard: countSelector(`[${TFT_PLAY_CARD_HIDDEN_ATTR}]`),
        aram: countSelector(`[${ARAM_HIDDEN_ATTR}]`),
      },
    },
    refresh: refreshOfficialEntryHiding,
  }
}

// ==================== Hide Right Navigation Text ====================

/** Whether hiding right navigation text is enabled. */
let hideRightNavTextEnabled = false

const NAV_TEXT_HIDDEN_ATTR = `${HIJACKED_ATTR}-nav-text`

/** Set toggle state, called from features.ts. */
export function setHideRightNavTextEnabled(enabled: boolean) {
  hideRightNavTextEnabled = enabled
  if (enabled) {
    injector.register(tryHideRightNavText)
  } else {
    injector.unregister(tryHideRightNavText)
    // Restore hidden text.
    const nav = document.querySelector('.right-nav-menu')
    if (nav) {
      nav.removeAttribute(NAV_TEXT_HIDDEN_ATTR)
      nav.querySelectorAll('lol-uikit-navigation-item').forEach((item) => {
        const text = (item as HTMLElement).querySelector('.menu-item-small-text') as HTMLElement | null
        if (text) text.style.display = ''
      })
    }
  }
}

/**
 * Injection task: hide home right-nav text.
 * Finds all lol-uikit-navigation-item nodes in right-nav-menu and hides menu-item-small-text in shadowRoot.
 */
function tryHideRightNavText(): boolean {
  if (!hideRightNavTextEnabled) return true

  const nav = document.querySelector('.right-nav-menu')
  if (!nav || nav.hasAttribute(NAV_TEXT_HIDDEN_ATTR)) return true

  const navItems = nav.querySelectorAll('lol-uikit-navigation-item')
  let hiddenCount = 0
  navItems.forEach((item) => {
    const el = item as HTMLElement
    const text = el.querySelector('.menu-item-small-text') as HTMLElement | null
    if (text) {
      text.style.display = 'none'
      hiddenCount++
      logger.info(`[HideRightNavText] Hide right nav text: ${el.textContent}`)
    }
  })
  // Tag only after every item text is hidden; otherwise retry on the next frame.
  if (hiddenCount > 0) {
    nav.setAttribute(NAV_TEXT_HIDDEN_ATTR, 'true')
  }
  return true
}

// ==================== Register All Injection Points ====================

/**
 * Register all injection tasks and start the global DOM guard.
 * Call once from index.tsx load().
 */
export function registerAllInjections() {
  injector.register(tryInjectSonaButton)
  // tryHijackAvailabilityHitbox is registered by the unlockAvailability toggle in features.ts.

  // Presence sync startup order:
  //   1. Fetch one ChatMe snapshot for restore and align store with client state.
  //   2. Subscribe to /lol-chat/v1/me events for future changes.
  //   3. Run a delayed verification after subscribing to catch startup races.
  //
  // Verification runs after subscribe because the client's XMPP init can arrive later than Sona.
  // If that late sync clears the status message without emitting a normal event, the delayed
  // verification catches and repairs it.
  restoreAvailabilityAndStatus().finally(() => {
    // Always attach the listener so later user status-message edits are captured.
    subscribeChatMeSync()
    // Run delayed verification after attaching the listener, without blocking injector.start.
    verifyAfterSubscribe()
  })

  injector.start()
}

/** Test/cleanup helper. Normally unused because plugin lifetime is process-wide. */
export function unregisterAllInjections() {
  unsubscribeChatMeSync()
}
