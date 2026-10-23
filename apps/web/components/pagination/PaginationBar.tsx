import type { ReactNode } from 'react'
import styles from './PaginationBar.module.css'

type PaginationBarProps = {
  count: ReactNode
  page: number
  pageCount: number
  previous: ReactNode
  next: ReactNode
  pageSize: ReactNode
  label: string
  className?: string
}

export function PaginationBar({ count, page, pageCount, previous, next, pageSize, label, className = '' }: PaginationBarProps) {
  return (
    <div className={`${styles.bar} ${className}`.trim()}>
      <span className={styles.count}>{count}</span>
      <nav aria-label={label} className={styles.navigation}>
        {previous}
        <span className={styles.pageNumber}>Page {page} of {pageCount}</span>
        {next}
      </nav>
      <div className={styles.size}>{pageSize}</div>
    </div>
  )
}
