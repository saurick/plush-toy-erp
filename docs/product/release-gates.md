# 发布门禁 / Release Gates

## 完成定义 / Definition of Done

| 层 | DoD |
| --- | --- |
| Product Core | schema / usecase / tests / docs 同步，核心事实规则不按客户分叉 |
| Industry Template | 默认角色、菜单、字段、流程和 seed template 明确，不污染核心事实 |
| Customer Config | 客户差异有配置位置、审批记录和回滚方式 |
| Workflow | done / blocked / rejected、reason、幂等、终态保护和非目标任务测试覆盖 |
| MasterData | 字段真源、唯一约束、导入和历史缺值回补路径明确 |
| Fact | happy path、非法状态、重复提交、取消 / 冲正、幂等、事务失败和不可物理删除覆盖 |
| RBAC | 未登录、disabled、非管理员、无权限、角色不匹配、super_admin 和业务边界覆盖 |
| API / UI | UI 只展示和提交动作，不承接后端事实逻辑；后端仍校验权限和状态 |
| Help / QA | docs registry、导航 seed、帮助入口和验收文档同步 |
| Delivery / Ops | migration、备份恢复、发布、健康检查、smoke、回滚和清理记录明确 |

## 必测门禁

- blocked reason 必填，trim 后不能为空。
- 同一 workflow event 幂等。
- 同名但非目标 task 不触发。
- settled 终态保护。
- `shipment_release` 不写 `inventory_txns / shipments / reservations / AR / invoice`。
- `shipping_released` UI 不能显示成已出库。
- 中文文案修改不影响业务逻辑。
- UI 隐藏按钮后，后端仍校验权限、状态和数据范围。
