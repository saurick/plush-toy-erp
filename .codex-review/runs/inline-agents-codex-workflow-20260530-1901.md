# Codex 审查报告

## 1. Goal 信息

- Goal 文件：Inline request
- Goal 名称：合并补充根 AGENTS.md 的 Codex 工作流规则
- 运行时间：2026-05-30 19:01
- 任务类型：docs-only / workflow rules
- 是否修改运行时代码：否
- 是否修改 Ent schema：否
- 是否修改 migration：否
- 是否修改 API：否
- 是否修改 UI：否
- 是否修改 docs registry：否
- 是否修改 seedData：否

## 2. 完成摘要

本轮在 `AGENTS.md` 现有 “Codex 工作流与 Goal 交接” 章节中做合并式补充，没有重复创建章节。新增内容覆盖：中文短 Goal 工作流、同一 Goal 后续处理范围、新开会话建议、Goal 输入规则、任务 md 的允许 / 禁止文件与验收命令优先级、审查报告历史副本、长期规则来源、项目长期边界和客户专属资料边界。

按仓库约定更新了 `progress.md`，并覆盖 `.codex-review/latest.md`，同时生成历史副本。

## 3. 新增 / 修改 / 删除文件

### 新增文件

- `.codex-review/runs/inline-agents-codex-workflow-20260530-1901.md`

### 修改文件

- `AGENTS.md`
- `progress.md`
- `.codex-review/latest.md`

### 删除文件

无。

## 4. Git 状态

命令：

```bash
git status --short
```

结果：

```text
 M AGENTS.md
 M README.md
 M docs/current-source-of-truth.md
 M progress.md
 M web/src/erp/docs/productization-delivery.md
 M web/src/erp/docs/system-layer-progress.md
?? .codex-review/
?? config/
?? deployments/
?? docs/architecture/customer-supplier-masterdata-review.md
?? docs/architecture/masterdata-order-source-document-review.md
?? docs/architecture/order-purchase-boundary-review.md
?? docs/architecture/product-sku-bom-boundary-review.md
?? docs/architecture/status-workflow-fact-boundary.md
?? docs/codex-goals/
?? docs/customers/
?? docs/product/
?? docs/reference/
?? server/internal/core/
?? web/src/erp/mobile/roles/
?? web/src/erp/modules/
```

说明：除 `AGENTS.md`、`progress.md` 和 `.codex-review/*` 外，其余工作区现场为本轮开始前已存在的未提交文档 / 骨架改动，本轮未回退或整理。

## 5. Diff 统计

命令：

```bash
git diff --stat
```

结果：

```text
 AGENTS.md                                   | 35 +++++++++++++++++++++++++++++
 README.md                                   |  8 ++++++-
 docs/current-source-of-truth.md             |  7 +++++-
 progress.md                                 | 20 +++++++++++++++++
 web/src/erp/docs/productization-delivery.md |  2 ++
 web/src/erp/docs/system-layer-progress.md   |  4 +++-
 6 files changed, 73 insertions(+), 3 deletions(-)
```

说明：`git diff --stat` 只统计已跟踪文件，不显示未跟踪的 `.codex-review/*` 和其他未跟踪现场。

## 6. 未跟踪文件

命令：

```bash
git ls-files --others --exclude-standard
```

结果：

```text
.codex-review/latest.md
.codex-review/runs/inline-agents-codex-workflow-20260530-1901.md
config/customers/current/README.md
config/industry-templates/plush/README.md
deployments/current/README.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/order-purchase-boundary-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/status-workflow-fact-boundary.md
docs/codex-goals/001-overnight-phase1-masterdata-order-review.md
docs/codex-goals/002-schema-design-final-review.md
docs/codex-goals/README.md
docs/codex-goals/_review-output-protocol.md
docs/customers/current/README.md
docs/customers/current/assumption-register.md
docs/customers/current/change-request-process.md
docs/customers/current/customer-config-draft.md
docs/customers/current/decision-log.md
docs/customers/current/delta-register.md
docs/customers/current/question-backlog.md
docs/customers/current/requirement-clues.md
docs/customers/current/source-materials.md
docs/product/business-records-transition-plan.md
docs/product/config-permission-policy.md
docs/product/customer-delta-policy.md
docs/product/customer-instance-policy.md
docs/product/domain-model-v1.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/module-boundaries.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
docs/product/product-principles.md
docs/product/release-gates.md
docs/product/rewrite-roadmap.md
docs/product/schema-design-final-review.md
docs/product/test-strategy.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
docs/product/zero-to-one-architecture.md
docs/reference/imported-notes/README.md
docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
docs/reference/imported-notes/erp_status_workflow_context.md
server/internal/core/README.md
server/internal/core/audit/.gitkeep
server/internal/core/bom/.gitkeep
server/internal/core/finance/.gitkeep
server/internal/core/inventory/.gitkeep
server/internal/core/masterdata/.gitkeep
server/internal/core/order/.gitkeep
server/internal/core/outsourcing/.gitkeep
server/internal/core/production/.gitkeep
server/internal/core/purchase/.gitkeep
server/internal/core/quality/.gitkeep
server/internal/core/rbac/.gitkeep
server/internal/core/shipment/.gitkeep
server/internal/core/workflow/.gitkeep
web/src/erp/mobile/roles/README.md
web/src/erp/modules/README.md
```

