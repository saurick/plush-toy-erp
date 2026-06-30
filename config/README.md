# 配置目录 / Config Directory

本目录保存产品化、客户差异和私有化复制相关配置。这里不是运行时多租户目录，也不是部署主路径；具体配置能否进入 runtime，必须看对应子目录 README、配置文件状态和正式文档。

## 目录职责

| 路径 | 职责 | 当前边界 |
| --- | --- | --- |
| `catalog/` | 客户配置包允许引用的模块、能力、页面、字段、责任池、策略和命令 key | 服务客户包 lint / preview 和 runtime manifest 编译；不驱动 Workflow / Fact runtime、不写事实 |
| `schemas/` | 客户配置包声明结构和边界校验规则 | 不是 Ent schema、Atlas migration、JSON-RPC contract 或 runtime loader |
| `customers/<customer-key>/` | 单个客户配置包，例如中性 demo、yoyoosun 品牌、菜单展示、字段编号草案和导入配置草案 | 不代表 SaaS tenant，不新增 `tenant_id`，不替代后端 RBAC、Workflow / Fact usecase、schema 或 migration |
| `industry-templates/plush/` | 毛绒行业模板候选配置 | 当前是 candidate，不是默认 runtime loader，不把单客户资料写成 Product Core |
| `private-deployment-template/` | 多客户私有化复制模板候选 | 不创建第二套部署主路径，不 fork 核心代码，不在客户服务器构建镜像 |

## 主路径

- 可复用 key 先登记到 `config/catalog/`，结构边界先进入 `config/schemas/`。
- 客户配置先进入 `config/customers/<customer-key>/`；中性 demo 只用于本地验证，真实客户配置还必须同步客户资料文档和客户差异台账。
- 客户包流程结构当前只能进入 lint / preview；如需进入后端 `customer_config`，必须先通过 `customer-config-runtime-manifest` 生成受控 manifest，再走后端 validate / publish / activate。raw 客户包不直接 publish、不 activate、不 rollback，也不接 Workflow / Fact runtime。
- Runtime manifest 的页面投影必须来自已登记正式菜单 key；manifest 编译器和后端 `validate_customer_config / publish_customer_config` 都会拒绝缺失、空列表或未知 page key 的 `compiled_snapshot.pages`，旧 active revision 缺 pages 或无有效 pages 时 `get_effective_session` 不回退 RBAC 全量页面。
- Runtime manifest 的字段策略不是 catalog fields 全量发布；当前只发布前端已消费的 `customers.default`、`suppliers.default` 和 `sales_orders.default`，`sales_order_items` 的产品 / 款式 / 颜色尺码候选仍停留在导入 / 客户评审草案。后端 `validate_customer_config / publish_customer_config` 也会拒绝未登记 surface / field key，`get_effective_session` 输出会过滤旧 revision 中的非法字段策略。
- 行业通用能力进入 Product Core 前，必须回到代码、测试、产品 / 架构文档和客户差异边界复核。
- 私有化部署资料进入 `deployments/<customer-key>/`；当前产品部署真源仍是 `server/deploy/compose/prod`。

## 不在本目录承接

- 不承接真实客户原始 Excel / PDF / 图片；这些资料按客户资料边界进入 `docs/customers/<customer-key>/raw-source-files/`。
- 不承接真实 `.env`、secret、证书私钥、数据库备份或生产日志。
- 不承接 Ent schema、Atlas migration、RBAC 权限码、Workflow / Fact 规则或 JSON-RPC usecase。
- 不承接 SaaS tenant runtime loader、license、billing 或客户工单系统。

## 相关入口

- 客户配置 catalog：`config/catalog/README.md`
- 客户配置 schema：`config/schemas/README.md`
- 中性 demo 客户配置包：`config/customers/demo/README.md`
- 客户配置包说明：`config/customers/yoyoosun/README.md`
- 行业模板说明：`config/industry-templates/plush/README.md`
- 私有化复制模板说明：`config/private-deployment-template/README.md`
- 当前真源索引：`docs/当前真源与交接顺序.md`
- 文档清单：`docs/文档清单.md`

## 校验命令

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
node scripts/qa/customer-package-lint.mjs --customer demo
node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile
node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-package-preview.json
node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun
node scripts/qa/customer-config-runtime-manifest.mjs --customer demo
node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile
```

前三条只做 raw 客户包结构、边界和 preview 检查，输出目录在 `output/` 下，不纳入 git；后两条生成后端 `customer_config` 可验证的受控 runtime manifest，但不上传文件、不调用后端、不 activate、不 rollback、不导入业务数据。当前 raw 包 `activate` / `rollback` 模式会被脚本拒绝。
