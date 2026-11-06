import { tr, useLocale } from '../../../shared/i18n'
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, toast } from "../../../shared/components";
import { deleteAutomationScript, exportAutomationScriptDirectory, exportAutomationScriptTemplate, exportAutomationScriptZip, refreshAutomationScript, saveAutomationScript } from "../automationScriptApi";
import {
  AutomationScriptExportModal,
  type AutomationScriptExportFormat,
} from "../components/AutomationScriptExportModal";
import { AutomationScriptPublicApiModal } from "../components/AutomationScriptPublicApiModal";
import { AutomationScriptRunModal } from "../components/AutomationScriptRunModal";
import {
  DUAL_INSTANCE_RUNTIME_SCRIPT_ID, buildAutomationScriptPublicAPIPath, canRefreshAutomationScriptSource,
  resolveAutomationScriptPublicAPIConfig,
  type AutomationScriptPublicAPIConfig, type AutomationScriptRecord,
} from "../automationScripts";
import { useLaunchContext } from "../hooks/useLaunchContext";
import { AutomationScriptDetailModals } from "./automationScriptDetail/AutomationScriptDetailModals";
import { AutomationScriptDetailPanels } from "./automationScriptDetail/AutomationScriptDetailPanels";
import {
  buildDualRuntimeRequestPreviews, buildOpenClawDualSiteCommand, buildPersistablePublicAPIConfig,
  hasSamePublicAPIConfig, preparePublicAPIConfigForCompare,
  validatePublicAPIConfig, validateTargetConfig,
} from "./automationScriptDetail/helpers";
import { getScriptParamsHelp } from "./automationScriptDetail/paramsHelp";
import { useAutomationScriptDetailState } from "./automationScriptDetail/useAutomationScriptDetailState";

