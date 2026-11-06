import { tr, useLocale } from '../../../shared/i18n'
import { Button, FormItem, Input, Modal, Select } from "../../../shared/components";
import { AUTOMATION_SCRIPT_TYPE_OPTIONS, type AutomationScriptType } from "../automationScripts";
import type { ImportMode } from "./AutomationPage.helpers";

interface CreateAutomationScriptModalProps {
  open: boolean;
  busyAction: "none" | "create" | "import";
  createName: string;
  createType: AutomationScriptType;
  onClose: () => void;
  onCreate: () => Promise<void>;
  onCreateNameChange: (value: string) => void;
  onCreateTypeChange: (value: AutomationScriptType) => void;
}

export function CreateAutomationScriptModal({
  open,
  busyAction,
  createName,
  createType,
  onClose,
  onCreate,
  onCreateNameChange,
  onCreateTypeChange,
}: CreateAutomationScriptModalProps) {
  useLocale()

  return (
      <Modal
        open={open}
        onClose={onClose}
        title={tr("browser.pages.AutomationCardsSection.text.c4ffd3d")}
        width="460px"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={busyAction !== "none"}
            >{tr("App.CloseConfirmModal.4d0b468")}</Button>
            <Button
              onClick={() => void onCreate()}
              loading={busyAction === "create"}
            >{tr("browser.components.GroupTreeNav.text.fcbd093")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormItem label={tr("browser.components.AutomationScriptHistoryModal.label.22dfd39")}>
            <Input
              value={createName}
              onChange={(event) => onCreateNameChange(event.target.value)}
              placeholder={tr("browser.pages.AutomationPageModals.placeholder.acc6a09")}
            />
          </FormItem>
          <FormItem label={tr("browser.components.AutomationScriptHistoryModal.label.f1574ac")}>
            <Select
              value={createType}
              options={AUTOMATION_SCRIPT_TYPE_OPTIONS}
              onChange={(event) =>
                onCreateTypeChange(event.target.value as AutomationScriptType)
              }
            />
          </FormItem>
        </div>
      </Modal>
  );
}

interface ImportAutomationScriptModalProps {
  open: boolean;
  busyAction: "none" | "create" | "import";
  importMode: ImportMode;
  gitURL: string;
  gitRef: string;
  gitScriptPath: string;
  onClose: () => void;
  onImport: () => Promise<void>;
  onImportLocalFile: () => Promise<void>;
  onImportLocalDirectory: () => Promise<void>;
  onImportModeChange: (value: ImportMode) => void;
  onGitURLChange: (value: string) => void;
  onGitRefChange: (value: string) => void;
  onGitScriptPathChange: (value: string) => void;
}

export function ImportAutomationScriptModal({
  open,
  busyAction,
  importMode,
  gitURL,
  gitRef,
  gitScriptPath,
  onClose,
  onImport,
  onImportLocalFile,
  onImportLocalDirectory,
  onImportModeChange,
  onGitURLChange,
  onGitRefChange,
  onGitScriptPathChange,
}: ImportAutomationScriptModalProps) {
  useLocale()

  return (
      <Modal
        open={open}
        onClose={onClose}
        title={tr("browser.pages.AutomationCardsSection.text.c6a5788")}
        width="720px"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={busyAction !== "none"}
            >{tr("App.CloseConfirmModal.4d0b468")}</Button>
            {importMode === "git" ? (
              <Button
                onClick={() => void onImport()}
                loading={busyAction === "import"}
              >{tr("browser.components.BrowserListLayout.text.60e2bca")}</Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">{tr("browser.pages.AutomationPageModals.text.cc350fb")}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "local", label: tr("browser.pages.AutomationPageModals.label.e8666c3"), disabled: false },
              { value: "git", label: tr("browser.pages.AutomationPageModals.label.9538296"), disabled: false },
              { value: "script-library", label: tr("browser.pages.AutomationPageModals.label.2da19da"), disabled: true },
            ].map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={importMode === item.value ? "primary" : "secondary"}
                onClick={() => {
                  if (item.value === "script-library") {
                    return;
                  }
                  onImportModeChange(item.value as ImportMode);
                }}
                disabled={busyAction !== "none" || item.disabled}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {importMode === "local" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() => void onImportLocalFile()}
                loading={busyAction === "import"}
              >{tr("browser.pages.AutomationPageModals.text.388b026")}</Button>
              <Button
                variant="secondary"
                onClick={() => void onImportLocalDirectory()}
                loading={busyAction === "import"}
              >{tr("browser.pages.AutomationPageModals.text.ed35809")}</Button>
            </div>
          ) : null}

          {importMode === "git" ? (
            <div className="space-y-4">
              <div className="text-sm text-[var(--color-text-secondary)]">{tr("browser.pages.AutomationPageModals.text.28c50c8")}</div>
              <FormItem label={tr("browser.pages.AutomationPageModals.label.6b470c4")}>
                <Input
                  value={gitURL}
                  onChange={(event) => onGitURLChange(event.target.value)}
                  placeholder="https://github.com/example/automation-scripts.git"
                />
              </FormItem>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormItem label={tr("browser.pages.AutomationPageModals.label.37c4215")}>
                  <Input
                    value={gitRef}
                    onChange={(event) => onGitRefChange(event.target.value)}
                    placeholder={tr("ui.modules.browser.pages.AutomationPageModals.label.b28b7af")}
                  />
                </FormItem>
                <FormItem label={tr("browser.pages.AutomationPageModals.label.f25c4ec")}>
                  <Input
                    value={gitScriptPath}
                    onChange={(event) => onGitScriptPathChange(event.target.value)}
                    placeholder={tr("browser.pages.AutomationPageModals.placeholder.dcbd165")}
                  />
                </FormItem>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
  );
}
