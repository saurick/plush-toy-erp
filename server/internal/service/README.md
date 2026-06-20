# 服务层说明 / Service

`service` 层负责协议适配，不负责落业务规则。

当前仓库里它的职责比较薄：

- 接收 JSON-RPC 请求
- 按 JSON-RPC URL / method 分发到对应业务域
- 执行入口级登录、管理员身份、权限码和错误码映射
- 记录入口日志
- 调用 `biz` 层 usecase
- 把结果包装回协议层返回结构

JSON-RPC dispatcher 继续按职责拆文件维护：

- `jsonrpc_dispatch.go`：dispatcher 构造、入口日志、URL 分发和 `system` 域。
- `jsonrpc_dispatch_auth.go`：登录、短信登录、`auth.me` 和鉴权错误映射。
- `jsonrpc_dispatch_guards.go`：登录态、管理员身份和当前管理员一致性校验。
- `jsonrpc_dispatch_admin.go`：后台管理员、角色、权限和控制面审计入口。
- `jsonrpc_dispatch_helpers.go`：协议参数解析、敏感参数脱敏和 `structpb` 包装 helper。

如果后续新增 gRPC / HTTP DTO 转换逻辑，也建议继续把协议细节留在 `service` 层，不要回灌到 `biz`。

补充说明见：

- `/Users/simon/projects/plush-toy-erp/server/docs/api.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/runtime.md`
