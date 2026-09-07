# Latitude Signal UI 与 Tor 传输验收记录

验收时间：2026-09-06 UTC / 2026-09-07 SGT（UTC+08:00）。

## 结论与范围

- **UI 已实现并通过浏览器回归**：19 个侧边栏路由/视图，深浅主题与三个宽度共 114 项，加 9 项交互，总计 **123/123**。
- **受管 Tor TCP 实验功能已落地并通过标准 Chrome 的真实原生网络回归**：**18/18**，包含官方 HTTPS 检查、重启及 Tor 进程故障后的依赖浏览器停机。
- **生产匿名准入未通过**：`productionReady=false`，默认关闭。不声称 Tor Browser 等价、完整泄漏防护或“两层匿名”。实际指纹内核与包级网络审计仍在准入清单中。
- 不提交、推送或公开发布。本轮保留已有工作区变更；不迁移生产配置，不在产品包中加入 Tor 二进制。

## 1. UI 实现与证据

视觉语言：石墨黑、受控绿色状态、细分隔线、紧凑但有层次的排版。强调页面主要操作，而非给每页添加装饰卡片或虚构仪表数据。

| 工作区 | 覆盖内容 |
|---|---|
| 实例 | 自动配置、总览、最近活动、待处理、指纹模板视图 |
| 网络 | 代理池、连接栈、Tor 实验室、网络诊断 |
| 资源与自动化 | 浏览器内核、插件、书签、自动化、运行记录 |
| 系统 | 常规设置、自动化运行时、备份与数据、文档中心、全部日志 |

复用三个参考仓库的具体边界见 [UI 来源](latitude-signal-ui-sources.md)：commander 的 COBE 生命周期/雷达样式、ascii 的分段进度适配；dex-ui 仅作终端/线框视觉参考，未移植它的 C++ 引擎。新增依赖只有锁定的 `cobe@2.0.1`，没有为此增加 Three.js、动画框架或服务端素材请求。

最终浏览器报告：

`output/playwright/workspace-full-20260907-releasecheck/report.json`

- 19 路由 × 1440×960 / 900×800 / 375×800 × dark / light = 114 项。
- 9 项操作包括键盘导航/视图模式、mock 实例启动/停止、工作区计算、mock Tor 编辑往返、书签保存、设置草稿/离开确认、关闭失败恢复、COBE 暂停/恢复与 reduced motion。
- 路由巡检检查可见内容、横向溢出、浏览器错误，并保留 114 张截图。
- **这些是前端 mock**：报告显式 `backendVerified=false`、`nativeAppVerified=false`。除了指定 Vite origin 外，外部请求被测试拦截；mock 测速/启动不是网络成功证据。
- 实际看过最终桌面深色代理池（静止地球已有点阵纹理）、桌面浅色 Tor 面板、375 px 深色代理池及实例列表截图。Globe、雷达与 ASCII 状态都不生成“安全分数”或假节点。

复现：

```bash
# 仓库根目录；Playwright 复用已有安装，不增加项目依赖
LATITUDE_PLAYWRIGHT_NODE_MODULES=/absolute/path/to/node_modules \
  LATITUDE_VERIFY_URL=http://127.0.0.1:5218 \
  node frontend/scripts/verify-workspace.mjs --scope=full

cd frontend
./node_modules/.bin/tsc --noEmit
npm run build:keep
```

构建记录：`/tmp/latitude-frontend-build-20260907-releasecheck.log`。COBE 独立 chunk 约 12.98 kB（gzip 5.95 kB），不作为首屏必须加载的依赖。未据此宣称 Core Web Vitals 或所有 GPU 的性能指标已通过。

## 2. Go 确定性与 race 检查

| 命令 | 结果 | 原始记录 |
|---|---|---|
| `go test ./... -count=1 -json` | 256 个测试/子测试通过；7 个有测试包通过 | `output/native-tor/final-20260907/go-test.jsonl` |
| `go test -race ./backend/internal/proxy ./backend/internal/browser ./backend/internal/launchcode ./backend -count=1 -json` | 216 个测试/子测试通过；4 包通过；无 race 报告 | `output/native-tor/final-20260907/go-race.jsonl` |

两个默认命令中的 `TestTorManagerRealBinary` 均明确 **SKIP**，原因是没有设置测试专用的 `LATITUDE_TOR_BINARY`。9 个无测试包的包级 skip 也不计为测试通过。单独的真实管理器测试此前使用核验后的官方二进制执行，通过用时 42.49 秒，原始输出已保留在 `output/native-tor/managed-tor-real-binary.log`，不能把它混入上述确定性计数。

重点回归：

