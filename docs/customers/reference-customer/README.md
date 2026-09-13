# 标准样例客户 / Reference Customer

`reference-customer` 是新增甲方时使用的中性工程参考，不是真实客户。它帮助开发、测试、运维和业务验收人员看清一项客户差异应落在哪一层、如何验证，以及哪些证据仍需在真实环境补齐。

## 当前结论

| 项目 | 当前状态 | 不能据此宣称 |
| --- | --- | --- |
| 客户配置包 | `draft`、`previewOnly=true`，可 lint 和编译受控 manifest | 已发布或已激活 |
| 字段与责任池投影 | Product Core 已有受控合同的工程参考 | 目标客户已经采用 |
| 流程与打印默认值 | 预览/受控投影，仍受 Workflow / Fact 和单据真源约束 | 任务完成等于事实入账、模板默认值等于业务事实 |
| 部署参数 | 复用生产 Compose 的示例 | 已创建生产实例或已有 release evidence |
| 客户资料与导入 | 未提供真实来源，真实导入不在本参考范围 | 客户已确认、已导入或已对账 |

仓库不创建 `deployments/reference-customer/`。参数示例和操作边界统一维护在 `config/private-deployment-template/`；真实客户的发布、备份恢复、浏览器 smoke 和签收证据仍进入该客户受控交付路径。

## 固定底线

- 保持一个模块化单体、一个 Product Core、一个后端、一个前端和一套 migration。
- 私有化采用一客户一实例：独立数据库/账号、文件目录、secrets、日志、备份与恢复权限；不增加 `tenant_id`。
- `ERP_CUSTOMER_KEY` 由部署环境固定，请求不能借 customer key 切换实例身份。
- 客户配置只能组合或收窄 Product Core 已有能力，不能增加 RBAC 权限码或绕过服务端权限。
- Workflow task done 不等于库存、采购、质检、出货或财务 Fact posted。
- 真实 Excel、PDF、合同、图片和其他原件应进入客户专属私有仓库或受控对象存储；Product Core 不使用 Git 子模块，也不反向依赖私有资料仓库。

## 差异与边界

本表只记录当前工程参考，不能替代真实客户访谈、差异确认或签收。`RUNTIME_CAPABLE` 表示 Product Core 已有受控消费链路，不表示 reference 实例已发布；`PREVIEW_ONLY` 表示只能用于评审；`DEFERRED` 表示本次没有实现。

| 需求 | 归属 | 当前层级 | 实现位置 | 验证位置 | 验收与风险 |
| --- | --- | --- | --- | --- | --- |
| 中性品牌、favicon | 客户配置 | `PREVIEW_ONLY` | `config/customers/reference-customer/customer-config.example.js`、`public-assets/` | `scripts/build/apply-customer-web-config.test.mjs` | 只证明构建 overlay；不是后端授权或生产品牌验收 |
| 供应商列表隐藏“供应商类型” | 客户配置 + Product Core 字段合同 | `RUNTIME_CAPABLE`、未发布 | `customerPackage.mjs.fieldPolicyOverrides`、catalog/schema/compiler/effective session/UI consumer | 客户包、manifest、后端 effective-session 与正式列表/CSV 测试 | 只能隐藏低风险已登记字段；不改变表单、校验或数据真源 |
| `order_review` 责任池投影到既有销售角色 | 客户配置 | `RUNTIME_CAPABLE`、未发布 | `customerPackage.mjs.workPoolRoleOverrides` | manifest 与 effective-session 测试 | 不能增加账号原本没有的后端权限；最终权限仍取交集 |
| 销售订单评审流程示例 | Workflow 投影 | `PREVIEW_ONLY` | `customerPackage.mjs.workflows` | 客户包 preview 边界测试 | 不接事实写入；task done 不生成库存、出货、应收或发票 |
| 采购/加工合同中性买方抬头 | 客户配置 | `PREVIEW_ONLY` | `customerPackage.mjs.printTemplateDefaults` | manifest/effective-session 合同测试 | 抬头是默认值；供应商、材料、数量、价格和金额仍来自 Source Document |
| 客户编号规则 | 受控策略 | `DEFERRED` | 无 | 无 | 没有真实需求和完整消费者，不提前建设编号平台 |
| 客户导入映射与 apply | 导入边界 | `DEFERRED` | 无 reference 原始资料或 apply 配置 | 仅保留通用导入边界测试 | 没有来源授权、dry-run、unresolved queue、备份与审批时不得 apply |
| 私有化部署参数 | 部署模板 | `PREVIEW_ONLY` | `config/private-deployment-template/` | private-deployment boundary/closure tests | 不等于目标机部署、备份恢复或发布证据 |
| 客户专属 schema、migration、RBAC、usecase、前端分支 | 拒绝 | `REJECTED` | 无 | 定向边界测试与代码审查 | 会形成双真源、破坏升级和权限边界 |
| SaaS、多租户、微服务、动态插件 | 拒绝 | `REJECTED` | 无 | 架构边界检查 | 当前是一客户一私有化实例，不以参考样例提前平台化 |

### 提升到 Product Core 的门禁

