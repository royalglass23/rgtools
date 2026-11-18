'use client'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { shortMaterialDescription } from './material-description'
import styles from './MaterialDescription.module.css'

export function MaterialDescription({ label, description, jobNumber, editHref }: {
  label: string; description: string | null; jobNumber: string | null; editHref?: string;
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipFocus = useRef(false)
  const id = useId()
  const summary = shortMaterialDescription(label)
  const cancelClose = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null }, [])
  const close = useCallback(() => {
    cancelClose()
    if (panel.current?.contains(document.activeElement)) { skipFocus.current = true; trigger.current?.focus() }
    setOpen(false)
  }, [cancelClose])
  function scheduleClose() {
    cancelClose()
    timer.current = setTimeout(() => {
      if (document.activeElement === trigger.current || panel.current?.contains(document.activeElement)) return
      close()
    }, 200)
  }
  useEffect(() => () => cancelClose(), [cancelClose])
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return
    const target = trigger.current.getBoundingClientRect()
    const bounds = panel.current.getBoundingClientRect()
    const left = Math.max(12, Math.min(target.left, window.innerWidth - bounds.width - 12))
    const below = target.bottom + 8
    const top = below + bounds.height <= window.innerHeight - 12 ? below : Math.max(12, target.top - bounds.height - 8)
    Object.assign(panel.current.style, { left: `${left}px`, top: `${top}px`, visibility: 'visible' })
  }, [open, label, description])
  useEffect(() => {
    if (!open) return
    function outside(event: Event) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close()
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); close() } }
    function scroll(event: Event) { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])
  return <>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={`View material description: ${summary}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') { cancelClose(); setOpen(true) } }} onPointerLeave={scheduleClose}
      onFocus={() => { if (skipFocus.current) skipFocus.current = false; else { cancelClose(); setOpen(true) } }}
      onClick={event => { cancelClose(); setOpen(true); if (event.detail === 0) requestAnimationFrame(() => panel.current?.focus()) }}>
      {summary}
    </button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" tabIndex={-1} aria-labelledby={`${id}-title`}
      className={styles.preview} onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
      <div className={styles.heading}><h3 id={`${id}-title`}>Materials · {jobNumber ?? 'Unnumbered job'}</h3><button type="button" onClick={close} aria-label="Close materials preview">Close</button></div>
      <p className={styles.description}>{description?.trim() || label}</p>
      {editHref && <Link href={editHref} onClick={close}>Edit product</Link>}
    </div>, document.body)}
  </>
}
