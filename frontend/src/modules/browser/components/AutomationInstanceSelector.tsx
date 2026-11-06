import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import type { ReactNode } from "react";
import { FormItem, Input, Select } from "../../../shared/components";
import type { AutomationScriptTargetMode } from "../automationScripts";
import type { BrowserProfile } from "../types";

export type AutomationInstanceSelectorMode =
  | AutomationScriptTargetMode
  | "select"
  | "code";

export interface AutomationInstanceOption {
  value: string;
  label: string;
}

interface AutomationInstanceSelectorProps {
  title?: string;
  mode: AutomationInstanceSelectorMode;
  modes?: AutomationInstanceSelectorMode[];
  codeSelectLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  showFields?: boolean;
  error?: string;
  selectedProfileId?: string;
  selectedCode?: string;
  createName?: string;
  templateProfileId?: string;
  profiles?: BrowserProfile[];
  profileOptions?: AutomationInstanceOption[];
  templateOptions?: AutomationInstanceOption[];
  selectPlaceholder?: string;
  templatePlaceholder?: string;
  codePlaceholder?: string;
  createNamePlaceholder?: string;
  hint?: string;
  extra?: ReactNode;
  onModeChange?: (mode: AutomationInstanceSelectorMode) => void;
  onSelectProfile?: (profileId: string) => void;
  onCodeChange?: (code: string) => void;
  onCreateNameChange?: (name: string) => void;
  onTemplateChange?: (profileId: string) => void;
}

function normalizeLaunchCode(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function buildCodeOptions(profiles: BrowserProfile[]): AutomationInstanceOption[] {
  return profiles
    .filter((profile) => normalizeLaunchCode(profile.launchCode))
    .map((profile) => {
      const code = normalizeLaunchCode(profile.launchCode);
      return {
        value: code,
        label: `${code} · ${profile.profileName || profile.profileId}`,
      };
    });
}

function modeLabel(mode: AutomationInstanceSelectorMode): string {
  if (mode === "manual") return tr("browser.automationScripts.definitions.label.6a30362");
  if (mode === "existing") return tr("browser.automationScripts.definitions.label.6a30362");
  if (mode === "create") return tr("browser.components.AutomationInstanceSelector.modeLabel.a1eb055");
  if (mode === "rotate") return tr("browser.components.AutomationInstanceSelector.modeLabel.ce09657");
  if (mode === "code") return tr("browser.components.AutomationInstanceSelector.modeLabel.99ec48e");
  return tr("browser.components.AutomationInstanceSelector.modeLabel.b1615f5");
}

function optionsWithFallback(
  options: AutomationInstanceOption[],
  placeholder: string,
  loading?: boolean,
): AutomationInstanceOption[] {
  if (options.length > 0) return options;
  return [{ value: "", label: loading ? tr("browser.components.AutomationInstanceSelector.optionsWithFallback.30350f7") : placeholder }];
}

export function AutomationInstanceSelector({
  title = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.168f9e8"),
  mode,
  modes = ["select", "create", "code"],
  codeSelectLabel = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.1e75bfe"),
  disabled = false,
  loading = false,
  required = false,
  showFields = true,
  error = "",
  selectedProfileId = "",
  selectedCode = "",
  createName = "",
  templateProfileId = "",
  profiles = [],
  profileOptions,
  templateOptions = [],
  selectPlaceholder = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.deb0aa0"),
  templatePlaceholder = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.71fdd5f"),
  codePlaceholder = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.b216cd4"),
  createNamePlaceholder = tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.9c0531d"),
  hint,
  extra,
  onModeChange,
  onSelectProfile,
  onCodeChange,
  onCreateNameChange,
  onTemplateChange,
}: AutomationInstanceSelectorProps) {
  useLocale()

  const resolvedProfileOptions = profileOptions || buildCodeOptions(profiles);
  const codeOptions = optionsWithFallback(
    resolvedProfileOptions,
    selectPlaceholder,
    loading,
  );
  const selectableCodeOptions = resolvedProfileOptions.length
    ? [{ value: "", label: selectPlaceholder }, ...resolvedProfileOptions]
    : codeOptions;
  const selectedCodeOption = resolvedProfileOptions.some(
    (option) => option.value === selectedCode,
  )
    ? selectedCode
    : "";
  const showTabs = modes.length > 1;
  const isExistingMode = mode === "select";
  const showManualInstanceFields = mode === "manual" || mode === "existing";
  const renderCodeSelector = (selectValue: string) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
      <FormItem label={tr("browser.components.AutomationInstanceSelector.label.7dc20c8")} required={required} error={translateMessage(error)}>
        <Input
          value={selectedCode}
          onChange={(event) => onCodeChange?.(event.target.value)}
          placeholder={codePlaceholder}
          className="font-mono "
          disabled={disabled}
        />
      </FormItem>
      <FormItem label={codeSelectLabel}>
        <Select
          value={selectValue}
          options={selectableCodeOptions}
          onChange={(event) => {
            const value = event.target.value;
            if (onSelectProfile) {
              onSelectProfile(value);
              return;
            }
            onCodeChange?.(value);
          }}
          disabled={disabled || resolvedProfileOptions.length === 0}
        />
      </FormItem>
    </div>
  );

  return (
    <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </div>
        {showTabs ? (
          <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-0.5">
            {modes.map((item) => (
              <button
                key={item}
                type="button"
                className={`min-w-[78px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === item
                    ? "border border-[var(--color-border-strong)] bg-black text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
                }`}
                onClick={() => onModeChange?.(item)}
                disabled={disabled}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showFields && isExistingMode ? (
        <div className="mt-3 space-y-2">
          <FormItem label={tr("browser.components.AutomationInstanceSelector.modeLabel.b1615f5")} required={required} error={translateMessage(error)}>
            <Select
              value={selectedProfileId}
              options={optionsWithFallback(
                resolvedProfileOptions,
                selectPlaceholder,
                loading,
              )}
              onChange={(event) => onSelectProfile?.(event.target.value)}
              disabled={disabled || resolvedProfileOptions.length === 0}
            />
          </FormItem>
          {extra}
        </div>
      ) : null}

      {showFields && showManualInstanceFields ? (
        <div className="mt-3 space-y-2">
          {renderCodeSelector(onSelectProfile ? selectedProfileId : selectedCodeOption)}
          {extra}
        </div>
      ) : null}

      {showFields && mode === "create" ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
            <FormItem label={tr("browser.components.AutomationInstanceSelector.label.d1829a3")} required={required}>
              <Input
                value={createName}
                onChange={(event) => onCreateNameChange?.(event.target.value)}
                placeholder={createNamePlaceholder}
                disabled={disabled}
              />
            </FormItem>
            <FormItem label={tr("browser.components.AutomationInstanceSelector.label.d2ec7fb")} required={required} error={translateMessage(error)}>
              <Select
                value={templateProfileId}
                options={optionsWithFallback(
                  templateOptions,
                  templatePlaceholder,
                  loading,
                )}
                onChange={(event) => onTemplateChange?.(event.target.value)}
                disabled={disabled || templateOptions.length === 0}
              />
            </FormItem>
          </div>
          {extra}
        </div>
      ) : null}

      {showFields && mode === "rotate" ? (
        <div className="mt-3 space-y-2">{extra}</div>
      ) : null}

      {showFields && mode === "code" ? (
        <div className="mt-3">
          {renderCodeSelector(selectedCodeOption)}
        </div>
      ) : null}

      {hint ? (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
