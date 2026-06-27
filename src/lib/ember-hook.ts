/**
 * Ember Hook based on the official Pengu Loader RCP API.
 *
 * How it works:
 *   1. Client Ember components get the Ember instance through rcp-fe-ember-libs.getEmber().
 *   2. Pengu Loader exposes context.rcp.postInit(name, cb) so plugins can access that module API.
 *   3. Hook api.getEmber and then hook Component.extend on the returned Ember instance.
 *   4. Whenever Ember.Component.extend({ classNames: ['xxx'], ... }) creates a component class,
 *      match its classNames against registered rules and then:
 *        - apply a Mixin that overrides members such as properties, computed getters, and methods
 *        - or wrap selected methods
 *
 * window.Ember is not reliably accessible, so the RCP path is the stable one.
 */

import { logger } from '@/index'

/** Minimal model of Ember.Component. Runtime is the real Ember object; this only types what we use. */
type EmberComponentClass = {
  extend: (...mixins: unknown[]) => EmberComponentClass
  proto: () => Record<string, unknown>
}

type EmberNamespace = {
  Component: EmberComponentClass
  [key: string]: unknown
}

/** Method wrapper that can adjust arguments or return value around the original function. */
export type MethodWrap = {
  /** Instance method name on the Component prototype. */
  name: string
  /**
   * Replacement body. The first argument calls the original method; the second is the original args.
   * Call `original(...args)` directly or pass modified args.
   */
  replacement: (this: unknown, original: (...args: unknown[]) => unknown, args: unknown[]) => unknown
}

/** Mixin factory that returns an object merged into Component.extend(...). */
export type MixinFactory = (Ember: EmberNamespace, extendArgs: unknown[]) => Record<string, unknown>

/**
 * Matcher supported forms:
 *   - string: exact match against classNames
 *   - '*': match every component, use carefully because it scans all extend calls
 *   - (extendArgs) => boolean: custom predicate over the full Component.extend(...) arguments
 */
export type Matcher = string | ((extendArgs: unknown[]) => boolean)

/** Rule definition. */
export type EmberRule = {
  /** Name used for logs and dedupe. */
  name: string
  /** Match condition: classNames string, '*', or custom function. */
  matcher: Matcher
  /** Optional Mixin factory for overriding or appending members. */
  mixin?: MixinFactory
  /** Optional method wrappers on the prototype. */
  wraps?: MethodWrap[]
}

// ========== Internal State ==========

const rules: EmberRule[] = []
let installed = false

/** Prevent wrapping the same function repeatedly. */
const WRAPPED_MARK = Symbol('SonaEmberWrapped')

/** Prevent applying the same rule repeatedly to one component prototype. */
const APPLIED_RULES_KEY = '__sonaAppliedRules'

// ========== Core Utilities ==========

/**
 * Wrap a method on an object so `replacement` receives `(original, args)`.
 * It can call original, modify args, or change the return value. Idempotent via Symbol marks.
 */
function wrapMethod(
  target: Record<string | symbol, unknown>,
  name: string,
  replacement: MethodWrap['replacement'],
): boolean {
  const fn = target[name]
  if (typeof fn !== 'function') return false

  // Skip if this name was already wrapped on this target.
  const wrappedSet = (target[WRAPPED_MARK] as Set<string> | undefined) ?? new Set<string>()
  if (wrappedSet.has(name)) return false

  const original = fn as (...args: unknown[]) => unknown
  target[name] = function (this: unknown, ...args: unknown[]) {
    const caller = (...callArgs: unknown[]) => original.apply(this, callArgs)
    return replacement.call(this, caller, args)
  }

  wrappedSet.add(name)
  target[WRAPPED_MARK] = wrappedSet
  return true
}

/**
 * Extract classNames from Ember.Component.extend(...args).
 * Typical client shape: Component.extend(MixinA, MixinB, { classNames: ['foo-bar'], ... })
 */
function extractClassNames(args: unknown[]): string[] {
  const collected: string[] = []
  for (const a of args) {
    if (a && typeof a === 'object') {
      const cn = (a as { classNames?: unknown }).classNames
      if (Array.isArray(cn)) {
        for (const c of cn) {
          if (typeof c === 'string') collected.push(c)
        }
      }
    }
  }
  return collected
}

/**
 * Apply one rule to a klass returned by extend.
 * Ember `.extend(mixin)` returns a new subclass, so update klass in a chain.
 */
function applyRuleToClass(
  Ember: EmberNamespace,
  klass: EmberComponentClass,
  extendArgs: unknown[],
  rule: EmberRule,
): EmberComponentClass {
  let cur = klass

  // 1. Apply Mixin overrides.
  if (rule.mixin) {
    try {
      const mixinObj = rule.mixin(Ember, extendArgs)
      cur = cur.extend(mixinObj)
      logger.info('[EmberHook] mixin applied: %s', rule.name)
    } catch (e) {
      logger.warn('[EmberHook] mixin failed: %s, %o', rule.name, e)
    }
  }

  // 2. Apply method wrappers.
  if (rule.wraps?.length) {
    try {
      const proto = cur.proto() as Record<string | symbol, unknown>

      // Prototype-level dedupe: apply the same rule once per prototype.
      const applied = (proto[APPLIED_RULES_KEY] as Set<string> | undefined) ?? new Set<string>()
      if (!applied.has(rule.name)) {
        for (const w of rule.wraps) {
          if (wrapMethod(proto, w.name, w.replacement)) {
            logger.info('[EmberHook] wrap applied: %s.%s', rule.name, w.name)
          }
        }
        applied.add(rule.name)
        proto[APPLIED_RULES_KEY] = applied
      }
    } catch (e) {
      logger.warn('[EmberHook] wraps failed: %s, %o', rule.name, e)
    }
  }

  return cur
}

