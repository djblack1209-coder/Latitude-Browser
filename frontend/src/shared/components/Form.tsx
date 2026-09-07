import {
  AriaAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import clsx from 'clsx'

const SELECT_CHEVRON_DATA_URI =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2364758b' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5.5 7.5 4.5 4.5 4.5-4.5'/%3E%3C/svg%3E")`

interface FormItemContextValue {
  itemId: string
  labelId?: string
  hintId?: string
  errorId?: string
  required: boolean
}

const FormItemContext = createContext<FormItemContextValue | null>(null)

function mergeAriaIds(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? [])
  const merged = Array.from(new Set(ids)).join(' ')
  return merged || undefined
}

interface FormControlA11yOptions {
  id?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  ariaInvalid?: AriaAttributes['aria-invalid']
  ariaRequired?: AriaAttributes['aria-required']
  invalid?: boolean
}

function useFormControlA11y({
  id: explicitId,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  invalid = false,
}: FormControlA11yOptions) {
  const formItem = useContext(FormItemContext)
  const generatedId = useId()
  const id = explicitId ?? (formItem ? `${formItem.itemId}-control-${generatedId}` : undefined)

  return {
    id,
    ariaLabel,
    ariaLabelledBy: ariaLabelledBy ?? (ariaLabel ? undefined : formItem?.labelId),
    ariaDescribedBy: mergeAriaIds(ariaDescribedBy, formItem?.hintId, formItem?.errorId),
    ariaInvalid: ariaInvalid ?? (invalid || formItem?.errorId ? true : undefined),
    ariaRequired: ariaRequired ?? (formItem?.required ? true : undefined),
    formItemId: formItem?.itemId,
    hasError: invalid || Boolean(formItem?.errorId),
  }
}