## 7. 禁止路径检查

必须检查这些路径是否被修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model/schema
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

| 路径 | 是否修改 | 说明 |
|---|---:|---|
| `server/internal/biz/workflow.go` | 否 | 无本轮改动。 |
| `server/internal/biz/rbac.go` | 否 | 无本轮改动。 |
| `server/internal/data` | 否 | 无本轮改动。 |
| `server/internal/data/model/schema` | 否 | 无本轮改动。 |
| `server/internal/core` | 是 | 未跟踪骨架已在本轮前存在；本轮未修改。 |
| `web/src/erp/config/docs.mjs` | 否 | 无本轮改动。 |
| `web/src/erp/config/seedData.mjs` | 否 | 无本轮改动。 |
| `web/src/erp/pages` | 否 | 无本轮改动。 |
| `web/src/erp/mobile` | 是 | 未跟踪 `web/src/erp/mobile/roles/README.md` 已在本轮前存在；本轮未修改。 |
| `migrations` | 否 | 无本轮改动。 |
| `server/deploy` | 否 | 无本轮改动。 |
| `scripts` | 否 | 无本轮改动。 |

## 8. tenant_id 检查

命令：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
```

结果：

```text
docs/product/zero-to-one-architecture.md:当前不实现 SaaS runtime tenant，不新增 `tenant_id`，不改 Ent schema，不改 RBAC 为多租户模型。
docs/product/phase1-risk-register.md:| `tenant_id` creep | High | 提前进入 SaaS 多租户复杂度和 schema 污染 | Phase 0 文档只允许未来 SaaS 评审候选 | 当前私有化阶段每客户一套 DB / 对象存储 / 部署配置 | Productization / Data | Yes |
docs/product/schema-design-final-review.md:- `tenant_id`
docs/product/v1-implementation-cutline.md:- 不新增 `tenant_id`。
docs/product/v1-schema-go-no-go.md:4. 不得新增 `tenant_id`。
docs/customers/current/README.md:`current` 不是 SaaS runtime tenant，不代表数据库多租户，不要求新增 `tenant_id`，也不是 Product Core 真源。
docs/reference/imported-notes/README.md:4. imported note 中出现的多租户或 `tenant_id` 示例，只能作为未来 SaaS 评审素材，不能进入当前 schema 方案。
config/customers/current/README.md:- 不新增 `tenant_id`。
```

解释：

- 是否新增了 `tenant_id` 字段？否，本轮只改 `AGENTS.md`、`progress.md` 和审查报告。
- 是否只出现在 imported notes、禁止说明、future SaaS 评审候选说明里？是，命中均为禁止、评审边界、测试命令或 imported notes。
- 是否进入了 schema draft、runtime 或 Ent schema？本轮没有修改 runtime、Ent schema 或 migration。

## 9. Workflow / Fact 边界检查

命令：

```bash
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

结果：

```text
docs/product/schema-design-final-review.md:shipping_released != shipped。
docs/product/schema-design-final-review.md:UI 可显示 `shipping_released` 为“已放行 / 可发货 / 待出库”。UI 不得把 `shipping_released` 显示为“已出库 / 已发货 / 已扣库存”。`shipped` 才能代表真实出货完成，必须由 shipment facts / inventory_txns 支撑。
docs/product/module-boundaries.md:| `shipping_released != shipped` | 已放行不等于已出库、已发货、已扣库存 |
docs/architecture/shipment-release-workflow-review.md:> 结论：第七条最小后端 workflow usecase 已落地。`shipment_release done / blocked / rejected` 只推进协同业务状态：`done -> shipping_released`，`blocked / rejected -> blocked`。它不等于 `shipped`，不写库存流水，不更新库存余额，不创建库存批次，不做库存预留 / 冻结 / 扣减，不创建 DerivedTask，不派生出货执行、应收、开票或任何财务任务，也不改 Ent schema 或生成 migration。
docs/architecture/order-purchase-boundary-review.md:`shipment_release done -> shipping_released` 只表示已放行 / 可发货 / 待出库。
docs/reference/imported-notes/erp_status_workflow_context.md:| shipping_released | 已出库 |
docs/reference/imported-notes/erp_status_workflow_context.md:把 shipping_released 显示为“已出库”。
docs/reference/imported-notes/erp_status_workflow_context.md:- shipping_released 不能显示成已出库
```

解释：

