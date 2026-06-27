/**
 * Chroma tab unlock for Tencent regions.
 *
 * Problem: the Tencent client hides the chroma sub-tab in collections by not rendering
 * the <a href="/chromas"> element from the collections-sub-nav component template.
 *
 * Approach: use the Ember hook to match classNames = 'collections-sub-nav-component'
 * and override these fields to false through a mixin:
 *         - isChromasDisabled controls whether the chroma tab is disabled
 *         - isTencentRegion usually feeds into that disabled calculation
 *
 * Why false: disabled=true means hidden/disabled, so showing it requires false.
 *
 * Note: the Ember hook registers during init, and component classes are created once.
 * Runtime toggle changes therefore require a client restart.
 */

import { registerEmberRule } from '@/lib/ember-hook'
import { store } from '@/lib/store'
import { logger } from '@/index'

export function registerChromaRules() {
  // If disabled, do not register the rule at all.
  if (!store.get('unlockChromas')) {
    logger.info('[ChromaUnlock] 开关已关闭，跳过注册')
    return
  }

  registerEmberRule({
    name: 'unlock-chromas',
    matcher: 'collections-sub-nav-component',
    mixin: () => ({
      // Plain properties shadow same-name computed getters.
      isChromasDisabled: false,
      isTencentRegion: false,
    }),
  })
}
