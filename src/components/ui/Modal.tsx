import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '@/styles/Modal.css'

export interface ModalProps {
  /** Whether the modal is visible. */
  open: boolean
  /** Close callback. */
  onClose: () => void
  /** Modal content. */
  children: ReactNode
  /** Width, defaults to 680px. */
  width?: number | string
  /** Height, defaults to 520px. */
  height?: number | string
  /** Whether clicking the backdrop closes the modal. Defaults to true. */
  maskClosable?: boolean
  /** Whether to show the close button. Defaults to true. */
  closable?: boolean
}

export function Modal({
  open,
  onClose,
  children,
  width = 680,
  height = 520,
  maskClosable = true,
  closable = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)

  // Mount immediately on open, then unmount after the close animation.
  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
    } else if (mounted) {
      setClosing(true)
    }
  }, [open])

  // Unmount after the exit animation completes.
  useEffect(() => {
    if (!closing) return
    const overlay = overlayRef.current
    if (!overlay) {
      setMounted(false)
      setClosing(false)
      return
    }
    const onEnd = (e: AnimationEvent) => {
      if (e.target === overlay) {
        setMounted(false)
        setClosing(false)
      }
    }
    overlay.addEventListener('animationend', onEnd)
    return () => overlay.removeEventListener('animationend', onEnd)
  }, [closing])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent background scrolling while open.
  useEffect(() => {
    if (mounted && !closing) {
      document.body.style.overflow = 'hidden'
    }
    if (!mounted) {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mounted, closing])

  if (!mounted) return null

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  const overlayClass = `sonaenhance-modal-overlay${closing ? ' sonaenhance-modal-closing' : ''}`
  const dialogClass = `sonaenhance-modal-dialog${closing ? ' sonaenhance-modal-closing' : ''}`

  return createPortal(
    <div
      ref={overlayRef}
      className={overlayClass}
      onClick={maskClosable ? onClose : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        className={dialogClass}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating close button */}
        {closable && (
          <button className="sonaenhance-modal-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* Body */}
        <div className="sonaenhance-modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.getElementById('sonaenhance-root') || document.body,
  )
}
