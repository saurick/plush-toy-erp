# Page Semantics / 页面语义与原型

页面任务、字段、动作、状态、信息层级或原型关系变化时读取。仓库内引用相对当前任务仓库根解析。

## Sync prototype design conditionally.
   - If the page has a matching asset under `docs/product/prototypes/**`, read `docs/product/prototypes/README.md` and the prototype README before changing runtime UI. Confirm whether the prototype is Draft, To Implement, or Current.
   - If no matching prototype exists, do not create one just to satisfy process. Create or update a prototype only when the user explicitly asks for prototype/design work, the task is a new reusable UI pattern, or missing prototype context would make implementation ambiguous.
   - Absorb prototype intent, structure, interaction, information hierarchy, and meaningful business semantics. Do not copy static numbers, fake customers, mock tasks, dev-only shells, or visual-only decoration into runtime.
   - If runtime implementation changes a prototype's promised structure, interaction, business meaning, absorbed scope, index entry, or status wording, update the prototype README, prototype index, registry, and related tests in the same round.
   - If the change is a small style, copy, or feature-detail correction and the existing prototype remains accurate, leave prototype files untouched; explain only when this affects the user’s conclusion.
   - Do not promote To Implement assets to Current without explicit user confirmation, even if code and tests pass.

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
