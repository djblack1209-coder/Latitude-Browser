import { tr, useLocale } from '../../../../shared/i18n'
import {
  ArrowLeft,
  Download,
  Link,
  Play,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  Button,
  FormItem,
  Input,
  Select,
  Textarea,
} from "../../../../shared/components";
import {
  AUTOMATION_SCRIPT_STATUS_OPTIONS,
  getAutomationScriptRefreshLabel,
  getAutomationScriptTypeLabel,
  type AutomationScriptTargetConfig,
  type AutomationScriptPublicAPIConfig,
  type AutomationScriptRecord,
  type AutomationScriptStatus,
} from "../../automationScripts";
import { WorkspaceHeader } from "../../../../shared/components/SignalPrimitives";
import { AutomationInstanceSelector } from "../../components/AutomationInstanceSelector";
import type { ScriptParamsHelpContent } from "./paramsHelp";
import {
  formatDateTime,
  formatScriptSource,
  type DualRuntimePreviewResult,
} from "./helpers";
import { AutomationScriptDetailBodyPanels } from "./AutomationScriptDetailBodyPanels";
import {
  CompactMetaField,
  DetailPanel,
  StructuredInfoCell,
} from "./shared";
import type { AutomationScriptDetailBusyAction } from "./useAutomationScriptDetailState";

interface AutomationScriptDetailPanelsProps {
  draft: AutomationScriptRecord;
  dirty: boolean;
  busy: boolean;
  busyAction: AutomationScriptDetailBusyAction;
  canRefresh: boolean;
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
  onLeavePage: () => void;
  onUpdateDraft: (patch: Partial<AutomationScriptRecord>) => void;
  onUpdateTargetConfig: (patch: Partial<AutomationScriptTargetConfig>) => void;
  onOpenRunModal: () => void;
  onOpenPublicApiManager: () => void;
  onOpenPublicApiTester: () => void;
  onOpenExportModal: () => void;
  onSave: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onOpenExistingTargetConfig: () => void;
  onTogglePublicApiExpanded: () => void;
  onCopyPublicApiUrl: () => void;
  onToggleDualRuntimeRequests: () => void;
  onCopyOpenClawCommand: () => void;
  onOpenParamsHelp: () => void;
}

