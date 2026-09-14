<p align="center"><img src="images/showcase/hero.svg" alt="Latitude Browser — A local workspace for isolated browser environments" width="100%" /></p>

<p align="center"><strong>Browser profiles, proxy routing, and automation. One local workspace.</strong></p>

<p align="center"><a href="README.md">简体中文</a> · English · <a href="docs/showcase/ENGINEERING.md">Engineering walkthrough (中文)</a> · <a href="docs/showcase/DEMO.md">Demo guide (中文)</a></p>

## What it is

Latitude Browser is a desktop workspace for managing separate Chromium profiles, their proxy connections, and trusted local automation. It brings environment configuration and process controls together for local Web testing and repeatable browser workflows.

It builds on [black-ant/Ant-Browser](https://github.com/black-ant/Ant-Browser). Latitude's changes include a terminal-inspired interface, guided environment setup, connector and network-state handling, and a consistent macOS installation entry. This is a derivative application, not an independently developed Chromium engine. The [engineering guide](docs/showcase/ENGINEERING.md) links the work to source files and commits.

<img src="images/showcase/workspace.png" alt="Latitude's browser profile workspace with four fictional test environments" width="100%" />

*Browser UI preview with fictional data. This screenshot does not establish native process execution, working proxy exits, or end-to-end desktop verification.*

## Features

- **Separate profiles:** individual data directories, launch arguments, tags, and proxy bindings.
- **Guided setup:** network entry, device baseline, fingerprint strategy, then confirmation.
- **Explicit connector selection:** an Xray + sing-box combination or an independent Mihomo stack. No automatic switching between the two stacks.
- **Local automation:** script packages and a local API for trusted code.
- **Local storage:** SQLite-backed configuration and backup/recovery entry points.

Profile separation is not a security sandbox or a guarantee of anonymity. Automation scripts run with the current user's permissions. Review scripts before execution.

## Explore the interface

Requires Node.js 22 and npm. Use this in an environment where you have permission to access and use the source:

```bash
git clone --depth 1 https://github.com/djblack1209-coder/Latitude-Browser.git
cd Latitude-Browser/frontend
npm ci
npm run dev:raw
```

Open the local URL printed in the terminal, normally `http://127.0.0.1:5218`. The browser preview uses demonstration state; desktop processes, actual proxy operations, and local file operations require the Wails runtime. Pinned proxy binaries make the initial clone relatively large.

From the repository root:

```bash
npm --prefix frontend run build:clean
go test ./backend/...
python3 tools/check-showcase.py
```

CI uses Go 1.26.x. Desktop development requires Wails v2.12.0 and [platform-specific native dependencies](https://wails.io/docs/gettingstarted/installation). See the [macOS](publish/mac/README.md) and [Linux](publish/linux/README.md) build guides; Windows uses `bat\dev.bat`. The formal macOS installation path is `/Applications/Latitude Browser.app`.

**There is no downloadable Release from this repository yet.** Platform build scripts do not establish that every platform has been tested. Signing, notarization, runtime distribution, and cross-platform verification remain release work; see the [Roadmap](ROADMAP.md).

## Read the architecture

The React/TypeScript frontend calls a Go application through Wails bindings. The backend coordinates profile storage, browser processes, proxy bridges, and local scripts. A Chromium process and its proxy runtime remain separate processes from the desktop shell.

Start with the [engineering guide](docs/showcase/ENGINEERING.md), [connector contract](docs/proxy-connector-stacks.md), and [five-minute demo](docs/showcase/DEMO.md).

## Contribute

Reproducible bug reports and concrete workflow feedback are welcome. Read [CONTRIBUTING](CONTRIBUTING.md) and [SECURITY](SECURITY.md) before sharing logs or screenshots. If the project is useful to you, a **Star** helps others discover it.

## Provenance and licensing

Thanks to [Ant-Browser](https://github.com/black-ant/Ant-Browser) for the application foundation, and to [fingerprint-chromium](https://github.com/adryfish/fingerprint-chromium), [Wails](https://github.com/wailsapp/wails), [Xray-core](https://github.com/XTLS/Xray-core), [sing-box](https://github.com/SagerNet/sing-box), and [Mihomo](https://github.com/MetaCubeX/mihomo).

The upstream repository still had no standalone LICENSE when checked on September 14, 2026. No project-wide MIT, Apache, or equivalent license is granted here. Visibility does not grant redistribution or commercial-use rights. See the [source record](docs/plan/source-migration-and-license.md) and [third-party notices](third_party/NOTICE.md); authorization and distribution obligations remain to be resolved.
