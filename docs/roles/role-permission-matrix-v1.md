# 角色权限矩阵 v1

## 当前口径

当前项目权限模型是标准 RBAC：用户通过 `admin_user_roles` 绑定角色，角色通过 `role_permissions` 获得权限码，后端接口、桌面菜单和移动端入口统一消费 permission code。`admin_users.level`、`admin_users.menu_permissions`、`admin_users.mobile_role_permissions` 不再作为权限来源。

权限码和内置角色真源在 `/Users/simon/projects/plush-toy-erp/server/internal/biz/rbac.go`。登录和 `auth.me` 返回当前管理员、角色、权限码和后端推导出的菜单；前端只负责按这些结果展示入口，不能把菜单隐藏当成安全边界。

`is_super_admin=true` 的账号拥有全部权限，用于初始化和紧急管理；普通管理员必须通过角色获得权限。普通管理员不能随意修改 super admin。

workflow 任务处理有两层校验：RBAC 只判断“能不能做这类动作”，业务归属继续由 `owner_role_key`、`assignee_id`、`task_status_key` 判断“这条任务是不是你该处理”。`workflow.task.update` 不能绕过任务归属；boss / pmc 的查看、关注、催办能力也不等于可以替销售、采购、仓库、品质、财务完成业务事实。

跟单角色如果甲方没有，不新增独立角色；业务跟进由 `sales` 或 `pmc` 承担。

## 关键权限码

| 模块 | 权限码 | 用途 |
| --- | --- | --- |
| 系统 | `system.user.read/create/update/disable` | 管理员账号读取、创建、更新和启停 |
| 系统 | `system.role.read/create/update/delete` | 角色读取、创建、更新和删除 |
| 系统 | `system.permission.manage` | 给角色分配权限 |
| 桌面入口 | `erp.dashboard.read`、`erp.print_template.read`、`erp.help_center.read`、`erp.business_chain_debug.read` | 后台菜单和页面入口 |
| 业务记录 | `business.record.read/create/update/delete` | 通用业务记录读写删 |
| 工作流 | `workflow.task.read/create/update/assign/approve/reject/complete` | 任务查询、创建、更新、指派、审批、驳回和完成 |
| 移动端 | `mobile.<role>.access` | 移动端角色入口，例如 `mobile.sales.access` |
| 调试 | `debug.seed`、`debug.cleanup`、`debug.business.clear`、`debug.business_chain.run` | 开发 / 测试调试能力 |

## 预设角色

| 角色 | 定位 | 默认权限范围 | 任务处理边界 |
| --- | --- | --- | --- |
| `boss` | 管理层、审批和风险查看 | 全局 read、审批、报表、看板和帮助中心；不默认给 `debug.business.clear` | 可处理老板角色池或指派给自己的任务；关注高风险不等于替其他角色完成事实 |
| `sales` | 销售 / 业务跟进 | 销售链路、客户订单、出货协同、业务记录读写、基础 workflow 权限、销售移动端 | 只能处理 `owner_role_key=sales` 或 `assignee_id=自己` 的任务 |
| `purchase` | 采购 | 采购单、采购收货、采购退货、采购异常、业务记录读写、采购移动端 | 只能处理 `owner_role_key=purchase` 或 `assignee_id=自己` 的任务 |
| `warehouse` | 仓库 | 库存、入库、出库、盘点、仓库移动端 | 只能处理 `owner_role_key=warehouse` 或 `assignee_id=自己` 的任务 |
| `quality` | 品质 | IQC、成品抽检、异常处理、返工复检、品质移动端 | 只能处理 `owner_role_key=quality` 或 `assignee_id=自己` 的任务 |
| `finance` | 财务 | 应收、应付、收付款、对账、财务报表、财务移动端 | 只能处理 `owner_role_key=finance` 或 `assignee_id=自己` 的任务 |
| `pmc` | 计划和风险跟进 | 计划、进度、风险查看和处理、PMC 移动端 | 可看风险和卡点；不能替生产、仓库、品质、财务完成业务事实 |
| `production` | 生产执行 | 生产计划、生产进度、返工、生产移动端 | 只能处理 `owner_role_key=production` 或 `assignee_id=自己` 的任务 |
| `admin` | 系统管理 | 用户、角色、权限、基础配置 | 不天然拥有业务审批、品质放行、仓库入出库或财务结算事实权 |
| `debug_operator` | 开发 / 测试调试 | `debug.seed`、`debug.cleanup`、`debug.business.clear`、`debug.business_chain.run` | 只应在 local / dev / test 环境使用，生产默认不分配 |

## 操作边界

- 可删除是受控能力，业务记录删除应写事件和原因，不等于绕过审计物理删除。
- 可审批必须同时满足权限码、业务归属和状态条件，不能只靠 `admin` 角色推导。
- 可催办必须写入 `workflow_task_events`，不能只是页面红点或备注。
- 可打印和可导出只表示入口权限，导出字段和数据范围仍要按后续数据权限规则收口。
- 移动端只处理当前角色任务和规则允许的风险任务，不展示低代码配置、状态字典或系统权限页面。
