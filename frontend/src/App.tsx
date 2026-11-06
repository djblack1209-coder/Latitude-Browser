import { tr, useLocale } from './shared/i18n'
import { reportFrontendError } from './shared/components/AppErrorBoundary'
import { Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "./shared/theme";
import { Layout } from "./shared/layout";
import { ToastContainer, Loading, toast } from "./shared/components";
import { AppRoutes } from "./routes/AppRoutes";
import { lazyNamed } from "./routes/lazyNamed";
import { useNotificationStore } from "./store/notificationStore";
import { installWailsOperationLogger } from "./utils/wailsOperationLogger";
import { DesktopServiceBoundary } from "./shared/components/DesktopServiceBoundary";


const QuickLaunchModal = lazyNamed(
  () => import("./modules/browser/components/QuickLaunchModal"),
  "QuickLaunchModal",
);

function useWailsNotifications() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const runtime = (window as any).runtime;
    if (!runtime?.EventsOn) return;

    const offQuitFailed = runtime.EventsOn('app:quit-failed', () => {
      toast.error(tr('App.CloseConfirmModal.88b1c71'));
    });

    const offCrashed = runtime.EventsOn(
      "browser:instance:crashed",
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: "error",
          title: tr("App.title.e66818d"),
          message: tr("App.message.973161a", [data.profileName || data.profileId, data.error]),
        });
      },
    );

    const offBridgeFailed = runtime.EventsOn(
      "proxy:bridge:failed",
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: "warning",
          title: tr("App.title.7e670fe"),
          message: `「${data.profileName || data.profileId}」${data.error}`,
        });
        toast.warning(tr("App.useWailsNotifications.1794a89", [data.profileName || data.profileId]), 6000);
      },
    );

    const offBridgeDied = runtime.EventsOn(
      "proxy:bridge:died",
      (data: { key: string; error: string }) => {
        addNotification({
          type: "warning",
          title: tr("App.title.d168497"),
          message: tr("App.message.e749293", [data.key]),
        });
      },
    );

    const offTorDied = runtime.EventsOn(
      "tor:runtime:died",
      (data: { profileId: string; error: string }) => {
        const message = data.error || tr("App.useWailsNotifications.7ae9827");
        addNotification({ type: "error", title: tr("App.title.e0b2476"), message });
        toast.error(message, 8000);
      },
    );

    return () => {
      offQuitFailed?.();
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
      reportFrontendError(event.message || toMessage(event.error));
      addNotification({
        type: "error",
        title: tr("App.title.1703b36"),
        message: event.message || toMessage(event.error) || tr("App.useGlobalErrorNotifications.2c73833"),
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportFrontendError(toMessage(event.reason));
      addNotification({
        type: "error",
        title: tr("App.title.f7c72e3"),
        message: toMessage(event.reason) || tr("App.useGlobalErrorNotifications.3efd48f"),
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


function App() {
  useLocale()

  useEffect(() => {
    installWailsOperationLogger();
  }, []);
  useWailsNotifications();
  useGlobalErrorNotifications();
  const [quickLaunchOpen, setQuickLaunchOpen] = useState(false);
  const routeFallback = (
    <div className="flex min-h-[240px] items-center justify-center py-10">
      <Loading text={tr("App.text.31b0fbc")} />
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

    const onQuickLaunch = () => setQuickLaunchOpen(true);
    window.addEventListener("latitude:quick-launch", onQuickLaunch);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("latitude:quick-launch", onQuickLaunch);
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
