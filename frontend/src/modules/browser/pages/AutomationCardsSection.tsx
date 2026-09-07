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
  const scriptMap = new Map(scripts.map((script) => [script.id, script]));
  const selectedScriptIdSet = new Set(selectedScriptIds);

  return (
    <TerminalPanel
      title="SCRIPT REGISTRY"
      meta={<span className="font-mono tabular-nums">{selectedScriptIds.length} SELECTED / {cards.length} TOTAL</span>}
    >
      {loading ? (
        <div className="px-6 py-12 text-center font-mono text-xs text-[var(--color-text-muted)]" role="status">
          LOADING SCRIPT INDEX...
        </div>
      ) : cards.length === 0 ? (
        <SignalEmptyState
          symbol="code"
          title="还没有自动化脚本"
          description="新建一套脚本，或从本地目录、文件与 Git 仓库导入。"
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onCreate}>
                <PlusSquare className="h-4 w-4" aria-hidden="true" />
                新建脚本
              </Button>
              <Button size="sm" variant="secondary" onClick={onImport}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                导入脚本
              </Button>
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
