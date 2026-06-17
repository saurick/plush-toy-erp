# 角色与权限 / Roles And Permissions

本目录回答“角色职责和权限矩阵怎么读”的问题。它是 RBAC 说明入口，不是后端权限码或安全边界的唯一真源。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 看角色权限矩阵 | `角色权限矩阵第一版.md` | `docs/当前真源与交接顺序.md`、后端 RBAC 代码和测试 |
| 改菜单可见性 | `docs/product/正式产品入口与菜单配置计划.md` | 前端 menu config、后端内置菜单、RBAC 权限 |
| 改岗位任务端入口 | `web/README.md` | 移动端角色权限、登录回跳和 style / smoke 覆盖 |

## 真源边界 / Source Boundary

前端隐藏菜单不是安全边界。后端权限码、管理员角色、owner role、assignee 和 super admin 边界必须回到代码、测试和 `docs/当前真源与交接顺序.md` 确认。

## 更新规则 / Maintenance

新增、删除、重命名角色权限文档，或改变角色职责、权限矩阵口径时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 相关 RBAC / API 测试和前端权限入口说明。
