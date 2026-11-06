import { tr } from '../../../../shared/i18n'
import {
  applyAutomationScriptPublicAPIVariables,
  collectAutomationScriptPublicAPIVariableValues,
  isAutomationScriptPublicAPIVariableName,
  prepareAutomationScriptPublicAPIConfigForSave,
  resolveAutomationScriptPublicAPIConfig,
  type AutomationScriptPublicAPIConfig,
  type AutomationScriptRecord,
} from "../../automationScripts";

function isJSONObjectText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return true;
  }

  try {
    const parsed = JSON.parse(normalized);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

function isJSONText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return true;
  }

  try {
    JSON.parse(normalized);
    return true;
  } catch {
    return false;
  }
}

export function validatePublicAPIConfig(
  config: AutomationScriptPublicAPIConfig,
): string {
  if (!config.enabled) {
    return "";
  }
  if (!config.path.trim()) {
    return tr("browser.pages.automationScriptDetail.publicApiConfigHelpers.validatePublicAPIConfig.9e50f01");
  }

  const invalidVariableNames = config.variables
    .filter((variable) => !isAutomationScriptPublicAPIVariableName(variable.name))
    .map((variable) => variable.name);
  if (invalidVariableNames.length) {
    return tr("browser.pages.automationScriptDetail.publicApiConfigHelpers.validatePublicAPIConfig.0c25042", [invalidVariableNames.join(", ")]);
  }

  const resolvedBody = applyAutomationScriptPublicAPIVariables(
    config.requestBodyText,
    config.variables,
    collectAutomationScriptPublicAPIVariableValues(config),
  );
  if (resolvedBody.missingRequired.length) {
    return tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.8744859", [resolvedBody.missingRequired.join(", ")]);
  }
  if (!isJSONObjectText(resolvedBody.bodyText)) {
    return tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.a948274");
  }
  if (!isJSONText(config.responseBodyText)) {
    return tr("browser.pages.automationScriptDetail.publicApiConfigHelpers.validatePublicAPIConfig.c8be9c6");
  }
  return "";
}

export function hasSamePublicAPIConfig(
  left: AutomationScriptPublicAPIConfig,
  right: AutomationScriptPublicAPIConfig,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.method === right.method &&
    left.path === right.path &&
    left.requestMode === right.requestMode &&
    left.responseMode === right.responseMode &&
    left.timeoutMs === right.timeoutMs &&
    left.requestBodyText === right.requestBodyText &&
    left.responseBodyText === right.responseBodyText &&
    JSON.stringify(left.variables) === JSON.stringify(right.variables)
  );
}

export function preparePublicAPIConfigForCompare(
  script: AutomationScriptRecord,
  publicAPI: AutomationScriptPublicAPIConfig = script.publicAPI,
): AutomationScriptPublicAPIConfig {
  return prepareAutomationScriptPublicAPIConfigForSave({
    ...script,
    publicAPI,
  });
}

export function buildPersistablePublicAPIConfig(
  script: AutomationScriptRecord,
  publicAPI: AutomationScriptPublicAPIConfig = script.publicAPI,
): AutomationScriptPublicAPIConfig {
  return prepareAutomationScriptPublicAPIConfigForSave({
    ...script,
    publicAPI: resolveAutomationScriptPublicAPIConfig({
      ...script,
      publicAPI,
    }),
  });
}
