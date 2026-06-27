import { logger } from '@/index'
import { store } from '@/lib/store'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase } from '@/lib/lcu'
import { sleep } from '@/lib/utils'
import { isRestReminderPaused } from '@/lib/features/auto-accept'

// ==================== Auto Return To Lobby ====================

let autoReturnUnsub: (() => void) | null = null

export function updateAutoReturnToLobby(enabled: boolean) {
  if (enabled && !autoReturnUnsub) {
    autoReturnUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, async (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase

      if (phase === 'EndOfGame') {
        const mode = store.get('autoReturnMode')
        logger.info('[AutoReturn] 检测到对局结束，准备执行自动返回流程...')

        // Delay briefly because honors may still be settling when entering post-game.
        await sleep(2000);

        try {
          // Use playAgain to rebuild the lobby consistently.
          await lcu.playAgain()
          logger.info('[AutoReturn] 已通过 play-again 重建房间（已保留原队伍结构）✓')

          // Auto-queue mode: also call startMatchmaking with retry because teammates may not be ready yet.
          if (mode === 'queue') {
            if (isRestReminderPaused()) {
              logger.info('[AutoReturn] 提醒休息暂停中，仅返回房间，不自动开始匹配')
              return
            }

            logger.info('[AutoReturn] 当前模式为自动排队，准备启动匹配引擎...')
            const MAX_RETRIES = 15
            for (let i = 1; i <= MAX_RETRIES; i++) {
              await sleep(1000)
              try {
                await lcu.startMatchmaking()
                logger.info('[AutoReturn] 正在自动匹配... ✓ (第 %d 次尝试)', i)
                break
              } catch (err) {
                if (i < MAX_RETRIES) {
                  logger.info('[AutoReturn] 开始排队失败（队友可能未就绪），1s 后重试... (%d/%d)', i, MAX_RETRIES)
                } else {
                  logger.error('[AutoReturn] 开始排队失败，已达最大重试次数 %d:', MAX_RETRIES, err)
                }
              }
            }
          }
        } catch (err) {
          logger.error('[AutoReturn] 自动返回流程异常:', err)
        }
      }
    })
    logger.info('Auto return to lobby enabled ✓')
  } else if (!enabled && autoReturnUnsub) {
    autoReturnUnsub()
    autoReturnUnsub = null
    logger.info('Auto return to lobby disabled')
  }
}
