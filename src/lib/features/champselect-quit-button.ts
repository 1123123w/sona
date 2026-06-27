/**
 * Inject a "quit match" button during champ select.
 *
 * Background:
 *   In non-custom champ-select flows, the client does not render its built-in
 *   `.quit-button`. Players otherwise need to close the client or use worse workarounds.
 *
 * Approach:
 *   Listen to gameflow-phase and register an injector task in ChampSelect:
 *     - if `.bottom-right-buttons` already has `.quit-button` (custom games), do nothing
 *     - otherwise insert a matching button and route clicks through Sona confirmation
 *
 *   Why DOM injection instead of an Ember hook:
 *     1. The native `.quit-button` visibility depends on fields like `isCustomGame`,
 *        and click handlers may have additional checks behind them.
 *     2. DOM injection does not depend on internal client fields, and
 *        `.bottom-right-buttons` is a stable container.
 *     3. The toggle takes effect immediately without a restart.
 *
 * Style reference:
 *   .quit-button width 125px and margin-right 10px, matching the parent flex layout.
 */

import { logger } from '@/index'
import { lcu, LcuEventUri, type LCUEventMessage } from '@/lib/lcu'
import type { GameflowPhase } from '@/types/lcu'
import { injector } from '@/lib/InjectorManager'

// ==================== Constants ====================

const CONTAINER_SELECTOR = '.bottom-right-buttons'
const NATIVE_QUIT_SELECTOR = '.quit-button'
const SONA_QUIT_ATTR = 'data-sonaenhance-quit-button'
const CONFIRM_OVERLAY_ID = 'sonaenhance-quit-confirm-overlay'

// ==================== Confirm Dialog ====================

/**
 * Show a centered confirm dialog with native DOM instead of a dedicated React root.
 */
function showConfirmDialog(onConfirm: () => void) {
  // Prevent duplicate dialogs.
  if (document.getElementById(CONFIRM_OVERLAY_ID)) return

  const overlay = document.createElement('div')
  overlay.id = CONFIRM_OVERLAY_ID
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.65)',
    'z-index:821',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'backdrop-filter:blur(2px)',
  ].join(';')

  const dialog = document.createElement('div')
  dialog.style.cssText = [
    'min-width:420px',
    'max-width:480px',
    'background:#010a13',
    'border:1px solid #785a28',
    'box-shadow:0 0 32px rgba(0,0,0,0.8)',
    'padding:24px 28px',
    'font-family:var(--font-body)',
    '-webkit-font-smoothing:subpixel-antialiased',
    'color:#a09b8c',
  ].join(';')

  const title = document.createElement('div')
  title.textContent = '确认退出英雄选择？'
  title.style.cssText = [
    'color:#f0e6d2',
    'font-size:16px',
    'font-weight:700',
    'letter-spacing:0.075em',
    'line-height:20px',
    'text-transform:uppercase',
    'border-bottom:1px solid #3c3c41',
    'padding-bottom:10px',
    'margin-bottom:14px',
  ].join(';')
  dialog.appendChild(title)

  const desc = document.createElement('div')
  desc.innerHTML = [
    '秒退将会：',
    '<br/>• 立即退出英雄选择并返回大厅',
    '<br/>• <span style="color:#e84749;font-weight:bold;">短时间内无法匹配</span>，并可能扣除信誉分',
    '<br/><br/>请谨慎操作。',
  ].join('')
  desc.style.cssText = 'font-size:13px;line-height:20px;margin-bottom:20px;'
  dialog.appendChild(desc)

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;'

  // Use the client's native <lol-uikit-flat-button> for built-in styling and interaction.
  const cancelBtn = document.createElement('lol-uikit-flat-button')
  cancelBtn.textContent = '取消'
  cancelBtn.style.minWidth = '100px'

  const confirmBtn = document.createElement('lol-uikit-flat-button')
  confirmBtn.textContent = '确认秒退'
  confirmBtn.style.minWidth = '120px'
  // Mark the risky action in red when the component honors text color.
  confirmBtn.style.color = '#e84749'

  const close = () => {
    overlay.remove()
  }

  cancelBtn.addEventListener('click', close)
  confirmBtn.addEventListener('click', () => {
    close()
    onConfirm()
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  btnRow.appendChild(cancelBtn)
  btnRow.appendChild(confirmBtn)
  dialog.appendChild(btnRow)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
}

// ==================== Button Builder ====================

/**
 * Use the client's native `<lol-uikit-flat-button>`.
 * The browser creates its Shadow DOM with official borders, hover, and click feedback.
 * We only provide text and event handling.
 */
function buildSonaQuitButton(): HTMLElement {
  const btn = document.createElement('lol-uikit-flat-button')
  btn.setAttribute(SONA_QUIT_ATTR, 'true')
  btn.textContent = '退出对局'
  // Match native quit-button layout: 125px width and 10px right margin in the flex parent.
  btn.style.width = '125px'
  btn.style.marginRight = '10px'

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    showConfirmDialog(async () => {
      try {
        await lcu.dodgeChampSelect()
        logger.info('[QuitButton] 已发送秒退请求 ✓')
      } catch (err) {
        logger.error('[QuitButton] 秒退请求失败:', err)
      }
    })
  })

  return btn
}