export function AutomationScriptDetailPanels({
  draft,
  dirty,
  busy,
  busyAction,
  canRefresh,
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
  onLeavePage,
  onUpdateDraft,
  onUpdateTargetConfig,
  onOpenRunModal,
  onOpenPublicApiManager,
  onOpenPublicApiTester,
  onOpenExportModal,
  onSave,
  onDelete,
  onRefresh,
  onOpenExistingTargetConfig,
  onTogglePublicApiExpanded,
  onCopyPublicApiUrl,
  onToggleDualRuntimeRequests,
  onCopyOpenClawCommand,
  onOpenParamsHelp,
}: AutomationScriptDetailPanelsProps) {
  useLocale()

  return (
    <div className="space-y-5 animate-fade-in">
      <WorkspaceHeader title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.title.9667ec3")}  />
      <section className="signal-panel rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onLeavePage}>
            <ArrowLeft className="h-4 w-4" />{tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.text.36cbfa4")}</Button>
          <div className="min-w-[220px] flex-1">
            <Input
              value={draft.name}
              onChange={(event) => onUpdateDraft({ name: event.target.value })}
              aria-label={tr("browser.components.AutomationScriptHistoryModal.label.22dfd39")}
              placeholder={tr("browser.components.AutomationScriptHistoryModal.label.22dfd39")}
              className="h-9 text-sm font-semibold"
            />
          </div>
          {canRefresh ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onRefresh}
              loading={busyAction === "refresh"}
              disabled={busyAction !== "none" && busyAction !== "refresh"}
            >
              <RefreshCw className="h-4 w-4" />
              {getAutomationScriptRefreshLabel(draft.source)}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={onOpenRunModal}
            disabled={busyAction !== "none"}
          >
            <Play className="h-4 w-4" />{tr("browser.components.AutomationScriptRunModalView.title.0ee58c6")}</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={
              resolvedPublicAPI.enabled
                ? onOpenPublicApiTester
                : onOpenPublicApiManager
            }
            disabled={busyAction !== "none"}
          >
            <Link className="h-4 w-4" />
            {resolvedPublicAPI.enabled ? tr("browser.pages.AutomationScriptSummaryCard.AutomationScriptSummaryCard.8da5fa5") : tr("browser.pages.AutomationScriptSummaryCard.AutomationScriptSummaryCard.5d1bf23")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenExportModal}
            loading={busyAction === "export"}
            disabled={busyAction !== "none" && busyAction !== "export"}
          >
            <Download className="h-4 w-4" />{tr("browser.components.AutomationScriptExportModal.text.1888967")}</Button>
          <Button
            size="sm"
            onClick={onSave}
            loading={busyAction === "save"}
            disabled={busyAction !== "none" && busyAction !== "save"}
          >
            <Save className="h-4 w-4" />{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            loading={busyAction === "delete"}
            disabled={busyAction !== "none" && busyAction !== "delete"}
          >
            <Trash2 className="h-4 w-4" />{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <DetailPanel title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.title.41654e0")} className="h-full">
          <FormItem label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.label.412f54d")}>
            <Textarea
              rows={2}
              value={draft.description}
              onChange={(event) =>
                onUpdateDraft({ description: event.target.value })
              }
              placeholder={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.placeholder.560e90b")}
            />
          </FormItem>

          <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            <div className="grid grid-cols-1 divide-y divide-[var(--color-border-muted)] md:grid-cols-2 md:divide-x md:divide-y xl:grid-cols-4 xl:divide-y-0">
              <StructuredInfoCell label={tr("browser.components.AutomationScriptHistoryModal.text.e4e46c7")}>
                {getAutomationScriptTypeLabel(draft.type)}
              </StructuredInfoCell>
              <StructuredInfoCell label={tr("browser.components.AutomationScriptHistoryModal.text.62e951a")}>
                <Select
                  value={draft.status}
                  options={AUTOMATION_SCRIPT_STATUS_OPTIONS}
                  onChange={(event) =>
                    onUpdateDraft({
                      status: event.target.value as AutomationScriptStatus,
                    })
                  }
                  className="h-9"
                  disabled={busy}
                />
              </StructuredInfoCell>
              <StructuredInfoCell label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.label.80920cd")}>
                {formatDateTime(draft.updatedAt)}
              </StructuredInfoCell>
              <StructuredInfoCell label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.label.07014cd")}>
                <span
                  className={dirty ? "text-[var(--color-warning)]" : undefined}
                >
                  {dirty ? tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.AutomationScriptDetailPanels.4123f1f") : tr("settings.components.ConnectorSettingsPanel.text.cdfab96")}
                </span>
              </StructuredInfoCell>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2.5">
            <div className="text-sm text-[var(--color-text-secondary)]">
              {formatScriptSource(draft)}
            </div>
            {draft.source.importedAt ? (
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">{tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.text.79cf24d")}{formatDateTime(draft.source.importedAt)}
              </div>
            ) : null}
          </div>
        </DetailPanel>

        {isDualInstanceRuntimeScript ? (
          <DetailPanel title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.title.f86c105")} className="h-full">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <CompactMetaField label={tr("browser.components.AutomationScriptHistoryModal.text.e4e46c7")} value={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.value.1769945")} />
              <CompactMetaField label={tr("browser.pages.automationScriptDetail.AutomationScriptDetailBodyPanels.label.9e3eff7")} value={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.value.6c82daf")} />
              <CompactMetaField label={tr("ui.modules.browser.pages.automationScriptDetail.AutomationScriptDetailPanels.label.b240d04")} value={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.value.c3f69fa")} />
            </div>
          </DetailPanel>
        ) : (
          <DetailPanel
            title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.title.7235946")}
            className="h-full"
          >
            <AutomationInstanceSelector
              title={tr("browser.pages.automationScriptDetail.AutomationScriptDetailPanels.title.ba9e1c7")}
              mode={
                draft.targetConfig.mode === "existing"
                  ? "manual"
                  : draft.targetConfig.mode
              }
              modes={["manual", "create", "rotate"]}
              showFields={false}
              disabled={busy}
              onModeChange={(mode) =>
                onUpdateTargetConfig({
                  mode: mode as AutomationScriptTargetConfig["mode"],
                })
              }
            />
          </DetailPanel>
        )}
      </div>

      <AutomationScriptDetailBodyPanels
        draft={draft}
        busy={busy}
        isDualInstanceRuntimeScript={isDualInstanceRuntimeScript}
        isLaunchApiScript={isLaunchApiScript}
        usesManualSelector={usesManualSelector}
        resolvedPublicAPI={resolvedPublicAPI}
        publicAPIPath={publicAPIPath}
        publicAPIURL={publicAPIURL}
        publicApiExpanded={publicApiExpanded}
        paramsHelp={paramsHelp}
        launchBaseUrl={launchBaseUrl}
        apiAuthHeader={apiAuthHeader}
        dualRuntimePreview={dualRuntimePreview}
        showDualRuntimeRequests={showDualRuntimeRequests}
        openClawDualSiteCommand={openClawDualSiteCommand}
        onUpdateDraft={onUpdateDraft}
        onOpenTargetConfig={onOpenExistingTargetConfig}
        onOpenPublicApiManager={onOpenPublicApiManager}
        onOpenPublicApiTester={onOpenPublicApiTester}
        onTogglePublicApiExpanded={onTogglePublicApiExpanded}
        onCopyPublicApiUrl={onCopyPublicApiUrl}
        onToggleDualRuntimeRequests={onToggleDualRuntimeRequests}
        onCopyOpenClawCommand={onCopyOpenClawCommand}
        onOpenParamsHelp={onOpenParamsHelp}
      />
    </div>
  );
}
