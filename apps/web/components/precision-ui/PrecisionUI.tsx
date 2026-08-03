import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './PrecisionUI.module.css'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <div className={styles.pageDescription}>{description}</div>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </header>
  )
}

export function SectionHeading({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className={styles.sectionHeading}>
      {eyebrow && <span>{eyebrow}</span>}
      <h2>{title}</h2>
    </div>
  )
}

export function DataPanel({
  title,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string
  eyebrow?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={[styles.dataPanel, className].filter(Boolean).join(' ')} aria-label={title}>
      <div className={styles.panelHeader}>
        <SectionHeading title={title} eyebrow={eyebrow} />
        {actions && <div className={styles.panelActions}>{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function KpiCard({
  label,
  value,
  detail,
  marker,
  children,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  marker?: ReactNode
  children?: ReactNode
}) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.kpiTopline}>
        <span>{label}</span>
        {marker && <span className={styles.kpiMarker} aria-hidden="true">{marker}</span>}
      </div>
      <div className={styles.kpiValue}>{value}</div>
      {detail && <div className={styles.kpiDetail}>{detail}</div>}
      {children}
    </article>
  )
}

export function PriorityItem({
  tone,
  status,
  value,
  label,
  children,
}: {
  tone: StatusTone | 'clear'
  status: string
  value: ReactNode
  label: string
  children?: ReactNode
}) {
  return (
    <article className={styles.priorityItem} data-tone={tone}>
      <div className={styles.priorityStatus}><span aria-hidden="true" />{status}</div>
      <div className={styles.priorityValue}>{value}</div>
      <div className={styles.priorityLabel}>{label}</div>
      {children && <div className={styles.priorityAction}>{children}</div>}
    </article>
  )
}

export function TableShell({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.tableShell} role="region" aria-label={label} tabIndex={0}>{children}</div>
}

export type StatusTone = 'positive' | 'warning' | 'critical' | 'info' | 'muted'

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={styles.statusBadge} data-tone={tone}>{children}</span>
}

export function PrecisionButton({
  tone = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'quiet' }) {
  return <button {...props} className={[styles.button, className].filter(Boolean).join(' ')} data-tone={tone} />
}

export function FeedbackState({
  tone,
  children,
}: {
  tone: 'empty' | 'loading' | 'error'
  children: ReactNode
}) {
  return (
    <div
      className={styles.feedback}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : undefined}
      aria-live={tone === 'loading' ? 'polite' : undefined}
    >
      {children}
    </div>
  )
}

export const precisionControlClassName = styles.control
export const precisionSecondaryLinkClassName = styles.secondaryLink