一项客户需求只有在已经属于通用领域事实，或出现真实复用需求且能保持现有事实、权限和事务语义时，才单独评审进入 Product Core。单个参考样例不能作为抽象依据。

任何需要新增 schema、migration、权限码、第二套服务、动态代码执行，或跨三个以上无直接关系子系统的需求，本次都停止并转为正式评审，不通过局部前端判断绕过。

## 实施与验收

本指南按使用者组织。工程参考的本地绿色只证明代码和模板合同，不替代目标环境、真实数据和客户人工验收。

### 开发人员

1. 先从 `config/customers/index.mjs` 取得已登记客户包，不在业务代码增加 customer key 条件。
2. 把差异写入现有 catalog/schema/compiler 能消费的声明字段；无真实消费者的配置不新增。
3. 保持 raw package 为 `draft`、`previewOnly=true`，禁止直接 publish/activate/rollback 或写业务 Fact。
4. 涉及字段时核对真源、列表/CSV consumer、来源切换和旧 revision；涉及 Workflow 时核对 Fact 禁区。
5. 运行：

```bash
node --test config/customers/index.test.mjs
node --test scripts/qa/customer-package-lint.test.mjs
node --test scripts/qa/customer-config-runtime-manifest.test.mjs
node --test scripts/build/apply-customer-web-config.test.mjs
node scripts/qa/customer-package-lint.mjs --customer reference-customer
node scripts/qa/customer-config-runtime-manifest.mjs --customer reference-customer --mode preview
```

### 测试人员

| 风险 | 最低验证 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| package/index | key、包内 key、schema、禁止项正负例 | 构建期登记和声明边界正确 | 后端已发布 |
| manifest | deterministic compile、未知 key 拒绝 | 受控 payload 可被后端验证 | revision 已激活 |
| 字段投影 | package → manifest → effective session → 正式列表/CSV | 一个低风险字段差异有真实消费者 | 表单 editable/required 已配置化 |
| 权限/责任池 | RBAC 上限、角色投影、customer key 不匹配拒绝 | 客户配置不能扩权或切换实例 | 前端隐藏本身是安全边界 |
| revision | 同 revision 同 hash 幂等、不同 hash conflict、事务回滚、唯一 active | 数据库约束和控制面语义成立 | 目标环境已迁移或已发布 |
| 部署模板 | 路径、参数、禁止项和 Compose 真源 | 模板边界成立 | 真实备份、smoke 或签收完成 |

涉及 PostgreSQL 唯一索引、事务和并发时必须运行 PostgreSQL 集成测试；in-memory 测试不能替代。环境不可用时保留测试并报告环境阻塞。

模板和文档验证：

```bash
node scripts/qa/private-deployment-boundaries.mjs
node --test scripts/qa/private-deployment-package-closure.test.mjs
node --test scripts/qa/affected.test.mjs
node --test scripts/qa/docs-inventory.test.mjs
git diff --check
```

### 运维人员

1. 使用 `server/deploy/compose/prod`，不要创建 reference 专属 Compose 主路径。
2. 从 `config/private-deployment-template/reference-customer.env.example` 准备受控 env；替换镜像 tag、密码、端口和目录占位值。
3. 固定 `ERP_CUSTOMER_KEY=reference-customer`，为数据库/账号、文件、日志、备份、恢复权限和 secrets 做实例级隔离。
4. 发布前记录产品版本、镜像 digest、customer-config revision、migration 状态和回滚点。
5. 目标机只加载构建制品；备份后再执行受控 migration；启动后检查 health、ready、桌面、登录、RBAC 和选定业务链路。
6. 回滚只使用兼容制品和已验证配置 revision。本参考实现没有 schema 变化，不把应用回滚写成数据库降级。

完整参数与命令见 `config/private-deployment-template/README.md`。仓库没有 `deployments/reference-customer/`，也没有 reference release evidence。

### 业务验收人员

按目标岗位使用真实验收账号检查：

1. 品牌和菜单是否符合已确认差异。
2. 供应商列表/导出是否按确认隐藏低风险字段，数据本身未被删除。
3. 角色能否看到并执行应有动作，无权动作是否由服务端拒绝。
4. 流程任务的责任人、状态和原因是否正确；任务完成后不得自动出现未授权业务事实。
5. 打印抬头与真实 Source Document 的供应商、材料、数量和金额是否分别来自正确真源。
6. 默认态、交互态、恢复态、错误态和相邻页面是否可理解。

### 真实交付仍需补齐的证据

| 事项 | reference 工程样例状态 | 真实交付要求 |
| --- | --- | --- |
| 客户需求/资料确认 | 未执行 | 有来源授权、差异确认和敏感性边界 |
| 真实导入 apply | 未执行 | dry-run、unresolved 清零、备份、审批、对账和 forward-fix |
| 目标机部署 | 未执行 | 固定 commit/image、环境、migration、health/ready/smoke 证据 |
| 备份恢复 | 未执行 | 隔离环境恢复演练和一致性核对 |
| 真实账号浏览器验收 | 未执行 | 多角色、服务端权限、关键业务链路人工验收 |
| 客户签收 | 未执行 | 客户负责人基于真实环境签收 |

不得把 Node 合同测试、模板报告、开发浏览器或本地绿色改写成上述外部事项已完成。