export function AutomationScriptDetailPage() {
  useLocale()

  const navigate = useNavigate();
  const { scriptId = "" } = useParams();
  const { launchBaseUrl, apiAuth } = useLaunchContext();
  const {
    draft,
    setDraft,
    profiles,
    loading,
    notFound,
    dirty,
    setDirty,
    runModalOpen,
    setRunModalOpen,
    exportModalOpen,
    setExportModalOpen,
    publicApiModalOpen,
    setPublicApiModalOpen,
    publicApiTestFocusTrigger,
    setPublicApiTestFocusTrigger,
    publicApiExpanded,
    setPublicApiExpanded,
    paramsHelpOpen,
    setParamsHelpOpen,
    showDualRuntimeRequests,
    setShowDualRuntimeRequests,
    busyAction,
    setBusyAction,
    updateDraft,
    updateTargetConfig,
    updatePublicAPI,
  } = useAutomationScriptDetailState(scriptId);

  const leavePage = () => {
    if (dirty && !window.confirm(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.71ece1c"))) {
      return;
    }
    navigate("/browser/automation");
  };

  const validateDraftForSave = (script: AutomationScriptRecord): boolean => {
    if (!script.name.trim()) {
      toast.warning(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.1d9778f"));
      return false;
    }
    if (!script.scriptText.trim()) {
      toast.warning(
        script.type === "launch-api"
          ? tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.444aff5")
          : tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.5a69755"),
      );
      return false;
    }

    const targetConfigError = validateTargetConfig(script.targetConfig);
    if (targetConfigError) {
      toast.warning(targetConfigError);
      return false;
    }

    const publicAPIError = validatePublicAPIConfig(script.publicAPI);
    if (publicAPIError) {
      toast.warning(publicAPIError);
      return false;
    }

    return true;
  };

  const persistDraft = async (
    script: AutomationScriptRecord,
    options?: { successMessage?: string; silentSuccess?: boolean },
  ): Promise<AutomationScriptRecord | null> => {
    const scriptToSave = {
      ...script,
      name: script.name.trim(),
      description: script.description.trim(),
      scriptText: script.scriptText,
      publicAPI: buildPersistablePublicAPIConfig(script),
      updatedAt: new Date().toISOString(),
    };
    if (!validateDraftForSave(scriptToSave)) {
      return null;
    }

    setBusyAction("save");
    try {
      const saved = await saveAutomationScript(scriptToSave);
      setDraft(saved);
      setDirty(false);
      if (!options?.silentSuccess) {
        toast.success(options?.successMessage || tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.a1fd745"));
      }
      return saved;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.8b114c8");
      toast.error(message);
      return null;
    } finally {
      setBusyAction("none");
    }
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    await persistDraft(draft, { successMessage: tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.a1fd745") });
  };

  const handleOpenPublicApiManager = () => {
    setPublicApiTestFocusTrigger(0);
    setPublicApiModalOpen(true);
  };
  const handleOpenPublicApiTester = () => {
    setPublicApiTestFocusTrigger((current) => current + 1);
    setPublicApiModalOpen(true);
  };

  const handlePreparePublicApiInvoke = async (
    publicAPI: AutomationScriptPublicAPIConfig,
  ): Promise<boolean> => {
    if (!draft) {
      return false;
    }

    const currentPublicAPI = preparePublicAPIConfigForCompare(draft);
    const nextPublicAPI = preparePublicAPIConfigForCompare(draft, publicAPI);
    const nextDraft = {
      ...draft,
      publicAPI,
    };
    if (!dirty && hasSamePublicAPIConfig(currentPublicAPI, nextPublicAPI)) {
      return true;
    }

    const saved = await persistDraft(nextDraft, { silentSuccess: true });
    return Boolean(saved);
  };

  const handleOpenRunModal = () => {
    if (draft) setRunModalOpen(true);
  };

  const handleDelete = async () => {
    if (!draft) {
      return;
    }
    if (!window.confirm(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.0cb86b1", [draft.name || tr("browser.automationScripts.normalizeScriptRecord.2a05a0f")]))) {
      return;
    }

    setBusyAction("delete");
    try {
      await deleteAutomationScript(draft.id);
      toast.success(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.7263783"));
      navigate("/browser/automation", { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.a0d737c");
      toast.error(message);
    } finally {
      setBusyAction("none");
    }
  };

  const handleRefresh = async () => {
    if (!draft) {
      return;
    }
    if (!canRefreshAutomationScriptSource(draft.source)) {
      toast.warning(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.7f2aa90"));
      return;
    }
    if (dirty) {
      toast.warning(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.e4bdfb4"));
      return;
    }
    if (!window.confirm(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.d01117e"))) {
      return;
    }

    setBusyAction("refresh");
    try {
      const refreshed = await refreshAutomationScript(draft.id);
      setDraft(refreshed);
      setDirty(false);
      toast.success(
        draft.source.type === "git" ? tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.48af931") : tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.4651cbf"),
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.5cd6e75");
      toast.error(message);
    } finally {
      setBusyAction("none");
    }
  };

  const handleOpenExportModal = () => {
    if (draft) setExportModalOpen(true);
  };

  const handleExport = async (format: AutomationScriptExportFormat) => {
    if (!draft) {
      return;
    }
    if (dirty) {
      toast.warning(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.bf428f7"));
      return;
    }

    setBusyAction("export");
    try {
      const result =
        format === "json"
          ? await exportAutomationScriptTemplate(draft.id, draft)
          : format === "directory"
            ? await exportAutomationScriptDirectory(draft.id)
            : await exportAutomationScriptZip(draft.id);
      if (result.cancelled) {
        setExportModalOpen(false);
        return;
      }

      setExportModalOpen(false);
      switch (format) {
        case "directory":
          toast.success(
            result.fileCount > 1
              ? tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.bea4f08", [result.fileCount])
              : result.message || tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.2cc9c35"),
          );
          break;
        case "zip":
          toast.success(
            result.fileCount > 1
              ? tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.956b269", [result.fileCount])
              : result.message || tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.f76ad10"),
          );
          break;
        default:
          toast.success(
            result.fileCount > 1
              ? tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.4bde333", [result.fileCount])
              : result.message || tr("browser.automationScriptApi.exports.message.2043de9"),
          );
          break;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : tr("browser.pages.AutomationPage.AutomationPage.ad0c1d4");
      toast.error(message);
    } finally {
      setBusyAction("none");
    }
  };

  if (loading) {
    return <div className="animate-fade-in rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-6 py-12 text-center text-sm text-[var(--color-text-muted)]">{tr("browser.pages.AutomationScriptDetailPage.text.57e8174")}</div>;
  }
  if (notFound || !draft) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button variant="secondary" size="sm" onClick={() => navigate("/browser/automation")}>
          <ArrowLeft className="h-4 w-4" />{tr("browser.pages.AutomationScriptDetailPage.text.53505b1")}</Button>
        <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-6 py-12 text-center text-sm text-[var(--color-text-muted)]">{tr("browser.pages.AutomationScriptDetailPage.text.893dae3")}</div>
      </div>
    );
  }

  const busy = busyAction !== "none";
  const canRefresh = canRefreshAutomationScriptSource(draft.source);
  const isDualInstanceRuntimeScript = draft.id === DUAL_INSTANCE_RUNTIME_SCRIPT_ID;
  const isLaunchApiScript = draft.type === "launch-api";
  const usesManualSelector =
    draft.targetConfig.mode === "manual" || draft.targetConfig.mode === "existing";
  const resolvedPublicAPI = resolveAutomationScriptPublicAPIConfig(draft);
  const publicAPIPath = buildAutomationScriptPublicAPIPath(resolvedPublicAPI.path);
  const publicAPIURL = `${launchBaseUrl}${publicAPIPath}`;
  const paramsHelp = getScriptParamsHelp(draft);
  const dualRuntimePreview = isDualInstanceRuntimeScript
    ? buildDualRuntimeRequestPreviews(draft.paramsText)
    : { requests: [], error: "" };
  const dualRuntimeCodes = dualRuntimePreview.requests.map((request) => request.code);
  const openClawDualSiteCommand = buildOpenClawDualSiteCommand(draft.id, dualRuntimeCodes);
  const handleCopyOpenClawCommand = async () => {
    try {
      await navigator.clipboard.writeText(openClawDualSiteCommand);
      toast.success(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.240622a"));
    } catch {
      toast.error(tr("browser.components.AutomationScriptPublicApiModal.helpers.copyText.f2c6b51"));
    }
  };

  const handleCopyPublicApiUrl = async () => {
    const currentPublicAPI = preparePublicAPIConfigForCompare(draft);
    const nextPublicAPI = preparePublicAPIConfigForCompare(
      draft,
      resolvedPublicAPI,
    );
    const needsPersist =
      dirty || !hasSamePublicAPIConfig(currentPublicAPI, nextPublicAPI);
    if (needsPersist) {
      const saved = await persistDraft(
        {
          ...draft,
          publicAPI: resolvedPublicAPI,
        },
        { silentSuccess: true },
      );
      if (!saved) {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(publicAPIURL);
      toast.success(tr("browser.pages.AutomationScriptDetailPage.AutomationScriptDetailPage.8555d6f"));
    } catch {
      toast.error(tr("browser.components.AutomationScriptPublicApiModal.helpers.copyText.f2c6b51"));
    }
  };

  return (
    <>
      <AutomationScriptDetailPanels
        draft={draft}
        dirty={dirty}
        busy={busy}
        busyAction={busyAction}
        canRefresh={canRefresh}
        isDualInstanceRuntimeScript={isDualInstanceRuntimeScript}
        isLaunchApiScript={isLaunchApiScript}
        usesManualSelector={usesManualSelector}
        resolvedPublicAPI={resolvedPublicAPI}
        publicAPIPath={publicAPIPath}
        publicAPIURL={publicAPIURL}
        publicApiExpanded={publicApiExpanded}
        paramsHelp={paramsHelp}
        launchBaseUrl={launchBaseUrl}
        apiAuthHeader={apiAuth.enabled ? apiAuth.header : ""}
        dualRuntimePreview={dualRuntimePreview}
        showDualRuntimeRequests={showDualRuntimeRequests}
        openClawDualSiteCommand={openClawDualSiteCommand}
        onLeavePage={leavePage}
        onUpdateDraft={updateDraft}
        onUpdateTargetConfig={updateTargetConfig}
        onOpenRunModal={handleOpenRunModal}
        onOpenPublicApiManager={handleOpenPublicApiManager}
        onOpenPublicApiTester={handleOpenPublicApiTester}
        onOpenExportModal={handleOpenExportModal}
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
        onRefresh={() => void handleRefresh()}
        onOpenExistingTargetConfig={() => {
          updateTargetConfig({ mode: "existing" });
        }}
        onTogglePublicApiExpanded={() =>
          setPublicApiExpanded((current) => !current)
        }
        onCopyPublicApiUrl={() => void handleCopyPublicApiUrl()}
        onToggleDualRuntimeRequests={() =>
          setShowDualRuntimeRequests((current) => !current)
        }
        onCopyOpenClawCommand={() => void handleCopyOpenClawCommand()}
        onOpenParamsHelp={() => setParamsHelpOpen(true)}
      />

      <AutomationScriptRunModal
        open={runModalOpen}
        script={draft}
        dirty={dirty}
        onClose={() => setRunModalOpen(false)}
      />
      <AutomationScriptExportModal
        open={exportModalOpen}
        busy={busyAction === "export"}
        onClose={() => setExportModalOpen(false)}
        onSubmit={(format) => void handleExport(format)}
      />
      <AutomationScriptPublicApiModal
        open={publicApiModalOpen}
        script={draft}
        busy={busy}
        launchBaseUrl={launchBaseUrl}
        apiAuthEnabled={apiAuth.enabled}
        apiAuthHeader={apiAuth.header}
        profiles={profiles}
        focusTestTrigger={publicApiTestFocusTrigger}
        onClose={() => setPublicApiModalOpen(false)}
        onChange={updatePublicAPI}
        onBeforeInvoke={handlePreparePublicApiInvoke}
      />
      <AutomationScriptDetailModals
        paramsHelp={paramsHelp}
        paramsHelpOpen={paramsHelpOpen}
        onCloseParamsHelp={() => setParamsHelpOpen(false)}
      />
    </>
  );
}