// ==================== Injection Task ====================

/**
 * Check and inject the quit button idempotently:
 *   - native `.quit-button` already exists in custom games: do not inject
 *   - our button already exists: skip
 *   - otherwise clone and insert
 */
function tryInjectQuitButton(): boolean {
  const container = document.querySelector(CONTAINER_SELECTOR)
  if (!container) return false

  // Native button already exists in custom games; leave it alone.
//   if (container.querySelector(NATIVE_QUIT_SELECTOR)) {
//     const ours = container.querySelector(`[${SONA_QUIT_ATTR}]`)
//     if (ours) ours.remove()
//     return true
//   }

  // Already injected.
  if (container.querySelector(`[${SONA_QUIT_ATTR}]`)) return true

  const btn = buildSonaQuitButton()
  // Insert first so it appears on the left, matching the native quit-button position.
  container.insertBefore(btn, container.firstChild)
  logger.info('[QuitButton] 已注入选人阶段退出按钮 ✓')
  return true
}

// ==================== Lifecycle ====================

let phaseUnsub: (() => void) | null = null
let injectRegistered = false

function mount() {
  if (injectRegistered) return
  injector.register(tryInjectQuitButton)
  injectRegistered = true
}

function unmount() {
  if (injectRegistered) {
    injector.unregister(tryInjectQuitButton)
    injectRegistered = false
  }
  // Remove injected buttons and any open confirm dialog.
  document.querySelectorAll(`[${SONA_QUIT_ATTR}]`).forEach((el) => el.remove())
  const overlay = document.getElementById(CONFIRM_OVERLAY_ID)
  if (overlay) overlay.remove()
}

// ==================== Public API ====================

/**
 * Enable or disable the champ-select quit button.
 * Mounts the injector task only during ChampSelect and cleans up immediately after leaving.
 */
export function updateChampSelectQuitButton(enabled: boolean) {
  if (enabled && !phaseUnsub) {
    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ChampSelect') {
        mount()
      } else {
        unmount()
      }
    })

    // Mount immediately if the plugin starts while already in ChampSelect.
    lcu.getGameflowPhase().then((phase) => {
      if (phase === 'ChampSelect') mount()
    }).catch(() => { /* ignore */ })

    logger.info('[QuitButton] 选人阶段退出按钮已启用 ✓')
  } else if (!enabled && phaseUnsub) {
    phaseUnsub()
    phaseUnsub = null
    unmount()
    logger.info('[QuitButton] 选人阶段退出按钮已禁用')
  }
}
