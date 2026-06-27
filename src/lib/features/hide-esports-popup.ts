import { logger } from '@/index'
import { injector } from '@/lib/InjectorManager'

const POPUP_SELECTOR = 'iframe#tv-official-pop'

function tryRemoveEsportsPopup(): boolean {
  const popup = document.querySelector(POPUP_SELECTOR)
  if (popup) {
    popup.remove()
    logger.info('[HideEsportsPopup] 已移除赛事直播弹窗')
  }
  return true
}

let registered = false

export function updateHideEsportsPopup(enabled: boolean) {
  if (enabled && !registered) {
    registered = true
    injector.register(tryRemoveEsportsPopup)
    logger.info('[HideEsportsPopup] enabled ✓')
  } else if (!enabled && registered) {
    registered = false
    injector.unregister(tryRemoveEsportsPopup)
    logger.info('[HideEsportsPopup] disabled')
  }
}