/** Hook Ember.Component.extend and match rules whenever component classes are created. */
function hookComponentExtend(Ember: EmberNamespace) {
  const Component = Ember.Component
  if (!Component || typeof Component.extend !== 'function') {
    logger.warn('[EmberHook] Ember.Component.extend 不存在，放弃')
    return
  }

  const target = Component as unknown as Record<string | symbol, unknown>
  if (target[WRAPPED_MARK]) {
    //logger.info('[EmberHook] Component.extend is already wrapped, skipping')
    return
  }

  const originalExtend = Component.extend.bind(Component)
  Component.extend = function (this: unknown, ...args: unknown[]): EmberComponentClass {
    // Call the original extend first to get the base klass.
    let klass = originalExtend(...args) as EmberComponentClass

    // Match rules.
    if (rules.length > 0) {
      // Compute classNames lazily only when at least one string matcher exists.
      let classNamesCache: string[] | null = null
      const getClassNames = () => {
        if (classNamesCache === null) classNamesCache = extractClassNames(args)
        return classNamesCache
      }

      for (const rule of rules) {
        const m = rule.matcher
        let matched = false

        if (typeof m === 'function') {
          // Function matcher: custom predicate.
          try {
            matched = m(args)
          } catch (e) {
            logger.warn('[EmberHook] matcher 函数抛错 (%s): %o', rule.name, e)
            matched = false
          }
        } else if (m === '*') {
          // Wildcard matcher: match all components.
          matched = true
        } else {
          // String matcher: exact classNames match.
          matched = getClassNames().includes(m)
        }

        if (matched) {
          klass = applyRuleToClass(Ember, klass, args, rule)
        }
      }
    }

    return klass
  } as EmberComponentClass['extend']

  target[WRAPPED_MARK] = true
  logger.info('[EmberHook] ✅ Ember.Component.extend 已被劫持（当前规则数: %d）', rules.length)
}

// ========== Public API ==========

/**
 * Call during init(context). It must run before client scripts initialize,
 * so it belongs in Sona init(), not load().
 */
export function installEmberHook(context: PenguContext) {
  if (installed) {
    logger.warn('[EmberHook] installEmberHook 已经被调用过，忽略')
    return
  }
  installed = true

  logger.info('[EmberHook] 注册 rcp-fe-ember-libs postInit...')

  // blocking=true is critical:
  //   - false (default): only captures future init events, which HMR/reload can miss.
  //   - true: if rcp-fe-ember-libs already initialized, immediately replays with cached API;
  //           the target module also waits for the callback, preserving the hook window.
  context.rcp.postInit('rcp-fe-ember-libs', (api: unknown) => {
    const emberLibs = api as { getEmber?: (...a: unknown[]) => Promise<EmberNamespace> }
    if (!emberLibs || typeof emberLibs.getEmber !== 'function') {
      logger.warn('[EmberHook] rcp-fe-ember-libs 里没有 getEmber，放弃')
      return
    }

    // Hook getEmber so we can insert the extend hook when the client asks for Ember.
    const target = emberLibs as unknown as Record<string | symbol, unknown>
    if (target[WRAPPED_MARK]) {
      logger.info('[EmberHook] getEmber 已被劫持过，跳过')
      return
    }

    const originalGetEmber = emberLibs.getEmber.bind(emberLibs)
    emberLibs.getEmber = function (this: unknown, ...args: unknown[]): Promise<EmberNamespace> {
      const p = originalGetEmber(...args)
      return Promise.resolve(p).then((Ember: EmberNamespace) => {
        try {
          hookComponentExtend(Ember)
        } catch (e) {
          logger.warn('[EmberHook] hookComponentExtend 异常: %o', e)
        }
        return Ember
      })
    }
    target[WRAPPED_MARK] = true

    logger.info('[EmberHook] 🎯 已劫持 rcp-fe-ember-libs.getEmber，等客户端首次调用...')
  }, true)
}

/**
 * Register one Ember component rule.
 * Can be called at any time:
 *   - if extend has not run yet, future calls will match automatically
 *   - if extend already ran, existing classes are unaffected, but future recreated classes still match
 */
export function registerEmberRule(rule: EmberRule) {
  // Simple dedupe.
  const i = rules.findIndex((r) => r.name === rule.name)
  if (i >= 0) {
    rules[i] = rule
    logger.info('[EmberHook] 更新规则: %s', rule.name)
  } else {
    rules.push(rule)
    const matcherDesc = typeof rule.matcher === 'function' ? '<function>' : rule.matcher
    logger.info('[EmberHook] 新增规则: %s (matcher=%s)，当前共 %d 条', rule.name, matcherDesc, rules.length)
  }
}

/** Debug helper: current registered rule count. */
export function getEmberRulesCount() {
  return rules.length
}
