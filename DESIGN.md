# Latitude Browser · Fieldwork 2.1

Fieldwork is a local browser control room. The interface keeps the current instance, its browser core and its network route recognizable as the user moves from a list to configuration, runtime details or automation.

## Visual system

The single token source is `backend/internal/uistyle/tokens.css`; the desktop imports it through `frontend/src/shared/theme/tokens.css`, and browser-facing pages use the same semantic colors.

| Role | Value |
| --- | --- |
| Canvas / surface / raised | `#080a09` / `#101311` / `#191d1a` |
| Main / secondary / muted text | `#edf1e9` / `#adb5aa` / `#889482` |
| Primary action / identity | Lime `#d2fa69` / lilac `#bcacee` |
| Success / warning / error | `#8edda4` / `#f3c77b` / `#ff8084` |
| Borders | `#2a302b`, strong `#3d473e` |
| Body / metadata | System sans with Chinese fallbacks / local JetBrains Mono |
| Type | 11 / 12 / 13 / 16 / 26 / 32 px |
| Controls / surfaces | 6 px / 10 px radius; dialogs 14 px |
| Main controls / navigation | 36 px / 42 px |
| Sidebar / titlebar / statusbar | 216 px / 56 px / 28 px |
| Compact sidebar | 64 px below 1100 px or on user collapse |

Lime indicates an action or selection, lilac identifies the workspace, and status colors retain their operational meaning. The dot graticule is a static illustration, not a network topology or security measurement.

## Layout and components

- The titlebar gives the current location and quick launch. Native macOS controls retain reserved space.
- The sidebar separates operational navigation from documentation and settings. A selected item has both shape and color cues.
- Instances have a visible heading, real counts, a dedicated search/action surface and a table/card switch. Creation stays on its own page; defaults, import, backup and trash retain their existing handlers.
- Shared headers, panels, tables, buttons, fields, tabs, empty states and dialogs use the same tokens. Settings use a secondary navigation column and bounded forms.
- Text and state remain readable in Chinese and English. Metadata uses tabular numbers; long paths wrap or truncate without displacing actions.
- The startup layer uses a small dot field, a short word reveal and one progress line. Keyboard, pointer or wheel input skips it; reduced motion removes its animations. There are no idle particle loops, videos or WebGL scenes in the workspace.

## Behavior and verification

Native quit starts full managed cleanup without opening a confirmation dialog. A real cleanup failure keeps ownership and offers a nonmodal error; it never bypasses the shutdown gate. The settings-page browser-unload guard applies only to web previews. Navigation away from unsaved settings still retains its existing draft protection.

A missing fingerprint argument slice is treated as no reusable fingerprint configuration. A top-level rendering boundary provides retry and optional diagnostic details instead of an empty native window; failures are recorded through the existing frontend-operation logger.

The 2026-11-06 pass checked 15 routes in both languages, table/card switching, search, quick launch and desktop/compact widths. Native checks used the canonical installed application, independent QA state and real Chrome 157. See [the result](LATITUDE-APP-REDESIGN-RESULT-2026-11-06.md) for the Chrome 148 limitation and the precise build/install evidence.

## References and authorship

The four exact entries were found at [十两 /news](https://wangshiliang.cn/news). Public preview frames were obtained; copying their complete prompts required login. The owner chose to continue from previews and record the full prompts as pending.

| Reference | Observed visual decision | Adaptation to Latitude |
| --- | --- | --- |
| AXON | Particle object with compact peripheral information | One clear workspace, restrained peripheral controls |
| Particle Self | Quiet shell around a focused identity object | Small lilac identity motif with a calm task surface |
| ASCII Studio | Monochrome character texture and lime commands | Monospace metadata, lime primary actions, static dot graticule |
| Cyber Layer | Black stage and explicit structural layers | Layered surfaces and separators; red reserved for errors |

These are preview-derived observations, not quotations or claims about unread prompt requirements. The SVG graticule and interface implementation are original project code. No reference video, thumbnail, template source or full prompt is distributed. The React Bits Pro catalog was inspected; no component code was copied or added. Existing component and font notices remain in [third-party notices](third_party/NOTICE.md).
