# 代理连接栈约束

该文档用于约束自动配置、实例启动、测速、真实连通性、IP 健康、预热和代理下载行为。

## `xray` 组合栈

当 `browser.default_connector_type=xray` 时：

- Xray 负责 vmess、vless、trojan、shadowsocks、链式代理等协议；
- sing-box 负责 hysteria2、tuic、anytls 等协议；
- 两者属于一套组合连接栈，不得把 sing-box 协议错误判定为“Xray 不支持”。

## `mihomo` 独立栈

当 `browser.default_connector_type=mihomo` 时：

- 由 Mihomo 独立管理和启动对应协议；
- 不自动调用 Xray 或 sing-box 替代；
- 切换到该栈后，需要重新测速、检查出口 IP 和执行泄漏诊断。

## 通用规则

- 一次实例运行只绑定一套连接栈；
- 不允许在两个栈之间自动混用；
- 连接栈切换属于高影响配置，必须显示配置差异并要求重新检查；
- 日志中不得记录代理密码、Token、Cookie 或完整订阅内容。
