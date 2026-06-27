/**
 * Modal visibility state.
 * Pure state logic with no DOM work, safe to import from any module.
 */

import { store } from '@/lib/store'

type VisibilityListener = (visible: boolean) => void
const listeners: Set<VisibilityListener> = new Set()

let modalVisible = false

export function isModalVisible() {
  return modalVisible
}

export function openModal() {
  modalVisible = true
  listeners.forEach((fn) => fn(modalVisible))
}

export function closeModal() {
  modalVisible = false
  listeners.forEach((fn) => fn(modalVisible))
}

export function toggleModal() {
  if (modalVisible) closeModal()
  else openModal()
}

/**
 * Subscribe to modal visibility changes.
 * @returns Unsubscribe function.
 */
export function onModalVisibilityChange(fn: VisibilityListener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ==================== Hotkeys ====================

let currentHotkey = ''

function onKeyDown(e: KeyboardEvent) {
  if (e.key === currentHotkey) {
    e.preventDefault()
    e.stopPropagation()
    toggleModal()
  }
}

/**
 * Register the global hotkey and rebind it when store settings change.
 */
export function registerHotkey() {
  currentHotkey = store.get('hotkey')
  document.addEventListener('keydown', onKeyDown, true)

  store.onChange('hotkey', (newKey) => {
    currentHotkey = newKey
  })
}
