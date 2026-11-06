import { tr } from '../../../shared/i18n'
import type { AutomationScriptType } from './definitions'
import { normalizeAutomationScriptTargetSelector } from './targets'

const DUAL_INSTANCE_DEFAULT_CODES = ["BUYER_001", "BUYER_002"] as const;
const DUAL_INSTANCE_DEFAULT_START_URLS = [
  "https://finance.sina.com.cn/",
  "https://map.baidu.com/",
] as const;

export function buildSelectorTemplate(type: AutomationScriptType): string {
  if (type === "launch-api") {
    return `{
  "code": "BUYER_001"
}`;
  }

  return "";
}

export function buildParamsTemplate(type: AutomationScriptType): string {
  if (type === "launch-api") {
    return `{
  "startUrls": ["https://example.com"],
  "skipDefaultStartUrls": true
}`;
  }

  return `{
  "url": "https://www.baidu.com",
  "keyword": "OpenAI",
  "timeoutMs": 30000,
  "waitAfterSearchMs": 1500,
  "captureScreenshot": true
}`;
}

export function buildScriptTemplate(type: AutomationScriptType): string {
  if (type === "launch-api") {
    return `export async function run({ baseUrl, apiKey, selector, params }) {
  const response = await fetch(\`\${baseUrl}/api/launch\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Ant-Api-Key': apiKey } : {}),
    },
    body: JSON.stringify({
      selector,
      ...(params || {}),
    }),
  })

  if (!response.ok) {
    throw new Error(\`launch failed: \${response.status}\`)
  }

  return await response.json()
}`;
  }

  return tr("browser.automationScripts.builtinsTemplates.buildScriptTemplate.536f779");
}

export function buildNotesTemplate(type: AutomationScriptType): string {
  if (type === "launch-api") {
    return tr("browser.automationScripts.builtinsTemplates.buildNotesTemplate.bceced7");
  }

  return tr("browser.automationScripts.builtinsTemplates.buildNotesTemplate.8c06552");
}

export function buildDualInstanceRuntimeParamsText(
  codes = [...DUAL_INSTANCE_DEFAULT_CODES],
): string {
  return `{
  "browsers": [
    {
      "code": "${codes[0] || DUAL_INSTANCE_DEFAULT_CODES[0]}",
      "skipDefaultStartUrls": true,
      "startUrls": ["${DUAL_INSTANCE_DEFAULT_START_URLS[0]}"]
    },
    {
      "code": "${codes[1] || DUAL_INSTANCE_DEFAULT_CODES[1]}",
      "skipDefaultStartUrls": true,
      "startUrls": ["${DUAL_INSTANCE_DEFAULT_START_URLS[1]}"]
    }
  ],
  "timeoutMs": 45000
}`;
}

export function buildDualInstanceRuntimeScriptText(): string {
  return tr("browser.automationScripts.builtinsTemplates.buildDualInstanceRuntimeScriptText.dbb0f18", [JSON.stringify([...DUAL_INSTANCE_DEFAULT_CODES]), JSON.stringify([...DUAL_INSTANCE_DEFAULT_START_URLS]), JSON.stringify(DUAL_INSTANCE_DEFAULT_CODES[0]), JSON.stringify([DUAL_INSTANCE_DEFAULT_START_URLS[0]]), JSON.stringify(DUAL_INSTANCE_DEFAULT_CODES[1]), JSON.stringify([DUAL_INSTANCE_DEFAULT_START_URLS[1]])]);
}

export function normalizeDualInstanceRuntimeParamsText(text: string): string {
  const fallback = buildDualInstanceRuntimeParamsText();

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }

    const raw = parsed as Record<string, unknown>;
    const topLevelSkipDefaultStartUrls = raw.skipDefaultStartUrls !== false;
    const rawBrowsers = Array.isArray(raw.browsers) ? raw.browsers : [];
    const browsers = rawBrowsers
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const entry = item as Record<string, unknown>;
        const code = normalizeAutomationScriptTargetSelector({
          code:
            typeof entry.code === "string"
              ? entry.code
              : typeof entry.launchCode === "string"
                ? entry.launchCode
                : "",
        }).code;
        if (!code) {
          return null;
        }

        const startUrls = Array.isArray(entry.startUrls)
          ? entry.startUrls
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        const launchArgs = Array.isArray(entry.launchArgs)
          ? entry.launchArgs
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];

        const fallbackStartUrls = DUAL_INSTANCE_DEFAULT_START_URLS[index]
          ? [DUAL_INSTANCE_DEFAULT_START_URLS[index]]
          : [];

        return {
          code: code || DUAL_INSTANCE_DEFAULT_CODES[index] || "",
          skipDefaultStartUrls:
            entry.skipDefaultStartUrls !== undefined
              ? entry.skipDefaultStartUrls !== false
              : topLevelSkipDefaultStartUrls,
          startUrls: startUrls.length > 0 ? startUrls : fallbackStartUrls,
          ...(launchArgs.length > 0 ? { launchArgs } : {}),
        };
      })
      .filter(
        (
          item,
        ): item is {
          code: string;
          skipDefaultStartUrls: boolean;
          startUrls: string[];
          launchArgs?: string[];
        } => item !== null,
      );

    const legacyCodes = [
      normalizeAutomationScriptTargetSelector({
        code: typeof raw.primaryCode === "string" ? raw.primaryCode : "",
      }).code,
      normalizeAutomationScriptTargetSelector({
        code: typeof raw.secondaryCode === "string" ? raw.secondaryCode : "",
      }).code,
    ].filter(Boolean);

    const normalizedBrowsers =
      browsers.length > 0
        ? browsers
        : legacyCodes.length > 0
          ? legacyCodes.map((code, index) => ({
              code,
              skipDefaultStartUrls: topLevelSkipDefaultStartUrls,
              startUrls: DUAL_INSTANCE_DEFAULT_START_URLS[index]
                ? [DUAL_INSTANCE_DEFAULT_START_URLS[index]]
                : [],
            }))
          : DUAL_INSTANCE_DEFAULT_CODES.map((code, index) => ({
              code,
              skipDefaultStartUrls: true,
              startUrls: DUAL_INSTANCE_DEFAULT_START_URLS[index]
                ? [DUAL_INSTANCE_DEFAULT_START_URLS[index]]
                : [],
            }));

    const timeoutMs =
      Number.isFinite(Number(raw.timeoutMs)) && Number(raw.timeoutMs) > 0
        ? Math.round(Number(raw.timeoutMs))
        : 45000;

    return JSON.stringify(
      {
        browsers: normalizedBrowsers,
        timeoutMs,
      },
      null,
      2,
    );
  } catch {
    return fallback;
  }
}
