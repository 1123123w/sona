import { logger } from '@/index'
import { injector } from '@/lib/InjectorManager'
import { lcu, LcuEventUri, type LCUEventMessage } from '@/lib/lcu'
import { store } from '@/lib/store'
import type { GameflowPhase } from '@/types/lcu'

const PLAY_BUTTON_SELECTOR = '.play-button-container'
const BOUND_ATTR = 'data-sonaenhance-quick-lobby-bound'

let registered = false
let phaseUnsub: (() => void) | null = null
let currentPhase: GameflowPhase | '' = ''

async function handlePlayClick(event: Event) {
  if (!store.get('quickLobbyMode')) return
  if (currentPhase !== 'None') return

  const queueId = store.get('quickLobbyQueueId')
  if (!queueId || queueId <= 0) {
    logger.warn('[QuickLobby] 未配置目标队列，放行原生 Play 行为')
    return
  }

  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  try {
    await lcu.createLobby(queueId)
    logger.info('[QuickLobby] 已快速创建大厅 → queueId=%d', queueId)
  } catch (err) {
    logger.error('[QuickLobby] 创建大厅失败 queueId=%d: %o', queueId, err)
  }
}

function tryBindPlayButton(): boolean {
  const button = document.querySelector(PLAY_BUTTON_SELECTOR)
  if (!button) return false
  if (button.getAttribute(BOUND_ATTR) === 'true') return true

  button.addEventListener('click', handlePlayClick, true)
  button.setAttribute(BOUND_ATTR, 'true')
  logger.info('[QuickLobby] 已绑定 Play 按钮点击监听')
  return true
}

function unbindPlayButtons(): void {
  document.querySelectorAll(`[${BOUND_ATTR}]`).forEach((button) => {
    button.removeEventListener('click', handlePlayClick, true)
    button.removeAttribute(BOUND_ATTR)
  })
}

export function updateQuickLobbyMode(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryBindPlayButton)

    phaseUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      currentPhase = event.data as GameflowPhase
    })
    lcu.getGameflowPhase()
      .then((phase) => { currentPhase = phase })
      .catch(() => { /* ignore */ })

    logger.info('[QuickLobby] 快速大厅模式已启用')
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryBindPlayButton)
    unbindPlayButtons()
    if (phaseUnsub) {
      phaseUnsub()
      phaseUnsub = null
    }
    currentPhase = ''
    logger.info('[QuickLobby] 快速大厅模式已禁用')
  }
}
