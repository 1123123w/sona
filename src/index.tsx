/// <reference path="../pengu.d.ts" />
declare const __PLUGIN_VERSION__: string  // Defined in vite.config.ts.

import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { installCoreDebugHandles, registerDebugHandle } from '@/lib/debug'
import { createLogger } from '@/lib/logger'
import { registerAllInjections } from '@/lib/injections'
import { initFeatures } from '@/lib/features'
import { registerHotkey } from '@/lib/modal'
import { initAssets } from '@/lib/assets'
import { injector } from '@/lib/InjectorManager'
import { lcu } from '@/lib/lcu'
import { installEmberHook } from '@/lib/ember-hook'
import { registerChromaRules } from '@/lib/features/chroma-unlock'
import { checkForUpdates } from '@/lib/update-checker'
import { installAdBlockXhrRules } from '@/lib/xhr'
import '@/styles/index.css'
import '@/styles/inject.css'
import '@/styles/availabilityMenu.css'
import '@/styles/gameModeFilter.css'

const PLUGIN_NAME = 'Sona-E'
const PLUGIN_VERSION = __PLUGIN_VERSION__
const CONTAINER_ID = 'sonaenhance-root'

export const logger = createLogger({
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
})

function getRuntime(): SonaRuntime {
  if (!window.__SONAENHANCE_RUNTIME__) {
    window.__SONAENHANCE_RUNTIME__ = {
      container: null,
      root: null,
      hasShownStartupToast: false,
      hasShownSpecialDayToast: false,
    }
  }

  return window.__SONAENHANCE_RUNTIME__
}

function appendContainer(container: HTMLDivElement) {
  const host = document.body ?? document.documentElement
  host.appendChild(container)
}

function ensureContainer(runtime: SonaRuntime) {
  const existing = document.getElementById(CONTAINER_ID)
  if (existing instanceof HTMLDivElement) {
    runtime.container = existing
  }

  if (!runtime.container) {
    runtime.container = document.createElement('div')
    runtime.container.id = CONTAINER_ID
    logger.info('Created app container')
  }

  if (!runtime.container.isConnected) {
    appendContainer(runtime.container)
    logger.warn('App container was missing from DOM and has been reattached')
  }

  return runtime.container
}

// Store context for use across the plugin
let penguContext: PenguContext | null = null

export function getPluginMeta() {
  const meta = penguContext?.meta
  return {
    name: typeof meta?.name === 'string' && meta.name ? meta.name : PLUGIN_NAME,
    version: typeof meta?.version === 'string' && meta.version ? meta.version : PLUGIN_VERSION,
    raw: meta ?? null,
  }
}

/**
 * Called before League Client initializes its scripts.
 * Use this for early hooks like RCP interception.
 */
export function init(context: PenguContext) {
  penguContext = context
  logger.info('Pengu plugin meta: %o', getPluginMeta())
  installAdBlockXhrRules()
  lcu.bindContext(context)

  // Register the RCP hook in init so it runs before the client calls getEmber.
  installEmberHook(context)
  registerChromaRules()

  logger.printBanner()
}

/**
 * Called after the window is loaded.
 * Safe to manipulate DOM here.
 */
export function load() {
  logger.info('Plugin loading...')
  installCoreDebugHandles()
  registerDebugHandle('pluginMeta', () => ({
    updatedAt: Date.now(),
    ...getPluginMeta(),
  }))
  registerAllInjections()  // Register DOM injection tasks and start the observer.
  initFeatures()           // Initialize feature listeners.
  registerHotkey()         // Register the F1 hotkey.
  initAssets()             // Initialize asset mappings asynchronously.
  mountApp()
  void checkForUpdates()
}

/**
 * Get the stored Pengu context
 */
export function getContext(): PenguContext | null {
  return penguContext
}

/**
 * Container guard injection task.
 * Reattaches #sonaenhance-root if the host DOM removes it.
 */
function tryGuardContainer(): boolean {
  const runtime = getRuntime()
  if (runtime.container?.isConnected) return true
  if (runtime.container) {
    appendContainer(runtime.container)
    logger.warn('Detected host DOM refresh; restored app container')
  }
  return Boolean(runtime.container?.isConnected)
}

function isSpecialDay(date = new Date()): boolean {
  return date.getMonth() === 7 && date.getDate() === 21
}

/**
 * Mount the React application into the League Client
 */
function mountApp() {
  const runtime = getRuntime()
  const container = ensureContainer(runtime)

  // Register the container guard with the global InjectorManager.
  injector.register(tryGuardContainer)

  if (!runtime.root) {
    runtime.root = createRoot(container)
    logger.info('Created React root')
  } else {
    logger.info('Reusing existing React root')
  }

  runtime.root.render(<App />)

  logger.info('Mounted ✓ (container connected: %s)', String(container.isConnected))

  if (!runtime.hasShownStartupToast) {
    Toast.success('Sona-E 已启动 ♫')
    runtime.hasShownStartupToast = true
  }

  if (!runtime.hasShownSpecialDayToast && isSpecialDay()) {
    Toast.success('today is a special day! 🎉')
    runtime.hasShownSpecialDayToast = true
  }
}
