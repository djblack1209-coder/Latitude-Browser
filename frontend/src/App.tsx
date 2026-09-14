import { Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "./shared/theme";
import { Layout } from "./shared/layout";
import { ToastContainer, Modal, Button, Loading, toast } from "./shared/components";
import { AlertCircle } from "lucide-react";
import { AppRoutes } from "./routes/AppRoutes";
import { lazyNamed } from "./routes/lazyNamed";
import { useNotificationStore } from "./store/notificationStore";
import { useBackupStore } from "./store/backupStore";
import { installWailsOperationLogger } from "./utils/wailsOperationLogger";
import { DesktopServiceBoundary } from "./shared/components/DesktopServiceBoundary";
import {
  ForceQuit as ForceQuitApp,
  QuitAppOnly as QuitAppOnlyApp,
} from "./wailsjs/go/main/App";
import {
  WindowHide,
  WindowMinimise,
} from "./wailsjs/runtime/runtime";

const QuickLaunchModal = lazyNamed(
  () => import("./modules/browser/components/QuickLaunchModal"),
  "QuickLaunchModal",
);

function useWailsNotifications() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const runtime = (window as any).runtime;
    if (!runtime?.EventsOn) return;

    const offCrashed = runtime.EventsOn(
      "browser:instance:crashed",
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: "error",
          title: "实例异常退出",
          message: `「${data.profileName || data.profileId}」意外崩溃：${data.error}`,
        });
      },
    );

    const offBridgeFailed = runtime.EventsOn(
      "proxy:bridge:failed",
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: "warning",
          title: "代理已降级直连",
          message: `「${data.profileName || data.profileId}」${data.error}`,
        });
        toast.warning(`「${data.profileName || data.profileId}」代理桥接失败，已直连启动`, 6000);
      },
    );

    const offBridgeDied = runtime.EventsOn(
      "proxy:bridge:died",
      (data: { key: string; error: string }) => {
        addNotification({
          type: "warning",
          title: "连接池节点失效",
          message: `代理节点 ${data.key} 连接中断，相关实例可能无法访问网络`,
        });
      },
    );

    const offTorDied = runtime.EventsOn(
      "tor:runtime:died",
      (data: { profileId: string; error: string }) => {
        const message = data.error || "Tor 传输已中断，不会切换到常规代理或直连。请检查实例状态。";
        addNotification({ type: "error", title: "Tor 传输中断", message });
        toast.error(message, 8000);
      },
    );

    return () => {
      offCrashed?.();
      offBridgeFailed?.();
      offBridgeDied?.();
      offTorDied?.();
    };
  }, [addNotification]);
}

