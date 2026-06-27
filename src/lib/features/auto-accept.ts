import { logger } from '@/index'
import { SETTING_KEYS, store } from '@/lib/store'
import { lcu, LcuEventUri } from '@/lib/lcu'
import type { LCUEventMessage, GameflowPhase, ReadyCheck } from '@/lib/lcu'
import { DelayTask, type TaskSignal } from '@/lib/cancellable-task'

// ==================== Auto Accept Match ====================

const AUTO_ACCEPT_MAX_DELAY_MS = 15000
const READY_CHECK_POLL_INTERVAL_MS = 200

let autoAcceptUnsub: (() => void) | null = null
let readyCheckUnsub: (() => void) | null = null
let readyCheckPollTimer: ReturnType<typeof setInterval> | null = null
const autoAcceptTask = new DelayTask()
let activeAutoAcceptSignal: TaskSignal | null = null
let hasAcceptedThisReadyCheck = false
let userDeclinedThisReadyCheck = false
let restReminderEndOfGameCounted = false
let restReminderPaused = false
let restReminderResumeUnsub: (() => void) | null = null
let restReminderEnabledUnsub: (() => void) | null = null
let restReminderAutoAcceptUnsub: (() => void) | null = null

/**
 * Calculate the delay for this accept attempt:
 *   - non-finite minMs/maxMs, negative values, or max > 15000 means no delay
 *   - min > max is invalid and falls back to no delay
 *   - min === max uses a fixed delay
 *   - otherwise randomize inside the inclusive [min, max] range
 *
 * Strict validation prevents accidental very long delays from blocking acceptance.
 */
function computeAcceptDelayMs(): number {
  const minMs = store.get(SETTING_KEYS.autoAcceptDelayMin)
  const maxMs = store.get(SETTING_KEYS.autoAcceptDelayMax)

  const isValidRange =
    Number.isFinite(minMs) && Number.isFinite(maxMs) &&
    minMs >= 0 && maxMs >= 0 &&
    maxMs <= AUTO_ACCEPT_MAX_DELAY_MS &&
    minMs <= maxMs &&
    maxMs > 0  // 全 0 = 用户没配 = 秒接

  if (!isValidRange) return 0

  // Uniform random value in [min, max].
  return Math.round(minMs + Math.random() * (maxMs - minMs))
}

function clearAutoAcceptTimer() {
  autoAcceptTask.cancel()
  activeAutoAcceptSignal = null

  if (readyCheckPollTimer) {
    clearInterval(readyCheckPollTimer)
    readyCheckPollTimer = null
  }
}

async function isReadyCheckAcceptable(): Promise<boolean> {
  try {
    const readyCheck = await lcu.getReadyCheck()
    return readyCheck.state === 'InProgress' && readyCheck.playerResponse === 'None'
  } catch (err) {
    logger.warn('[AutoAccept] ReadyCheck 状态检查失败，取消本次自动接受: %o', err)
    return false
  }
}

function startReadyCheckPolling(signal: TaskSignal) {
  if (readyCheckPollTimer) {
    clearInterval(readyCheckPollTimer)
    readyCheckPollTimer = null
  }

  readyCheckPollTimer = setInterval(() => {
    if (signal.cancelled) return

    lcu.getReadyCheck()
      .then((readyCheck) => {
        if (signal.cancelled) return

        if (readyCheck.state !== 'InProgress' || readyCheck.playerResponse !== 'None') {
          logger.info(
            '[AutoAccept] ReadyCheck 已变化，取消本次自动接受: state=%s, response=%s',
            readyCheck.state,
            readyCheck.playerResponse,
          )
          clearAutoAcceptTimer()
        }
      })
      .catch((err) => {
        if (signal.cancelled) return
        logger.warn('[AutoAccept] ReadyCheck 轮询失败，取消本次自动接受: %o', err)
        clearAutoAcceptTimer()
      })
  }, READY_CHECK_POLL_INTERVAL_MS)
}

function suppressAutoAcceptForDecline(source: string) {
  userDeclinedThisReadyCheck = true
  hasAcceptedThisReadyCheck = true
  clearAutoAcceptTimer()
  logger.info('[AutoAccept] 检测到玩家拒绝 ReadyCheck，取消本次自动接受: %s', source)
}

export function notifyUserManuallyDeclined() {
  suppressAutoAcceptForDecline('manual-click')
}

export function notifyUserManuallyAccepted() {
  hasAcceptedThisReadyCheck = true
  userDeclinedThisReadyCheck = false
  clearAutoAcceptTimer()
  logger.info('[AutoAccept] 检测到玩家手动接受 ReadyCheck，取消待执行的延迟自动接受')
}

function normalizeRestReminderLimit(): number {
  const limit = store.get('restReminderAcceptLimit')
  if (!Number.isFinite(limit)) return 2
  return Math.max(1, Math.floor(limit))
}

