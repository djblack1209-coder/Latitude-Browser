# Changelog

## 2.2.0 - 2026-11-06

- 落实四份完整原词的设计差异：可扰动并归位的粒子、跨页面连续的同一身份主体、实际 ASCII 字符渲染、锐利分层与一次入场，融合为 Fieldwork 2.2。
- 选择实例、表格/卡片切换与详情状态驱动主体变化；保留双语、现有功能、148 默认/157 可选和两套连接栈。
- 统一 2/4/6 px 几何与红色停止/破坏性操作；静止停止逐帧渲染、隐藏暂停、减弱动态效果直接切换，并提供 Canvas 不可用时的 SVG 降级。
- 完成 macOS arm64 构建、正式安装与双语原生截图；124 项前端测试、后端测试、34 项 UI 检查及 9 项动效检查通过。真实 148 与 157 均通过就绪、导航、后退及标签页开关，原生退出完成受管清理。

- Unify the four prompt differences as Fieldwork 2.2: spring-return particles, persistent identity, actual ASCII cells and sharp layered composition.
- Drive the object with profile selection, view mode and detail state while preserving bilingual workflows, configured core defaults and connector stacks.
- Add sharp geometry, red Stop/destructive actions, on-demand rendering, reduced-motion behavior and an SVG fallback.
- Build and install the macOS arm64 application; pass 124 frontend tests, backend tests, 34 UI checks, nine motion checks and real 148/157 browser operations with managed quit cleanup.

## 2.1.0 - 2026-11-06

- Fieldwork 全界面重设计：黑色画布、荧光绿操作色、淡紫点阵、分层工作区与统一组件；保留中英文和现有功能入口。
- 移除退出警告与确认框，原生关闭直接执行受管运行时清理；保留清理失败时的进程归属与重试能力。
- 修复空指纹参数导致实例列表渲染失败，增加渲染恢复入口与错误记录。
- 保留既有 Chrome 148 默认项、157 可选项和两套连接栈规则。
- 更新双语 README、原生截图、工程导览与设计来源记录。
- macOS arm64 安装及 Chrome 157 流程通过；当时待补的 Chrome 148 就绪检查和四份完整参考提示词已在后续续办中完成，设计差异于 2.2 落实。

- Redesign the application as Fieldwork while retaining bilingual controls and existing workflows.
- Remove quit confirmation and retain managed runtime cleanup and ownership on failure.
- Handle empty fingerprint arguments and provide recovery from rendering failures.
- Retain configured Chrome 148 defaults, optional 157, and explicit connector stacks.
- Refresh bilingual documentation and real native screenshots. The initial Chrome 148 and reference-prompt gaps were closed in the continuation, followed by the 2.2 design implementation.

## 2.0.0 - 2026-11-06

- Terminal 深色界面：扁平导航、实例表格、真实状态栏、集中设计令牌和本地 JetBrains Mono 字体。
- 完整简体中文 / 英文消息层，默认系统语言，支持即时手动切换与原生菜单/对话框本地化。
- 精简重复说明、统计条、装饰图形和无效设置；资产页提供内核、扩展、书签与标签入口。
- 可跳过的短启动层，支持减弱动态效果、会话去重和就绪失败超时移除。
- 更新 Go、Wails、React、Vite、Tailwind、SQLite 和代理运行时；macOS 新内核推荐官方 Chrome for Testing 157。
- 保留既有实例内核绑定及 PolyForm Noncommercial 1.0.0；普通 Chrome 不承诺补丁内核的指纹能力。

- Terminal interface, flat navigation, one instance table, live status bar and shared design tokens.
- System-default Chinese/English localization with immediate switching and native UI messages.
- Reduced secondary copy, decorative graphics, duplicate statistics and settings with no runtime effect.
- Skippable startup layer with reduced motion, session gating and a hard timeout.
- Current stable application dependencies and proxy runtimes; official Chrome for Testing 157 on macOS.
- Existing core bindings and the noncommercial license retained. Stock Chrome does not implement patched fingerprint flags.

## 未发布

- SOCKS5 优化：完善 SOCKS5 与链式代理连接流程，统一实例启动、代理测速、连通性检测和健康检测体验。
- 体验优化：优化代理池、实例列表、日志查看和异常提示等页面细节，减少日常操作干扰。
- 内存限制：新增实例最大内存配置，支持按实例限制浏览器内存占用，降低单个实例异常占用资源的风险。

