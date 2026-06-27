import { logger } from '@/index'
import { lcu } from '@/lib/lcu'
import { injector } from '@/lib/InjectorManager'
import { sleep } from '@/lib/utils'

// ==================== Friend Smart Grouping ====================

const SONA_FRIEND_GROUP_ATTR = 'data-sonaenhance-friend-group'
const SONA_FRIEND_CHECKED_ATTR = 'data-sonaenhance-friend-checked'
const FRIENDS_URI = '/lol-chat/v1/friends'

/** Colors used to assign the same color to the same game. */
const GAME_COLORS = [
  '#e8a424', '#4a9eff', '#5bbd72', '#e74c3c', '#c084fc', '#f97316', '#14b8a6', '#ec4899',
  '#8b5cf6', '#06b6d4', '#eab308', '#ef4444', '#22d3ee', '#a3e635', '#fb923c', '#f472b6',
]


/** gameId to color cache. */
let gameColorMap = new Map<string, string>()
let colorIndex = 0

/** Friend name to game info cache, populated by on-demand queries. */
let friendInfoMap = new Map<string, { gameId: number; gameStatus: string }>()
let friendRefreshTimer: number | null = null
let friendRefreshInFlight: Promise<void> | null = null

function getGameColor(gameId: string): string {
  if (!gameColorMap.has(gameId)) {
    gameColorMap.set(gameId, GAME_COLORS[colorIndex % GAME_COLORS.length])
    colorIndex++
  }
  return gameColorMap.get(gameId)!
}

/** Query all friend game statuses asynchronously and build the name to game info map. */
async function refreshFriendInfoMap(retries = 5) {
  if (friendRefreshInFlight) return friendRefreshInFlight

  friendRefreshInFlight = doRefreshFriendInfoMap(retries)
    .finally(() => {
      friendRefreshInFlight = null
    })

  return friendRefreshInFlight
}

async function doRefreshFriendInfoMap(retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const friends = await lcu.getFriends()
      if (!friendSmartGroupRegistered) return

      const newMap = new Map<string, { gameId: number; gameStatus: string }>()

      for (const f of friends) {
        const name = f.gameName || f.name
        if (!name) continue

        // lol.gameId / lol.gameStatus are strings and need numeric conversion.
        // XMPP presence fields conventionally store every value as a string.
        const gameIdStr = f.lol?.gameId
        const gameId = gameIdStr ? Number(gameIdStr) : 0
        const gameStatus = f.lol?.gameStatus ?? ''

        if (gameId > 0 && gameStatus && gameStatus !== 'outOfGame') {
          newMap.set(name, { gameId, gameStatus })
        }
      }

      friendInfoMap = newMap
      logger.info('[FriendGroup] 刷新好友游戏状态 → %d 人在游戏中 (attempt %d)', newMap.size, attempt)
      tryInjectFriendSmartGroup()
      return
    } catch (err) {
      if (attempt < retries) {
        logger.debug('[FriendGroup] 好友接口未就绪，%ds 后重试 (%d/%d)', 2, attempt + 1, retries)
        await sleep(2000)
      } else {
        logger.error('[FriendGroup] 查询好友状态失败:', err)
      }
    }
  }
}

function scheduleFriendInfoRefresh(delay = 250) {
  if (!friendSmartGroupRegistered) return

  if (friendRefreshTimer != null) {
    window.clearTimeout(friendRefreshTimer)
  }

  friendRefreshTimer = window.setTimeout(() => {
    friendRefreshTimer = null
    void refreshFriendInfoMap(0)
  }, delay)
}

/**
 * Injection task: scan the friend list and mark friends in the same game with the same border color.
 *
 * DOM structure:
 * - friend list container: .lol-social-lower-pane-container
 * - each friend: lol-social-roster-member, plus .offline when offline
 *   - .member-name: friend name without tag
 *   - span.status-message.game-status.dnd: in-game status
 *   - parentElement is the movable list row
 *
 * The visual friend list is reversed from the DOM order, so moving to the bottom
 * places the row first visually.
 */
