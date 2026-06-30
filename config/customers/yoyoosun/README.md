# 永绅 yoyoosun 客户配置 / Yoyoosun Customer Config

本目录是 永绅 yoyoosun 客户配置包的落点。

当前口径：

- `yoyoosun` 是永绅客户的稳定客户 key。
- 本目录保存客户配置草案和已经接入的低风险前端品牌 / 菜单展示配置。
- 不代表 SaaS runtime tenant。
- 不新增 `tenant_id`。
- 不改变后端 RBAC 动作权限、Workflow / Fact 边界、schema、migration 或真实导入。
- 不改 Ent schema。

当前已接入：

- `menuConfig.mjs`：永绅 yoyoosun 前端品牌和桌面菜单配置源。该配置不再被默认产品前端静态 import；部署 yoyoosun 时应把 `customer-config.example.js` 复制或渲染为前端静态根路径的 `customer-config.js`，并发布 `assets/favicon-yoyoosun.svg` 到 `/customer-assets/yoyoosun/favicon-yoyoosun.svg`。该配置只控制登录页 / 入口页 / 后台侧栏的客户品牌展示，以及前端桌面菜单的分组、排序、隐藏和文案；菜单隐藏不是安全边界，后端仍以 RBAC action permission 和业务 usecase 校验为准。

- `customer-config.example.js`：永绅 yoyoosun 前端部署注入示例。默认产品 Web 包只带中性的 `web/public/customer-config.js` 占位，不能把本示例复制进 Product Core 默认产物。

- `fieldNumberingConfig.mjs`：永绅 yoyoosun 字段显示和编号规则配置草案。该文件当前 `runtimeEnabled=false`，只作为 Customer Config 评审清单；不接前端运行时、不改后端、不改 schema、不执行导入。

- `importConfig.mjs`：永绅 yoyoosun 导入与客户差异配置草案。该文件根据已提取的 Excel evidence、产品核心边界和客户台账收口导入顺序、字段映射分组、人工 review 队列、禁止自动导入目标和 deferred runtime 项；当前 `runtimeEnabled=false`，不嵌入 raw rows，不接 loader，不执行真实导入。

- `customerPackage.mjs`：永绅 yoyoosun 客户配置包结构草案，按 `workflows / businessFlows / stateMachines / processPolicies` 收口流程相关配置预览。当前接入 `scripts/qa/customer-package-lint.mjs`、`scripts/qa/customer-config-runtime-manifest.mjs` 和开发态 `/__dev/customer-config` 预检展示；开发页可触发测试版 UI Dry Run 生成 ignored `output/customers/yoyoosun/ui-import-dry-run` evidence，也可编译受控 runtime manifest 后用当前管理员登录态调用后端 `customer_config.validate_customer_config / publish_customer_config / activate_customer_config` 应用到测试环境。当前 manifest 会生成 9 个责任池 / role profile，包含 engineering 责任池和工程岗位端 access entitlement；页面投影必须来自已登记正式菜单 key，manifest 编译器和后端 validate / publish 都会拒绝缺失、空列表或未知 page key 的 `compiled_snapshot.pages`，旧 active revision 缺 pages 或无有效 pages 时 `get_effective_session` 不回退 RBAC 全量页面；字段策略只发布前端已消费的 `customers.default`、`suppliers.default` 和 `sales_orders.default`，`sales_order_items` 的产品 / 款式 / 颜色尺码候选仍停留在导入 / 客户评审草案；后端 `validate_customer_config / publish_customer_config` 也会拒绝未登记 surface / field key，`get_effective_session` 输出会过滤旧 revision 中的非法字段策略；Dry Run 不写数据库；测试环境应用只写客户配置控制面表并由后端 RBAC / JSON-RPC 守住，不上传 raw 包、不直写数据库、不导入真实客户业务数据；正式版入口必须先通过 release readiness gate，门禁通过后才允许用同一后端受控 API 发布 / 激活；后端 `rollback_customer_config` 只对已发布的 compiled revision 做受控版本回滚并写 `customer_config.rollback` 审计，不等于 raw 包回滚、真实导入失败恢复或备份恢复演练；`runtimeEnabled=false`，`previewOnly=true`，raw 包不 publish、不 activate、不 rollback。只有经过 runtime manifest 编译后的受控 JSON 才可作为后端 `customer_config.validate_customer_config / publish_customer_config` 输入，且不改变 WorkflowUsecase、Fact usecase、schema、migration 或真实导入。

未来可继续放：

- logo / 主题色。
- 打印模板选择。
- 角色模板和权限模板。
- 初始化数据。

## 校验命令

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-config-boundaries.mjs
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun
```

如需生成本地预览报告：

```bash
node scripts/qa/customer-package-lint.mjs --customer yoyoosun --out output/customers/yoyoosun/customer-package-preview.json
node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json
```

这些报告只写入 `output/`，用于人工 review，不纳入 git。`customer-package-preview.json` 不是 runtime manifest；`customer-config-runtime-manifest.json` 是可提交给后端 validate / publish 的受控 payload 形状，但脚本本身不调用后端、不激活、不导入业务数据。
