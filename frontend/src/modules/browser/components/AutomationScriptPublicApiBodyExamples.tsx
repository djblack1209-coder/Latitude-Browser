import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { Copy } from "lucide-react";
import { Button, Textarea } from "../../../shared/components";
import { copyText } from "./AutomationScriptPublicApiModal.helpers";
import type { AutomationScriptPublicAPIConfig } from "../automationScripts";

interface AutomationScriptPublicApiBodyExamplesProps {
  busy: boolean;
  resolvedConfig: AutomationScriptPublicAPIConfig;
  requestExampleFallback: string;
  responseExampleFallback: string;
  requestBodyError: string;
  responseBodyError: string;
  updateConfig: (patch: Partial<AutomationScriptPublicAPIConfig>) => void;
}

export function AutomationScriptPublicApiBodyExamples({
  busy,
  resolvedConfig,
  requestExampleFallback,
  responseExampleFallback,
  requestBodyError,
  responseBodyError,
  updateConfig,
}: AutomationScriptPublicApiBodyExamplesProps) {
  useLocale()

  return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.AutomationScriptPublicApiBodyExamples.text.1b76dd4")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void copyText(
                      resolvedConfig.requestBodyText || requestExampleFallback,
                      tr("browser.components.AutomationScriptPublicApiBodyExamples.AutomationScriptPublicApiBodyExamples.7ae0f92"),
                    )
                  }
                >
                  <Copy className="h-4 w-4" />{tr("browser.components.AutomationScriptPublicApiBodyExamples.text.4edd1d0")}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => updateConfig({ requestBodyText: "" })}
                  disabled={busy}
                >{tr("browser.api.runtime.message.c8d09cf")}</Button>
              </div>
            </div>
            <Textarea
              rows={10}
              value={resolvedConfig.requestBodyText}
              onChange={(event) =>
                updateConfig({ requestBodyText: event.target.value })
              }
              className="mt-3 font-mono"
              placeholder={requestExampleFallback}
              disabled={busy}
            />
            {requestBodyError ? (
              <p className="mt-2 text-xs text-[var(--color-error)]">
                {translateMessage(requestBodyError)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{tr("browser.components.AutomationScriptPublicApiBodyExamples.text.168c211")}</p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.AutomationScriptPublicApiBodyExamples.text.b0c6ec8")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void copyText(
                      resolvedConfig.responseBodyText || responseExampleFallback,
                      tr("browser.components.AutomationScriptPublicApiBodyExamples.AutomationScriptPublicApiBodyExamples.1306517"),
                    )
                  }
                >
                  <Copy className="h-4 w-4" />{tr("browser.components.AutomationScriptPublicApiBodyExamples.text.4edd1d0")}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => updateConfig({ responseBodyText: "" })}
                  disabled={busy}
                >{tr("browser.api.runtime.message.c8d09cf")}</Button>
              </div>
            </div>
            <Textarea
              rows={13}
              value={resolvedConfig.responseBodyText}
              onChange={(event) =>
                updateConfig({ responseBodyText: event.target.value })
              }
              className="mt-3 font-mono"
              placeholder={responseExampleFallback}
              disabled={busy}
            />
            {responseBodyError ? (
              <p className="mt-2 text-xs text-[var(--color-error)]">
                {translateMessage(responseBodyError)}
              </p>
            ) : null}
          </div>
        </div>
  );
}
