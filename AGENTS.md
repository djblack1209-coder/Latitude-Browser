# Project Agent Instructions

<!-- ant-ready-start-skills:start -->

## Shared Local Skills

Use the shared local skills below when the task matches their scope:

- `page-style-linear-flow`: `D:\code\open_source\ant-ready-start\skills\page-style-linear-flow\SKILL.md`
- `ui-ux-pro-max`: `D:\code\open_source\ant-ready-start\skills\ui-ux-pro-max\SKILL.md`
- `frontend-skill`: `D:\code\open_source\ant-ready-start\skills\frontend-skill\SKILL.md`
- `create-plan`: `D:\code\open_source\ant-ready-start\skills\create-plan\SKILL.md`
- `create-plan-doc`: `D:\code\open_source\ant-ready-start\skills\create-plan-doc\SKILL.md`

Apply it for frontend page design or refactors involving pages, admin panels, forms, tables, dashboards, detail views, wizards, modal/drawer placement, or multi-step flows.

Apply `ui-ux-pro-max` for broader UI/UX design work involving visual direction, design-system shaping, palette and typography selection, component styling, landing pages, dashboards, and cross-stack interface generation when linear-flow rules alone are not enough.

Apply `frontend-skill` when the task needs stronger frontend art direction, visual hierarchy, landing-page composition, sparse premium layouts, image-led sections, or restrained motion design.

Apply `create-plan` when the user explicitly asks for a plan, task breakdown, implementation roadmap, rollout outline, or a step-by-step execution plan before coding.

Apply `create-plan-doc` when the user explicitly asks for a plan that should also be saved into the repository as a markdown document under `docs/plan`.

Core expectations:

- Keep each page focused on one primary responsibility.
- Do not mix operational tables and submit forms on the same screen.
- Use modal/drawer for short low-risk forms; use a dedicated page or wizard for complex flows.
- Remove filler copy, repeated headings, decorative cards, and meaningless whitespace.
- Keep the next action obvious and preserve predictable back/cancel/save behavior.
- 代理连接必须遵守两套连接栈规则，详见 `docs/proxy-connector-stacks.md`：`browser.default_connector_type=xray` 表示 Xray + sing-box 组合栈，Xray 负责 vmess/vless/trojan/shadowsocks/链式代理等，sing-box 负责 hysteria2/tuic/anytls 等协议；`browser.default_connector_type=mihomo` 表示独立 Mihomo 栈。实例启动、测速、真实连通性、IP 健康、预热和代理下载都必须按当前连接栈执行，不允许在 `xray` 组合栈和 `mihomo` 栈之间自动混用；不要把 sing-box 协议误判成“xray 不支持”。
- For detailed UI checks, selectively read `D:\code\open_source\ant-ready-start\skills\page-style-linear-flow\references\checklist.md`.

## macOS 应用唯一入口规则

为避免 Spotlight、Dock、LaunchServices 和自动化测试同时命中多个同名应用，项目必须始终保持一个可启动的正式入口：

- 正式产品名称和显示名称统一为 `Latitude Browser`；正式 Bundle ID 固定为 `com.latitude.browser.desktop`。
- 唯一正式安装入口固定为 `/Applications/Latitude Browser.app`。手工验收、自动化测试、Dock 配置和 LaunchServices 注册都必须使用这个路径。
- 禁止在 `/Applications` 保留或生成 `AntBrowser.app`；旧名称只能出现在不带 `.app` 扩展名的历史备份路径中，不能被系统识别为可启动应用。
- `build/bin/*.app` 与 `publish/output/*.app` 仅是构建产物，不得作为测试入口、Dock 目标或长期安装副本；打包验证完成后应移出系统索引位置或删除。
- 每次安装/打包后都必须清理旧路径的 LaunchServices 注册，并验证系统搜索结果中只剩一个 `com.latitude.browser.desktop` 应用。
- 测试脚本不得通过模糊名称（例如 `Ant Browser`、`Latitude Browser`）选择应用，必须直接启动 `/Applications/Latitude Browser.app`。
- 所有产品界面、原生窗口标题、菜单、通知、安装器、桌面启动器、发布说明、示例文案和网络 User-Agent 必须使用 `Latitude Browser`；不得新增或恢复 `Ant Browser`、`Ant Chrome`、`AntBrowser` 等旧品牌可见文案。旧名称仅允许出现在兼容迁移逻辑、旧数据键、上游许可证/归属说明和 Go 模块路径中，并且必须标注为 legacy/compatibility。

These shared skill instructions supplement project-specific rules in this `AGENTS.md`; keep more specific project rules authoritative for this repository.

<!-- ant-ready-start-skills:end -->
