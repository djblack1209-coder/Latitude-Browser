interface TagFilterBarProps {
  tags: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

export function TagFilterBar({ tags, selected, onChange }: TagFilterBarProps) {
  if (tags.length === 0) return null

  const toggle = (tag: string) => {
    const next = new Set(selected)
    next.has(tag) ? next.delete(tag) : next.add(tag)
    onChange(next)
  }

  const isAllSelected = selected.size === 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--color-text-muted)] shrink-0">标签：</span>
      <button
        type="button"
        aria-pressed={isAllSelected}
        onClick={() => onChange(new Set())}
        className={`px-2 py-0.5 rounded-sm text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)] ${
          isAllSelected
            ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
        }`}
      >
        全部
      </button>
      {tags.map(tag => (
        <button
          type="button"
          key={tag}
          aria-pressed={selected.has(tag)}
          onClick={() => toggle(tag)}
          className={`px-2 py-0.5 rounded-sm text-xs font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)] ${
            selected.has(tag)
              ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
              : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]'
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
