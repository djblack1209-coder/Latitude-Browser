# Latitude Browser App 重设计与仓库升级结果 · 2026-11-06

## 交付状态

- App：2.1.0 Fieldwork 已构建并安装到 `/Applications/Latitude Browser.app`，Bundle ID `com.latitude.browser.desktop`。最终包已实际重新启动，显示新界面与 v2.1.0，并直接退出。
- 已验证：中英文、主要页面、实际 Chrome 157 浏览器流程、真实标签页读回、App 内打开地址、快捷启动、无确认退出及受管进程清理。续办中现有 Chrome 148.0.7778.215 也通过正式 App 的 CDP 就绪、导航、后退和标签页开关检查。
- 原词：四份完整提示词均已从本机已登录 Chrome 的准确条目复制、完整阅读并私下保存；逐项比对发现的实质设计差异列入下文待办，本轮未重做 App。
- 仓库：双语首页、原生截图、设计说明、工程/演示导览与更新日志已更新。续办推送成功，远端 main 已包含读回核对的 `7dff90f9b9cce6921fc161034d00a07d35b41dff` 及其 2.1.0 发布提交；此前 HTTP 408 阻断已关闭。

## 1. 实际取得的参考

主要来源：[十两网站收录库](https://wangshiliang.cn/news)。初轮找到四个准确条目并取得公开预览帧；复制原词时遇到登录页，用户选择“先按公开预览继续，并记录原词待补”。随后按 `LATITUDE-APP-CONTINUE-2026-11-07.md`，使用本机已登录 Chrome 取得全部四份完整原词，见第 8 节。MotionSites 的四个直接详情链接在初轮读取失败；未把搜索镜像或相似 Axon 条目当成原始来源。

| 准确标题 | 来源资源 ID | 观察与迁移 |
| --- | --- | --- |
| AXON | `sites:framesbase:ea2e9bae-7ea6-4df0-a2be-6975f18d7c44` | 粒子主体、外围紧凑信息 → 集中的工作区与安静的周边控制 |
| Particle Self | `sites:framesbase:e9d9fc76-f365-48fc-8d10-26700e0f6c46` | 聚焦身份主体、克制的浮动导航 → 淡紫身份图形与清晰的当前任务 |
| ASCII Studio | `sites:framesbase:9d231c1b-d1c3-4d18-94fc-42d9f74b8413` | 字符纹理与荧光绿命令 → 等宽元数据、主要操作和静态点阵 |
| Cyber Layer | `sites:cyber-layer` | 黑色舞台、结构化层次 → 分层面板、分隔线；红色只表示错误 |

上表记录 2.1.0 发布时从预览帧作出的设计推导，不追溯改写为依据完整原词实现，也不声称验证过参考站动效。原始提示词、视频、缩略图与模板源码没有加入公开仓库。[React Bits Pro App UI](https://pro.reactbits.dev/docs/app-ui) 目录已查看；本轮未复制组件源码、引入其依赖或购买许可。

## 2. 新设计语言与实现

Fieldwork：黑色画布、荧光绿主要操作、淡紫定位图、清晰的面板层级。

| 项目 | 实现 |
| --- | --- |
| 背景 | `#080a09` / `#101311` / `#191d1a` |
| 文字 | `#edf1e9` / `#adb5aa` / `#889482` |
| 操作与身份 | `#d2fa69` / `#bcacee` |
| 状态 | 成功 `#8edda4`，警告 `#f3c77b`，错误 `#ff8084` |
| 字体 | 系统正文与中文回退；本地 JetBrains Mono 用于元数据、数字与代码 |
| 布局 | 216 px 侧栏、56 px 标题栏、28 px 状态栏；1100 px 以下使用 64 px 紧凑侧栏 |
| 组件 | 可见页面标题、实例概览、统一操作区、表格/卡片切换、6 px 控件、10 px 面板、14 px 弹窗 |
| 动效 | 静态原创 SVG 点阵；短启动层可由键盘/点击/滚轮跳过，支持减弱动态效果，无常驻粒子循环 |

令牌集中于 `backend/internal/uistyle/tokens.css`，由前端与浏览器页面共同使用。导航、列表、表单、设置、弹窗、空状态与状态栏统一更新；业务路由和原有处理器保留。没有修改 `website/`。

验收中实际发现 API 空指纹参数会触发 `fingerprintArgs.some` 异常，导致原生窗口空白；已将空值视为无可复用指纹，并验证空参数后的列表、详情和运行状态。另增加顶层错误恢复入口与现有日志通道，避免其他渲染异常留下无操作的窗口。

## 3. 退出确认移除

- 删除前端 `CloseConfirmModal` 及 `app:request-close` 交互。
- 原生关闭同步关闭启动门禁，异步执行原有受管浏览器、代理与 Tor 清理；清理完成后授权真正退出，不绕过清理门禁。
- 清理失败恢复重试门禁、保留进程归属，仅显示真实错误，不显示退出警告/确认。
- 原生 App 不注册设置页的浏览器卸载确认；页面内未保存设置的导航保护保留。
- 在浏览器仍运行时实测 `⌘Q`：没有退出确认，App 与所属浏览器退出，监听端口释放。最终签名包重开/退出也通过。

## 4. 构建与验收证据

| 检查 | 实际结果 |
| --- | --- |
| `npm --prefix frontend run build:clean` | TypeScript + Vite 生产构建通过；存在大 chunk 的优化建议，没有构建错误 |
| `npm --prefix frontend test` | 121 通过、0 失败 |
| `go test ./backend/... -count=1` | 全部通过，包含 browser、launchcode、proxy、snapshot 等包 |
| 退出与标签页针对性 Go 检查 | 原生关闭门禁、失败恢复、重复关闭、真实 CDP 标签页读取通过 |
| 浏览器 UI 巡检 | 15 个主要页面 × 中英文，另含视图切换/搜索/快捷启动与 1440/1280/900 宽度，共 34 项通过，未捕获脚本异常 |
| Wails 原生构建 | `wails build -s -m -nosyncgomod -skipbindings -platform darwin/arm64 -o latitude-browser` 通过；首次完整构建生成过绑定 |
| 完整打包 | `bash publish/mac/publish-mac.sh --arch arm64 --skip-build` 通过；运行时与图标检查通过 |
| 运行时/打包契约单测 | 15 项运行时契约、8 项 macOS 打包契约通过 |
| 文档检查 | 12 份展示文档、107 个本地链接与 SVG 检查通过 |
| 包契约 | `artifact_contract.py validate` 对最终 ZIP、身份、版本、签名、架构和关键文件校验通过 |
| 正式安装 | 最终包文件与 `/Applications/Latitude Browser.app` 清单一致；执行代码与最终包去签名后比较一致；最终签名包实际重开通过 |
| 系统入口 | 清理构建路径的 LaunchServices 注册后，Spotlight 只有 `/Applications/Latitude Browser.app` |
| 真实浏览器 | Chrome 157.0.8103.38：启动、导航、后退、新标签页、关闭标签页通过；App 打开本地 URL 后读回 `Latitude navigation verified` |
| 原生 UI | 英文/中文切换、实例列表、内核默认项、详情、Cookie 域名过滤、快捷启动与无确认退出通过 |
| 偏好与隔离 | 测试实例使用独立 QA 数据目录；原有实例筛选与语言偏好读回一致，未改用户正式配置或内核默认选择 |

原生浏览器验收使用正式 App 与受约束的 QA 启动器：App 的 HOME 独立；Chromium 保留正常 macOS HOME 以使用系统服务，并强制其用户数据目录位于 QA 路径。直接把 Chromium HOME 指向空测试目录会导致本轮观察到的就绪/渲染超时，未把这种失败当作通过。没有使用私人浏览器资料或生产代理。

本轮没有重新认证远端代理、Tor、Windows/Linux 或指纹/匿名能力。构建使用 ad-hoc 签名，未做 Developer ID 签名、公证或另建 GitHub Release。

### 本地正式产物

- ZIP：`publish/output/LatitudeBrowser-2.1.0-macos-arm64.zip`
- 清单：`publish/output/manifest-macos-arm64.json`
- ZIP SHA-256：`a74dab2c478206a83880210182f7426f22d3422c6ff04b0abbf1450130fb8657`
- 原生真实截图：`images/showcase/fieldwork-workspace-en.png`、`fieldwork-workspace-zh.png`、`fieldwork-cores-en.png`、`fieldwork-instance-tabs-en.png`。
- 验收原始输出保存在本地 `output/playwright/latitude-redesign-20261106/`，不包含认证密钥或用户浏览器资料，不推送这些运行输出。

## 5. GitHub 升级与提交范围

- 重写 `README.md` / `README.en.md`：真实原生截图、功能表、连接栈、内核选择、安装、构建、验证边界、源码目录和 PolyForm Noncommercial 1.0.0 许可说明。
- 更新 `DESIGN.md`、`CHANGELOG.md`、工程/演示导览与当前/历史设计来源区分。
- 保留现有 Git 历史和许可证范围，未将上游或第三方重新授权为维护者原创。
- 发布内容包含本地已有 2.0 App 的必要基础改动：语言层、运行时/依赖、Wails 绑定、代理下载保护等；这些在任务开始时已经存在，并作为可构建 2.1 的前提保留和验证，不归为本轮新设计发明。
- `website/`、本地 ChatGPT/Claude 绑定说明、其他任务文件和历史未跟踪素材不纳入提交，不删除其现场。
- 现有发布 remote 为 `user`：`https://github.com/djblack1209-coder/Latitude-Browser.git`，跟踪/default 分支均为 `main`；`origin` 是历史上游，不推送到它。

GitHub 仓库简介已更新为 Fieldwork 工作区说明，新增 macos、browser-management、local-automation topics；default 分支读回为 main。没有改动网站主页或部署。

初轮提交与推送（后续成功证据见第 8 节）：

- 本地发布提交：`bf7cc17ea4e7bc07e9d6a801fb59b33cc4b69eb4`，`feat: ship Fieldwork UI and Latitude Browser 2.1`，326 个文件；包含必要的既有 2.0 基础改动与本轮重设计/展示更新。
- 执行 `git push user HEAD:main`，退出码 1：`RPC failed; HTTP 408 curl 22`，随后为 sideband 连接中断。客户端尾部的 `Everything up-to-date` 未作为成功证据。
- 直接读回远端 main：仍为 `ee4a162f1cb9640df0ace2a1e31694ed809b145e`，未包含本轮发布提交；本次更新没有触发远端新 CI，不能把旧 CI 成功算成本轮通过。
- 按任务文件“push is blocked, stop that step and record it”的要求停止推送；未更换 remote、猜测其他分支、强制推送或重写历史。所有源码、截图与结果保留在本地提交中，供后续重试。
- 本结果的验证/清理/阻断说明另以本地 docs 提交保存，不再次尝试已受阻的推送。

## 6. 待办

原有三项阻断均已关闭：源码推送成功，四份原词已取得，Chrome 148 已通过本轮就绪及真实操作验收。目前待办是第 8 节列出的四项设计差异取舍；它们是原词与已交付组合设计的差异，不表示应机械移植四个营销网页。按续办要求，本轮只记录、不实施设计变更。

范围说明：Developer ID、公证、另建 GitHub Release 与其他平台实机验证不是本轮已完成事项。

## 7. 资源与恢复

已复用前端依赖、Wails CLI、已有内核与代理运行时。仅关闭本轮 App、浏览器、见证 HTTP 服务和 Vite/自动化页面；其他客户端、连接器与并行任务保留。旧版安装备份 `.local-backup/latitude-2.0.0-before-2.1.0.zip` 已进行 CRC、实际展开、签名及可执行文件/Info.plist 比对，作为回滚基线保留。已回收本轮临时目录中的 718 个常规文件，合计 318,651,762 字节（约 303.9 MiB，逻辑文件大小，不等同于实时磁盘可用空间）；另清理 2 个经 socket/cookie 归属和无活跃引用核验的 Chrome 临时目录，以及 5 个已知自动化浏览器中间产物。保留最终安装包/清单、4 张正式截图、验收输出、已核验的旧版安装与源文件回滚备份。既有备份未证明被覆盖，保留未删。

## 8. 续办结果 · 2026-11-07 任务

### GitHub 推送已关闭

在不改 App 代码、remote 和历史的前提下，以 HTTP/1.1、`pack.window=0` 和两个打包线程正常重试，推送成功：`ee4a162..7dff90f HEAD -> main`。GitHub 提示已有的数个运行时二进制超过推荐的 50 MB，但接受了提交；没有强制推送或重写历史。

源码推送后的两次独立读回均为 `7dff90f9b9cce6921fc161034d00a07d35b41dff`：`git ls-remote --heads user main` 与 GitHub commits API。该提交包含发布提交 [bf7cc17](https://github.com/djblack1209-coder/Latitude-Browser/commit/bf7cc17ea4e7bc07e9d6a801fb59b33cc4b69eb4)；[远端 7dff90f](https://github.com/djblack1209-coder/Latitude-Browser/commit/7dff90f9b9cce6921fc161034d00a07d35b41dff) 的仓库、分支和完整 SHA 均核对一致。本次续办说明单独作为 docs 提交发布；其完整 SHA、检查结果和远端 main 最终读回另存于本地 `output/playwright/latitude-continue-20261107/continuation-status.json`，与源码推送时的 SHA 分开记录。

### 四份完整原词与设计差异

复用用户本机 Chrome 的已登录配置；每次在准确标题卡片点击“复制提示词”，读取实际剪贴板全文，并核对文件读回与剪贴板逐字节一致。ASCII Studio 的首次复制为空，刷新本轮标签页后重新复制取得 44,266 字节正文，未把空值标为成功。没有注册、要求重新登录或退出账号，原本为空的剪贴板已恢复。

原文合计 122,022 字节，保存在本地 `docs/references/private/fieldwork-2026-11-07/`：`axon.txt`、`particle-self.txt`、`ascii-studio.txt`、`cyber-layer.txt`。同目录 `manifest.json` 记录来源、准确资源 ID、取得时间、逐文件 SHA-256、完整性核对、原词章节及差异状态。该目录已通过 `git check-ignore` 核对，不加入公开仓库。

| 原词 | 取得结果 | 对照 2.1.0 的实质差异与待办 |
| --- | --- | --- |
| AXON | 完整，10,148 字节 | `D-AXON-01`：原词 §7–9 的雕塑粒子主体会随指针扰动、跟随视角，并在约 1–2 秒回归。当前 `LatitudeField.tsx` 只有静态点阵。待取舍：工作区身份图形如何提供有边界、可中断的交互与归位；不是只补一种颜色。视频作品目录不属于 App 必须复制的内容。 |
| Particle Self | 完整，53,315 字节；正文名为 Kin OS | `D-PARTICLE-01`：原词 §7–8 让同一身份主体在不同场景保持连续，通过缩框、位移、散开重组呈现状态变化，并要求按需渲染和减弱动态。当前淡紫地球在页面/选区改变时没有对应的连续变化，启动词语揭示与业务状态也独立。待取舍：把同一主体的连续变化用于真实的工作区状态转换；人像、长滚动故事和虚构 widgets 不自动移植。 |
| ASCII Studio | 完整，44,266 字节；正文名为 Architecture — ASCII / Ublicloud | `D-ASCII-01`：原词 §7、10、12、15 的主体是实际字符单元渲染，同一对象跨视角可追认，指针留下渐隐荧光绿字符轨迹。当前仅迁移等宽元数据、绿操作与 SVG 点阵，没有字符渲染或对象变化。待取舍：以真实 App 状态驱动有边界的字符视觉；建筑模型、920svh 路径及漫游内容不机械引入。 |
| Cyber Layer | 完整，14,293 字节 | `D-CYBER-01`：原词 §3–6、8 强调锐角红 CTA、左侧大字、右侧多层视频与有序的一次入场，明确排除紫色/卡片/圆角胶囊。当前主要迁移黑色与面板层次，仍为绿操作、紫身份、6/10/14 px 圆角，没有视频层次。待取舍：如何在四来源组合中体现锐利结构、非对称排字和时间层次，并保留 App 的红色状态语义及短、可跳过的启动。 |

以上均标为 `material_gap_pending`，未把核心交互差异归为细节，也未把原词的逐像素复刻要求直接升级为 Latitude 的产品需求。色值微差、模板品牌/文案、字体精确别名与营销页技术栈是来源细节；不能替代上表需要明确取舍的设计问题。本轮只更新证据和说明，已安装 App、令牌、业务代码与 `website/` 均未改变。

### Chrome 148 就绪项已关闭

- 现有 `Chromium.app`：`148.0.7778.215`，arm64；完整签名检查通过，无 `com.apple.quarantine` 属性。未下载替代内核。
- 首次最小参数探测在 25 秒内未开放 CDP，采样显示主线程在 `SecItemCopyMatching → SecKeychainSearchCopyNext → KeychainCore::ItemImpl::recordType → mutex wait`，另一线程等待 SecurityServer 返回。保留该次失败，不能据此声称已修复 macOS 钥匙串根因。
- 随后通过唯一正式入口 `/Applications/Latitude Browser.app` 的现有 2.1.0 执行验收。App 使用全新 QA HOME；受约束启动器仅为 Chromium 保留正常 macOS HOME，并强制独立资料目录。未使用 mock 钥匙串、关闭沙箱或切换 157；指纹参数、默认 148/可选 157 和 `xray` 连接栈保持。
- 正式 App PID `71274`，实际 148 PID `71306`；运行会话 API 返回 HTTP 200、`running=true`、`ready=true`、`debugReady=true`、`waitTimedOut=false`。调试端口 `64584` 的 `/json/version` 和 `/json/list` 均返回 200，实际版本读回 `Chrome/148.0.7778.215`。
- 使用这个实际 CDP 会话访问仅本机的 HTTP 见证页，验证标题、第二页、后退、新标签页打开及关闭，均通过。测试为本地直连流程，不扩大为代理/匿名能力验收。
- 通过 App 的 stop API 停止 148，随后原生 `⌘Q` 直接退出，退出码 0。App、所属浏览器及见证服务退出，API/CDP/见证端口均释放；安装可执行文件 SHA-256 前后一致，用户筛选、视图与语言偏好逐值读回一致。

本地机器可读证据：`output/playwright/latitude-continue-20261107/native148.json`；首次阻塞采样与日志为 `chrome148-minimal-sample.txt`、`chrome148-minimal-stderr.log`、`chrome148-minimal.json`。成功的正式 App 日志为 `chrome148-native.log`。这次通过关闭了“148 未验证”的待办；首次钥匙串等待的具体触发条件尚未确定，未把一次通过写成所有冷启动均已根治。

### 文档检查与收尾

续办文档提交限定为本结果、`DESIGN.md`、两份 README、`docs/plan/latitude-signal-ui-sources.md`、`docs/showcase/DEMO.md` 和 `docs/showcase/ENGINEERING.md`，共 7 份。现有展示文档检查通过（12 份文档、107 个本地链接、SVG 有效）；另核对本次 7 份文档的本地链接、引用目标和差异空白。原词和验收输出仍被 Git 忽略，暂存与提交范围不含其他已有改动。

续办测试进程、见证服务和所属浏览器均已退出；已核验并删除 205 个临时文件，共 14,861,322 字节，以及其所属测试目录和一个失去引用的 Chromium socket 目录。该数值是逻辑文件大小，不代表实时磁盘可用空间。保留四份私有原词、校验清单、验收证据、正式安装与回滚产物；现有 `AGENTS.md`、其他截图和未跟踪文件保持原状。
