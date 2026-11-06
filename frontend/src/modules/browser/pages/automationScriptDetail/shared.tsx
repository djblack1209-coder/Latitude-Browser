import { tr, useLocale } from '../../../../shared/i18n'
import type { ReactNode } from "react";
import { FormItem, Input, Select, Textarea } from "../../../../shared/components";
import {
  formatAutomationTargetIdentity,
  type AutomationScriptTargetSelector,
} from "../../automationScripts";
import type { BrowserProfile } from "../../types";
import {
  findMatchedProfileId,
  formatSelectorTerms,
  parseSelectorTerms,
  type SelectorSuggestion,
} from "./helpers";

export interface TargetSelectorEditorProps {
  selector: AutomationScriptTargetSelector;
  onChange: (patch: Partial<AutomationScriptTargetSelector>) => void;
  codeSuggestions: SelectorSuggestion[];
  profileIdSuggestions: SelectorSuggestion[];
  profileNameSuggestions: SelectorSuggestion[];
  groupOptions: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

export function TargetSelectorEditor({
  selector,
  onChange,
  codeSuggestions,
  profileIdSuggestions,
  profileNameSuggestions,
  groupOptions,
  disabled = false,
}: TargetSelectorEditorProps) {
  useLocale()

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <FormItem label={tr("ui.modules.browser.pages.automationScriptDetail.shared.label.adac693")}>
        <Input
          value={selector.code}
          onChange={(event) =>
            onChange({ code: event.target.value.trim().toUpperCase() })
          }
          placeholder={tr("browser.pages.automationScriptDetail.shared.placeholder.18eeaf4")}
          list="automation-script-target-code-options"
          disabled={disabled}
        />
        {codeSuggestions.length > 0 ? (
          <datalist id="automation-script-target-code-options">
            {codeSuggestions.map((item) => (
              <option key={item.key} value={item.value}>
                {item.label}
              </option>
            ))}
          </datalist>
        ) : null}
      </FormItem>

      <FormItem label={tr("browser.pages.automationScriptDetail.shared.label.61e44a1")}>
        <Input
          value={selector.profileId}
          onChange={(event) =>
            onChange({ profileId: event.target.value.trim() })
          }
          placeholder={tr("browser.pages.automationScriptDetail.shared.placeholder.66cceaa")}
          list="automation-script-target-profile-id-options"
          disabled={disabled}
        />
        {profileIdSuggestions.length > 0 ? (
          <datalist id="automation-script-target-profile-id-options">
            {profileIdSuggestions.map((item) => (
              <option key={item.key} value={item.value}>
                {item.label}
              </option>
            ))}
          </datalist>
        ) : null}
      </FormItem>

      <FormItem label={tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.9c0531d")}>
        <Input
          value={selector.profileName}
          onChange={(event) =>
            onChange({ profileName: event.target.value.trim() })
          }
          placeholder={tr("browser.pages.automationScriptDetail.shared.placeholder.baba6bb")}
          list="automation-script-target-profile-name-options"
          disabled={disabled}
        />
        {profileNameSuggestions.length > 0 ? (
          <datalist id="automation-script-target-profile-name-options">
            {profileNameSuggestions.map((item) => (
              <option key={item.key} value={item.value}>
                {item.label}
              </option>
            ))}
          </datalist>
        ) : null}
      </FormItem>

      <FormItem label={tr("browser.pages.automationScriptDetail.shared.label.4ce78e8")}>
        <Select
          value={selector.groupId}
          onChange={(event) =>
            onChange({ groupId: event.target.value.trim() })
          }
          options={groupOptions}
          disabled={disabled}
        />
      </FormItem>

      <FormItem label={tr("browser.pages.BrowserDetailPage.text.ae0a7af")}>
        <Textarea
          rows={3}
          value={formatSelectorTerms(selector.tags)}
          onChange={(event) =>
            onChange({ tags: parseSelectorTerms(event.target.value) })
          }
          placeholder={"sales-us\nbuyer"}
          disabled={disabled}
        />
      </FormItem>

      <FormItem label={tr("browser.components.BrowserProfilesPanel.text.621219f")}>
        <Textarea
          rows={3}
          value={formatSelectorTerms(selector.keywords)}
          onChange={(event) =>
            onChange({ keywords: parseSelectorTerms(event.target.value) })
          }
          placeholder={"buyer-001\nwarm-account"}
          disabled={disabled}
        />
      </FormItem>
    </div>
  );
}

export interface DetailPanelProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DetailPanel({
  title,
  actions,
  children,
  className = "",
}: DetailPanelProps) {
  useLocale()

  return (
    <section
      className={`signal-panel rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function CompactMetaField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  useLocale()

  return (
    <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export function StructuredInfoCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  useLocale()

  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
        {children}
      </div>
    </div>
  );
}

export function FieldLabelWithHelp({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  useLocale()

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        aria-label={tr("browser.pages.automationScriptDetail.shared.FieldLabelWithHelp.2e4e83d", [label])}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors duration-150 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
      >
        ?
      </button>
    </span>
  );
}

export function ExactTargetSummary({
  title,
  selector,
  profiles,
}: {
  title: string;
  selector: AutomationScriptTargetSelector;
  profiles: BrowserProfile[];
}) {
  useLocale()

  const profileId = findMatchedProfileId(selector, profiles);
  const targetLabel = formatAutomationTargetIdentity(selector, profiles, {
    fallback: tr("browser.pages.automationScriptDetail.shared.fallback.524912a"),
  });

  return (
    <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
      <div className="text-[11px] font-semibold   text-[var(--color-text-muted)]">
        {title}
      </div>
      <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
        {targetLabel}
      </div>
      {profileId ? (
        <div className="mt-1 break-all text-xs text-[var(--color-text-muted)]">{tr("browser.pages.automationScriptDetail.shared.text.0bc38f3")}{profileId}
        </div>
      ) : null}
    </div>
  );
}
