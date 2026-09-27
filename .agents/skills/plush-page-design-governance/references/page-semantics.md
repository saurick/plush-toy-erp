# Page Semantics / 页面语义与交互设计

页面任务、字段、动作、状态、信息层级或交互设计变化时读取。仓库内引用相对当前任务仓库根解析。

<a id="design-sync"></a>

## 设计与实现同步 / Design Sync

按页面、动作或共享组件名定位 `docs/product/ui-design/交互设计说明.md` 的相关章节；需要核对外观或操作演示时，再读取 `docs/product/ui-design/index.html` 的对应片段。入口不清才读该目录 README；小改动不默认全量读取或重写 HTML。

统一视觉语言、控件语义和同类操作，保留不同岗位与业务任务所需的布局。风格改动优先使用共享主题、组件和样式。工作台直接读取同一份设计文件，控件规范复用真实共享组件；组件变化仍需核对独立 HTML 中受影响的表达。

以下同步用于已授权的实现改动；仅评估或设计提案不自动扩大为系统修改。

| 改动 | 同步范围 |
| --- | --- |
| 改变统一颜色、字体、密度或控件外观 | 修改共享实现，同轮更新 HTML 中受影响的外观及说明；核对业务页和工作台受影响的展示。 |
| 改变页面结构、主要入口、保存、返回、筛选或恢复行为 | 同轮更新相关 HTML 演示和说明；专有页面或字段变化只同步其实际影响的表达。 |
| 修复实现使其符合现有设计，或内部重构、性能修复未改变可见行为 | 核对设计仍准确即可，无须机械修改设计文件；验证受影响的实现。 |
| 改变设计取舍或原因 | 更新 `docs/product/ui-design/设计依据.md` 对应段落；仅变更实现时无须改写依据。 |

- 每轮只修改受影响的内容。设计稿表达通用页面与关键路径，不逐页复制全部字段和业务状态机；保留单份 HTML，历史由 Git 追溯，不恢复图片方案、版本目录或原型晋级状态。
- 实施设计意图前核对 API、RBAC、路由及 Workflow / Fact 合同；虚构样例与模拟动作留在 dev-only 设计查看器，不进入业务真源。
- 统一评审使用同一份代码与设计快照，按影响提供相关规则、设计片段、代码差异及必要浏览器证据。只读设计时结论限于设计；实现、目标运行、发布与验收分别核对，设计稿不替代运行证据。

## Define the page's single primary job.
   - State who uses the page and what they should finish there.
   - Every visible module must answer at least one useful question: why the user needs it, what decision or action it supports, and what changes after the user acts.
   - Classify each visible element as decision information, action entry, operational feedback/status, navigation/context, or auxiliary explanation.

## Evaluate feature and detail semantics before visual simplification.
   - For each feature, button, field, filter, status, tab, card, table column, empty state, error state, and shortcut, state which role uses it and which business action, decision, or feedback it supports.
   - Verify that the user action has a real outcome: data changes, task state changes, navigation changes, validation feedback, exported output, or a clear next step. If nothing meaningful changes, delete, rename, merge, or downgrade the control.
   - Check whether the feature already exists elsewhere. Keep duplicates only when role, context, frequency, or selected-record workflow justifies the second entry.
   - Check whether the visible UI implies a backend/API/RBAC/menu/Workflow/Fact capability that is not actually complete. If so, fix the wording or scope instead of letting the UI pretend the capability exists.
   - Cover functional edge states before styling: no data, long text, many tags, large numbers, no permission, disabled user, loading, failed request, validation error, already done, posted/settled, cancelled/reversed, and stale selected records where relevant.
   - Treat page navigation and tab switching as request-lifecycle events. When a current page issues list/dictionary/reference reads that can overlap with a later route, menu, tab, filter, or refresh action, the older request must be cancelled or guarded by a latest-request check; aborted or stale requests must not show user-facing network errors, overwrite current state, or re-enable loading indicators incorrectly.
   - Re-clicking the already active desktop menu entry is not a refresh gesture. It may close mobile navigation, but it must not re-request page data; use the page-level refresh button for explicit reloads.
   - Prefer selecting or deriving business fields from existing truth sources over manually inventing page-local values. Do not let frontend display logic become a hidden business fact source.
   - Do not expose engineering fields to business users. Fields such as `idempotency_key`, 幂等键, 内部主键, 内部引用, trace / request IDs, raw database IDs, source IDs, or source line IDs must not be visible form labels, table columns, filter placeholders, modal fields, or export headers. Keep them hidden in form state or backend contracts when needed, and show readable business references such as 单号、来源单据、来源行、状态、余额、已关联 or 不可生成原因.
   - Business object controls are allowed only when they read as business controls: labels, option text, selected summaries, empty states, and validation messages must use names, codes, order numbers, line numbers, status, quantity, or "已关联" feedback. Do not show raw `#123` fallbacks, `id` / `*_id` fields, source ID inputs, source line ID inputs, or "选择器" copy that asks non-technical users to understand implementation mechanics.
   - For business fields, identify the source-of-truth field before changing labels, mappings, defaults, imports, table columns, details, printing, export, or search. Check both stale values and missing values across create defaults, edit overwrite, source switch, source clear/delete, list/detail/print/export/search display, and historical-data fallback.
   - If the page repeats the same field mapping in form defaults, save transforms, table mapping, print/export mapping, or import logic, prefer a shared mapper/helper over adding another local conditional.

## Reduce density by meaning, not by hiding truth.
   - Delete, merge, rename, or downgrade elements that are decorative, duplicated, vanity-only, or do not change a user's judgment or next action.
   - Reserve prominent `Alert` cards and warning icons for states that require the user to stop, correct, retry, confirm risk, or resolve missing permission. Routine guidance, successful calculations, loading copy, DEV / QA / simulation labels, and evidence-boundary explanations must not become persistent employee-facing alerts; use one short inline note, field help, or an on-demand disclosure instead, and keep at most one passive note visible by default in a page or modal section.
   - Prefer fewer stronger sections over many small cards.
   - Avoid duplicate shortcuts to the same action unless the duplicate is role-specific and measurably shortens the main task.
   - Keep ERP pages work-focused: compact filters, readable tables, clear primary actions, restrained status summaries, and obvious selected-row actions.
   - Use helpful labels and microcopy only where they reduce ambiguity; do not add explanatory text that restates visible UI.

## Preserve project boundaries.
   - Do not change schema, migration, RBAC permissions, menu truth, route truth, WorkflowUsecase, or Fact usecases as a side effect of visual cleanup.
   - Do not hardcode the current customer into product-core UI.
   - Do not turn prototype static numbers, fake records, or dev-only samples into runtime facts.
   - Do not make workflow task done mean inventory, shipment, finance, invoice, receivable, or payment fact posted.
   - For official menu changes, verify the menu/product contract and current authorization. Continue the authorized scope; pause only a material scope expansion that needs a user decision.
