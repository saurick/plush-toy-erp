# Phase 12 SaaS 单独评审 / Phase 12 SaaS Review

- 文档类型：产品化评审 / Productization Review
- 状态：Phase 12 当前评审 / Phase 12 Current Review
- 作用域：SaaS、多租户、license、billing、运营后台和私有化共存策略的进入门禁
- 不代表：SaaS 已开始实现、`tenant_id` 已允许进入 schema、runtime tenant 已存在、license / billing / 客户工单系统已进入当前任务

## 结论

Phase 12 当前结论是：只完成 SaaS 进入门禁评审，不进入实现。

当前项目已经形成单客户私有化部署、行业模板候选和多客户私有化复制包模板，但还没有真实第二客户交付、没有多客户私有化运行反馈，也没有足够证据证明需要把当前单客户私有化内核升级成共享数据库多租户 SaaS。

因此，本轮不新增 `tenant_id`，不改 Ent schema / Atlas migration，不改 RBAC 真源，不新增运营后台、license server、billing、套餐权限或客户工单系统。

## 当前阶段判断

| 项 | 现状 | Phase 12 判断 |
| --- | --- | --- |
| 客户形态 | yoyoosun 是第一个私有化客户实例；Phase 11 只形成私有化客户包模板 | 继续按私有化客户包复制，不升级为 runtime tenant |
| 行业模板 | Phase 10 已形成 `candidate`，`runtimeEnabled=false` | 需要更多客户样本或人工确认后才能升为行业默认 |
| 多客户复制 | Phase 11 已形成模板候选，未创建真实第二客户 | 先验证真实第二客户包和部署闭环 |
| 数据隔离 | 当前以每客户独立部署 / 独立数据库作为低风险方向 | 不进入共享库 `tenant_id` 模型 |
| RBAC | 当前是单实例标准 RBAC | 不做租户维度 RBAC 改造 |
| 运维 | 当前唯一部署真源仍是 Compose prod 目录，低配服务器只加载已构建产物 | 不新增 SaaS 控制面或统一运营后台 |

## 不进入实现的原因

1. 当前没有真实多客户私有化运行证据。
2. 当前客户配置 loader 只控制前端菜单，不是租户隔离层。
3. `tenant_id` 会影响几乎所有事实表、权限守卫、查询、导入、审计、备份恢复和回滚路径，不能作为小改动提前落地。
4. license / billing / 套餐权限 / 客户工单系统属于商业化控制面，不应污染当前私有化 ERP 内核。
5. 共享数据库多租户会显著提高安全、运维、迁移、性能隔离和事故半径风险，当前收益证据不足。

## 当前允许

- 保留 SaaS 作为未来候选方向。
- 继续用 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/` 和 `deployments/<customer-key>/` 管理私有化客户包。
- 在真实新增客户前评审稳定 customer key、资料入仓边界、导入 dry-run、部署地址、备份恢复和验收清单。
- 继续沉淀行业模板候选，但保持 `runtimeEnabled=false`，直到有多客户验证或人工确认。
- 将未来 SaaS 研究限制在设计文档、风险评估、迁移方案草案和商业化假设评审中。

## 当前禁止

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不新增 license server。
- 不新增 billing、套餐权限或客户工单系统。
- 不新增 SaaS 运营后台。
- 不把 customer key 当 runtime tenant。
- 不把客户配置包、行业模板候选或私有化部署模板接成多租户 runtime loader。
- 不修改 Ent schema、Atlas migration、RBAC、WorkflowUsecase、Fact usecase、JSON-RPC、前端路由或部署脚本来服务 SaaS。
- 不把 Phase 12 评审写成真实第二客户、真实导入、多客户 runtime 或客户已签收。

## 未来进入 SaaS 实现前的硬门禁

只有同时满足以下条件，才允许另开任务评审 SaaS schema / runtime：

1. 至少完成一个真实新增私有化客户包，从资料、配置、部署、备份恢复到验收 evidence 形成闭环。
2. 明确客户隔离模型：每客户独立数据库、独立 schema、共享库 `tenant_id` 或混合模式，并说明为什么现有私有化复制不足。
3. 完成数据安全评审：越权查询、批量导出、附件 / 对象存储隔离、备份恢复、日志和审计脱敏。
4. 完成迁移评审：现有单客户库如何迁入或不迁入 SaaS，Atlas migration 如何分批执行，失败如何回滚。
5. 完成 RBAC 评审：角色、权限、管理员、super_admin、岗位任务入口和客户管理员边界。
6. 完成运维评审：运营后台、客户开通、禁用、升级、备份、恢复、监控、资源隔离和事故半径。
7. 完成商业化评审：license、billing、套餐权限、客户工单系统是否真的需要进入产品内核。
8. 明确私有化与 SaaS 共存策略，避免一套代码同时出现两套冲突的部署和数据隔离主路径。

## 下一步

当前下一步不是实现 SaaS，而是继续让 Phase 11 私有化客户包经历真实新增客户验证。

若短期没有第二客户，后续工作应优先回到客户使用确认、真实导入前评审、打印 / 报表 / 附件 / 扫码等业务增强，而不是提前做多租户底座。
