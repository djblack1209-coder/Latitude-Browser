# Latitude Browser：源码迁移与许可证边界

## 已完成的源码迁移

- 当前项目目录：`/Users/blackdj/Desktop/Latitude Browser`
- 上游仓库：`https://github.com/black-ant/Ant-Browser.git`
- 上游默认分支：`master`
- 迁移方式：直接克隆到当前项目目录，保留 `.git` 历史和 `origin` 远程地址。
- 当前迁移基线：上游提交 `10b36b518650860749c55394099dbb3bcb406c37`（2026-08-13）。

已安装的 `/Applications/AntBrowser.app` 和 `~/Library/Application Support/ant-browser` 没有被复制进源码仓库。它们属于已编译应用和本机运行时数据，可能包含浏览器实例、Cookie、代理凭据或其他私有信息，不适合作为 Git 源码的一部分。

## 许可证核查结果

截至 2026-09-04，仓库没有独立的 `LICENSE`、`COPYING` 或 `NOTICE` 文件；README 的 License 章节明确写的是“当前仓库暂未附带独立的 `LICENSE` 文件，后续会补充”。因此目前无法把它当作 MIT、Apache-2.0 或其他宽松许可证项目来处理。

结论：

1. **本地学习、私有原型和内部二次开发**：可以继续进行，但应保留上游 Git 历史和作者信息。
2. **公开发布、商业分发、提供安装包或公开源码镜像**：在获得作者书面授权或仓库补充明确许可证前，不应默认认为已经获准。
3. **上游依赖**：README 还提到 `fingerprint-chromium`，后续分发时需要单独核对该项目许可证及其二进制分发条件。
4. **品牌替换**：本地工作树已切换为 Latitude Browser，但不应把这等同于已取得上游品牌或代码再发布授权。

建议在准备公开发布前：

- 向作者确认二次开发和再分发范围；
- 明确是否允许移除 Ant Browser 品牌、是否需要保留署名；
- 为 Latitude Browser 增加自己的 LICENSE、第三方依赖清单和 NOTICE；
- 重新核对 `fingerprint-chromium`、浏览器内核和代理二进制的许可证。
