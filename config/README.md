# 配置目录 / Config Directory

本目录保存产品化、客户差异和私有化复制相关配置。这里不是运行时多租户目录，也不是部署主路径；具体配置能否进入 runtime，必须看对应子目录 README、配置文件状态和正式文档。

## 目录职责

| 路径 | 职责 | 当前边界 |
| --- | --- | --- |
| `catalog/` | 客户配置包允许引用的模块、能力、页面、字段、责任池、策略和命令 key | 服务客户包 lint / preview 和 runtime manifest 编译；不驱动 Workflow / Fact runtime、不写事实 |
| `schemas/` | 客户配置包声明结构和边界校验规则 | 不是 Ent schema、Atlas migration、JSON-RPC contract 或 runtime loader |
| `customers/<customer-key>/` | 单个客户配置包；`demo` 是最小 smoke fixture，`reference-customer` 是中性工程参考，`yoyoosun` 是当前真实客户配置 | 不代表 SaaS tenant，不新增 `tenant_id`，不替代后端 RBAC、Workflow / Fact usecase、schema 或 migration |
| `industry-templates/plush/` | 毛绒行业模板候选配置 | 当前是 candidate，不是默认 runtime loader，不把单客户资料写成 Product Core |
| `private-deployment-template/` | 多客户私有化复制模板候选 | 不创建第二套部署主路径，不 fork 核心代码，不在客户服务器构建镜像 |

## 主路径

- 可复用 key 先登记到 `config/catalog/`，结构边界先进入 `config/schemas/`。
- 客户配置先进入 `config/customers/<customer-key>/`；中性 demo 只用于本地验证，reference 保持 draft/preview，真实客户配置还必须同步客户资料文档和客户差异台账。
- 客户包流程结构当前只能进入 lint / preview；如需进入后端 `customer_config`，必须先通过 `customer-config-runtime-manifest` 生成受控 manifest，再走后端 validate / publish / activate。raw 客户包不直接 publish、不 activate、不 rollback，也不接 Workflow / Fact runtime。
- Runtime manifest 的页面投影必须来自已登记正式菜单 key；manifest 编译器和后端 `validate_customer_config / publish_customer_config` 都会拒绝缺失、空列表或未知 page key 的 `compiled_snapshot.pages`，旧 active revision 缺 pages 或无有效 pages 时 `get_effective_session` 不回退 RBAC 全量页面。
- 每个正式页面还必须在 `config/catalog/customerPackageCatalog.mjs` 登记 `requiredCapabilityKeys`。客户角色的 `menuSurfaces` 只有在其能力集合覆盖页面全部读取合同后才能编译；编译结果写入 `compiled_snapshot.rolePageProjections`，用于把“页面所需的窄引用读取权限”和“角色真正可见的菜单”分开，避免补一个引用读取权限就意外开放整个主数据页面。
- 动作能力只有一个客户配置加法真源：`access_entitlements`。`role_profiles` 只保留角色启停、能力包标记和 `revokes`；最终动作集合按 `后端 RBAC ∩ 模块状态 ∩ access_entitlements - role_profiles.revokes` 逐角色计算，再对多角取并集。
- Runtime manifest 的字段策略不是 catalog fields 全量发布；当前只发布 `customers.default`、`suppliers.default` 和 `sales_orders.default`，前端仅消费列表 / CSV 导出列的 `visible`。默认值为 `visible=true`；reference 工程样例仅隐藏低风险的 `suppliers.default.supplier_type`，yoyoosun 未配置隐藏规则。该合同不驱动表单 label、editable、required。BOM、采购、委外、质检、库存、出货和财务字段只属于正式业务字段合同，不是 active field policy；`sales_order_items` 的款式 / 颜色尺码仍是导入 / 客户评审草案。后端 `validate_customer_config / publish_customer_config` 会拒绝其他 surface / field key，`get_effective_session` 输出会过滤旧 revision 中的非法字段策略。
- 行业通用能力进入 Product Core 前，必须回到代码、测试、产品 / 架构文档和客户差异边界复核。
- 私有化部署资料进入 `deployments/<customer-key>/`；当前产品部署真源仍是 `server/deploy/compose/prod`。

## 不在本目录承接

- 不承接真实客户原始 Excel / PDF / 图片；原件进入客户专属私有仓库或受控对象存储，Product Core 只保留通用工具、合成 fixture、manifest 结构和脱敏映射。
- 不承接真实 `.env`、secret、证书私钥、数据库备份或生产日志。
- 不承接 Ent schema、Atlas migration、RBAC 权限码、Workflow / Fact 规则或 JSON-RPC usecase。
- 不承接 SaaS tenant runtime loader、license、billing 或客户工单系统。

## 相关入口

- 客户配置 catalog：`config/catalog/README.md`
- 客户配置 schema：`config/schemas/README.md`
- 中性 demo 客户配置包：`config/customers/demo/README.md`
- 标准样例客户配置包：`config/customers/reference-customer/README.md`
- 永绅客户配置包：`config/customers/yoyoosun/README.md`
- 行业模板说明：`config/industry-templates/plush/README.md`
- 私有化复制模板说明：`config/private-deployment-template/README.md`
- 当前真源索引：`docs/当前真源与交接顺序.md`
- 文档清单：`docs/文档清单.md`

## 校验命令

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
node scripts/qa/customer-package-lint.mjs --customer demo
node scripts/qa/customer-package-lint.mjs --all
node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile
node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-package-preview.json
node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview
node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode preview
node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview
```

`customer-package-lint` 只做 raw 客户包结构、边界和 preview 检查，输出目录在 `output/` 下，不纳入 git；当前登记包均为 draft，因此 `customer-config-runtime-manifest` 显式使用 `--mode preview` 生成不可发布的受控 manifest 形状，不上传文件、不调用后端、不 activate、不 rollback、不导入业务数据。当前 raw 包 `activate` / `rollback` 模式会被脚本拒绝。
