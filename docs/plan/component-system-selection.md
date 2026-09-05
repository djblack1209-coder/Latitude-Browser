# Latitude Browser：开源组件体系与换壳施工方案

> 状态：已选型，先在现有 React + Vite + Tailwind + Wails 前端上落地基础令牌和共享组件，再逐页迁移旧页面。

## 1. 选型结论

Latitude Browser 不直接套用一个带有强烈模板感的后台主题，而是采用“源码归属在项目内、视觉令牌由产品控制”的组合：

- [shadcn/ui](https://ui.shadcn.com/)：作为组件设计方法和本地组件源码参考。它采用 MIT License，组件可以复制到项目内再按产品需要修改。
- [Radix UI Primitives](https://www.radix-ui.com/primitives)：作为 Dialog、Popover、Dropdown、Tabs、Accordion 等交互原语参考，采用 MIT License。
- [Lucide](https://lucide.dev/)：作为全局线性图标体系，当前项目已经使用 `lucide-react`，采用 ISC License。
- Tailwind CSS：继续作为布局和主题令牌层，不引入另一个会覆盖现有样式的完整后台模板。

这个组合适合当前 Wails 的 React + TypeScript + Vite 前端，不需要改动 Go/Wails API，也不会影响 Xray + sing-box 组合栈和 Mihomo 独立栈。

## 2. 为什么不直接使用整套 Admin 模板

直接套用模板往往会重新引入渐变、玻璃拟态、厚重阴影、过多圆角卡片和“AI 仪表盘”文案，正是当前界面塑料感和模板感的来源。Latitude 的方向是：

- 深色工作台，不做大面积发光；
- 窄边框和明确分区，减少卡片堆叠；
- 线性图标、短标签、状态点和等宽数字；
- 新手入口保持简单，高级能力延迟到实例设置或高级设置；
- 所有复杂交互都保留可访问的键盘焦点、关闭和返回路径。

## 3. Latitude Signal Noir 令牌

```text
背景          #090c0d
侧边栏        #0f1415
面板          #151b1d
悬停          #182023
边框          #263235
主文字        #edf6ef
次文字        #b2c2b7
弱文字        #71817a
强调绿        #72f59a
强调绿悬停    #93ffb2
成功          #72f59a
警告          #f7c35f
错误          #ff7777
信息          #7fc9ff
```

字体：正文使用 IBM Plex Sans 或系统无衬线回退，协议、签名、视口和状态值使用 JetBrains Mono 或系统等宽回退。

## 4. 已完成的首轮施工

1. 新 Logo 已由提供的 hooded line-art 图片裁剪、去除黑底并生成透明 PNG，替换前端 favicon、应用图标、Windows 图标和 macOS/Wails 图标源。
2. 全局默认主题切换为 Signal Noir 深色主题。
3. 侧边栏调整为“置顶入口、工作台、网络与代理、指纹资产、自动化、系统”，自动配置位于置顶入口。
4. 共享 Button、Card、Form、Modal、Progress、StatCard 统一为较窄圆角、定向过渡和低阴影，避免塑料卡片感。
5. 自动配置新增四步线性向导：网络入口、设备基线、指纹策略、确认并保存。
6. 自动配置会遵守连接栈规则：`xray` 表示 Xray + sing-box 组合栈，`mihomo` 表示独立 Mihomo，直连不启动代理内核。
7. 自动配置当前保存为本机草稿，不会未经确认启动实例，也不会猜测未知代理节点地址。

## 5. 后续迁移顺序

- 第一阶段：继续统一 Topbar、通知、主题选择器和表单反馈。
- 第二阶段：迁移实例总览、实例创建和代理池页面，保持业务 API 不变，只替换布局和共享组件。
- 第三阶段：将自动配置草稿接入 `BrowserProfileCreate`，增加差异预览、冲突提示和撤销。
- 第四阶段：将高级设置按网络、指纹、浏览器内核、自动化四组收纳，并为高影响设置增加“为什么”说明。

每一阶段都应先验证 `npm run build:keep`、`git diff --check`，再做页面级视觉检查，避免一次性重写导致功能回归。

## 6. 许可证边界

shadcn/ui、Radix 和 Lucide 的许可证只覆盖新增组件本身，不能替代上游 Ant Browser 的许可证。当前上游仓库没有独立的 `LICENSE`、`COPYING` 或 `NOTICE` 文件，因此本项目继续保留上游 Git 历史和致谢信息；公开发布、商业分发或提供安装包前仍需取得作者明确授权并完成依赖许可证核查。
