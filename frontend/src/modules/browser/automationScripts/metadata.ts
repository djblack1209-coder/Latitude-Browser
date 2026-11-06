import { tr } from '../../../shared/i18n'
import {
  AUTOMATION_SCRIPT_STATUS_OPTIONS,
  AUTOMATION_SCRIPT_TYPE_OPTIONS,
  type AutomationScriptSource,
  type AutomationScriptStatus,
  type AutomationScriptType,
} from "./definitions";

export function normalizeAutomationScriptSource(
  source: unknown,
): AutomationScriptSource {
  if (!source || typeof source !== "object") {
    return {
      type: "",
      uri: "",
      ref: "",
      path: "",
      importedAt: "",
    };
  }

  const raw = source as Partial<AutomationScriptSource>;
  return {
    type: typeof raw.type === "string" ? raw.type.trim() : "",
    uri: typeof raw.uri === "string" ? raw.uri.trim() : "",
    ref: typeof raw.ref === "string" ? raw.ref.trim() : "",
    path: typeof raw.path === "string" ? raw.path.trim() : "",
    importedAt:
      typeof raw.importedAt === "string" ? raw.importedAt.trim() : "",
  };
}

export function getAutomationScriptSourceLabel(source: AutomationScriptSource): string {
  switch (source.type) {
    case "builtin":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.0bf50ac");
    case "local-file":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.c8a69b6");
    case "local-dir":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.530997c");
    case "remote-url":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.b17abb3");
    case "git":
      return "Git";
    case "text":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.a1ce59a");
    case "manual":
      return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.e069342");
    default:
      return source.type || tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.b1bbc79");
  }
}

export function canRefreshAutomationScriptSource(
  source: AutomationScriptSource,
): boolean {
  return (
    source.type === "builtin" ||
    source.type === "local-file" ||
    source.type === "local-dir" ||
    source.type === "remote-url" ||
    source.type === "git"
  );
}

export function getAutomationScriptRefreshLabel(
  source: AutomationScriptSource,
): string {
  if (source.type === "builtin") {
    return tr("browser.automationScripts.metadata.getAutomationScriptRefreshLabel.4e6dd47");
  }
  return source.type === "git" ? tr("browser.automationScripts.metadata.getAutomationScriptRefreshLabel.0124319") : tr("browser.automationScripts.metadata.getAutomationScriptRefreshLabel.4cce0eb");
}

export function getAutomationScriptTypeLabel(
  type: AutomationScriptType,
): string {
  return (
    AUTOMATION_SCRIPT_TYPE_OPTIONS.find((item) => item.value === type)?.label ||
    type
  );
}

export function getAutomationScriptStatusLabel(
  status: AutomationScriptStatus,
): string {
  return (
    AUTOMATION_SCRIPT_STATUS_OPTIONS.find((item) => item.value === status)
      ?.label || status
  );
}
