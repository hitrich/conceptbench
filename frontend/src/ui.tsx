import { useLayoutEffect, useId, useRef } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { X, ArrowUpRight, CircleHelp, LoaderCircle } from 'lucide-react'

export function Dialog({
  title,
  children,
  close,
  wide = false,
  drawer = false,
}: {
  title: string
  children: ReactNode
  close: () => void
  wide?: boolean
  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  // Close before DOM removal so the browser restores focus to the opening control.
  useLayoutEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`${wide ? 'wide ' : ''}${drawer ? 'drawer' : ''}`}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            <h2 id={id}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CircleHelp size={24} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Preparing your workspace">
      <span className="brand" aria-hidden="true">
        conceptbench.
      </span>
      <div className="loading-preview" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span>Preparing your workspace…</span>
    </div>
  )
}
export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  )
}
export const formValues = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
}
export const tomorrow = (days = 14) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
export function Submit({
  busy,
  disabled = false,
  label = 'Save changes',
}: {
  busy: boolean
  disabled?: boolean
  label?: string
}) {
  return (
    <button type="submit" className="button primary" aria-busy={busy} disabled={busy || disabled}>
      {busy && <LoaderCircle size={15} className="spin" />}
      {busy ? 'Saving…' : label}
    </button>
  )
}
