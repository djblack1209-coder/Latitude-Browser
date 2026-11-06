import { tr, useLocale } from '../../../shared/i18n'
import { Download, History, PlusSquare, RefreshCw, Upload } from "lucide-react";
import { Button } from "../../../shared/components";
import { WorkspaceHeader } from "../../../shared/components/SignalPrimitives";

interface AutomationPageHeaderProps {
  refreshing: boolean;
  exporting: boolean;
  selectedCount: number;
  scriptCount: number;
  readyCount: number;
  apiCount: number;
  profileCount: number;
  onRefresh: () => void;
  onCreate: () => void;
  onExportSelected: () => void;
  onImport: () => void;
  onOpenHistory: () => void;
}

export function AutomationPageHeader({
  refreshing,
  exporting,
  selectedCount,
  onRefresh,
  onCreate,
  onExportSelected,
  onImport,
  onOpenHistory,
}: AutomationPageHeaderProps) {
  useLocale()

  return (
    <div className="space-y-4">
      <WorkspaceHeader

        title={tr("config.navigation.config.name.b9a14be")}

        actions={(
          <>
            <Button size="sm" variant="secondary" onClick={onRefresh} loading={refreshing}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />{tr("browser.components.AutomationRuntimeSnapshot.text.38108ea")}</Button>
            <Button size="sm" onClick={onCreate}>
              <PlusSquare className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.AutomationCardsSection.text.c4ffd3d")}</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onExportSelected}
              loading={exporting}
              disabled={selectedCount === 0}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {selectedCount > 0 ? tr("browser.pages.AutomationPageHeader.AutomationPageHeader.f9c5126", [selectedCount]) : tr("browser.components.AutomationScriptExportModal.title.70d8514")}
            </Button>
            <Button size="sm" variant="secondary" onClick={onImport}>
              <Upload className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.AutomationCardsSection.text.c6a5788")}</Button>
            <Button size="sm" variant="secondary" onClick={onOpenHistory}>
              <History className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.AutomationPageHeader.text.16e7d12")}</Button>
          </>
        )}
      />

    </div>
  );
}
