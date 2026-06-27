import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { logger } from '@/index'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase } from '@/lib/lcu'
import { injector } from '@/lib/InjectorManager'

// ==================== Auto Show Game Analysis Popup ====================

/** Dedicated React root for GameAnalysisModal. */
let gameAnalysisRoot: Root | null = null
let gameAnalysisContainer: HTMLDivElement | null = null
let gameAnalysisModalLoadPromise: Promise<typeof import('@/components/ui/GameAnalysisModal')['GameAnalysisModal']> | null = null

function loadGameAnalysisModal() {
  gameAnalysisModalLoadPromise ??= import('@/components/ui/GameAnalysisModal')
    .then((module) => module.GameAnalysisModal)
  return gameAnalysisModalLoadPromise
}

async function showGameAnalysisModal() {
  const GameAnalysisModal = await loadGameAnalysisModal()

  if (!gameAnalysisContainer) {
    gameAnalysisContainer = document.createElement('div')
    gameAnalysisContainer.id = 'sonaenhance-game-analysis-root'
    document.body.appendChild(gameAnalysisContainer)
    gameAnalysisRoot = createRoot(gameAnalysisContainer)
  }

  const close = () => {
    gameAnalysisRoot?.render(
      createElement(GameAnalysisModal, { open: false, onClose: close }),
    )
  }

  gameAnalysisRoot!.render(
    createElement(GameAnalysisModal, { open: true, onClose: close }),
  )
  logger.info('[GameAnalysis] 战力分析弹窗已显示')
}

function cleanupGameAnalysisModal() {
  if (gameAnalysisRoot) {
    gameAnalysisRoot.unmount()
    gameAnalysisRoot = null
  }
  if (gameAnalysisContainer) {
    gameAnalysisContainer.remove()
    gameAnalysisContainer = null
  }
}

// ---- Embedded Client Button ----

const GAME_ANALYSIS_BTN_ATTR = 'data-sonaenhance-game-analysis'

/**
 * Injection task: inject the analysis button into game-in-progress-container.
 * Uses the client's native <lol-uikit-flat-button> for official styling and interaction.
 */
function tryInjectGameAnalysisButton(): boolean {
  const container = document.querySelector('.game-in-progress-container')
  if (!container) return false

  // Already injected.
  if (container.querySelector(`[${GAME_ANALYSIS_BTN_ATTR}]`)) return true

  const btn = document.createElement('lol-uikit-flat-button')
  btn.setAttribute(GAME_ANALYSIS_BTN_ATTR, 'true')
  btn.textContent = '对局分析'
  btn.style.marginTop = '12px'

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    void showGameAnalysisModal()
    logger.info('[GameAnalysis] 打开分析弹窗')
  })

  container.appendChild(btn)
  logger.info('[GameAnalysis] 客户端内嵌按钮已注入 ✓')
  return true
}

/** Remove the embedded client button. */
function cleanupGameAnalysisButton() {
  document.querySelectorAll(`[${GAME_ANALYSIS_BTN_ATTR}]`).forEach((el) => el.remove())
}

let gameAnalysisBtnRegistered = false

/** Track the current game ID so each game opens the popup once. */
let lastPopupGameId = 0

let gameAnalysisPopupUnsub: (() => void) | null = null

export function updateGameAnalysisPopup(enabled: boolean) {
  if (enabled && !gameAnalysisPopupUnsub) {
    gameAnalysisPopupUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'InProgress') {
        // Register embedded button injection.
        if (!gameAnalysisBtnRegistered) {
          injector.register(tryInjectGameAnalysisButton)
          gameAnalysisBtnRegistered = true
        }
        // Query current gameId to avoid duplicate popups after reconnects.
        lcu.getGameflowSession()
          .then((session) => {
            const gid = session.gameData?.gameId ?? 0
            if (gid > 0 && gid !== lastPopupGameId) {
              lastPopupGameId = gid
              void showGameAnalysisModal()
            }
          })
          .catch(() => {
            // Still try to show the popup if session query fails, such as in custom games.
            void showGameAnalysisModal()
          })
      } else if (phase === 'WaitingForStats' || phase === 'PreEndOfGame' || phase === 'EndOfGame') {
        // Game has ended; reset state and close the popup.
        lastPopupGameId = 0
        // Cancel button injection.
        if (gameAnalysisBtnRegistered) {
          injector.unregister(tryInjectGameAnalysisButton)
          gameAnalysisBtnRegistered = false
        }
        cleanupGameAnalysisButton()
        cleanupGameAnalysisModal()
      }
    })
    logger.info('Game analysis popup enabled ✓')
  } else if (!enabled && gameAnalysisPopupUnsub) {
    gameAnalysisPopupUnsub()
    gameAnalysisPopupUnsub = null
    lastPopupGameId = 0
    if (gameAnalysisBtnRegistered) {
      injector.unregister(tryInjectGameAnalysisButton)
      gameAnalysisBtnRegistered = false
    }
    cleanupGameAnalysisButton()
    cleanupGameAnalysisModal()
    logger.info('Game analysis popup disabled')
  }
}
