---
name: plush-page-design-governance
description: 项目页面设计治理（plush-toy-erp）。Use when Codex designs, reviews, simplifies, or implements plush ERP pages, dashboards, workbenches, task boards, mobile role task pages, print center pages, lists, forms, detail pages, action modals, collaboration entries, page features, feature details, buttons, fields, filters, states, empty/error states, stale/missing field values, accessibility, keyboard/focus behavior, prototypes, prototype sync, Draft/To Implement/Current prototype states, or when the user mentions 简洁易用, 心智负担, 信息密度高, 一眼看不懂, 页面好看, 低密度, 严格按原型, 没意义的东西不要做, 功能评估, 功能细节, 按钮字段筛选状态, 字段残值, 字段缺值, 可访问性, 键盘焦点, 原型同步, 有原型, 无原型, or asks whether such page-design guidance should be made into a skill.
---

# Plush Page Design Governance

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文，`Workflow / Fact / RBAC / API / migration / runtime` 等术语按需保留，方便触发、检索和跨工具引用。

Use this skill to turn "简洁易用、美观、低心智负担" into concrete implementation checks for plush-toy-erp pages. Do not treat it as a generic visual taste guide. Its purpose is to protect page meaning, feature semantics, information hierarchy, ERP task focus, Workflow / Fact boundaries, RBAC/menu truth, and regression quality.

边界说明：本 skill 只负责页面可见能力、功能语义、信息层级、交互和页面回归治理；涉及 API / RBAC / schema / migration / Workflow / Fact 时，只做真实性核对和升级判断，不直接把后端实现纳入页面治理范围。若页面改动需要新增或修改后端能力，应切换到 `plush-domain-boundary-governance`，并按对应 test / security / release skill 补足验证。

## 页面质量门禁 Page Quality Gate

页面治理不能只追求“好看”或“少一点”。要把每个可见模块、字段、按钮、状态和文案压回真实业务意义：

### 结构质量检查 Structure Quality Checks

- 边界清晰、合理严谨：说明本轮管什么、不管什么、依赖哪个真源，以及为什么当前拆分、抽象和验证足够但不过度。
- 模块化：页面按主任务、数据/动作 hook、表格、表单、详情、状态和反馈拆分；只有能降低理解、复用或回归成本时才拆。
- 高内聚：同一字段展示、状态解释、操作入口、错误提示和布局规则尽量收口到共享组件/helper，不让相邻页面各写一套。
- 低耦合：页面只提交用户意图并展示后端事实，不把 RBAC、业务事实、部署或客户配置硬编码进局部 UI。
- 单一职责：一个组件不要同时承担布局、数据请求、权限裁决、业务派生、保存副作用和兜底；必要时先抽 hook/helper。

- 功能先于视觉：每个元素都要说明支持哪个角色、哪个判断、哪个动作或哪个反馈；无决策价值、重复入口、假快捷方式和装饰性卡片应删除、合并或降级。
- 真源先于局部修补：页面不能补造后端事实、隐藏 Workflow / Fact 缺口、显示裸技术字段，或用页面私有字段映射替代共享 helper / API / RBAC 合同。
- 低密度但不失真：减少信息密度必须通过信息分组、任务优先级、可读标签和可验证交互完成，不能靠隐藏必要状态、吞掉错误或弱化关键约束。
- 可回归：样式、布局、交互和原型同步必须覆盖默认态、交互态、恢复态、长文本/大数字/多标签、暗色/移动端和相邻区域；共享组件按影响面升级验证。

## Workflow

1. Establish the page state and truth source.
   - Determine whether the work is Draft, To Implement, or Current.
   - Read the relevant current truth before editing: project `AGENTS.md`, `docs/当前真源与交接顺序.md`, `web/README.md`, and `docs/product/prototypes/README.md` when prototypes are involved.
   - Inspect the real runtime page and existing components when the task touches layout, density, spacing, styles, interactions, or visible page structure.

2. Sync prototype design conditionally.
   - If the page has a matching asset under `docs/product/prototypes/**`, read `docs/product/prototypes/README.md` and the prototype README before changing runtime UI. Confirm whether the prototype is Draft, To Implement, or Current.
   - If no matching prototype exists, do not create one just to satisfy process. Create or update a prototype only when the user explicitly asks for prototype/design work, the task is a new reusable UI pattern, or missing prototype context would make implementation ambiguous.
   - Absorb prototype intent, structure, interaction, information hierarchy, and meaningful business semantics. Do not copy static numbers, fake customers, mock tasks, dev-only shells, or visual-only decoration into runtime.
   - If runtime implementation changes a prototype's promised structure, interaction, business meaning, absorbed scope, index entry, or status wording, update the prototype README, prototype index, registry, and related tests in the same round.
   - If the change is a small style, copy, or feature-detail correction and the existing prototype remains accurate, leave prototype files untouched and say why in the final response.
   - Do not promote To Implement assets to Current without explicit user confirmation, even if code and tests pass.

