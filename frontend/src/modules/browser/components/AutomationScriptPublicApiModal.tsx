import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useRef, useState } from "react";
import { toast } from "../../../shared/components";
import {
  invokeAutomationScriptPublicApi,
  type AutomationScriptPublicApiInvokeResult,
} from "../automationScriptApi";
import { openCorePath } from "../api";
import type { BrowserProfile } from "../types";
import {
  applyAutomationScriptPublicAPIVariables,
  buildAutomationScriptPublicAPIPath,
  buildAutomationScriptPublicAPIRequestExample,
  buildAutomationScriptPublicAPIRequestBodyWithTargetCode,
  buildAutomationScriptPublicAPIResponseExample,
  collectAutomationScriptPublicAPIVariableValues,
  DUAL_INSTANCE_RUNTIME_SCRIPT_ID,
  isAutomationScriptPublicAPIVariableName,
  normalizeAutomationScriptPublicAPIRequestBodyForInvoke,
  normalizeAutomationScriptPublicAPIConfig,
  prepareAutomationScriptPublicAPIConfigForSave,
  readAutomationScriptPublicAPIInstanceType,
  readAutomationScriptPublicAPITargetCode,
  resolveAutomationScriptPublicAPIConfig,
  suggestAutomationScriptPublicAPIPath,
  type AutomationScriptPublicAPIConfig,
  type AutomationScriptPublicAPIVariable,
  type AutomationScriptRecord,
} from "../automationScripts";
import {
  buildRequestBodyWithDualTargetCode,
  isInstanceVariableName,
  parseJSONText,
  parsePublicApiOutputEntries,
  readPublicApiDualTargetCode,
  safeParseJSONObject,
} from "./AutomationScriptPublicApiModal.helpers";
import { AutomationScriptPublicApiModalView } from "./AutomationScriptPublicApiModalView";
interface AutomationScriptPublicApiModalProps {
  open: boolean;
  script: AutomationScriptRecord;
  busy?: boolean;
  launchBaseUrl: string;
  apiAuthEnabled: boolean;
  apiAuthHeader: string;
  profiles?: BrowserProfile[];
  focusTestTrigger?: number;
  onClose: () => void;
  onChange: (config: AutomationScriptPublicAPIConfig) => void;
  onBeforeInvoke?: (
    config: AutomationScriptPublicAPIConfig,
  ) => Promise<boolean> | boolean;
}

