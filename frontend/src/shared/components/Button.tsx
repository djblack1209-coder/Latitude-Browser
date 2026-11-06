import { TextSpinner } from './TextSpinner'
import { useLocale } from '../i18n'
import { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  useLocale()

  const baseStyles = 'signal-press signal-button relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium rounded-full border select-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]'

  const variants = {
    primary: 'signal-button--primary border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]',
    secondary: 'signal-button--secondary bg-transparent text-[var(--color-text-secondary)] border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
    danger: 'signal-button--danger border-[var(--color-error)]/40 bg-[var(--color-error)]/10 text-[var(--color-error)] hover:bg-[var(--color-error)]/15 focus-visible:ring-[var(--color-error)]',
    ghost: 'signal-button--ghost border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-text-primary)]',
  }

  const sizes = {
    sm: 'h-[30px] px-2.5 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-[13px] gap-2',
    lg: 'h-[42px] px-5 text-sm gap-2',
  }

  return (
    <button
      className={clsx(
        baseStyles,
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <TextSpinner label="" decorative />
      )}
      {children}
    </button>
  )
}
