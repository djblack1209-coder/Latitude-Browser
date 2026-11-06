# Latitude Browser App 重设计与仓库升级结果 · 2026-11-06

## 交付状态

- App：2.1.0 Fieldwork 已构建并安装到 `/Applications/Latitude Browser.app`，Bundle ID `com.latitude.browser.desktop`。最终包已实际重新启动，显示新界面与 v2.1.0，并直接退出。
- 已验证：中英文、主要页面、实际 Chrome 157 浏览器流程、真实标签页读回、App 内打开地址、快捷启动、无确认退出及受管进程清理。
- 待办：四份完整设计提示词和现有 Chrome 148 的 CDP 就绪验收，详见下文。未把待办写为通过。
- 仓库：双语首页、原生截图、设计说明、工程/演示导览与更新日志已更新。提交/推送记录将在实际执行后补齐。

## 1. 实际取得的参考

主要来源：[十两网站收录库](https://wangshiliang.cn/news)。四个标题均找到准确条目，取得公开预览帧；点击“复制提示词”跳转登录页。未绕过登录或付费限制，未取得完整原词。用户随后明确选择“先按公开预览继续，并记录原词待补”。MotionSites 的四个直接详情链接在本轮读取失败；未把搜索镜像或相似 Axon 条目当成原始来源。

| 准确标题 | 来源资源 ID | 观察与迁移 |
| --- | --- | --- |
| AXON | `sites:framesbase:ea2e9bae-7ea6-4df0-a2be-6975f18d7c44` | 粒子主体、外围紧凑信息 → 集中的工作区与安静的周边控制 |
| Particle Self | `sites:framesbase:e9d9fc76-f365-48fc-8d10-26700e0f6c46` | 聚焦身份主体、克制的浮动导航 → 淡紫身份图形与清晰的当前任务 |
| ASCII Studio | `sites:framesbase:9d231c1b-d1c3-4d18-94fc-42d9f74b8413` | 字符纹理与荧光绿命令 → 等宽元数据、主要操作和静态点阵 |
| Cyber Layer | `sites:cyber-layer` | 黑色舞台、结构化层次 → 分层面板、分隔线；红色只表示错误 |

这是从预览帧作出的设计推导，没有声称看过完整提示词或验证过参考站动效。原始提示词、视频、缩略图与模板源码没有加入公开仓库。[React Bits Pro App UI](https://pro.reactbits.dev/docs/app-ui) 目录已查看；本轮未复制组件源码、引入其依赖或购买许可。

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

提交与推送：待实际执行后补齐。

## 6. 待办

1. 完整参考提示词：登录门槛未解除；用户已授权按公开预览继续，本轮未获得原词。
2. Chrome 148：现有 148.0.7778.215 核心在 QA 中拉起进程但 CDP 一直未就绪。保留默认选择，157 仍为可选，不自动回退或跨连接栈。
3. Developer ID、公证、GitHub Release 与其他平台实机验证不在本轮已完成记录中。

## 7. 资源与恢复

已复用前端依赖、Wails CLI、已有内核与代理运行时。仅关闭本轮 App、浏览器、见证 HTTP 服务和 Vite/自动化页面；其他客户端、连接器与并行任务保留。旧版安装备份 `.local-backup/latitude-2.0.0-before-2.1.0.zip` 已进行 CRC、实际展开、签名及可执行文件/Info.plist 比对，作为回滚基线保留。具体临时文件回收数量在收尾后补齐。
