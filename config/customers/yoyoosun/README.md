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

- `menuConfig.mjs`：永绅前端品牌和桌面菜单配置源。部署时把经过审查的 `customer-config.example.js` 发布为静态根路径 `customer-config.js`，并只复制 `public-assets/` 到 `/customer-assets/yoyoosun/`。菜单隐藏不是安全边界，后端仍以 RBAC、active revision、模块状态和业务 usecase 校验为准。

- `customer-config.example.js`：永绅 yoyoosun 前端部署注入示例。默认产品 Web 包只带中性的 `web/public/customer-config.js` 占位，不能把本示例复制进 Product Core 默认产物。

- `public-assets/`：唯一允许复制到公开前端产物的客户静态资源，目前只含 favicon 等经过审查的品牌资源。
- `assets/engineering-work-instruction/`：客户工程表来源证据，只用于受控人工评审和模板设计，不由 dev server/生产 overlay 发布，也不再注入无鉴权的工程打印草稿。
- 版本化配置和试用 fixture 不保存真实员工姓名、手机号或签字人；真实合同经办信息由客户 active revision 或本单 `contract_party_snapshot` 受控维护并审计。

- `fieldNumberingConfig.mjs`：永绅 yoyoosun 字段显示和编号规则配置草案。该文件当前 `runtimeEnabled=false`，只作为 Customer Config 评审清单；不接前端运行时、不改后端、不改 schema、不执行导入。

- `importConfig.mjs`：永绅 yoyoosun 导入与客户差异配置草案。该文件根据已提取的 Excel evidence、产品核心边界和客户台账收口导入顺序、字段映射分组、人工 review 队列、禁止自动导入目标和 deferred runtime 项；当前 `runtimeEnabled=false`，不嵌入 raw rows，不接 loader，不执行真实导入。

- `customerPackage.mjs`：永绅客户包声明源。raw 包保持 `runtimeEnabled=false / previewOnly=true`；只有编译后的受控 manifest 才能走后端 validate / publish / activate，且不改变 schema、RBAC 或 Workflow / Fact 底线。
  - 模块、页面、角色和责任池由 catalog、active revision 与后端 RBAC 共同收窄；客户包不安装代码或模块。
  - `roleFlowMatrix.mjs` 中每个角色的 `menuSurfaces` 使用真实 runtime page key；其 `capabilityKeys` 必须覆盖页面 catalog 登记的全部读取合同。仅为页面联查补充的客户、供应商、材料、产品、库存等窄读取权限不会自动开放对应独立菜单，最终菜单由编译后的 `rolePageProjections` 继续收窄。
  - 客户包角色能力只编译为 `access_entitlements`；`role_profiles` 没有加权字段，角色撤权使用 `revokes`，后端 RBAC 是不可突破的上限。
  - 字段投影只发布 `customers.default`、`suppliers.default`、`sales_orders.default` 的列表 / CSV 列 `visible`。当前是 Product Core 的 `visible=true` 默认值，没有永绅专属隐藏，也不控制表单 label / editable / required；详见 `docs/customers/yoyoosun/配置投影覆盖矩阵.md`。
  - 打印默认值只覆盖采购合同、加工合同的买方 / 委托方抬头，供应商 / 加工方和明细继续来自业务快照。
  - Dry Run 不写数据库；测试应用只写客户配置控制面。正式发布仍需 release readiness，rollback 只回滚配置 revision，不回滚业务数据或数据库备份。

未来可继续放：

- logo / 主题色。
- 打印模板选择和经确认的甲方 party defaults。
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