- 是否仍然明确 `shipping_released != shipped`？是，正式产品和架构文档继续明确。
- 是否有任何文档把 `shipping_released` 写成已出库、已发货、已扣库存？正式文档明确禁止；`docs/reference/imported-notes/*` 有历史输入和反例材料，不作为当前真源。
- 是否有任何内容让 Workflow 写 inventory、shipment、finance、AR/AP、invoice、payment facts？正式产品和架构文档继续禁止，本轮未改运行时代码。

## 10. 实现状态措辞检查

命令：

```bash
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
```

结果：

```text

```

解释：

- 本轮是否把 draft / review 错写成 implemented？未发现问题。

## 11. 测试命令与结果

### 文档 / diff 检查

命令：

```bash
git diff --check
```

结果：

```text
pass
```

### 前端测试

未跑命令：

```bash
cd web && pnpm test
```

未跑原因：本轮只改根协作规则、进度记录和审查报告，不触达前端运行时代码、样式、docs registry 或 seedData。

是否与本轮改动相关：否。

### 后端测试

未跑命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

未跑原因：本轮不改后端运行时代码、Ent schema、repo、usecase 或 migration。

是否与本轮改动相关：否。

## 12. 关键决策

- 合并到 `AGENTS.md` 既有 Codex 工作流章节，不重复创建同类章节。
- 本轮不修改 `docs/codex-goals/README.md` 或 `_review-output-protocol.md`，因为已有正式协议文件，本轮目标只要求补根目录 `AGENTS.md`。
- 客户专属资料边界只写协作规则，不移动目录、不改 docs registry、不改 runtime loader。

## 13. 风险

风险：工作区已有大量本轮前未提交文档和骨架现场。
影响：`git diff --stat` 和 `git status --short` 会包含非本轮文件。
缓解措施：报告中明确标注本轮实际触达范围，未回退既有现场。
下一步是否需要评审：如要提交，应先按路径核对本轮与既有现场的提交边界。

风险：`docs/reference/imported-notes/*` 中仍有历史输入和反例。
影响：grep 会命中一些禁止或反例文本。
缓解措施：`AGENTS.md` 和 `docs/current-source-of-truth.md` 已规定 imported notes 不能作为当前真源。
下一步是否需要评审：否，除非后续要清理 imported notes。

## 14. 下一轮建议 Codex Goal

建议下一轮 Goal：如继续推进编号 Goal，按 `docs/codex-goals/README.md` 新开会话执行对应 goal md。
建议 Goal 文件：由用户选择当前要推进的 `docs/codex-goals/*.md`。
为什么：本轮只补协作规则，不进入 schema / repo / API / UI 实现。
下一轮禁止做：不要把 current 客户资料写入 Product Core；不要新增 `tenant_id`；不要让 WorkflowUsecase 写 Fact。

## 15. 复制给 GPT 的摘要

请把本节作为用户可直接复制给 GPT 的摘要。

```text
【Codex 审查报告】

【Goal】
Inline request：合并补充根 AGENTS.md 的 Codex 工作流规则

【完成摘要】
已在 AGENTS.md 现有 Codex 工作流章节中合并补齐会话边界、Goal 输入规则、审查报告规则、长期规则来源、项目长期边界和客户专属资料边界；同步更新 progress.md，并生成 .codex-review/latest.md 与历史副本。

【新增文件】
.codex-review/runs/inline-agents-codex-workflow-20260530-1901.md

【修改文件】
AGENTS.md
progress.md
.codex-review/latest.md

【git status --short】
工作区包含 AGENTS.md、progress.md 和 .codex-review/，同时仍有本轮前已存在的 README/docs/config/deployments/server/internal/core/web 骨架现场。

【git diff --stat】
AGENTS.md +35 行；progress.md +20 行；其余统计包含本轮前未提交现场。

【untracked files】
.codex-review/latest.md 以及本轮前已存在的 docs/product、docs/codex-goals、docs/customers、config、deployments、server/internal/core、web/src/erp/mobile/roles 等未跟踪现场。

【测试命令与结果】
git diff --check：pass。未跑前端 / 后端测试，因为本轮只改协作规则文档、进度记录和审查报告。

【tenant_id 检查】
未新增 tenant_id 字段；命中为禁止说明、future SaaS 评审边界、测试命令或 imported notes。

【Workflow / Fact 检查】
正式产品和架构文档仍明确 shipping_released != shipped，Workflow 不写库存、出货、财务、应收、应付、发票或收付款事实。

【禁止路径检查】
server/internal/core 和 web/src/erp/mobile 有本轮前未跟踪骨架；workflow.go、rbac.go、server/internal/data、schema、docs registry、seedData、pages、migrations、server/deploy、scripts 均无本轮改动。

【关键决策】
合并到 AGENTS.md 既有章节；不重复复制 docs/codex-goals 的完整协议；不移动客户资料目录。

【风险】
工作区已有大量本轮前未提交现场，提交前需要按路径核对边界。

【下一轮 Codex 建议】
如继续推进编号 Goal，按 docs/codex-goals/README.md 新开会话执行对应 goal md。
```
