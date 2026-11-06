# Engineering · Latitude Browser 2.1

[中文首页](../../README.md) · [English](../../README.en.md) · [真实演示](DEMO.md)

Latitude Browser is a Go/Wails desktop application with a React/TypeScript interface and SQLite-backed local state. Fieldwork changes the application shell and shared visual system while keeping the browser managers, connector selection and existing workflow handlers.

## Read the code by responsibility

| Responsibility | Entry |
| --- | --- |
| Native application lifecycle | `main.go`, `backend/app_startup.go`, `backend/app_shutdown.go` |
| Desktop UI and routing | `frontend/src/App.tsx`, `frontend/src/routes/AppRoutes.tsx` |
| Visual tokens and layout | `backend/internal/uistyle/tokens.css`, `frontend/src/shared/layout/`, `frontend/src/shared/theme/terminal.css` |
| Language and diagnostics | `frontend/src/shared/i18n/`, `backend/internal/locale/`, `frontend/src/shared/components/AppErrorBoundary.tsx` |
| Profiles and real browser state | `backend/app_instance_status.go`, `backend/internal/browser/`, `frontend/src/modules/browser/` |
| Proxy stack contract | [Xray + sing-box / independent Mihomo](../proxy-connector-stacks.md) |
| Automation and local API | `backend/internal/automation/`, `backend/internal/launchcode/` |
| Package identity and recovery | [macOS artifact contract](../../publish/mac/README.md), `tools/runtime/` |

## Changes a reviewer can trace

1. A native close closes the launch gate synchronously, performs managed cleanup asynchronously, then permits the final native quit. There is no frontend confirmation event. Cleanup failure restores the retry gate and retains runtime ownership.
2. An API profile can contain a nil fingerprint-argument slice. Workspace classification treats it as an empty configuration, preventing a native render failure. The application boundary can recover from other rendering errors and records them through the existing logger.
3. Shared design tokens cover the desktop and browser-facing pages. The dot graticule uses static SVG; it does not run a canvas loop or fabricate network observations.
4. Production does not silently use development mock data when a desktop bridge method is unavailable. The UI preview is an explicit development mode with a visible label.
5. Packaging validates the selected platform, runtime hashes, icon, identity and signatures, then keeps inspection bundles out of indexing. The canonical installed app is the only launch target.

## Verification boundaries

The 2026-11-06 pass ran the frontend build, 121 frontend tests, `go test ./backend/...`, 34 bilingual/viewport UI checks, package-contract validation and native app/browser flows. The native test created disposable profiles and opened a local witness page; it did not use personal browser sessions or production proxies.

Chrome 157 passed real navigation and tab operations using a QA launcher that preserves the normal macOS home for Chromium services while enforcing an isolated user-data directory. The existing 148 core failed CDP readiness in QA; its default binding was kept. Remote proxy connectivity, Tor, Windows and Linux were not newly certified by this UI pass. Detailed commands, evidence and pending work are in [the execution result](../../LATITUDE-APP-REDESIGN-RESULT-2026-11-06.md).

For contribution and provenance requirements, read [CONTRIBUTING](../../CONTRIBUTING.md), [LICENSE-SCOPE](../../LICENSE-SCOPE.md) and [third-party notices](../../third_party/NOTICE.md). The original upstream history and existing local implementation work are preserved.
