# Service

`service` 层负责协议适配，不负责落业务规则。

当前仓库里它的职责比较薄：

- 接收 JSON-RPC 请求
- 记录入口日志
- 调用 `biz` 层 usecase
- 把结果包装回协议层返回结构

如果后续新增 gRPC / HTTP DTO 转换逻辑，也建议继续把协议细节留在 `service` 层，不要回灌到 `biz`。

补充说明见：

- `/Users/simon/projects/plush-toy-erp/server/docs/api.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/runtime.md`
