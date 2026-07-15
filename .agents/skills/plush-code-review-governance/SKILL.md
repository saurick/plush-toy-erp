---
name: plush-code-review-governance
description: 项目代码审查治理（plush-toy-erp）。Use when reviewing plush diffs, commits, pull requests, or working-tree changes for correctness, project boundaries, regressions, and missing validation.
---

# Plush 代码审查治理 Code Review Governance

用这个 skill 审查 `/Users/simon/projects/plush-toy-erp` 的代码和正式文档改动。默认只审查，不改代码。

## 范围解析 Scope

1. 用户指定 commit、branch、文件、目录或 PR 时，只审指定范围。
2. side chat 或新会话未指定范围时，审当前仓库 `git status`、staged diff、unstaged diff 和最近相关提交。
3. 当前主会话里“实现后 review”时，审本轮相关改动；若工作区有多组无关改动，先按最近用户请求收窄。
4. 不依赖主会话说法。任何结论都要回到仓库代码、正式文档、测试和当前 diff。

## 必读真源 Truth Chain

先运行：

```bash
git -C /Users/simon/projects/plush-toy-erp status --short
git -C /Users/simon/projects/plush-toy-erp diff --stat
```

再按触达范围读：

- `AGENTS.md`
- `README.md`
- `docs/当前真源与交接顺序.md`
- `docs/product/自动化测试策略.md`
- `scripts/README.md`
- 前端任务读 `web/README.md` 和相关页面/组件/测试。
- 服务端、schema、事实层任务读 `server/README.md`、相关 `biz / data / service / schema / migration` 和测试。
- 文档或页面设计相关改动需要同时按项目 docs/page governance skill 的规则审查，但本 skill 不要求它们必须一起触发。

## 高风险检查 Risk Checklist

重点审这些问题：

- Workflow / Fact 边界：`WorkflowUsecase` 不能直接写库存、出货、财务、应收、应付、发票或收付款事实；task done 不等于 fact posted。
- 事实真源：不要新增与现有 `units / materials / products / warehouses / inventory_txns / purchase_receipts / quality_inspections / RBAC` 等语义重复的表、字段或配置。
- RBAC / API：前端隐藏菜单不是安全边界；后端权限、角色、`owner_role_key`、`assignee_id`、`task_status_key` 要闭环。
- 字段残值和缺值：涉及默认带值、保存映射、来源切换、清空来源、列表、详情、打印、导出、搜索时，检查旧值残留和真源缺失回补。
- 前端事实边界：前端不能本地补造后端事实、长期承担业务一致性，或把 workflow payload 当事实真源。
- 删除 / 回收站：业务对象没有后端 usecase、RBAC、审计和引用检查时，不应出现通用删除/回收站主路径。
- 页面设计：业务页面不要露裸数据库 ID；按钮、字段、筛选、状态、空态和快捷入口必须有真实业务意义和可验证结果。
- 用户可见字段：业务前端不要展示 `idempotency_key`、幂等键、内部主键、内部引用、trace / request / raw ID 等工程实现字段；需要防重、追溯或关联时，由系统隐藏携带并展示可读业务编号、来源单据、状态或“已关联”反馈。
- 客户差异：`yoyoosun` 可以是种子客户样本，不能硬编码进通用产品核心 usecase。
- 部署与 migration：schema 变更必须走 Ent + Atlas；发布不能假设低配服务器可构建。
- 错误码：新增/修改错误码必须保持服务端真源、前端生成码表、消费层和测试同步。
- 文档漂移：代码能力层级、菜单、API、部署、产品状态、真源变了，要检查相关 README、当前真源、产品/架构文档和 `progress.md`。

## 项目审查门禁 Project Review Gates

- 复用优先：新增 helper、组件、schema、migration、API、RBAC 权限、Workflow 规则、客户配置、QA 脚本或部署步骤时，检查现有能力是否可以承接；如果新增复杂度没有清晰收益，应作为风险指出。
- 主路径优先：警惕为通过当前页面或当前测试而加入局部 fallback、重复派生、页面私有真源、宽松校验、隐藏兼容分支或后处理补丁。
- 范围克制：实现如果把一个可验证切片扩张成 schema、RBAC、runtime、docs、deployment 多层大改，要检查是否越界、是否能拆小、是否缺少中间验收。
- 可回归：功能、页面、文档或部署变化必须能说明验证层级；“测试通过”不能替代业务真源、权限、旧数据、浏览器状态、migration 和文档同步检查。
- 视觉证据：涉及页面、打印/PDF、布局、焦点、选择、拖拽、插入/删除、hover、disabled、移动端或暗色态时，review 要检查是否有真实浏览器截图调试、DOM / box metrics、目标行/单元格/焦点断言和对应 L1 / Playwright 回归。
- 截图证据充足性：review 不要求截图数量越多越好，但要能证明 exact changed / problem state、修复后状态、至少一个相关边界状态，以及目标行/单元格/按钮/焦点、overflow / clipping / adjacent layout 没有错。
- 噪点判断：抗锯齿、字体渲染、截图压缩或 1px 内 subpixel 差异通常是 rendering noise；真实遮挡、溢出、误高亮、错误焦点、PDF 缺字或业务误导是 product defect，不能用“截图噪点”带过。
- 可读可维护：代码和文档应简洁直接，命名和结构符合项目现有风格；明显难懂、重复、硬编码客户特例或让后续 AI 容易误判的实现，即使短期可运行，也应列为质量风险。

质量问题不等于一律阻断。若改动很小、属于 docs/skill-only 或低风险局部修正，review 应按影响面控制验证深度；但必须明确为什么当前复杂度和验证范围是恰当的。

## 验证建议 Validation

- 先看已有测试是否覆盖改动的 happy path、非法状态、权限、幂等、事务失败、旧数据或页面状态。
- 前端样式/布局默认至少要求目标页面浏览器级回归；共享组件或全局样式按影响面升级。
- 文档/skill-only 改动至少运行 `git diff --check` 和对应 skill validator。
- 不要为 docs-only 或 skill-only 改动机械运行迁移、全量 UI 回归或重型服务端测试，除非 touched path 需要。

## 输出要求 Output

按 code review 姿态输出：

1. Findings first，按严重度排序，带文件行号、影响和建议。
2. 无问题时明确写“未发现阻塞问题”。
3. 写清审查范围、已读真源、已跑或未跑的验证。
4. 单列剩余盲区，尤其是未覆盖的测试、浏览器状态、migration、部署或文档同步。
5. 默认不附长篇改动总结，除非用户要求。
