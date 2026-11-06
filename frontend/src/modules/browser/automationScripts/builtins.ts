import { tr, sourceText } from '../../../shared/i18n'
import {
  AUTOMATION_SCRIPT_MANIFEST_VERSION,
  AUTOMATION_SCRIPT_PACKAGE_FORMAT,
  DUAL_INSTANCE_RUNTIME_SCRIPT_ID,
  type AutomationScriptRecord,
} from "./definitions";
import { createAutomationScriptPublicAPIConfig } from "./publicApi";
import {
  normalizeAutomationScriptTargetConfig,
} from "./targets";

const BACKEND_BUILTIN_SCRIPT_PLACEHOLDER = sourceText("browser.automationScripts.builtins.message.fa6cf55");


function nowIso(): string {
  return new Date().toISOString();
}

export {
  buildParamsTemplate,
  buildScriptTemplate,
  buildSelectorTemplate,
  buildNotesTemplate,
  normalizeDualInstanceRuntimeParamsText,
} from "./builtinsTemplates";
import {
  buildDualInstanceRuntimeParamsText,
  buildDualInstanceRuntimeScriptText,
} from "./builtinsTemplates";

export function createNewsTxtScriptDraft(): AutomationScriptRecord {
  const createdAt = nowIso();

  return {
    packageFormat: AUTOMATION_SCRIPT_PACKAGE_FORMAT,
    manifestVersion: AUTOMATION_SCRIPT_MANIFEST_VERSION,
    id: "news-query-txt",
    name: tr("browser.automationScripts.builtins.name.691188f"),
    description: tr("browser.automationScripts.builtins.description.0eb2af2"),
    type: "playwright-cdp",
    status: "ready",
    entryFile: "index.cjs",
    tags: ["Playwright", tr("browser.automationScripts.builtins.createNewsTxtScriptDraft.76484b3"), "TXT"],
    selectorText: "",
    paramsText: `{
  "keyword": "OpenAI",
  "limit": 10,
  "timeRange": "week",
  "outputFileName": "openai-news.txt",
  "timeoutMs": 30000,
  "waitAfterLoadMs": 1500,
  "captureScreenshot": false
}`,
    scriptText: BACKEND_BUILTIN_SCRIPT_PLACEHOLDER,
    notes:
      tr("browser.automationScripts.builtins.notes.74d704e"),
    targetConfig: normalizeAutomationScriptTargetConfig(null),
    publicAPI: createAutomationScriptPublicAPIConfig(),
    source: {
      type: "builtin",
      uri: "repo://backend/internal/automation/demo-library/news-query-txt",
      ref: "HEAD",
      path: "news-query-txt",
      importedAt: "",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export function createDualInstanceRuntimeScriptDraft(): AutomationScriptRecord {
  const createdAt = nowIso();

  return {
    packageFormat: AUTOMATION_SCRIPT_PACKAGE_FORMAT,
    manifestVersion: AUTOMATION_SCRIPT_MANIFEST_VERSION,
    id: DUAL_INSTANCE_RUNTIME_SCRIPT_ID,
    name: tr("browser.automationScripts.builtins.name.520164b"),
    description:
      tr("browser.automationScripts.builtins.description.deb99c8"),
    type: "launch-api",
    status: "ready",
    entryFile: "index.cjs",
    tags: ["Launch API", "OpenClaw", tr("browser.automationScripts.builtins.createDualInstanceRuntimeScriptDraft.c1ad1e4")],
    selectorText: "",
    paramsText: buildDualInstanceRuntimeParamsText(),
    scriptText: buildDualInstanceRuntimeScriptText(),
    notes:
      tr("browser.automationScripts.builtins.notes.482fbc9"),
    targetConfig: normalizeAutomationScriptTargetConfig(null),
    publicAPI: createAutomationScriptPublicAPIConfig(),
    source: {
      type: "builtin",
      uri: "repo://backend/internal/automation/demo-library/dual-instance-runtime-switch",
      ref: "HEAD",
      path: "dual-instance-runtime-switch",
      importedAt: "",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export function createWebImageGenerateDownloadScriptDraft(): AutomationScriptRecord {
  const createdAt = nowIso();

  return {
    packageFormat: AUTOMATION_SCRIPT_PACKAGE_FORMAT,
    manifestVersion: AUTOMATION_SCRIPT_MANIFEST_VERSION,
    id: "web-image-generate-download",
    name: tr("browser.automationScripts.builtins.name.6824a87"),
    description:
      tr("browser.automationScripts.builtins.description.a869ea0"),
    type: "playwright-cdp",
    status: "draft",
    entryFile: "index.cjs",
    tags: ["Playwright", tr("browser.automationScripts.builtins.createWebImageGenerateDownloadScriptDraft.1f6a9da"), tr("browser.automationScripts.builtins.createWebImageGenerateDownloadScriptDraft.2b9d013")],
    selectorText: "",
    paramsText: `{
  "prompt": "A cinematic browser mascot, premium product lighting"
}`,
    scriptText: BACKEND_BUILTIN_SCRIPT_PLACEHOLDER,
    notes:
      tr("browser.automationScripts.builtins.notes.91eec68"),
    targetConfig: normalizeAutomationScriptTargetConfig(null),
    publicAPI: {
      ...createAutomationScriptPublicAPIConfig(),
      enabled: true,
      path: "image/chatgpt-generate-download",
      timeoutMs: 300000,
      requestBodyText: `{
  "instance": {
    "type": "existing",
    "selector": {
      "code": "BUYER_001"
    }
  },
  "params": {
    "prompt": "{{prompt}}"
  },
  "timeoutMs": 300000
}`,
      responseBodyText: tr("browser.automationScripts.builtins.responseBodyText.19c2d1a"),
      variables: [
        {
          name: "prompt",
          defaultValue:
            "A cinematic browser mascot, premium product lighting",
          description: tr("browser.automationScripts.builtins.description.fc16a87"),
          required: true,
        },
      ],
    },
    source: {
      type: "builtin",
      uri: "repo://backend/internal/automation/demo-library/web-image-generate-download",
      ref: "HEAD",
      path: "web-image-generate-download",
      importedAt: "",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildDefaultAutomationScripts(): AutomationScriptRecord[] {
  return [
    createNewsTxtScriptDraft(),
    createDualInstanceRuntimeScriptDraft(),
    createWebImageGenerateDownloadScriptDraft(),
  ];
}
