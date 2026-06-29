import fs from 'node:fs'
import path from 'node:path'

type CleanupOptions = {
  apply: boolean
  gameDir: string
  includeUntitledTestPage: boolean
}

type ItemSet = {
  uid?: string
  title?: string
  [key: string]: unknown
}

type ItemSetWrapper = {
  itemSets?: ItemSet[]
  [key: string]: unknown
}

type FileCleanupResult = {
  scanned: number
  matched: number
  retained: number
  deleted: number
}

const DEFAULT_GAME_DIR = 'C:\\Program Files (x86)\\WeGameApps\\英雄联盟\\Game'
const WATCH_INTERVAL_MS = 2000
const BACKUP_PREFIX = 'SonaEItemSetBackup-'
const UNTITLED_TEST_PAGE_TITLE = '新的配装方案'
const MANAGED_UID_PREFIXES = ['sonaenhance-', 'sona-']
const MANAGED_TITLE_PREFIXES = ['[Sona-E]', '[Sona]']
const CURRENT_UID_PREFIX = 'sonaenhance-'
const CURRENT_TITLE_PREFIX = '[Sona-E]'

function parseArgs() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const watch = args.includes('--watch')
  const includeUntitledTestPage = args.includes('--include-untitled-test-page')
  const dirArg = args.find((arg) => arg.startsWith('--game-dir='))
  const gameDir = dirArg ? dirArg.slice('--game-dir='.length) : DEFAULT_GAME_DIR
  return { apply: apply || watch, watch, includeUntitledTestPage, gameDir }
}

function isManagedSonaItemSet(itemSet: ItemSet): boolean {
  const uid = String(itemSet.uid ?? '')
  const title = String(itemSet.title ?? '')
  return MANAGED_UID_PREFIXES.some((prefix) => uid.startsWith(prefix))
    || MANAGED_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix))
}

function isCurrentSonaEnhanceItemSet(itemSet: ItemSet): boolean {
  return String(itemSet.uid ?? '').startsWith(CURRENT_UID_PREFIX)
    || String(itemSet.title ?? '').startsWith(CURRENT_TITLE_PREFIX)
}

function isUntitledTestPage(itemSet: ItemSet): boolean {
  return String(itemSet.title ?? '') === UNTITLED_TEST_PAGE_TITLE
}

function shouldRemoveItemSet(itemSet: ItemSet, options: Pick<CleanupOptions, 'includeUntitledTestPage'>): boolean {
  if (isManagedSonaItemSet(itemSet)) return true
  return options.includeUntitledTestPage && isUntitledTestPage(itemSet)
}

function isBackupPath(filePath: string): boolean {
  return filePath.split(path.sep).some((part) => part.startsWith(BACKUP_PREFIX))
}

function walkJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []

  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith(BACKUP_PREFIX)) continue
      files.push(...walkJsonFiles(fullPath))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(fullPath)
    }
  }
  return files
}

function ensureBackupPath(backupRoot: string, sourcePath: string, configDir: string): string {
  const relative = path.relative(configDir, sourcePath)
  const backupPath = path.join(backupRoot, relative)
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  return backupPath
}

function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown
  } catch {
    return null
  }
}

function getItemSetsFromJson(value: unknown): ItemSet[] {
  if (!value || typeof value !== 'object') return []
  const maybeWrapper = value as ItemSetWrapper
  if (Array.isArray(maybeWrapper.itemSets)) return maybeWrapper.itemSets
  return [value as ItemSet]
}

function getCurrentManagedUid(configDir: string): string | null {
  const itemSetsPath = path.join(configDir, 'ItemSets.json')
  if (!fs.existsSync(itemSetsPath)) return null

  const wrapper = readJsonFile(itemSetsPath) as ItemSetWrapper | null
  const itemSets = Array.isArray(wrapper?.itemSets) ? wrapper.itemSets : []
  const currentManaged = itemSets.filter(isCurrentSonaEnhanceItemSet)
  return String(currentManaged.at(-1)?.uid ?? '') || null
}

function getMatchedItemSets(filePath: string, options: Pick<CleanupOptions, 'includeUntitledTestPage'>): ItemSet[] {
  const json = readJsonFile(filePath)
  return getItemSetsFromJson(json).filter((itemSet) => shouldRemoveItemSet(itemSet, options))
}

function shouldRetainRecommendedFile(filePath: string, currentManagedUid: string | null, retainedUids: Set<string>): boolean {
  if (!currentManagedUid) return false
  const json = readJsonFile(filePath)
  const itemSets = getItemSetsFromJson(json)
  if (!itemSets.some((itemSet) => String(itemSet.uid ?? '') === currentManagedUid)) return false
  if (retainedUids.has(currentManagedUid)) return false
  retainedUids.add(currentManagedUid)
  return true
}