export function AutomationScriptPublicApiModal({
  open,
  script,
  busy = false,
  launchBaseUrl,
  apiAuthEnabled,
  apiAuthHeader,
  profiles = [],
  focusTestTrigger = 0,
  onClose,
  onChange,
  onBeforeInvoke,
}: AutomationScriptPublicApiModalProps) {
  useLocale()

  const storedConfig = prepareAutomationScriptPublicAPIConfigForSave(script);
  const resolvedConfig = resolveAutomationScriptPublicAPIConfig(script);
  const fullPath = buildAutomationScriptPublicAPIPath(resolvedConfig.path);
  const fullURL = `${launchBaseUrl}${fullPath}`;
  const requestExampleFallback = buildAutomationScriptPublicAPIRequestExample(
    script,
    {
      ...resolvedConfig,
      requestBodyText: "",
    },
  );
  const requestBodySource = resolvedConfig.requestBodyText.trim()
    ? resolvedConfig.requestBodyText
    : requestExampleFallback;
  const responseExampleFallback = buildAutomationScriptPublicAPIResponseExample(
    script,
    {
      ...resolvedConfig,
      responseBodyText: "",
    },
  );
  const resolvedRequestBody = applyAutomationScriptPublicAPIVariables(
    resolvedConfig.requestBodyText,
    resolvedConfig.variables,
    collectAutomationScriptPublicAPIVariableValues(resolvedConfig),
  );
  const resolvedRequestBodyText = resolvedRequestBody.bodyText;
  const visibleVariables = resolvedConfig.variables
    .map((variable, index) => ({ variable, index }))
    .filter(({ variable }) => !isInstanceVariableName(variable.name));
  const visibleVariableNames = new Set(
    visibleVariables.map(({ variable }) => variable.name),
  );
  const invalidVariableNames = visibleVariables
    .map(({ variable }) => variable)
    .filter((variable) => !isAutomationScriptPublicAPIVariableName(variable.name))
    .map((variable) => variable.name);
  const missingVisibleVariables = resolvedRequestBody.missingRequired.filter(
    (name) => visibleVariableNames.has(name),
  );
  const variableError = invalidVariableNames.length
    ? tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.29d2c6d", [invalidVariableNames.join(", ")])
    : missingVisibleVariables.length
      ? tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.8744859", [missingVisibleVariables.join(", ")])
      : "";
  const responseBodyValidation = parseJSONText(resolvedConfig.responseBodyText);
  const requestBodyError =
    resolvedRequestBodyText.trim() && !safeParseJSONObject(resolvedRequestBodyText)
      ? tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.a948274")
      : "";
  const responseBodyError =
    resolvedConfig.responseBodyText.trim() && !responseBodyValidation.ok
      ? tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.d002308", [responseBodyValidation.error])
      : "";
  const isDualInstanceRuntimeScript = script.id === DUAL_INSTANCE_RUNTIME_SCRIPT_ID;
  const selectedTargetCode = readAutomationScriptPublicAPITargetCode(
    resolvedRequestBodyText,
  );
  const selectedInstanceType = readAutomationScriptPublicAPIInstanceType(
    resolvedRequestBodyText,
  );
  const selectedPrimaryTargetCode = readPublicApiDualTargetCode(
    resolvedRequestBodyText,
    0,
  );
  const selectedSecondaryTargetCode = readPublicApiDualTargetCode(
    resolvedRequestBodyText,
    1,
  );
  const targetCodeError =
    isDualInstanceRuntimeScript
      ? selectedPrimaryTargetCode && selectedSecondaryTargetCode
        ? ""
        : tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.d2d808a")
      : selectedTargetCode
        ? ""
        : selectedInstanceType === "script-default"
          ? ""
          : tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.433c8f7");
  const invokeDisabled =
    busy ||
    !resolvedConfig.enabled ||
    !!variableError ||
    !!requestBodyError ||
    !!responseBodyError ||
    !!targetCodeError;

  const [apiKey, setApiKey] = useState("");
  const [invoking, setInvoking] = useState(false);
  const [invokeResult, setInvokeResult] =
    useState<AutomationScriptPublicApiInvokeResult | null>(null);
  const [invokeError, setInvokeError] = useState("");
  const testSectionRef = useRef<HTMLDivElement>(null);
  const outputEntries = parsePublicApiOutputEntries(invokeResult);

  useEffect(() => {
    if (!open) {
      setInvoking(false);
      setInvokeResult(null);
      setInvokeError("");
    }
  }, [open, script.id]);

  useEffect(() => {
    if (!open || focusTestTrigger <= 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      testSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [focusTestTrigger, open]);

  const updateConfig = (patch: Partial<AutomationScriptPublicAPIConfig>) => {
    const nextConfig = normalizeAutomationScriptPublicAPIConfig({
      ...storedConfig,
      ...patch,
    });
    onChange(nextConfig);
  };

  const handleApplySuggestedPath = () => {
    updateConfig({ path: suggestAutomationScriptPublicAPIPath(script) });
  };

  const handleTargetCodeChange = (code: string) => {
    updateConfig({
      requestBodyText: buildAutomationScriptPublicAPIRequestBodyWithTargetCode(
        requestBodySource,
        requestExampleFallback,
        code,
      ),
    });
  };

  const handleDualTargetCodeChange = (index: number, code: string) => {
    updateConfig({
      requestBodyText: buildRequestBodyWithDualTargetCode(
        requestBodySource,
        requestExampleFallback,
        index,
        code,
      ),
    });
  };

  const updateVariable = (
    index: number,
    patch: Partial<AutomationScriptPublicAPIVariable>,
  ) => {
    updateConfig({
      variables: resolvedConfig.variables.map((variable, variableIndex) =>
        variableIndex === index ? { ...variable, ...patch } : variable,
      ),
    });
  };

  const handleAddVariable = () => {
    const existingNames = new Set(
      resolvedConfig.variables.map((variable) => variable.name),
    );
    const baseName = [
      "searchQuery",
      "senderEmail",
      "recipient",
      "mailboxName",
    ].find((name) => !existingNames.has(name));
    updateConfig({
      variables: [
        ...resolvedConfig.variables,
        {
          name: baseName || `variable${visibleVariables.length + 1}`,
          defaultValue: "",
          description: "",
          required: false,
        },
      ],
    });
  };

  const handleRemoveVariable = (index: number) => {
    updateConfig({
      variables: resolvedConfig.variables.filter(
        (_variable, variableIndex) => variableIndex !== index,
      ),
    });
  };

  const handleInvoke = async () => {
    if (!resolvedConfig.enabled) {
      toast.warning(tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.1b00fbc"));
      return;
    }
    if (variableError) {
      toast.warning(variableError);
      return;
    }
    if (requestBodyError) {
      toast.warning(requestBodyError);
      return;
    }
    if (responseBodyError) {
      toast.warning(responseBodyError);
      return;
    }
    if (targetCodeError) {
      toast.warning(targetCodeError);
      return;
    }

    setInvoking(true);
    setInvokeError("");
    setInvokeResult(null);

    try {
      if (onBeforeInvoke) {
        const allowed = await onBeforeInvoke(resolvedConfig);
        if (!allowed) {
          return;
        }
      }

      const result = await invokeAutomationScriptPublicApi({
        url: fullURL,
        method: resolvedConfig.method,
        bodyText: normalizeAutomationScriptPublicAPIRequestBodyForInvoke(
          resolvedRequestBodyText,
        ),
        apiKey,
        authHeader: apiAuthHeader,
        timeoutMs: resolvedConfig.timeoutMs + 10000,
      });
      setInvokeResult(result);
      if (result.ok) {
        toast.success(tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.506368a"));
      } else {
        toast.warning(tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.9c0c993", [result.status]));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.4184cd8");
      setInvokeError(message);
      toast.error(message);
    } finally {
      setInvoking(false);
    }
  };

  const handleOpenOutputPath = async (path: string) => {
    try {
      await openCorePath(path);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.6651d08");
      toast.error(message);
    }
  };

  return (
    <AutomationScriptPublicApiModalView
      open={open}
      onClose={onClose}
      busy={busy}
      script={script}
      launchBaseUrl={launchBaseUrl}
      apiAuthEnabled={apiAuthEnabled}
      apiAuthHeader={apiAuthHeader}
      profiles={profiles}
      fullURL={fullURL}
      fullPath={fullPath}
      resolvedConfig={resolvedConfig}
      requestExampleFallback={requestExampleFallback}
      responseExampleFallback={responseExampleFallback}
      visibleVariables={visibleVariables}
      variableError={translateMessage(variableError)}
      requestBodyError={translateMessage(requestBodyError)}
      responseBodyError={translateMessage(responseBodyError)}
      isDualInstanceRuntimeScript={isDualInstanceRuntimeScript}
      selectedTargetCode={selectedTargetCode}
      selectedPrimaryTargetCode={selectedPrimaryTargetCode}
      selectedSecondaryTargetCode={selectedSecondaryTargetCode}
      invokeDisabled={invokeDisabled}
      apiKey={apiKey}
      setApiKey={setApiKey}
      invoking={invoking}
      invokeResult={invokeResult}
      invokeError={translateMessage(invokeError)}
      outputEntries={outputEntries}
      testSectionRef={testSectionRef}
      updateConfig={updateConfig}
      updateVariable={updateVariable}
      handleApplySuggestedPath={handleApplySuggestedPath}
      handleAddVariable={handleAddVariable}
      handleRemoveVariable={handleRemoveVariable}
      handleTargetCodeChange={handleTargetCodeChange}
      handleDualTargetCodeChange={handleDualTargetCodeChange}
      handleInvoke={handleInvoke}
      handleOpenOutputPath={handleOpenOutputPath}
    />
  );
}
