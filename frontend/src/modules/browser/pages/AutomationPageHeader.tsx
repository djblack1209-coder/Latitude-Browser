import { Download, History, PlusSquare, RefreshCw, Upload } from "lucide-react";
import { Button } from "../../../shared/components";
import { TelemetryStrip, WorkspaceHeader } from "../../../shared/components/SignalPrimitives";

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
  scriptCount,
  readyCount,
  apiCount,
  profileCount,
  onRefresh,
  onCreate,
  onExportSelected,
  onImport,
  onOpenHistory,
}: AutomationPageHeaderProps) {
  return (
    <div className="space-y-4">
      <WorkspaceHeader
        eyebrow="AUTOMATION / SCRIPTS"
        title="自动化脚本"
        description="创建、导入并执行 Playwright CDP 与 Launch API 脚本。"
        actions={(
          <>
            <Button size="sm" variant="secondary" onClick={onRefresh} loading={refreshing}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              刷新
            </Button>
            <Button size="sm" onClick={onCreate}>
              <PlusSquare className="h-4 w-4" aria-hidden="true" />
              新建脚本
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onExportSelected}
              loading={exporting}
              disabled={selectedCount === 0}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {selectedCount > 0 ? `导出 ${selectedCount} 个` : "导出脚本"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onImport}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              导入脚本
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenHistory}>
              <History className="h-4 w-4" aria-hidden="true" />
              调用记录
            </Button>
          </>
        )}
      />
      <TelemetryStrip
        items={[
          { label: "脚本总数", value: scriptCount, detail: "本地脚本包" },
          { label: "就绪", value: readyCount, detail: "可直接执行", tone: readyCount > 0 ? "success" : "neutral" },
          { label: "公开接口", value: apiCount, detail: "已启用 Public API", tone: apiCount > 0 ? "accent" : "neutral" },
          { label: "可选实例", value: profileCount, detail: "运行目标池" },
        ]}
      />
    </div>
  );
}