## 1.5.0 - 2026-07-25

- 代理增强：支持 HTTPS 代理桥接，完善代理导入、测速和连接可用性处理。
- 实例安全：增加实例删除数据审计，避免误删用户数据目录时缺少确认依据。
- 会话恢复：新增实例最近会话恢复配置，创建、复制、更新和启动流程保持一致。
- 启动服务：补充启动 API 服务端口设置，设置页可查看当前地址并保存偏好端口。
- 界面优化：精简代理池导入流程，新增代理池使用说明入口，减少页面信息堆叠。

## 1.4.0 - 2026-07-15

- VPN 优化：完善代理/VPN 检测展示，指纹检测页可直接查看配置代理、认证状态、浏览器出口 IP、ASN/网络、多源归属冲突和来源明细，避免单一 IP 库误判。
- 指纹优化：优化指纹检测页的基线、修改前后对比、自动刷新和启动逻辑；默认保留中文界面，Linux / macOS 指纹环境自动切换英文，避免缺少中文字体时出现方块字。
- 导航精简：移除控制台栏目，启动页直接进入实例列表，减少无用入口。
- 增强观测能力：提供指纹识别页面。

## 1.3.0 - 2026-06-23

- 自动化增强：完善自动化脚本能力，支持更完整的脚本导入、运行、目标实例选择和执行记录管理。
- 插件管理：新增插件包管理能力，支持插件安装、导入、启停、删除、实例限制和单实例插件配置。
- VPN 优化：优化代理/VPN 连接链路，完善 Xray、sing-box、Mihomo 等连接栈的启动、测速、检测和预热能力。
- 实例迁移：支持浏览器实例导入导出，可将实例配置和用户数据打包迁移到新环境。
- 数据保留：实例导出包包含完整浏览器用户数据目录，可保留 Cookie、LocalStorage、IndexedDB、扩展本地数据等浏览器状态。
- 代理适配：实例导入时按代理名称匹配本地同名代理，匹配不到或同名不唯一时自动清空代理。
- 批量操作：实例列表支持批量导出、批量启动、批量停止、批量删除等操作，提升多实例管理效率。
- 单例操作：单个实例的“更多”菜单新增导出入口，便于快速迁移单个实例。
- 分组管理：完善实例分组、标签、关键字等管理能力，方便按业务场景组织实例。
- 文档中心：补充启动 API、自动化、插件管理、代理配置等说明，降低接入和排查成本。
- 状态检测：增强实例运行状态、调试端口、代理健康、测速结果等状态反馈。
- 界面优化：优化实例列表、关键字展示、操作菜单和导入导出入口，减少页面拥挤和无效信息。

## 1.2.0 - 2026-05-09

- 接口调用：Launch API 补齐实例增删改查、按 code / selector 启动、runtime session / status / stop 和统一 CDP 入口，方便外部系统直接调用浏览器能力。
- 自动化接口：脚本执行支持 selector / params 覆盖和 timeoutMs 超时控制，双实例 runtime 流程支持超时取消与错误返回。
- 代理池增强：新增链式代理导入、编辑和预览能力，支持 HTTP / SOCKS5 两层链路，并优化直连代理批量导入。
- 代理检测：新增测速目标、IP 健康检测目标和桥接启动超时配置，链式代理也可以参与测速与健康检测。
- 实例启动：代理异常时支持本次直连启动，不修改实例原有代理配置；默认代理池只保留直连节点。
- 书签能力：新增 IP 检测站点默认书签，支持设置启动时自动打开，并可同步到已有未运行实例。

## 1.1.0 - 2026-03-19

- 完善 Linux 支持：补齐 Linux 环境下的开发、打包、安装、启动与运行链路，并持续修复安装版启动与退出稳定性问题。
- 补齐 macOS unsigned 内测支持：新增原生 macOS `.app` / `.zip` 打包、Darwin 运行时校验、Application Support 用户状态目录和 macOS 发布工作流。
- 新增 SOCKS 代理测试支持：SOCKS 代理能力已进入测试阶段，后续会继续验证稳定性与兼容性。
- 实验性支持接口触发浏览器：支持通过接口启动浏览器实例，便于后续接入自动化流程。
