# 永绅 yoyoosun 客户部署 / Yoyoosun Deployment

本目录记录 永绅 yoyoosun 私有化部署实例资料。

当前 Phase 0 不修改 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`，不新增多租户部署，不改变发布流程。

Phase 8 目标环境发布和内部模拟验收手册已记录在：

- `/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/phase8-target-release-acceptance.md`

该手册只承接发布步骤、migration、健康检查、Phase 8 页面验收、内部模拟事实闭环和 evidence 模板；当前唯一部署主路径仍是 `server/deploy/compose/prod`。

2026-06-08 Phase 8 当前目标环境发布和内部模拟事实闭环 evidence：

- `/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`

该 evidence 表示目标环境已加载新镜像、migration 已到最新、健康检查、只读路由 smoke、目标试用账号 RBAC 核对、登录态只读 API smoke 和 `SIM-YOYOOSUN-PHASE8` 内部模拟事实写入闭环通过。客户使用确认属于交付后的业务确认，不作为 Phase 8 完成阻塞。

未来可放：

- env 样例和填写说明。
- compose override。
- 备份恢复。
- 发布清单。
- 巡检清单。
- 客户培训和交付记录。

Phase 11 已新增私有化客户包模板：

- `/Users/simon/projects/plush-toy-erp/config/private-deployment-template/templateConfig.mjs`
- `/Users/simon/projects/plush-toy-erp/docs/product/private-deployment-package-review.md`
- `/Users/simon/projects/plush-toy-erp/scripts/qa/private-deployment-boundaries.mjs`
- `/Users/simon/projects/plush-toy-erp/scripts/qa/phase11-private-deployment-closure.mjs`

该模板只说明新增客户时如何准备 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/` 和 `deployments/<customer-key>/`，不创建真实第二客户、不执行真实导入、不新增 `tenant_id`，也不改变当前 yoyoosun 部署主路径。

部署边界：

- 当前唯一部署真源仍是 `server/deploy/compose/prod`。
- 低配服务器只负责加载已构建产物、启动服务、执行 migration 和部署后检查。
- Atlas migration 仍使用宿主机 `/usr/local/bin/atlas`。