- 旧实例普通模式默认值、Tor/普通代理互斥、导入/更新校验与运行中禁止切换。
- Tor 配置权限、引导等待、端口/握手就绪、运行时故障与进程清理。
- 默认启动参数必须在受管净化前应用，第一次启动与再次启动一致。
- SOCKS 代理 IP 的 DNS 例外仅为 `127.0.0.1`，不是取消 loopback 代理约束。
- CDP 关闭后确认进程退出；只对当前持有的相符子进程进行有界强制清理。
- 旧监控器不能停止替代实例，Tor 错误不被异步正常退出覆盖。
- 原生关闭回调不等待 Tor 引导；退出请求即时阻止新启动，重叠退出不得重置授权。
- 备份初始化/导入在完整运行时事务期间持有生命周期门，停止失败不继续销毁受管状态。

## 3. 真实原生 Tor 网络回归

执行器：`frontend/scripts/verify-native-tor.mjs`。

已通过报告：`output/native-tor/native-tor-20260907-releasecheck-retry/evidence.json`，**18/18**，清理错误 **0**。

最终安装构建的第一次冷启动在 75 秒 Tor 引导窗口内未就绪，10 项前置检查通过后启动检查失败；报告保留为 `output/native-tor/native-tor-20260907-releasecheck/evidence.json`。没有启动 Chrome，也没有回退直连。随后仅用一个独立 QA 夹具重试，18 项全部通过；未修改超时、代理约束或 TLS 校验。该失败仍是冷引导可用性边界，后续成功不抹除它。

这不是浏览器 preview，也不是 curl 代替 Chrome：

1. 确认 API listener 属于唯一正式可执行文件，且 HOME 是隔离 QA 目录。
2. 未认证请求返回 401，认证健康检查成功。
3. 创建接口拒绝 Tor + 代理配置、Tor + 直连标记，运行时拒绝临时直连覆盖。
4. 普通实例保留原默认流程；Tor 实例没有普通代理绑定。
5. 经正式 Wails/Go 应用启动受管 Tor 与 **标准 Google Chrome**，CDP ready，继承的默认参数与 Tor 约束同时生效。
6. Chrome 实际访问 `https://check.torproject.org/api/ip`，JSON `IsTor:true`，TLS 校验开启。
7. 正常停止确认旧 Tor/Chrome 退出，重新启动后再次访问相同 HTTPS 端点，`IsTor:true`。
8. 只终止本次创建的 QA Tor PID；检测到浏览器停止，Tor 错误被保留，未启动普通代理或直连替代实例。
9. 只删除本次创建的 QA 配置；清理错误为零。报告不保存出口 IP 或 API key。

### QA 隔离和证书服务

- 管理器 HOME：`/tmp/latitude-native-qa-20260906`。
- 所有测试浏览器都有显式隔离 `user-data-dir`，位于该 HOME 的 Latitude 数据目录下 `data/native-qa/`。
- 实际测试内核为 **Google Chrome 152.0.7977.76**，不是项目的指纹内核。
- macOS 下将 Chrome 的 OS HOME 也改到临时目录，会让本次环境的证书路径构建卡住，普通直连 HTTPS 也能复现；不能把这个超时归咎为 Tor 成功或失败。
- 因此隔离 QA 配置使用一个临时 launcher：它只接受恰好一个、位于 QA 根目录且无路径遍历的 `--user-data-dir`，恢复 OS HOME 以保留 macOS 证书服务，然后 `exec` 正常 Chrome。浏览器配置/存储仍隔离，进程 PID 所有权不变。
- **没有关闭证书校验、TLS、安全沙箱、Gatekeeper 或 SIP；没有读取/使用生产浏览器 profile 或修改生产 Latitude 配置。** 这不是完全隔离 OS 信任服务的测试环境，也不是产品内新加入的启动适配器。
- QA launcher 的路径与 SHA 记录在对应 `build-*.json`。评估 Tor 文件只留在临时评估目录，不随产品分发。

复现时必须先建立自己隔离的 QA 配置并核验 Tor。不要将命令中的 HOME 换成生产 HOME：

```bash
HOME=/tmp/latitude-native-qa-<run> \
  LATITUDE_NATIVE_QA_BASE_URL=http://127.0.0.1:<qa-port> \
  LATITUDE_NATIVE_QA_API_KEY='<qa-only-key>' \
  LATITUDE_NATIVE_QA_NATIVE_PID=<canonical-qa-app-pid> \
  node frontend/scripts/verify-native-tor.mjs
```

## 4. 原生关闭与安装入口

最终构建：`output/native-tor/build-20260907-releasecheck.json`。最终安装与清理复核：`output/native-tor/install-releasecheck-20260907.json`。

最终可执行文件 SHA-256：`a1ec8b7d89c96b136c86cf22af2df59a4f241266ec3f7a8bd7bee5520919e8f8`。已验证 ad-hoc 代码签名，但不将其描述为 Apple Developer ID 公证。

