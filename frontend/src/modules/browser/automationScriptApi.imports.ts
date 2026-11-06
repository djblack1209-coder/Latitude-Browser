import { tr } from '../../shared/i18n'
import { importAutomationScript, type AutomationScriptRecord } from "./automationScripts";
import { getBindings, normalizeAutomationScriptRecord, type AutomationScriptBatchImportResult } from "./automationScriptApi.shared";

export async function importAutomationScriptFromLocalFile(): Promise<AutomationScriptRecord> {
  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportLocalFile) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptImportLocalFile(),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportLocalFile === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptImportLocalFile(),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromLocalFile.ea85856"));
}

export async function importAutomationScriptFromText(
  text: string,
): Promise<AutomationScriptRecord> {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromText.9b6e1c6"));
  }

  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportText) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptImportText(normalizedText),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportText === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptImportText(normalizedText),
    );
  }

  return importAutomationScript(normalizedText);
}

export async function importAutomationScriptFromLocalDirectory(): Promise<AutomationScriptRecord> {
  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportLocalDirectory) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptImportLocalDirectory(),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportLocalDirectory === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptImportLocalDirectory(),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromLocalDirectory.4ccd376"));
}

function normalizeAutomationScriptBatchImportResult(
  payload: any,
): AutomationScriptBatchImportResult {
  const imported = Array.isArray(payload?.imported)
    ? payload.imported.map(normalizeAutomationScriptRecord)
    : [];

  return {
    imported,
    failed: Array.isArray(payload?.failed)
      ? payload.failed.map((item: any) => ({
          path: String(item?.path || ""),
          message: String(item?.message || ""),
        }))
      : [],
    scanned:
      Number.isFinite(Number(payload?.scanned)) && Number(payload.scanned) > 0
        ? Math.round(Number(payload.scanned))
        : imported.length,
  };
}

export async function importAutomationScriptFromLocalLibrary(): Promise<AutomationScriptBatchImportResult> {
  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportLocalLibrary) {
    return normalizeAutomationScriptBatchImportResult(
      await bindings.AutomationScriptImportLocalLibrary(),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportLocalLibrary === "function") {
    return normalizeAutomationScriptBatchImportResult(
      await goApp.AutomationScriptImportLocalLibrary(),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromLocalLibrary.7896650"));
}

export async function importAutomationScriptFromRemote(url: string): Promise<AutomationScriptRecord> {
  const normalizedURL = String(url || "").trim();
  if (!normalizedURL) {
    throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromRemote.ec95266"));
  }

  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportRemote) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptImportRemote(normalizedURL),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportRemote === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptImportRemote(normalizedURL),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromRemote.7f7b1c2"));
}

export async function importAutomationScriptFromGit(
  repoURL: string,
  ref = "",
  scriptPath = "",
): Promise<AutomationScriptRecord> {
  const normalizedRepoURL = String(repoURL || "").trim();
  if (!normalizedRepoURL) {
    throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromGit.6f999d4"));
  }

  const normalizedRef = String(ref || "").trim();
  const normalizedScriptPath = String(scriptPath || "").trim();

  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptImportGit) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptImportGit(
        normalizedRepoURL,
        normalizedRef,
        normalizedScriptPath,
      ),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptImportGit === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptImportGit(
        normalizedRepoURL,
        normalizedRef,
        normalizedScriptPath,
      ),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.importAutomationScriptFromGit.6a6c768"));
}

export async function refreshAutomationScript(
  scriptId: string,
): Promise<AutomationScriptRecord> {
  const normalizedScriptId = String(scriptId || "").trim();
  if (!normalizedScriptId) {
    throw new Error(tr("browser.automationScriptApi.exports.exportAutomationScriptTemplate.69e2e09"));
  }

  const bindings: any = await getBindings();
  if (bindings?.AutomationScriptRefresh) {
    return normalizeAutomationScriptRecord(
      await bindings.AutomationScriptRefresh(normalizedScriptId),
    );
  }

  const goApp = (window as any).go?.main?.App;
  if (typeof goApp?.AutomationScriptRefresh === "function") {
    return normalizeAutomationScriptRecord(
      await goApp.AutomationScriptRefresh(normalizedScriptId),
    );
  }

  throw new Error(tr("browser.automationScriptApi.imports.refreshAutomationScript.d011740"));
}
