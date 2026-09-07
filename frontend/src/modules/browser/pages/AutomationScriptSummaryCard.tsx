import { type KeyboardEvent, type ReactNode } from "react";
import { Braces, Clipboard, Link, Pencil, Play } from "lucide-react";
import { Button } from "../../../shared/components";
import type { AutomationCardPresentation } from "./AutomationPage.helpers";
import { copyToClipboard } from "./AutomationPage.helpers";

function ScriptCardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-[var(--color-border-muted)] px-3 py-2.5 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 min-w-0 text-xs font-medium leading-5 text-[var(--color-text-primary)]">
        {children}
      </div>
    </div>
  );
}

export function AutomationScriptSummaryCard({
  card,
  onOpen,
  onRunScript,
  onRunAPI,
  selected = false,
  onSelectedChange,
}: {
  card: AutomationCardPresentation;
  onOpen?: () => void;
  onRunScript?: () => void;
  onRunAPI?: () => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const interactive = typeof onOpen === "function";
  const selectable = typeof onSelectedChange === "function";
  const isInterfaceModeCard = card.scriptType === "launch-api";
  const cardClickable = selectable || interactive;

  const handleCardClick = () => {
    if (selectable) {
      onSelectedChange?.(!selected);
      return;
    }
    onOpen?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!cardClickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      role={selectable ? "checkbox" : interactive ? "button" : undefined}
      aria-label={selectable ? `${selected ? "取消选择" : "选择"}脚本 ${card.title}` : interactive ? `打开脚本 ${card.title}` : undefined}
      aria-checked={selectable ? selected : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      onClick={cardClickable ? handleCardClick : undefined}
      onKeyDown={cardClickable ? handleKeyDown : undefined}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-md border bg-[var(--color-bg-surface)] text-left transition-[border-color,background-color,transform] duration-150 active:translate-y-px ${
        cardClickable
          ? "cursor-pointer hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          : ""
      } ${selected ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]" : "border-[var(--color-border-default)]"}`}
    >
      <div className="flex min-w-0 items-start gap-3 px-3.5 py-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSelectedChange?.(event.currentTarget.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--color-border-strong)] accent-[var(--color-accent)]"
            aria-label={`选择 ${card.title}`}
          />
        ) : (
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${card.modeToneClass}`} aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h3 className="min-w-0 text-[15px] font-semibold leading-5 text-[var(--color-text-primary)]">
              {card.title}
            </h3>
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              {card.versionLabel}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
            {card.description}
          </p>
        </div>
      </div>

      <div className="grid border-y border-[var(--color-border-muted)] md:grid-cols-[118px_minmax(0,1fr)]">
        <ScriptCardField label="执行模式">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${card.modeToneClass}`} aria-hidden="true" />
            {card.modeLabel}
          </span>
        </ScriptCardField>
        <ScriptCardField label="目标 Code">
          <code className="block truncate whitespace-nowrap font-mono text-[10.5px] tracking-[0.03em]" title={card.codeDisplay}>
            {card.codeDisplay}
          </code>
        </ScriptCardField>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            void copyToClipboard(card.primaryActionText, card.primaryActionSuccessMessage);
          }}
          aria-label={`复制 ${card.title} 的 ${card.primaryActionLabel}`}
        >
          <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
          {card.primaryActionLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            void copyToClipboard(card.secondaryActionText, card.secondaryActionSuccessMessage);
          }}
          aria-label={`复制 ${card.title} 的请求 JSON`}
        >
          <Braces className="h-3.5 w-3.5" aria-hidden="true" />
          JSON
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {isInterfaceModeCard ? (
            typeof onRunAPI === "function" || typeof onRunScript === "function" ? (
              <Button
                type="button"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  if (typeof onRunAPI === "function") onRunAPI();
                  else onRunScript?.();
                }}
                aria-label={`执行 ${card.title}`}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                执行
              </Button>
            ) : null
          ) : (
            <>
              {typeof onRunScript === "function" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRunScript();
                  }}
                  aria-label={`执行脚本 ${card.title}`}
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  执行
                </Button>
              ) : null}
              {typeof onRunAPI === "function" ? (
                <Button
                  type="button"
                  size="sm"
                  variant={card.publicAPIEnabled ? "secondary" : "ghost"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRunAPI();
                  }}
                  aria-label={`${card.publicAPIEnabled ? "执行接口" : "配置接口"} ${card.title}`}
                >
                  {card.publicAPIEnabled ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Link className="h-3.5 w-3.5" aria-hidden="true" />}
                  {card.publicAPIEnabled ? "接口" : "配置接口"}
                </Button>
              ) : null}
            </>
          )}
          {interactive ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                onOpen?.();
              }}
              aria-label={`编辑 ${card.title}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              编辑
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
