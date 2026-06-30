# yoyoosun Smoke 检查 / Smoke Test Checklist

## 基础访问

- [ ] Web `/healthz`。
- [ ] Server `/healthz`。
- [ ] Server `/readyz`。
- [ ] 登录页打开。
- [ ] 后台首页打开。
- [ ] 岗位任务端入口打开。

## 账号与权限

- [ ] 管理员登录。
- [ ] 普通业务角色登录。
- [ ] 仓库岗位账号可进入 `/m/warehouse/tasks`。
- [ ] 质检岗位账号可进入 `/m/quality/tasks`。
- [ ] 无权限账号不能访问受限菜单。
- [ ] 前端隐藏菜单不替代后端 RBAC。

## 核心页面

- [ ] 客户档案。
- [ ] 供应商档案。
- [ ] 联系人。
- [ ] 产品管理。
- [ ] 物料管理。
- [ ] 单位管理。
- [ ] 仓库。
- [ ] BOM。
- [ ] 销售订单。
- [ ] 采购入库 / 收货。
- [ ] 质检任务或质检记录。
- [ ] 库存余额。
- [ ] 库存批次。
- [ ] 库存流水。
- [ ] 出货相关页面，如当前 release 已开放。
- [ ] 应收 / 应付相关页面，如当前 release 已开放。
- [ ] 审计日志或权限页面，如当前 release 已开放。

## 客户配置生效态

- [ ] 如本次发布激活 customer config revision，`customer_config.get_effective_session` 已读回期望 revision。
- [ ] effective session 的 `source` 为 `active_customer_config_revision`，页面投影非空。
- [ ] effective session 字段策略至少包含 `customers.default`、`suppliers.default` 和 `sales_orders.default`。

## 禁止项

- [ ] 不显示真实 secret。
- [ ] 不显示 demo / fixture 入口。
- [ ] 不出现开发阶段命名、内部闭环等非产品化菜单文案。
- [ ] smoke 不创建正式库存、出货、预留或财务事实。

## 结果

- [ ] smoke report 已生成。
- [ ] 每条 smoke check 都记录了可复核 target；URL / path 检查还记录 HTTP status。
- [ ] 失败项有截图或日志摘要，且已脱敏。