function useGlobalErrorNotifications() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const toMessage = (value: unknown) => {
      if (value instanceof Error) return value.message || String(value);
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const handleError = (event: ErrorEvent) => {
      addNotification({
        type: "error",
        title: "前端异常",
        message: event.message || toMessage(event.error) || "未知脚本错误",
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      addNotification({
        type: "error",
        title: "未处理异步异常",
        message: toMessage(event.reason) || "未知 Promise 异常",
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [addNotification]);
}

function CloseConfirmModal() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("");
  const [quittingAction, setQuittingAction] = useState<
    "app-only" | "app-and-browser" | null
  >(null);
  const importInProgress = useBackupStore((s) => s.importInProgress);
  const importProgress = useBackupStore((s) => s.importProgress);
  const importMessage = useBackupStore((s) => s.importMessage);
  const supportsTray = platform === "windows";
  const quitting = quittingAction !== null;

  useEffect(() => {
    const runtime = (window as any).runtime;
    if (!runtime?.EventsOn) return;

    const off = runtime.EventsOn("app:request-close", () => {
      setQuittingAction(null);
      setOpen(true);
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const runtime = (window as any).runtime;

    // The Wails runtime is only injected inside the desktop shell. Keep the
    // browser/Vite preview usable when it is not available.
    if (typeof runtime?.Environment !== "function") {
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve(runtime.Environment())
      .then((info) => {
        if (!cancelled && info?.platform) {
          setPlatform(info.platform);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const closeModal = () => {
    if (quitting) return;
    setOpen(false);
  };

  const handleMinimize = () => {
    if (quitting) return;
    setOpen(false);
    const runtime = (window as any).runtime;
    if (supportsTray && typeof runtime?.WindowHide === "function") {
      WindowHide();
      return;
    }
    if (typeof runtime?.WindowMinimise === "function") {
      WindowMinimise();
    }
  };

  const handleQuitAppOnly = async () => {
    setQuittingAction("app-only");
    try {
      await QuitAppOnlyApp();
    } catch (error) {
      console.error("QuitAppOnly failed; runtime remains open for retry", error);
      toast.error("受管实例或其运行时尚未确认退出，应用保持打开状态，可重试关闭");
      setQuittingAction(null);
    }
  };

  const handleQuitAppAndBrowsers = async () => {
    setQuittingAction("app-and-browser");
    try {
      // ForceQuit owns the shutdown gate. Never fall back to runtime.Quit:
      // the backend deliberately returns without quitting when a browser or
      // Tor sidecar cannot be proven stopped.
      await ForceQuitApp();
    } catch (error) {
      console.error("ForceQuit failed; runtime remains open for retry", error);
      toast.error("仍有浏览器或 Tor 运行时未能确认退出，应用保持打开状态");
      setQuittingAction(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="关闭应用确认"
      width={importInProgress ? "360px" : "420px"}
      closable={!quitting}
    >
      <div className="flex flex-col items-center pt-2 pb-6 px-4">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            importInProgress
              ? "bg-[var(--color-bg-muted)] text-[var(--color-warning)]"
              : "bg-[var(--color-bg-muted)] text-[var(--color-error)]"
          }`}
        >
          <AlertCircle className="w-6 h-6" />
        </div>
        {importInProgress && (
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            正在加载中，是否关闭？
          </h3>
        )}
        {importInProgress ? (
          <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
            当前正在加载配置
            {importProgress > 0 ? `（${importProgress}%）` : ""}。
            <br />
            {importMessage || "退出将等待当前配置操作和受管进程清理完成。"}
          </p>
        ) : (
          <p className="mb-6 text-sm text-center text-[var(--color-text-secondary)]">
            仅退出应用通常保留普通浏览器。
            <br />
            有 Tor 会话时，两种退出方式均执行完整清理，关闭全部受管浏览器与传输。
          </p>
        )}

        <div
          className={`w-full ${importInProgress ? "flex gap-3" : "flex flex-col gap-2"}`}
        >
          {importInProgress ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={closeModal}
                disabled={quitting}
              >
                继续加载
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleQuitAppAndBrowsers}
                loading={quittingAction === "app-and-browser"}
              >
                仍要关闭
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="w-full"
                onClick={supportsTray ? handleMinimize : closeModal}
                disabled={quitting}
              >
                {supportsTray ? "最小化到托盘" : "取消"}
              </Button>
              <Button
                className="w-full"
                onClick={handleQuitAppOnly}
                loading={quittingAction === "app-only"}
                disabled={quitting}
              >
                仅退出应用
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={handleQuitAppAndBrowsers}
                loading={quittingAction === "app-and-browser"}
                disabled={quitting}
              >
                退出应用与浏览器
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function App() {
  useEffect(() => {
    installWailsOperationLogger();
  }, []);
  useWailsNotifications();
  useGlobalErrorNotifications();
  const [quickLaunchOpen, setQuickLaunchOpen] = useState(false);
  const routeFallback = (
    <div className="flex min-h-[240px] items-center justify-center py-10">
      <Loading text="页面加载中..." />
    </div>
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setQuickLaunchOpen((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <ThemeProvider>
      <DesktopServiceBoundary>
      <Router>
        <Layout>
          <Suspense fallback={routeFallback}>
            <AppRoutes />
          </Suspense>
        </Layout>
        <ToastContainer />
        <CloseConfirmModal />
        <Suspense fallback={null}>
          {quickLaunchOpen ? (
            <QuickLaunchModal
              open={quickLaunchOpen}
              onClose={() => setQuickLaunchOpen(false)}
            />
          ) : null}
        </Suspense>
      </Router>
      </DesktopServiceBoundary>
    </ThemeProvider>
  );
}

export default App;
