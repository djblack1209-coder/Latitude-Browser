import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
﻿import { Copy, FolderOpen } from "lucide-react";
import { Badge, Button, Textarea } from "../../../shared/components";
import type { AutomationScriptRunRecord } from "../automationScripts";
import {
  copyToClipboard,
  formatDateTime,
  formatDuration,
  formatRunResultOutputName,
  formatRunResultText,
  parseRunResultOutputs,
} from "./AutomationScriptRunModal.helpers";

interface AutomationScriptRunResultPanelProps {
  lastRun: AutomationScriptRunRecord;
  handleOpenOutputPath: (path: string) => Promise<void>;
}

export function AutomationScriptRunResultPanel({
  lastRun,
  handleOpenOutputPath,
}: AutomationScriptRunResultPanelProps) {
  useLocale()

  const resultOutputs = parseRunResultOutputs(lastRun.resultText);
  const formattedResultText = formatRunResultText(lastRun.resultText);

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={lastRun.status === "success" ? "success" : "error"}
            size="sm"
            dot
          >
            {lastRun.status === "success" ? tr("browser.components.AutomationScriptRunResultPanel.AutomationScriptRunResultPanel.6c189aa") : tr("browser.components.AutomationScriptRunResultPanel.AutomationScriptRunResultPanel.9746cfc")}
          </Badge>
          <span className="text-sm text-[var(--color-text-primary)]">
            {lastRun.summary || tr("browser.components.AutomationScriptRunResultPanel.AutomationScriptRunResultPanel.b8955d3")}
          </span>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatDateTime(lastRun.startedAt)} · {formatDuration(lastRun.durationMs)}
        </div>
      </div>

      {lastRun.error && (
        <div className="mt-3 break-all text-sm text-[var(--color-error)]">
          {translateMessage(lastRun.error)}
        </div>
      )}

      {lastRun.resultText && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-[var(--color-text-muted)]">{tr("browser.components.AutomationScriptRunResultPanel.text.c14a48a")}</div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void copyToClipboard(formattedResultText, tr("browser.components.AutomationScriptRunResultPanel.AutomationScriptRunResultPanel.02c7a1b"))}
            >
              <Copy className="h-3.5 w-3.5" />{tr("browser.components.AutomationScriptRunResultPanel.text.0d6cb0c")}</Button>
          </div>
          <Textarea rows={10} value={formattedResultText} readOnly className="font-mono" />
          {resultOutputs.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
              <div className="space-y-2">
                {resultOutputs.map((output) => (
                  <div
                    key={`${output.key}-${output.path}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--color-text-primary)]">
                        {output.label} · {formatRunResultOutputName(output.path)}
                      </div>
                      <div className="mt-1 break-all text-xs text-[var(--color-text-muted)]">
                        {output.path}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleOpenOutputPath(output.path)}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />{tr("browser.components.AutomationScriptPublicApiModalView.text.3120403")}</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