function cleanupRecommendedDirectory(
  dir: string,
  configDir: string,
  backupRoot: string,
  options: CleanupOptions,
  currentManagedUid: string | null,
  retainCurrentRecommended: boolean,
): FileCleanupResult {
  const files = walkJsonFiles(dir).filter((file) => !isBackupPath(file))
  const matchedFiles = files.filter((file) => getMatchedItemSets(file, options).length > 0)
  const retainedUids = new Set<string>()
  const filesToRetain = retainCurrentRecommended
    ? matchedFiles.filter((file) => shouldRetainRecommendedFile(file, currentManagedUid, retainedUids))
    : []
  const retainedFiles = new Set(filesToRetain)
  const filesToDelete = matchedFiles.filter((file) => !retainedFiles.has(file))

  if (options.apply) {
    for (const file of filesToDelete) {
      fs.copyFileSync(file, ensureBackupPath(backupRoot, file, configDir))
      fs.unlinkSync(file)
    }
  }

  return {
    scanned: files.length,
    matched: matchedFiles.length,
    retained: filesToRetain.length,
    deleted: options.apply ? filesToDelete.length : 0,
  }
}

function cleanupItemSetsJson(configDir: string, backupRoot: string, options: CleanupOptions) {
  const itemSetsPath = path.join(configDir, 'ItemSets.json')
  if (!fs.existsSync(itemSetsPath)) {
    return { exists: false, managedBefore: 0, managedAfter: 0, changed: false }
  }

  const raw = fs.readFileSync(itemSetsPath, 'utf-8')
  const wrapper = JSON.parse(raw) as ItemSetWrapper
  const itemSets = Array.isArray(wrapper.itemSets) ? wrapper.itemSets : []
  const managed = itemSets.filter(isManagedSonaItemSet)
  const currentManaged = managed.filter(isCurrentSonaEnhanceItemSet)
  const unmanaged = itemSets.filter((itemSet) => !shouldRemoveItemSet(itemSet, options))
  const latestManaged = currentManaged.at(-1)
  const nextItemSets = latestManaged ? [...unmanaged, latestManaged] : unmanaged
  const changed = nextItemSets.length !== itemSets.length

  if (options.apply && changed) {
    fs.copyFileSync(itemSetsPath, ensureBackupPath(backupRoot, itemSetsPath, configDir))
    const nextWrapper: ItemSetWrapper = {
      ...wrapper,
      itemSets: nextItemSets,
      timestamp: Date.now(),
    }
    fs.writeFileSync(itemSetsPath, `${JSON.stringify(nextWrapper)}\n`, 'utf-8')
  }

  return {
    exists: true,
    managedBefore: managed.length,
    currentManagedBefore: currentManaged.length,
    managedAfter: latestManaged ? 1 : 0,
    changed,
  }
}

function runCleanup(options: CleanupOptions) {
  const configDir = path.join(options.gameDir, 'Config')

  if (!fs.existsSync(configDir)) {
    throw new Error(`找不到游戏配置目录：${configDir}`)
  }

  const backupRoot = path.join(
    configDir,
    `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`,
  )
  const currentManagedUid = getCurrentManagedUid(configDir)
  const globalRecommended = cleanupRecommendedDirectory(
    path.join(configDir, 'Global', 'Recommended'),
    configDir,
    backupRoot,
    options,
    currentManagedUid,
    false,
  )
  const championRecommended = cleanupRecommendedDirectory(
    path.join(configDir, 'Champions'),
    configDir,
    backupRoot,
    options,
    currentManagedUid,
    true,
  )
  const itemSets = cleanupItemSetsJson(configDir, backupRoot, options)

  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    gameDir: options.gameDir,
    includeUntitledTestPage: options.includeUntitledTestPage,
    currentManagedUid,
    backupRoot: options.apply ? backupRoot : null,
    globalRecommended,
    championRecommended,
    itemSets,
  }

  console.log(JSON.stringify(result, null, 2))
  return result
}

function main() {
  const { watch, ...options } = parseArgs()

  if (!watch) {
    runCleanup(options)
    return
  }

  console.log(`Watching Sona/Sona-E item-set files every ${WATCH_INTERVAL_MS}ms. Press Ctrl+C to stop.`)
  runCleanup(options)
  setInterval(() => {
    runCleanup(options)
  }, WATCH_INTERVAL_MS)
}

main()
