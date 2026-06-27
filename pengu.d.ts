/**
 * PenguLoader Runtime API Type Declarations
 * @see https://pengu.lol/runtime-api
 */

import type { Root } from 'react-dom/client'

declare global {
  interface PenguContext {
    meta: {
      name: string
      version?: string
      [key: string]: unknown
    }
    rcp: {
      preInit: (name: string, callback: (api: unknown) => void) => void
      /**
       * Runs the callback after the target RCP module initializes.
       *
       * @param name Target RCP module name, such as 'rcp-fe-ember-libs'.
       * @param callback Callback that receives the module API object.
       * @param blocking Controls whether already-initialized modules are replayed.
       *   - false: only future initialization events are observed.
       *   - true: replay with the cached API when available, and block later initialization until the callback finishes.
       */
      postInit: (name: string, callback: (api: unknown) => unknown, blocking?: boolean) => void
      /**
       * Promise-based equivalent of postInit that also resolves for modules already loaded.
       *
       * @example
       *   const chat = await context.rcp.whenReady('rcp-be-lol-chat')
       *   const [a, b] = await context.rcp.whenReady(['rcp-a', 'rcp-b'])
       */
      whenReady: {
        (name: string): Promise<unknown>
        (names: string[]): Promise<unknown[]>
      }
      /** Synchronously returns an RCP plugin already registered in the callback map. */
      get: (name: string) => unknown
    }
    socket: {
      observe: (uri: string, callback: (data: unknown) => void) => void
      disconnect: () => void
    }
  }

  interface Window {
    /** Opens Chrome DevTools window */
    openDevTools(remote?: boolean): void
    /** Opens the plugins folder */
    openPluginsFolder(path?: string): void
    /** Reloads the client (ignores cache) */
    reloadClient(): void
    /** Restarts the client (all UX processes) */
    restartClient(): void
    /** Gets the current script path */
    getScriptPath(): string
    /** Sona plugin runtime state */
    __SONAENHANCE_RUNTIME__?: SonaRuntime
    /** Sona-E debug helpers exposed for DevTools diagnostics */
    __SONAENHANCE_DEBUG__?: SonaEnhanceDebugApi
  }

  interface SonaEnhanceDebugApi {
    runtimeState?: () => unknown
    opgg?: () => unknown
    counter?: () => unknown
    features?: () => unknown
    config?: () => unknown
    logs?: (limit?: number) => unknown
    summary?: () => unknown
    [key: string]: unknown
  }

  /** Pengu Loader namespace */
  const Pengu: {
    /** Current Pengu Loader version */
    version: string
  }

  /** Toast notification API @since v1.1.0 */
  const Toast: {
    /** Push a notification with a success checkmark icon */
    success(message: string): void
    /** Push a notification with a failure icon */
    error(message: string): void
    /** Push a progress notification that awaits a promise */
    promise<T>(promise: Promise<T>, msg: { loading: string; success: string; error: string }): Promise<T>
  }

  /**
   * DataStore persistent storage API.
   * Data is stored on disk as JSON.
   * @see https://pengu.lol/runtime-api/data-store
   */
  const DataStore: {
    /** Stores data and returns whether it succeeded. */
    set(key: string | number, value: unknown): boolean
    /** Reads data, returning the fallback or undefined when missing. */
    get<T = unknown>(key: string | number, fallback?: T): T | undefined
    /** Checks whether a key exists. */
    has(key: string | number): boolean
    /** Removes data and returns whether it succeeded. */
    remove(key: string | number): boolean
  }

  /**
   * Window visual effect API.
   * @see https://pengu.dev/runtime-api/effect
   */
  const Effect: {
    /** Applies a window visual effect. */
    apply(name: 'transparent' | 'blurbehind' | 'acrylic' | 'unified' | 'mica' | 'vibrancy', options?: { color?: string; material?: string; alwaysOn?: boolean }): void
    /** Clears the current effect. */
    clear(): void
    /** Sets the theme. */
    setTheme(theme: 'light' | 'dark'): void
  }

  type SonaRuntime = {
    container: HTMLDivElement | null
    root: Root | null
    hasShownStartupToast: boolean
    hasShownSpecialDayToast: boolean
  }
}

export {}