额外原生关闭证据：`output/native-tor/native-close-20260907-texture/evidence.json`，**7 项检查通过**。在实际 Tor 和 Chrome 已启动时，用原生窗口关闭按钮打开确认，再点击「仅退出应用」；管理器、Tor、捕获到的全部 9 个 Chrome 进程均退出，没有替代进程，QA API listener 关闭。随后只在相同隔离 HOME 重启管理器删除自建测试配置，再退出 QA 应用。

此关闭测试针对 texture 构建，最后的 releasecheck 构建只进一步澄清了关闭文案，后端没有变化。文案和前端拒绝恢复逻辑在最终 123 项回归中重新检查；最终安装构建的 18 项真实网络测试也单独重跑。构建产物从未作为启动入口。

- 正式名称 `Latitude Browser`，Bundle ID `com.latitude.browser.desktop`。
- 唯一正式入口 `/Applications/Latitude Browser.app`。
- notices 随应用放入 `Contents/Resources/third_party/`；不带 Tor 二进制或 QA 配置。
- 构建 `.app` 移到 `.bundles.noindex/`，旧安装备份使用不带 `.app` 的路径；旧 LaunchServices 记录清理后，系统索引仅保留正式入口。
- macOS 原生关闭确认和取消已在实际窗口观察，不只检查 React mock。
- 关闭确认明确提示：有 Tor 会话时，两种退出方式均会关闭**全部**受管浏览器，不会暗示普通浏览器一定能保留。
- 原生 WebView 已实际观察到 COBE 点阵纹理；初始化期间的 SVG fallback 没有遮住最终画布。
- 最后在正式入口观察到新的退出提示，并点击「退出应用与浏览器」。隔离 QA 管理器 PID 2002 已退出，19878 端口关闭，无 QA Chrome/Tor 遗留进程。最终测试夹具已从活动列表移除，仅保留原 QA 默认实例；本轮 preview 服务也已停止。未启动生产 HOME 的应用。

## 5. 保留的失败与修复证据

不覆盖失败报告来制造全绿：

| 早期证据 | 根因 / 处理 |
|---|---|
| `workspace-full-20260907-final/` | preview 服务已停止，非 UI pass；增加服务器 preflight 后用活跃 preview 重跑 |
| `workspace-full-20260907-preview/` | 122/123；暂停导致 renderer 重建及控件短暂消失，改为只调整调度 |
| `native-tor-20260907-pre-gates/` | CDP 就绪早于 page target；停止确认不足。补有界就绪等待及进程确认 |
| `native-tor-20260907-verified/` | SOCKS 本地代理 IP 也被 Chromium host-resolver mapping 阻断。仅豁免受管 IP |
| `native-tor-20260907-routefix/` | 代理已连通，但隔离 OS HOME 导致证书服务卡住。QA 专用 launcher 保留正常信任服务 |
| `native-close-20260907-final/` | 同一 QA 实例两次 Tor 引导超过 75 秒，均没有启动 Chrome，停止后无 Tor 遗留。未修改生产超时限制或退回直连；该次活动会话关闭检查未执行，后续独立夹具 `native-close-20260907-texture/` 成功 |
| `native-tor-20260907-releasecheck/` | 最后构建首次冷引导超过 75 秒；未启动浏览器、无直连回退，清理无错误。失败原件与脱敏诊断保留，独立夹具 `native-tor-20260907-releasecheck-retry/` 18/18 通过；未改生产参数 |
| 静止 Globe 截图 | COBE 异步纹理上传后没有初始重绘；一次同相机重绘修复，无持续低动态动画 |

失败记录和修复后的绿色记录的范围不同，不能择取失败中的 mock 成功项当作真实网络证据。诊断用的原始 netlog 仅在临时 QA 目录中，不放入仓库报告，以免暴露出口地址或证书细节。

## 6. 仍未验收的边界

- 实际指纹内核下 DNS / IPv6 / DoH / WebRTC / UDP / QUIC 的逐包泄漏测试。
- 原生 Windows、Linux 的生命周期、系统代理策略、证书和沙箱行为。
- 线路失效、睡眠恢复、对抗性的启动参数/PAC/扩展/CDP 绕过与长期压力测试。
- 稳定指纹、登录账号、Cookie、持久化存储及流量时序造成的身份关联。
- 正式运行时更新、Apple Developer ID 公证、精确 Tor 构建的再分发许可与对应源码义务。

这些是匿名产品声明的门槛，不是本轮 18 项传输 MVP 功能测试已经覆盖的内容。下一步建议先选择实际指纹内核，执行隔离的包级泄漏矩阵，再决定是否扩大匿名功能承诺。