function tryInjectFriendSmartGroup(): boolean {
  const container = document.querySelector('.lol-social-lower-pane-container')
  if (!container) return true

  const allMembers = container.querySelectorAll('[class*="lol-social-roster-member"]')
  if (allMembers.length === 0) return true

  // First pass: collect gameId to friend element lists.
  const gameIdToElements = new Map<string, HTMLElement[]>()

  allMembers.forEach((member) => {
    const el = member as HTMLElement

    const isOffline = el.className.includes('offline')
    const isInGame = !isOffline && !!el.querySelector('span.status-message.game-status.dnd')

    if (!isInGame) {
      // Clear stale marks when not in-game or offline.
      if (el.hasAttribute(SONA_FRIEND_GROUP_ATTR)) {
        el.removeAttribute(SONA_FRIEND_GROUP_ATTR)
        el.style.borderRight = ''
      }
      el.removeAttribute(SONA_FRIEND_CHECKED_ATTR)
      return
    }

    // Read the friend name from DOM.
    const nameEl = el.querySelector('.member-name')
    const memberName = nameEl?.textContent?.trim() ?? ''
    if (!memberName) return

    // Match gameId from cache.
    const info = friendInfoMap.get(memberName)
    const gameId = info ? String(info.gameId) : undefined

    if (gameId) {
      if (!gameIdToElements.has(gameId)) gameIdToElements.set(gameId, [])
      gameIdToElements.get(gameId)!.push(el)
    } else {
      // Clear possible stale marks when gameId is unavailable, such as champ select.
      if (el.hasAttribute(SONA_FRIEND_GROUP_ATTR)) {
        el.removeAttribute(SONA_FRIEND_GROUP_ATTR)
        el.style.borderRight = ''
      }
    }
  })

  // Second pass: only mark groups with 2+ friends in the same game.
  gameIdToElements.forEach((elements, gameId) => {
    if (elements.length < 2) {
      // Clear stale marks for solo players.
      elements.forEach((el) => {
        if (el.hasAttribute(SONA_FRIEND_GROUP_ATTR)) {
          el.removeAttribute(SONA_FRIEND_GROUP_ATTR)
          el.style.borderRight = ''
        }
      })
      return
    }

    const color = getGameColor(gameId)
    elements.forEach((el) => {
      el.setAttribute(SONA_FRIEND_GROUP_ATTR, gameId)
      el.style.borderRight = `4px solid ${color}`
    })
  })


  return true
}


let friendSmartGroupRegistered = false
let friendSmartGroupInjected = false
let friendSmartGroupUnsub: (() => void) | null = null

export function updateFriendSmartGroup(enabled: boolean) {
  if (enabled && !friendSmartGroupRegistered) {
    friendSmartGroupRegistered = true

    injector.register(tryInjectFriendSmartGroup)
    friendSmartGroupInjected = true

    friendSmartGroupUnsub = lcu.observe(FRIENDS_URI, () => {
      scheduleFriendInfoRefresh()
    })

    void refreshFriendInfoMap().then(() => {
      if (friendSmartGroupRegistered) {
        logger.info('Friend smart group enabled ✓')
      }
    })
  } else if (!enabled && friendSmartGroupRegistered) {
    if (friendSmartGroupInjected) {
      injector.unregister(tryInjectFriendSmartGroup)
      friendSmartGroupInjected = false
    }
    if (friendSmartGroupUnsub) {
      friendSmartGroupUnsub()
      friendSmartGroupUnsub = null
    }
    if (friendRefreshTimer != null) {
      window.clearTimeout(friendRefreshTimer)
      friendRefreshTimer = null
    }
    friendSmartGroupRegistered = false
    friendInfoMap.clear()

    gameColorMap.clear()

    colorIndex = 0
    document.querySelectorAll(`[${SONA_FRIEND_GROUP_ATTR}]`).forEach((el) => {
      const htmlEl = el as HTMLElement
      htmlEl.removeAttribute(SONA_FRIEND_GROUP_ATTR)
      htmlEl.removeAttribute(SONA_FRIEND_CHECKED_ATTR)
      htmlEl.style.borderRight = ''
    })
    logger.info('Friend smart group disabled')
  }
}
