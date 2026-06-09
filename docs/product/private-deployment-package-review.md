# 多客户私有化复制包评审 / Private Deployment Package Review

- 文档类型：产品化交付评审 / Productization Delivery Review
- 状态：Phase 11 当前评审 / Phase 11 Current Review
- 作用域：新增客户时的 docs、config、deployment 包边界
- 不代表：真实客户数据导入、SaaS、多租户、license、billing、schema、migration、runtime loader 或客户已签收

## 结论

Phase 11 的交付目标是让新增客户主要复制客户包，而不是复制代码。

当前采用三段式客户包：

| 包 | 路径 | 作用 |
| --- | --- | --- |
| 客户资料包 | `docs/customers/<customer-key>/` | 客户资料、差异、导入 dry-run、unresolved queue、验收清单 |
| 客户配置包 | `config/customers/<customer-key>/` | 菜单、字段显示、编号、初始化模板等客户配置草案 |
| 部署资料包 | `deployments/<customer-key>/` | 私有化部署 runbook、环境清单、备份恢复、发布 evidence |

Phase 11 已新增 `config/private-deployment-template/templateConfig.mjs` 作为模板候选。它只供 QA、文档评审和未来客户包准备使用，`runtimeEnabled=false`，不接运行时。

## 当前允许

- 复用 `config/industry-templates/plush/templateConfig.mjs` 作为行业模板候选输入。
- 为新增客户建立 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/` 和 `deployments/<customer-key>/`。
- 在客户包中记录 dry-run、freeze、unresolved queue、backup evidence 和人工审批要求。
- 本地或目标环境只跑显式模拟数据闭环，并使用 `SIM-*` 前缀。
- 目标低配服务器只加载本地或 CI 已构建镜像，执行 migration status / apply、健康检查和回归。

## 当前禁止

- 不新增 `tenant_id`。
- 不实现 SaaS、多租户、license、billing 或客户工单系统。
- 不按客户 fork 代码。
- 不按客户复制核心 schema、migration、RBAC、WorkflowUsecase 或 Fact usecase。
- 不执行真实客户数据导入。
- 不写 `business_records`、库存、出货、预留、财务或其他事实表。
- 不把 `SIM-PRIVATE-PHASE11` 创建为正式客户目录。
- 不把单一客户样本直接升为行业默认。

## 模拟闭环

Phase 11 本地模拟闭环使用：

```bash
node scripts/qa/private-deployment-boundaries.mjs
node scripts/qa/phase11-private-deployment-closure.mjs \
  --out output/customers/yoyoosun/phase11-private-deployment-closure
```

该闭环只读取模板和现有包边界，生成本地 evidence；不连接数据库、不调用后端、不写文件到客户正式目录、不执行真实导入。

## 进入真实新增客户前

真实新增客户必须先确认：

1. 稳定 customer key。
2. 客户资料是否可入仓，是否含敏感信息。
3. 导入来源清单、字段分类和 unresolved queue。
4. 目标部署地址、资源限制、备份目录和回滚方式。
5. 是否需要客户专属打印样本或 extension；默认不得进入 Product Core。
6. 真实导入必须单独评审，不得从 Phase 11 模板直接执行。

