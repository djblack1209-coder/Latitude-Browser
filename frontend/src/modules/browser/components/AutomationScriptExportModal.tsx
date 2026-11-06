import { tr, useLocale, localized } from '../../../shared/i18n'
import { useEffect, useState } from "react";
import { Button, Modal } from "../../../shared/components";

export type AutomationScriptExportFormat = "json" | "zip" | "directory";

interface AutomationScriptExportModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (format: AutomationScriptExportFormat) => void;
}

const EXPORT_OPTIONS: Array<{
  value: AutomationScriptExportFormat;
  title: string;
  description: string;
}> = localized(() => ([
  {
    value: "json",
    title: tr("browser.components.AutomationScriptExportModal.title.846c895"),
    description: tr("browser.components.AutomationScriptExportModal.description.1e8c909"),
  },
  {
    value: "zip",
    title: tr("browser.components.AutomationScriptExportModal.title.fab2f65"),
    description: tr("browser.components.AutomationScriptExportModal.description.bb75a56"),
  },
  {
    value: "directory",
    title: tr("browser.components.AutomationScriptExportModal.title.1ecbd0b"),
    description: tr("browser.components.AutomationScriptExportModal.description.059a29d"),
  },
]));

export function AutomationScriptExportModal({
  open,
  busy,
  onClose,
  onSubmit,
}: AutomationScriptExportModalProps) {
  useLocale()

  const [selectedFormat, setSelectedFormat] =
    useState<AutomationScriptExportFormat>("zip");

  useEffect(() => {
    if (open) {
      setSelectedFormat("zip");
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={tr("browser.components.AutomationScriptExportModal.title.70d8514")}
      width="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={() => onSubmit(selectedFormat)} loading={busy}>{tr("browser.components.AutomationScriptExportModal.text.1888967")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {EXPORT_OPTIONS.map((option) => {
          const active = option.value === selectedFormat;
          return (
            <button
              key={option.value}
              type="button"
              className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                active
                  ? "border-[var(--color-border-strong)] bg-[var(--color-bg-secondary)]"
                  : "border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-strong)]"
              }`}
              onClick={() => setSelectedFormat(option.value)}
              disabled={busy}
            >
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {option.title}
              </div>
              <div className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
