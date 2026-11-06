import { tr, localized } from '../../../shared/i18n'
export type AutomationScriptType = "playwright-cdp" | "launch-api";

export type AutomationScriptStatus = "draft" | "ready" | "disabled";

export type AutomationScriptTargetMode =
  | "manual"
  | "existing"
  | "create"
  | "rotate";

export type AutomationScriptPublicAPIRequestMode =
  | "standard"
  | "params-only";

export type AutomationScriptPublicAPIResponseMode =
  | "envelope"
  | "result-only";

export interface AutomationScriptPublicAPIVariable {
  name: string;
  defaultValue: string;
  description: string;
  required: boolean;
}

export interface AutomationScriptSource {
  type: string;
  uri: string;
  ref: string;
  path: string;
  importedAt: string;
}

export interface AutomationScriptTargetSelector {
  code: string;
  profileId: string;
  profileName: string;
  groupId: string;
  keywords: string[];
  tags: string[];
}

export interface AutomationScriptTargetConfig {
  mode: AutomationScriptTargetMode;
  selector: AutomationScriptTargetSelector;
  templateSelector: AutomationScriptTargetSelector;
  createNameTemplate: string;
}

export interface AutomationScriptPublicAPIConfig {
  enabled: boolean;
  method: "POST";
  path: string;
  requestMode: AutomationScriptPublicAPIRequestMode;
  responseMode: AutomationScriptPublicAPIResponseMode;
  timeoutMs: number;
  requestBodyText: string;
  responseBodyText: string;
  variables: AutomationScriptPublicAPIVariable[];
}

export interface AutomationScriptRecord {
  packageFormat: string;
  manifestVersion: number;
  id: string;
  name: string;
  description: string;
  type: AutomationScriptType;
  status: AutomationScriptStatus;
  entryFile: string;
  tags: string[];
  selectorText: string;
  paramsText: string;
  scriptText: string;
  notes: string;
  targetConfig: AutomationScriptTargetConfig;
  publicAPI: AutomationScriptPublicAPIConfig;
  source: AutomationScriptSource;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationScriptRunRecord {
  id: string;
  scriptId: string;
  scriptName: string;
  scriptType: string;
  status: "success" | "failed" | "running";
  summary: string;
  error: string;
  resultText: string;
  logText: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface AutomationScriptRunInput {
  scriptId: string;
  selectorText?: string;
  targetInput?: Record<string, unknown>;
  paramsText?: string;
  useScriptSelector?: boolean;
  useScriptParams?: boolean;
  timeoutMs?: number;
  launchCode?: string;
  startByCodeBeforeRun?: boolean;
}

export const AUTOMATION_SCRIPT_PACKAGE_FORMAT = "ant-automation-script";
export const AUTOMATION_SCRIPT_MANIFEST_VERSION = 1;
export const AUTOMATION_SCRIPT_PUBLIC_API_BASE_PATH =
  "/api/automation/hooks";
export const AUTOMATION_SCRIPT_PUBLIC_API_DEFAULT_TIMEOUT_MS = 300000;

export const AUTOMATION_SCRIPT_TYPE_OPTIONS: Array<{
  value: AutomationScriptType;
  label: string;
}> = [
  { value: "playwright-cdp", label: tr("ui.modules.browser.automationScripts.definitions.label.ceb770f") },
  { value: "launch-api", label: tr("ui.modules.browser.automationScripts.definitions.label.6c42827") },
];

export const AUTOMATION_SCRIPT_STATUS_OPTIONS: Array<{
  value: AutomationScriptStatus;
  label: string;
}> = localized(() => ([
  { value: "draft", label: tr("browser.automationScripts.definitions.label.0f43681") },
  { value: "ready", label: tr("browser.automationScripts.definitions.label.e91365c") },
  { value: "disabled", label: tr("browser.automationScripts.definitions.label.d989e55") },
]));

export const AUTOMATION_SCRIPT_TARGET_MODE_OPTIONS: Array<{
  value: AutomationScriptTargetMode;
  label: string;
}> = localized(() => ([
  { value: "manual", label: tr("browser.automationScripts.definitions.label.6a30362") },
  { value: "existing", label: tr("browser.automationScripts.definitions.label.6a30362") },
  { value: "create", label: tr("browser.automationScripts.definitions.label.30a1e27") },
  { value: "rotate", label: tr("browser.automationScripts.definitions.label.f86b018") },
]));

export const DUAL_INSTANCE_RUNTIME_SCRIPT_ID = "dual-instance-runtime-switch";
