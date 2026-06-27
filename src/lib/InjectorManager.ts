/**
 * InjectorManager - centralized injection manager
 *
 * Design: one global MutationObserver guards all injection tasks.
 *
 * - Persistent: never calls disconnect(), so removed injection points are
 *   restored on the next DOM mutation.
 * - Smooth: the whole plugin uses one Observer, throttled by requestAnimationFrame
 *   to at most one check per frame.
 * - Extensible: new injection points only need injector.register(task).
 */

import { logger } from '@/index'

/** Injection task: returns true when injected/already present, false when the target is not ready. */
type InjectTask = () => boolean

class InjectorManager {
  private tasks: Set<InjectTask> = new Set()
  private observer: MutationObserver | null = null
  private isThrottled = false

  /**
   * Register a new injection task.
   * Runs once immediately after registration.
   */
  register(task: InjectTask) {
    this.tasks.add(task)
    try {
      task()
    } catch (e) {
      logger.error('[Injector] Task failed on register:', e)
    }
  }

  /**
   * Unregister an injection task.
   */
  unregister(task: InjectTask) {
    this.tasks.delete(task)
  }

  /**
   * Start the global DOM guard.
   * Starts once; repeated calls are ignored.
   */
  start() {
    if (this.observer) return

    logger.info('[Injector] Starting global DOM observer...')

    this.observer = new MutationObserver(() => {
      if (this.isThrottled) return
      this.isThrottled = true

      requestAnimationFrame(() => {
        for (const task of this.tasks) {
          try {
            task()
          } catch (e) {
            logger.error('[Injector] Task failed:', e)
          }
        }
        this.isThrottled = false
      })
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Stop the global DOM guard. Usually not needed.
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
      logger.info('[Injector] Global DOM observer stopped')
    }
  }
}

/** Global injector manager singleton. */
export const injector = new InjectorManager()
