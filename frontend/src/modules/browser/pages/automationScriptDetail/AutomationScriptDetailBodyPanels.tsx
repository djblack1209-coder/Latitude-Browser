import { translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
import { ChevronDown, ChevronRight, Copy, Play, Settings } from "lucide-react";
import {
  Badge,
  Button,
  FormItem,
  Textarea,
} from "../../../../shared/components";
import type {
  AutomationScriptPublicAPIConfig,
  AutomationScriptRecord,
} from "../../automationScripts";
import type { ScriptParamsHelpContent } from "./paramsHelp";
import {
  buildRuntimeSessionHttpPreview,
  type DualRuntimePreviewResult,
} from "./helpers";
import {
  CompactMetaField,
  DetailPanel,
  FieldLabelWithHelp,
} from "./shared";

interface AutomationScriptDetailBodyPanelsProps {
  draft: AutomationScriptRecord;
  busy: boolean;
  isDualInstanceRuntimeScript: boolean;
  isLaunchApiScript: boolean;
  usesManualSelector: boolean;
  resolvedPublicAPI: AutomationScriptPublicAPIConfig;
  publicAPIPath: string;
  publicAPIURL: string;
  publicApiExpanded: boolean;
  paramsHelp: ScriptParamsHelpContent | null;
  launchBaseUrl: string;
  apiAuthHeader: string;
  dualRuntimePreview: DualRuntimePreviewResult;
  showDualRuntimeRequests: boolean;
  openClawDualSiteCommand: string;
  onUpdateDraft: (patch: Partial<AutomationScriptRecord>) => void;
  onOpenTargetConfig: () => void;
  onOpenPublicApiManager: () => void;
  onOpenPublicApiTester: () => void;
  onTogglePublicApiExpanded: () => void;
  onCopyPublicApiUrl: () => void;
  onToggleDualRuntimeRequests: () => void;
  onCopyOpenClawCommand: () => void;
  onOpenParamsHelp: () => void;
}

function formatManualSelectorSummary(selectorText: string): string {
  const normalized = selectorText.trim();
  if (!normalized) {
    return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.fb8810a");
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.455a4c6");
    }
    const selector = parsed as Record<string, unknown>;
    const code = String(selector.code || "").trim();
    if (code) {
      return `Code：${code}`;
    }
    const profileName = String(selector.profileName || "").trim();
    if (profileName) {
      return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.aa2fe30", [profileName]);
    }
    const profileId = String(selector.profileId || "").trim();
    if (profileId) {
      return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.fb6e878", [profileId]);
    }
    return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.455a4c6");
  } catch {
    return tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.formatManualSelectorSummary.455a4c6");
  }
}