interface FormItemProps {
  label?: ReactNode
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function FormItem({ label, required = false, hint, error, children, className }: FormItemProps) {
  const generatedId = useId()
  const itemId = `form-item-${generatedId}`
  const hasLabel = Boolean(label)
  const labelId = hasLabel ? `${itemId}-label` : undefined
  const hintId = hint ? `${itemId}-hint` : undefined
  const errorId = error ? `${itemId}-error` : undefined
  const containerRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLLabelElement>(null)
  const contextValue = useMemo<FormItemContextValue>(() => ({
    itemId,
    labelId,
    hintId,
    errorId,
    required,
  }), [errorId, hintId, itemId, labelId, required])

  // Bind the visible label to the first shared control while aria-labelledby
  // continues to name any additional controls contained in the same item.
  useLayoutEffect(() => {
    const labelElement = labelRef.current
    const containerElement = containerRef.current
    if (!labelElement || !containerElement) return

    const primaryControl = Array.from(
      containerElement.querySelectorAll<HTMLElement>('[data-form-item-control]'),
    ).find((element) => element.dataset.formItemControl === itemId)

    if (primaryControl?.id) {
      labelElement.htmlFor = primaryControl.id
    } else {
      labelElement.removeAttribute('for')
    }
  })

  return (
    <div ref={containerRef} className={clsx('space-y-1.5', className)}>
      {hasLabel && (
        <div className="flex items-center gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          <label ref={labelRef} id={labelId}>
            {label}
            {required && <span aria-hidden="true" className="text-[var(--color-error)] ml-0.5">*</span>}
          </label>
          {hint && (
            <span className="group relative inline-flex" tabIndex={0} aria-label={hint} title={hint}>
              <span aria-hidden="true" className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--color-border-muted)] text-[10px] font-semibold leading-none text-[var(--color-text-muted)]">?</span>
              <span aria-hidden="true" className="pointer-events-none absolute left-0 top-5 z-50 hidden w-64 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs font-normal leading-5 text-[var(--color-text-secondary)] shadow-lg group-hover:block group-focus:block">
                {hint}
              </span>
            </span>
          )}
        </div>
      )}
      {hint && <span id={hintId} className="sr-only">{hint}</span>}
      <FormItemContext.Provider value={contextValue}>
        {children}
      </FormItemContext.Provider>
      {error && <p id={errorId} className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export function Input({
  error,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...props
}: InputProps) {
  const a11y = useFormControlA11y({
    id,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid,
    ariaRequired,
    invalid: error,
  })

  return (
    <input
      {...props}
      id={a11y.id}
      aria-label={a11y.ariaLabel}
      aria-labelledby={a11y.ariaLabelledBy}
      aria-describedby={a11y.ariaDescribedBy}
      aria-invalid={a11y.ariaInvalid}
      aria-required={a11y.ariaRequired}
      data-form-item-control={a11y.formItemId}
      className={clsx(
        'block h-9 px-3 text-sm',
        'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border-default)] rounded-md',
        'placeholder:text-[var(--color-text-muted)]',
        'focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)]',
        'disabled:bg-[var(--color-bg-muted)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed',
        'transition-colors duration-150',
        a11y.hasError && 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
        // 默认宽度自适应，可通过 className 覆盖
        !className?.includes('w-') && 'w-full',
        className
      )}
    />
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  options: { value: string; label: string }[]
}

export function Select({
  error,
  options,
  className,
  style,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...props
}: SelectProps) {
  const a11y = useFormControlA11y({
    id,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid,
    ariaRequired,
    invalid: error,
  })

  return (
    <select
      {...props}
      id={a11y.id}
      aria-label={a11y.ariaLabel}
      aria-labelledby={a11y.ariaLabelledBy}
      aria-describedby={a11y.ariaDescribedBy}
      aria-invalid={a11y.ariaInvalid}
      aria-required={a11y.ariaRequired}
      data-form-item-control={a11y.formItemId}
      className={clsx(
        'block h-9 appearance-none px-3 pr-10 text-sm',
        'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border-default)] rounded-md',
        'hover:border-[var(--color-border-strong)]',
        'focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)]',
        'disabled:bg-[var(--color-bg-muted)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed',
        'transition-colors duration-150',
        'cursor-pointer',
        a11y.hasError && 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
        // 默认宽度自适应，可通过 className 覆盖
        !className?.includes('w-') && 'w-full',
        className
      )}
      style={{
        backgroundImage: SELECT_CHEVRON_DATA_URI,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.8rem center',
        backgroundSize: '0.95rem 0.95rem',
        ...style,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export function Textarea({
  error,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...props
}: TextareaProps) {
  const a11y = useFormControlA11y({
    id,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid,
    ariaRequired,
    invalid: error,
  })

  return (
    <textarea
      {...props}
      id={a11y.id}
      aria-label={a11y.ariaLabel}
      aria-labelledby={a11y.ariaLabelledBy}
      aria-describedby={a11y.ariaDescribedBy}
      aria-invalid={a11y.ariaInvalid}
      aria-required={a11y.ariaRequired}
      data-form-item-control={a11y.formItemId}
      className={clsx(
        'block w-full px-3 py-2 text-sm',
        'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border-default)] rounded-md',
        'placeholder:text-[var(--color-text-muted)]',
        'focus:outline-none focus:border-[var(--color-border-strong)] focus:ring-1 focus:ring-[var(--color-border-strong)]',
        'disabled:bg-[var(--color-bg-muted)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed',
        'transition-colors duration-150 resize-none',
        a11y.hasError && 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
        className
      )}
    />
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: AriaAttributes['aria-invalid']
  'aria-required'?: AriaAttributes['aria-required']
}

export function Switch({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: SwitchProps) {
  const a11y = useFormControlA11y({
    id,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid,
    ariaRequired,
  })

  return (
    <button
      id={a11y.id}
      type="button"
      role="switch"
      aria-label={a11y.ariaLabel}
      aria-labelledby={a11y.ariaLabelledBy}
      aria-describedby={a11y.ariaDescribedBy}
      aria-invalid={a11y.ariaInvalid}
      aria-required={a11y.ariaRequired}
      aria-checked={checked}
      data-form-item-control={a11y.formItemId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-strong)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
