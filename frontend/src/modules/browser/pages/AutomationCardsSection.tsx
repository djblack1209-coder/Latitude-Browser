import { tr, useLocale } from '../../../shared/i18n'
import { PlusSquare, Upload } from "lucide-react";
import { Button } from "../../../shared/components";
import { SignalEmptyState, TerminalPanel } from "../../../shared/components/SignalPrimitives";
import { resolveAutomationScriptPublicAPIConfig, type AutomationScriptRecord } from "../automationScripts";
import { AutomationScriptSummaryCard } from "./AutomationScriptSummaryCard";
import type { AutomationCardPresentation } from "./AutomationPage.helpers";

interface AutomationCardsSectionProps {
  loading: boolean;
  cards: AutomationCardPresentation[];
  scripts: AutomationScriptRecord[];
  selectedScriptIds: string[];
  onCreate: () => void;
  onImport: () => void;
  onToggleScriptSelection: (scriptId: string, selected: boolean) => void;
  onOpenScript: (scriptId: string) => void;
  onRunAutomationScript: (script: AutomationScriptRecord) => void;
  onOpenPublicApi: (script: AutomationScriptRecord, options?: { focusTest?: boolean }) => void;
}

export function AutomationCardsSection({
  loading,
  cards,
  scripts,
  selectedScriptIds,
  onCreate,
  onImport,
  onToggleScriptSelection,
  onOpenScript,
  onRunAutomationScript,
  onOpenPublicApi,
}: AutomationCardsSectionProps) {
  useLocale()

  const scriptMap = new Map(scripts.map((script) => [script.id, script]));
  const selectedScriptIdSet = new Set(selectedScriptIds);

  return (
    <TerminalPanel
      title={tr("browser.pages.AutomationCardsSection.title.da72dc3")}
      meta={<span className="tabular-nums">{tr("browser.components.BrowserListWidgets.text.17f3287")}{selectedScriptIds.length}{tr("browser.pages.AutomationCardsSection.text.6ae797b")}{cards.length}</span>}
    >
      {loading ? (
        <div className="px-6 py-12 text-center text-xs text-[var(--color-text-muted)]" role="status">{tr("browser.pages.AutomationCardsSection.text.235fa40")}</div>
      ) : cards.length === 0 ? (
        <SignalEmptyState
          symbol="code"
          title={tr("browser.pages.AutomationCardsSection.title.bd8bb93")}

          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onCreate}>
                <PlusSquare className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.AutomationCardsSection.text.c4ffd3d")}</Button>
              <Button size="sm" variant="secondary" onClick={onImport}>
                <Upload className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.AutomationCardsSection.text.c6a5788")}</Button>
            </div>
          )}
        />
      ) : (
        <div className="grid items-stretch gap-3 p-3 md:p-4 xl:grid-cols-2 2xl:grid-cols-3">
          {cards.map((card) => {
            const scriptId = card.scriptId;
            const onOpen = scriptId ? () => onOpenScript(scriptId) : undefined;
            const script = scriptId ? scriptMap.get(scriptId) : undefined;
            const publicAPIEnabled = script
              ? resolveAutomationScriptPublicAPIConfig(script).enabled
              : false;
            const runScriptAction = script && script.type !== "launch-api"
              ? () => onRunAutomationScript(script)
              : undefined;
            const onRunAPI = script
              ? () => onOpenPublicApi(script, { focusTest: publicAPIEnabled })
              : undefined;

            return (
              <AutomationScriptSummaryCard
                key={card.key}
                card={card}
                onOpen={onOpen}
                onRunScript={runScriptAction}
                onRunAPI={onRunAPI}
                selected={scriptId ? selectedScriptIdSet.has(scriptId) : false}
                onSelectedChange={scriptId ? (selected) => onToggleScriptSelection(scriptId, selected) : undefined}
              />
            );
          })}
        </div>
      )}
    </TerminalPanel>
  );
}
