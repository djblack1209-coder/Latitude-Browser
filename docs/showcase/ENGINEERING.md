# Engineering · Latitude Browser 2.2

[中文首页](../../README.md) · [English](../../README.en.md) · [真实演示](DEMO.md)

Latitude Browser is a Go/Wails desktop application with a React/TypeScript interface and SQLite-backed local state. Fieldwork 2.2 joins particle interaction, continuous identity, actual ASCII rendering and sharp operational surfaces while preserving the existing managers, language layer and workflow handlers.

## Read the code by responsibility

| Responsibility | Entry |
| --- | --- |
| Native application lifecycle | `main.go`, `backend/app_startup.go`, `backend/app_shutdown.go` |
| Desktop UI and routing | `frontend/src/App.tsx`, `frontend/src/routes/AppRoutes.tsx` |
| Visual tokens and composition | `backend/internal/uistyle/tokens.css`, `frontend/src/shared/theme/fieldwork.css` |
| Persistent field and UI anchors | `frontend/src/shared/layout/LatitudeField.tsx` |
| Grain model / renderer | `frontend/src/shared/layout/fieldwork/fieldModel.ts`, `frontend/src/shared/layout/fieldwork/fieldRenderer.ts` |
| Language and diagnostics | `frontend/src/shared/i18n/`, `backend/internal/locale/`, `frontend/src/shared/components/AppErrorBoundary.tsx` |
| Profiles and real browser state | `backend/app_instance_status.go`, `backend/internal/browser/`, `frontend/src/modules/browser/` |
| Proxy stack contract | [Xray + sing-box / independent Mihomo](../proxy-connector-stacks.md) |
| Automation and local API | `backend/internal/automation/`, `backend/internal/launchcode/` |
| Package identity and recovery | [macOS artifact contract](../../publish/mac/README.md), `tools/runtime/` |

## Changes a reviewer can trace

1. `FieldworkProvider` mounts a single canvas outside routed children. Registered overview, heading and sidebar anchors reserve layout space. Selection, view mode, route and profile status publish actual UI state through a stable runtime; rendering does not update React state every frame.
2. `fieldModel.ts` owns stable grain identities, projection, pointer impulses and bounded spring integration. `fieldRenderer.ts` owns Canvas 2D, character-cell depth selection, glyph/point blending, visible-anchor selection and scheduling. Its 320 × 176 logical canvas caps DPR at 2, stops when settled, suspends while the document is hidden, snaps under reduced motion and leaves SVG available when Canvas 2D fails. Event listeners, observers and scheduled frames are disposed on unmount.
3. The sharp visual system uses shared 2/4/6 px radii, lime selection/primary actions, lilac identity and red Stop/destructive actions. Local procedural depth plates adapt the reference's video layering. No new runtime dependency or remote media request is introduced.
4. Existing native close still closes the launch gate, performs managed cleanup and quits without confirmation. Failure retains ownership and the retry gate. Nil fingerprint arguments and rendering-error recovery retain the 2.1 fixes.
5. Production still requires the desktop bridge; only explicit development preview uses visibly labeled mock data. Core defaults, saved profile bindings and connector-stack execution are unchanged. Packaging validates runtime hashes, identity, architecture and signatures, and keeps inspection bundles outside indexing.

## Verification boundaries

The 2.2 pass completed TypeScript/Vite and Wails builds, 124 frontend tests, `go test ./backend/...`, 34 bilingual/viewport/fallback UI checks, nine motion/state integration checks and macOS artifact validation. Three model tests cover bounded pointer displacement and return, large-frame/reduced-motion handling, and finite projection across profile poses. Integration checks cover pointer pixels, idle scheduling, keyboard view changes, selection identity, route continuity, reduced motion and fallback. Visibility policy uses controlled events because automation Chrome kept tabs visible; actual OS occlusion was not measured.

The canonical installed App supplied real English/Chinese window captures. Isolated native checks exercised Chrome 148.0.7778.215 and 157.0.8103.38 through App API/CDP readiness, local navigation, back and tab operations. The QA launcher retains Chromium's normal macOS HOME while enforcing an independent user-data directory. Normal native quit with a running 157 instance released owned processes and ports. The installed executable and original user view preferences were unchanged by the checks.

The native capture helper verifies the application identity and captures its real window; its accessibility readback covers the native window/menu, not all WKWebView content. Remote proxy connectivity, Tor, Windows/Linux and fingerprint/anonymity claims were not newly certified. Commands, exact evidence, source adaptations and historical 2.1 results are in [the execution result](../../LATITUDE-APP-REDESIGN-RESULT-2026-11-06.md).

For contribution and provenance requirements, read [CONTRIBUTING](../../CONTRIBUTING.md), [LICENSE-SCOPE](../../LICENSE-SCOPE.md) and [third-party notices](../../third_party/NOTICE.md). Original upstream history and unrelated local work remain preserved.
