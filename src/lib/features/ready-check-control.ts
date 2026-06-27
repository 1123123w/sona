import { logger } from '@/index'
import { notifyUserManuallyAccepted, notifyUserManuallyDeclined } from '@/lib/features/auto-accept'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { GameflowPhase, LCUEventMessage, ReadyCheck } from '@/lib/lcu'

const BUTTONS_CONTAINER_SELECTOR = '.ready-check-buttons-element'
const ACCEPT_BUTTON_SELECTOR = '.ready-check-button-accept'
const DECLINE_BUTTON_SELECTOR = '.ready-check-button-decline'
const SHADOW_BUTTON_SELECTOR = '.lol-uikit-flat-button-wrapper, .lol-uikit-flat-button'
const CLICK_BOUND_ATTR = 'data-sona-readycheck-bound'
const POLL_INTERVAL_MS = 300

type PlayerResponse = ReadyCheck['playerResponse']

let currentResponse: PlayerResponse = 'None'
let phaseUnsub: (() => void) | null = null
let readyCheckUnsub: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let registered = false

const boundClicks: Array<{ el: Element; handler: EventListener }> = []

function unlockButton(container: Element, target: 'accept' | 'decline'): number {
  const el = container.querySelector(target === 'accept' ? ACCEPT_BUTTON_SELECTOR : DECLINE_BUTTON_SELECTOR)
  if (!el) return 0

  let removed = 0

  Array.from(el.classList).forEach((cls) => {
    if (cls.endsWith('-disabled')) {
      el.classList.remove(cls)
      removed++
    }
  })

  el.querySelectorAll('lol-uikit-flat-button').forEach((host) => {
    const root = (host as HTMLElement).shadowRoot
    if (!root) return

    root.querySelectorAll(SHADOW_BUTTON_SELECTOR).forEach((button) => {
      if (button.classList.contains('disabled')) {
        button.classList.remove('disabled')
        removed++
      }
    })
  })

  return removed
}

function applyUnlock() {
  const container = document.querySelector(BUTTONS_CONTAINER_SELECTOR)
  if (!container) return

  if (currentResponse === 'Accepted') {
    const removed = unlockButton(container, 'decline')
    if (removed > 0) logger.info('[ReadyCheckControl] 已接受后解禁拒绝按钮: %d', removed)
  } else if (currentResponse === 'Declined') {
    const removed = unlockButton(container, 'accept')
    if (removed > 0) logger.info('[ReadyCheckControl] 已拒绝后解禁接受按钮: %d', removed)
  }
}

function bindClickHandler(el: Element | null, kind: 'accept' | 'decline') {
  if (!el || el.hasAttribute(CLICK_BOUND_ATTR)) return
  el.setAttribute(CLICK_BOUND_ATTR, 'true')

  const handler: EventListener = () => {
    if (kind === 'accept') {
      notifyUserManuallyAccepted()
    } else {
      notifyUserManuallyDeclined()
    }

    const action = kind === 'accept' ? lcu.acceptMatch() : lcu.declineMatch()
    action
      .then(() => logger.info('[ReadyCheckControl] 已主动%s对局 ✓', kind === 'accept' ? '接受' : '拒绝'))
      .catch((err) => logger.error('[ReadyCheckControl] %s 调用失败: %o', kind, err))
  }

  el.addEventListener('click', handler)
  boundClicks.push({ el, handler })
}

function ensureClickHandlers() {
  const container = document.querySelector(BUTTONS_CONTAINER_SELECTOR)
  if (!container) return

  bindClickHandler(container.querySelector(ACCEPT_BUTTON_SELECTOR), 'accept')
  bindClickHandler(container.querySelector(DECLINE_BUTTON_SELECTOR), 'decline')
}

function unbindClickHandlers() {
  for (const { el, handler } of boundClicks) {
    el.removeEventListener('click', handler)
    el.removeAttribute(CLICK_BOUND_ATTR)
  }
  boundClicks.length = 0
}

function refreshFromResponse(next: PlayerResponse) {
  currentResponse = next
  ensureClickHandlers()
  applyUnlock()
}

async function pollReadyCheckOnce() {
  try {
    const readyCheck = await lcu.getReadyCheck()
    refreshFromResponse(readyCheck?.playerResponse ?? 'None')
  } catch {
    // ReadyCheck may already be gone.
  }
}

function startPolling() {
  if (pollTimer) return
  void pollReadyCheckOnce()
  pollTimer = setInterval(() => void pollReadyCheckOnce(), POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function cleanup() {
  stopPolling()
  unbindClickHandlers()
  currentResponse = 'None'
}

export function updateAllowDeclineAfterAccept(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    currentResponse = 'None'

    readyCheckUnsub = lcu.observe(LcuEventUri.READY_CHECK, (event: LCUEventMessage) => {
      const readyCheck = event.data as ReadyCheck | null
      refreshFromResponse(readyCheck?.playerResponse ?? 'None')
    })

    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ReadyCheck') {
        startPolling()
      } else {
        cleanup()
      }
    })

    lcu.getGameflowPhase()
      .then((phase) => {
        if (phase === 'ReadyCheck') startPolling()
      })
      .catch(() => { /* ignore */ })

    logger.info('[ReadyCheckControl] enabled ✓')
  } else if (!enabled && registered) {
    registered = false
    if (phaseUnsub) {
      phaseUnsub()
      phaseUnsub = null
    }
    if (readyCheckUnsub) {
      readyCheckUnsub()
      readyCheckUnsub = null
    }
    cleanup()
    logger.info('[ReadyCheckControl] disabled')
  }
}