3. Define the page's single primary job.
   - State who uses the page and what they should finish there.
   - Every visible module must answer at least one useful question: why the user needs it, what decision or action it supports, and what changes after the user acts.
   - Classify each visible element as decision information, action entry, operational feedback/status, navigation/context, or auxiliary explanation.

4. Evaluate feature and detail semantics before visual simplification.
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

5. Reduce density by meaning, not by hiding truth.
   - Delete, merge, rename, or downgrade elements that are decorative, duplicated, vanity-only, or do not change a user's judgment or next action.
   - Prefer fewer stronger sections over many small cards.
   - Avoid duplicate shortcuts to the same action unless the duplicate is role-specific and measurably shortens the main task.
   - Keep ERP pages work-focused: compact filters, readable tables, clear primary actions, restrained status summaries, and obvious selected-row actions.
   - Use helpful labels and microcopy only where they reduce ambiguity; do not add explanatory text that restates visible UI.

6. Preserve project boundaries.
   - Do not change schema, migration, RBAC permissions, menu truth, route truth, WorkflowUsecase, or Fact usecases as a side effect of visual cleanup.
   - Do not hardcode the current customer into product-core UI.
   - Do not turn prototype static numbers, fake records, or dev-only samples into runtime facts.
   - Do not make workflow task done mean inventory, shipment, finance, invoice, receivable, or payment fact posted.
   - If a simplification requires hiding, renaming, combining, or reordering official menu entries, stop and treat it as a menu/product-boundary review.

7. Implement with the existing design system.
   - Reuse current page shells, shared business-page components, theme tokens, CSS variables, and existing interaction patterns before adding new abstractions.
   - Keep light and dark themes readable. Printing/PDF previews remain fixed light unless a separate design explicitly changes screen preview behavior.
   - For desktop ERP business objects, use Modal as the unified create/edit/view surface. Do not introduce Drawer as the primary business-form interaction; keep Drawer for workflow task handling, navigation, or contextual side panels that do not save a complete business object.
   - Size modals by task complexity: confirmation/delete/simple prompts around 420-520px, master-data create/edit around 640-880px, and business documents such as purchase orders, sales orders, shipments, quality inspections, BOM, and outsourcing orders around `min(1720px, calc(100vw - 96px))` with a fixed footer action area. Keep complex line items inside the same business modal through sections, tables, horizontal scroll, or a second-level source picker; do not split business editing into drawers.
   - Preserve accessibility and keyboard behavior for interactive surfaces: opening focus, logical Tab order, Escape/close behavior, disabled/loading states, aria labels for icon-only controls, focus return after modal close, and keyboard access for draggable/resizable or overflow controls.
   - Prefer scoped component styles. Do not add `!important` unless the source cannot be controlled and the reason is documented in the final response.
   - Use real controls for real actions: buttons for commands, tabs for views, menus for option sets, checkboxes/toggles for binary settings, and tables for scan/compare workflows.

8. Validate as regression, not just screenshot review.
   - Cover default, interaction, recovery, and adjacent-area states.
   - Check DOM/box metrics for layout-sensitive changes: bounding boxes, overflow, scrollWidth/clientWidth, offsetHeight/clientHeight/scrollHeight, wrapping, and neighboring overlap.
   - Include long text, many tags, wide numbers, and mobile/dark cases when the changed area can receive variable data.
   - For field chain changes, validate relevant stale/missing value paths: new value replaces old value, source switching clears or replaces old values, missing truth is not fabricated, snapshot gaps fall back only by documented rules, and historical records do not display incorrect values.
   - For interactive controls, validate focus, keyboard, disabled/loading, and accessible-name behavior in the changed surface.
   - For navigation-sensitive pages, validate fast route/menu/tab switching. Confirm that stale requests are cancelled or ignored, no stale request produces a toast on the next page, and repeated clicks on the active menu entry do not trigger duplicate reads.
   - If prototype assets, prototype registry, or prototype tests changed, run the relevant prototype inventory and frontend regression checks named by the repo.
   - Run the repo-appropriate frontend checks. For style/page work in plush-toy-erp, default to:
     ```bash
     cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test
     cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1
     ```
   - For a narrow page change, targeted `STYLE_L1_SCENARIOS=... pnpm style:l1` is acceptable only when the final response clearly names the covered scenario and any remaining blind spots.

## Deliverable Standard

When answering, lead with a verdict if the user asks whether the design direction is reasonable. If implementing, report:

- What page meaning was kept, removed, merged, renamed, or downgraded.
- Which prototype assets were checked, updated, intentionally skipped, or not found.
- What feature or detail semantics were kept, removed, merged, renamed, downgraded, or left unimplemented.
- Which stale/missing field-value paths and accessibility/keyboard states were verified or intentionally left out.
- Which files changed.
- Which runtime/browser and automated checks passed.
- Which paths were intentionally not changed, especially RBAC, schema, menu truth, Workflow / Fact, customer-specific logic, and docs.
- Any remaining blind spots or follow-up tasks.