export function AutomationScriptDetailBodyPanels({
  draft,
  busy,
  isDualInstanceRuntimeScript,
  isLaunchApiScript,
  usesManualSelector,
  resolvedPublicAPI,
  publicAPIPath,
  publicAPIURL,
  publicApiExpanded,
  paramsHelp,
  launchBaseUrl,
  apiAuthHeader,
  dualRuntimePreview,
  showDualRuntimeRequests,
  openClawDualSiteCommand,
  onUpdateDraft,
  onOpenTargetConfig,
  onOpenPublicApiManager,
  onOpenPublicApiTester,
  onTogglePublicApiExpanded,
  onCopyPublicApiUrl,
  onToggleDualRuntimeRequests,
  onCopyOpenClawCommand,
  onOpenParamsHelp,
}: AutomationScriptDetailBodyPanelsProps) {
  useLocale()

  return (
    <>
      <DetailPanel
        title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.title.11594ed")}
        actions={
          <>
            <Badge
              variant={resolvedPublicAPI.enabled ? "success" : "default"}
              size="sm"
            >
              {resolvedPublicAPI.enabled ? tr("browser.components.AutomationScriptPublicApiModalView.AutomationScriptPublicApiModalView.25d2843") : tr("browser.automationRuntime.getAutomationRuntimeBadgeText.8bb38ef")}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onTogglePublicApiExpanded}
              aria-expanded={publicApiExpanded}
            >
              {publicApiExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {publicApiExpanded ? tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.a86af73") : tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.1f43c28")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onCopyPublicApiUrl}
              disabled={busy}
            >
              <Copy className="h-4 w-4" />{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.8b9c9ed")}</Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onOpenPublicApiTester}
              disabled={busy}
            >
              <Play className="h-4 w-4" />{tr("browser.components.AutomationScriptPublicApiModalView.text.0152e9c")}</Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onOpenPublicApiManager}
              disabled={busy}
            >{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.4989b5c")}</Button>
          </>
        }
      >
        <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
          <div className="text-[11px] font-semibold   text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.0e2d9b0")}</div>
          <div className="mt-2 break-all text-sm font-medium text-[var(--color-text-primary)]">
            {publicAPIURL}
          </div>
        </div>

        {publicApiExpanded ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CompactMetaField label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.8830694")} value={resolvedPublicAPI.method} />
              <CompactMetaField label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.519e391")} value={<code>{publicAPIPath}</code>} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <CompactMetaField
                label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.3b7ddba")}
                value={<code>{"instance / params / timeoutMs"}</code>}
              />
              <CompactMetaField
                label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.31f4220")}
                value={<code>{"ok / status / message / data"}</code>}
              />
              <CompactMetaField
                label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.d4c45de")}
                value={`${resolvedPublicAPI.timeoutMs} ms`}
              />
            </div>
          </>
        ) : null}
      </DetailPanel>

      {isDualInstanceRuntimeScript ? (
        <DetailPanel title={tr("browser.components.AutomationScriptRunModal.AutomationScriptRunModal.46155bb")}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CompactMetaField label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.8830694")} value={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.61ff81c")} />
              <CompactMetaField label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.519e391")} value={<code>/api/runtime/session</code>} />
              <CompactMetaField
                label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.1dbd61f")}
                value={<span className="break-all">{launchBaseUrl}</span>}
              />
              <CompactMetaField
                label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.15a52fa")}
                value={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.78d0ccd", [dualRuntimePreview.requests.length || 0])}
              />
            </div>

            {dualRuntimePreview.error ? (
              <div className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-3 text-sm text-[var(--color-text-secondary)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.7efb012")}{" "}
                <code>{translateMessage(dualRuntimePreview.error)}</code>
              </div>
            ) : null}

            {dualRuntimePreview.requests.length > 0 ? (
              <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.a96d8f4")}{dualRuntimePreview.requests.length}{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.d0f4afc")}</div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onToggleDualRuntimeRequests}
                  >
                    {showDualRuntimeRequests ? tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.2e4830d") : tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.a8b345f")}
                  </Button>
                </div>
                {showDualRuntimeRequests ? (
                  <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {dualRuntimePreview.requests.map((request, index) => (
                      <div
                        key={`${request.code}-${index}`}
                        className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-3 py-3"
                      >
                        <div className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.f495347")}{index + 1}{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.a1f87da")}<code>{request.code}</code>
                        </div>
                        <pre className="overflow-x-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3 text-xs leading-6 text-[var(--color-text-secondary)]">
                          <code>
                            {buildRuntimeSessionHttpPreview(
                              launchBaseUrl,
                              apiAuthHeader,
                              request.payload,
                            )}
                          </code>
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.9560c4c")}</div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onCopyOpenClawCommand}
                >
                  <Copy className="h-4 w-4" />{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.5aadf3a")}</Button>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] p-3 text-xs leading-6 text-[var(--color-text-secondary)]">
                <code>{openClawDualSiteCommand}</code>
              </pre>
            </div>

            <FormItem label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.17eaaaa")}>
              <Textarea
                rows={12}
                value={draft.paramsText}
                onChange={(event) =>
                  onUpdateDraft({ paramsText: event.target.value })
                }
                className="font-mono"
                placeholder={`{
  "browsers": [
    { "code": "BUYER_001", "skipDefaultStartUrls": true },
    { "code": "BUYER_002", "skipDefaultStartUrls": true }
  ],
  "timeoutMs": 45000
}`}
                disabled={busy}
              />
            </FormItem>
          </div>
        </DetailPanel>
      ) : (
        <>
          {usesManualSelector ? (
            <DetailPanel
              title={tr("browser.components.AutomationScriptRunModal.AutomationScriptRunModal.53327e5")}
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onOpenTargetConfig}
                  disabled={busy}
                >
                  <Settings className="h-4 w-4" />{tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.1e75bfe")}</Button>
              }
            >
              <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
                <div className="text-[11px] font-semibold   text-[var(--color-text-muted)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.eeb54b8")}</div>
                <div className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
                  {formatManualSelectorSummary(draft.selectorText)}
                </div>
              </div>
            </DetailPanel>
          ) : null}

          <DetailPanel title={resolvedPublicAPI.enabled ? tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.ac90131") : tr("browser.components.AutomationScriptRunModal.AutomationScriptRunModal.b215c99")}>
            <FormItem
              label={
                paramsHelp ? (
                  <FieldLabelWithHelp label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.031a4e7")} onOpen={onOpenParamsHelp} />
                ) : (
                  tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.031a4e7")
                )
              }
            >
              <Textarea
                rows={12}
                value={draft.paramsText}
                onChange={(event) =>
                  onUpdateDraft({ paramsText: event.target.value })
                }
                className="font-mono"
                placeholder='{"startUrls":["https://example.com"]}'
                disabled={busy}
              />
            </FormItem>
          </DetailPanel>
        </>
      )}

      {isLaunchApiScript ? (
        <DetailPanel title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.title.1d693ac")}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CompactMetaField label={tr("browser.components.AutomationScriptHistoryModal.text.e4e46c7")} value={tr("browser.pages.AutomationPage.helpers.getAutomationModeLabel.b65f076")} />
            <CompactMetaField label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.9e3eff7")} value={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.value.2072850")} />
            <CompactMetaField
              label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.507520d")}
              value={
                isDualInstanceRuntimeScript ? tr("browser.components.AutomationScriptRunModal.AutomationScriptRunModal.46155bb") : tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.AutomationScriptDetailBodyPanels.f3cfd1a")
              }
            />
          </div>
          <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.text.9484679")}</div>
        </DetailPanel>
      ) : (
        <DetailPanel title={tr("browser.components.AutomationScriptHistoryModal.text.7fbccbe")}>
          <FormItem label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.2a33eaa")}>
            <Textarea
              rows={24}
              value={draft.scriptText}
              onChange={(event) =>
                onUpdateDraft({ scriptText: event.target.value })
              }
              className="min-h-[520px] font-mono leading-6"
              placeholder={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.40db77a")}
            />
          </FormItem>
        </DetailPanel>
      )}
    </>
  );
}