function recordRestReminderCompletedGame() {
  if (!store.get('restReminderEnabled')) return

  const limit = normalizeRestReminderLimit()
  const nextCount = Math.max(0, Math.floor(store.get('restReminderAcceptCount') || 0)) + 1
  store.set('restReminderAcceptCount', nextCount)

  if (nextCount < limit) {
    logger.info('[RestReminder] 已完成对局计数: %d/%d', nextCount, limit)
    return
  }

  restReminderPaused = true
  store.set('autoAcceptMatch', false)
  store.set('restReminderAcceptCount', 0)
  clearAutoAcceptTimer()
  logger.info('[RestReminder] 已完成 %d 局，暂停自动接受；手动寻找对局后将自动恢复', limit)
}

export function isRestReminderPaused(): boolean {
  return restReminderPaused
}

function ensureRestReminderPauseResumeObserver() {
  if (!restReminderResumeUnsub) {
    restReminderResumeUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (
        phase === 'Matchmaking' &&
        restReminderPaused &&
        store.get('restReminderEnabled') &&
        !store.get('autoAcceptMatch')
      ) {
        restReminderPaused = false
        store.set('restReminderAcceptCount', 0)
        store.set('autoAcceptMatch', true)
        logger.info('[RestReminder] 检测到手动寻找对局，已恢复自动接受')
      }
    })
  }

  restReminderEnabledUnsub ??= store.onChange('restReminderEnabled', (enabled) => {
    if (!enabled) {
      restReminderPaused = false
      store.set('restReminderAcceptCount', 0)
    }
  })

  restReminderAutoAcceptUnsub ??= store.onChange('autoAcceptMatch', (enabled) => {
    if (enabled) {
      restReminderPaused = false
    }
  })
}

function scheduleAcceptMatch() {
  // Clear any leftover previous schedule defensively.
  clearAutoAcceptTimer()

  const delayMs = computeAcceptDelayMs()

  const doAccept = async (signal: TaskSignal) => {
    try {
      if (signal.cancelled) return

      if (readyCheckPollTimer) {
        clearInterval(readyCheckPollTimer)
        readyCheckPollTimer = null
      }

      if (!await isReadyCheckAcceptable()) {
        logger.info('[AutoAccept] ReadyCheck 不再可接受，跳过本次自动接受')
        return
      }
      if (signal.cancelled) return

      lcu.acceptMatch()
        .then(() => {
          logger.info('Auto accepted match ✓ (delay=%dms)', delayMs)
        })
        .catch((err) => logger.error('Auto accept failed:', err))
    } finally {
      if (activeAutoAcceptSignal === signal) {
        activeAutoAcceptSignal = null
      }
    }
  }

  activeAutoAcceptSignal = autoAcceptTask.schedule(delayMs, doAccept)
  if (delayMs > 0) {
    logger.info('[AutoAccept] 随机延迟 %dms 后接受', delayMs)
    startReadyCheckPolling(activeAutoAcceptSignal)
  }
}

export function updateAutoAccept(enabled: boolean) {
  ensureRestReminderPauseResumeObserver()

  if (enabled && !autoAcceptUnsub) {
    autoAcceptUnsub = lcu.observe(LcuEventUri.GAMEFLOW_PHASE_CHANGE, (event: LCUEventMessage) => {
      const phase = event.data as GameflowPhase
      if (phase === 'ReadyCheck') {
        if (!hasAcceptedThisReadyCheck && !userDeclinedThisReadyCheck) {
          hasAcceptedThisReadyCheck = true
          scheduleAcceptMatch()
        }
      } else if (phase === 'InProgress') {
        restReminderEndOfGameCounted = false
      } else if (phase === 'EndOfGame') {
        if (!restReminderEndOfGameCounted) {
          restReminderEndOfGameCounted = true
          recordRestReminderCompletedGame()
        }
      } else {
        hasAcceptedThisReadyCheck = false
        userDeclinedThisReadyCheck = false
        if (activeAutoAcceptSignal || autoAcceptTask.active || readyCheckPollTimer) {
          // Clear the timer when the ReadyCheck window closes, whether by manual decline,
          // timeout, or teammate decline, to avoid accepting a later ReadyCheck by mistake.
          clearAutoAcceptTimer()
        }
      }
    })
    readyCheckUnsub = lcu.observe(LcuEventUri.READY_CHECK, (event: LCUEventMessage) => {
      const readyCheck = event.data as ReadyCheck | null
      if (readyCheck?.playerResponse === 'Declined') {
        suppressAutoAcceptForDecline('ready-check-event')
      }
    })
    logger.info('Auto accept enabled ✓')
  } else if (!enabled && autoAcceptUnsub) {
    autoAcceptUnsub()
    autoAcceptUnsub = null
    if (readyCheckUnsub) {
      readyCheckUnsub()
      readyCheckUnsub = null
    }
    hasAcceptedThisReadyCheck = false
    userDeclinedThisReadyCheck = false
    restReminderEndOfGameCounted = false
    clearAutoAcceptTimer()
    logger.info('Auto accept disabled')
  }
}
