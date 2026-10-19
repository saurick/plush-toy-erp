# 受控项目手册 / Protected Project Manuals

本包把[项目三册手册](../../../docs/manuals/README.md)中的管理与运维正文随正式后端内嵌，通过当前有效账号的实际角色和权限筛选。业务册继续复用在线业务帮助内容源；本包不执行运维命令、读取任意路径或写业务数据。

`content.generated.json` 从两册正式 Markdown 生成，包含书目、正文与内容 hash；不手工修改生成内容。仓库根运行：

```bash
node scripts/docs/project-manuals.mjs
node scripts/docs/project-manuals.mjs --check
```

读取规则在 `manuals.go`，登录和协议适配在 `service/jsonrpc_project_manuals.go`；接口见[API 说明](../../docs/api.md#账号与权限-admin)。普通 Web 制品不直接导入这里的正文。修改手册时同轮生成、检查漂移并验证阅读和下载范围。

`documents.generated.json` 同源保存业务章节、词条、图解和管理 / 运维章节的身份、hash 及阅读边界。`catalog.go` 供帮助维护 usecase 验证章节和实际账号范围。企业补充和员工纠错通过独立的 Go usecase / repository 保存到数据库，正式手册正文仍由生成资源提供；六项编辑 / 发布权限不扩大阅读范围。维护合同见[在线纠错与企业补充](../../../docs/manuals/README.md#在线纠错与企业补充--help-contributions)。
