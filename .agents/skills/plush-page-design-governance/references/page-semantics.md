# Page Semantics / 页面语义与交互设计

页面任务、字段、动作、状态、信息层级或交互设计变化时读取。仓库内引用相对当前任务仓库根解析。

<a id="design-sync"></a>

## 设计与实现同步 / Design Sync

按页面、动作或共享组件名定位 `docs/product/ui-design/交互设计说明.md` 的相关章节；需要核对外观或操作演示时，再读取 `docs/product/ui-design/index.html` 的对应片段。入口不清才读该目录 README；小改动不默认全量读取或重写 HTML。

统一视觉语言、控件语义和同类操作，保留不同岗位与业务任务所需的布局。风格改动优先使用共享主题、组件和样式。工作台直接读取同一份设计文件，控件规范复用真实共享组件；组件变化仍需核对独立 HTML 中受影响的表达。

已有产品的原型先核对受影响范围的当前界面、正式设计与实际行为，辨明有效设计、问题和本次改进，展示整合后的岗位体验；局部未展示但沿用的能力按需注明。实施时对照实质差异，复用共享组件和既有业务主路径，合并重复入口，并验证改进效果及相关保留能力。

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

<a id="task-focus-and-cross-device-parity"></a>

## 任务聚焦与两端一致 / Task Focus and Cross-Device Parity

涉及 ERP 页面信息层级或两端体验时，落实项目 AGENTS 的简洁实用与一致性要求；任务详情、流程跟踪和异常追踪按以下步骤核对。这是设计与验收方法，不代表当前实现已经达标。任务三步的内容归属及底栏布局按[三步职责与操作栏](../../../../docs/product/ui-design/交互设计说明.md#task-step-responsibilities)核对，覆盖只读、终态及未打开编辑器，不能以局部截图或按钮可点代替职责边界验证。

1. 明确当前查看对象和主要动作。任务详情优先回答“发生了什么、处于哪个环节、轮到谁、现在做什么”，展示必要的单据/批次、原因、状态、实际办理人和操作。主要动作、阻塞原因和必要限制直接可见；清晰的岗位文案与相关入口应让使用者快速找到任务和办理人。
2. 控制链路范围。默认展示本任务或本次异常的真实处理进度，突出当前节点及下一步条件；核对真实关联，不能把同订单的并列任务拼成前后依赖。完整订单链提供直接查看入口，总览保留主链骨架、当前位置和异常标记；长历史和大量节点明细按需展开。避免把整单所有任务堆入单项详情，或用层层折叠迫使使用者寻找当前任务。无法识别所属环节时明确缺口，不编造阶段或完成状态。
3. 核对两端入口与内容。以同一账号、权限、业务对象及筛选条件比较下表；任务详情、流程跟踪、业务页关联入口应能到达同一对象的对应追踪内容。复用已有查询、状态和权限真源，不能因只接入某个组件就认定所有入口已一致。

| 核对项 | 一致性标准 | 设备适配 |
| --- | --- | --- |
| 查找与上下文 | 关键筛选含义、业务对象、所属环节、办理人和匹配结果一致 | 电脑可展开常用条件，手机可用紧凑筛选；已选条件可见、可清除 |
| 主链与异常 | 当前环节、异常原因、关联关系、处理状态及已记录结果一致，相关入口可发现 | 电脑可横向或分栏，手机可纵向；不能以屏幕小为由省略核心追踪 |
| 业务动作 | 同权限和状态下，可办理动作、校验、提交结果及任务/业务事实边界一致 | 电脑可用抽屉，手机可用整页；主动作易发现、便于触达 |
| 反馈与恢复 | 加载、失败、无数据、无权限明确区分；返回后保留必要筛选和对象定位 | 文案适应空间；不以空白、静默隐藏或要求换端代替缺失能力 |

4. 用真实浏览器验证受影响的桌面与手机入口：查看同一任务/异常、定位当前环节、进入相同业务动作、返回并核对结果；按影响补充权限、失败、空数据和长链场景。只读评估明确尚未实测项；实施验收不能用电脑端通过、共享组件存在或原型可点击代替手机实测。业务行为或设计取舍变化时，沿用上方 Design Sync 同步效能工作台所用设计源与说明。

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

<a id="density-and-subtraction"></a>

## 信息密度与减法 / Density and Subtraction

流程与异常页面先按[可视化表达规范](../../../../docs/engineering/可视化表达规范.md)核对图、分支和导航：选择后直接见图，只解释选中节点；不以长文或步骤列表替换关系。验收须点通真实分支、拒绝、回接与终止，并确认一般受阻说明不会自动变成异常入口。

先降低岗位理解、定位和办理成本，再考虑新增内容；字数、卡片高度和折叠数量不是完成指标。没有明确收益时保留好用的布局、顺序和交互。优先用分组、对齐、间距和视觉层级表达内容关系；布局与现有文案已清楚表达的信息，不再追加重复的辅助标签或说明。新增说明、标签、卡片、入口或确认步骤前，说明它提供了什么已有内容无法提供的判断、动作或反馈，优先复用、替换或合并。

| 信息性质 | 处理方式 |
| --- | --- |
| 标题、标签、正文、操作说明、占位提示和按钮重复表达同一意思 | 保留最直接的一处，删除重复教程；不能仅因文字相近就合并不同业务含义 |
| 同一对象的零散身份、状态或时间 | 合并展示，保留实际办理人、责任岗位、状态与截止风险的区别 |
| 低频背景、仅作背景的完整分类路径、补充帮助和版本等次要审计信息 | 放到清晰、可发现的按需入口；不删除分类或历史，不用层层折叠增加寻找成本 |
| 当前判断与操作所需的产品身份、来源类型及单号、责任、期限、阻塞原因、处理意见和可信结果 | 直接可见；单位、金额口径、必填、冻结条件及明细变化后的重新确认不能作为普通赘述隐藏 |
| 失败、无权限、结果不确定、未保存离开或取消/冲销/撤回后果 | 在相关状态或操作发生时明确显示，保留校验、确认和恢复入口 |
| 已经好用的三步导引、信息卡骨架、复制、历史排序/展开、步骤详情和按需计算依据 | 优先保留；只有证明能缩短理解或办理路径时才改变 |

分别核对默认、打开弹窗、展开帮助和错误状态，用相同内容、视口与状态比较；不能把互斥状态的说明相加，当成默认页面同时显示的问题。已经按需提供的进度、用料计算或采购依据不重复搬到默认画面。

同一任务的说明与追踪先检查原位展开、相邻详情和复用现有图形组件，避免“查看”隐式切换页面或 Tab。独立业务办理使用清楚命名的正式入口，避免嵌套弹层；关闭或返回后实测筛选、选中对象、滚动与焦点恢复。共享入口同时核对调用页面、多个关联流程、空结果、失败重试、权限变化和窄屏，不能把单条模拟数据当成所有来源都适用。

减法不删除搜索、筛选、追踪或必要阶段，不靠缩小字号、压缩触区、截断关键内容或隐藏异常换取整齐；手机主要触控区至少 44px。类别和模拟性质只认正式字段或标记，不按名称猜测，也不把办理人当作冗余说明。保留岗位需要的少量清晰分组、紧凑筛选、可扫读表格、明显主动作和当前记录操作，不为统一形式增加卡片或折叠状态。

醒目 `Alert` 和警告图标用于需要停下、修正、重试、确认风险或解决权限的状态。常规教程、成功计算、读取提示、DEV/QA/模拟标记和证据边界使用短行说明、字段帮助或按需入口；每个页面或弹窗区块默认至多保留一条被动说明，不以此限额隐藏必要条件或错误。

交付时按本次影响简述删了什么、合并了什么、移到哪里、保留了什么及原因；在真实页面或原型检查默认阅读、信息找回、操作和返回恢复。原型可用不替代两端实现验证，必要时明确未实测范围。

<a id="page-growth"></a>

## 功能与数据增长 / Page Growth

涉及动作、筛选、页签、关联项或列表数据增长时，区分功能可扩展性与数据规模；用当前岗位、真实状态和有依据的增长场景判断，未知规模注明假设。普通文案或间距调整沿用已有边界，不另起容量评估。

| 触达面 | 设计与验证重点 |
| --- | --- |
| 动作与导航增多 | 复用共享动作目录、业务分类与优先级，保持主要动作可发现、组内顺序稳定；按实际文字和可用宽度收纳，菜单保留分类且空组隐藏。覆盖未选、选中、清空、权限、窄屏及菜单或弹窗打开时的布局稳定；不按固定按钮数切换整套布局 |
| 数据与关联项增多 | 核对服务端分页、搜索、汇总与返回范围，避免全量载入或把当前页当作全部结果；长列表、长链和大量选项按实际读取成本与浏览器表现选择分批、按需加载或虚拟化，保留定位、完整结果与恢复能力 |

仅为本次受影响的增长场景补充验证；查询、统计、导出或批处理成本需要改变后端合同时，按领域 Skill 的[数据规模与并发](../../plush-domain-boundary-governance/SKILL.md#data-scale-and-concurrency)继续同一授权目标。交付说明采用的增长假设、现有方案的适用边界及需要升级的触发条件，示意数据不作为容量证明。

## Preserve project boundaries.
   - Do not change schema, migration, RBAC permissions, menu truth, route truth, WorkflowUsecase, or Fact usecases as a side effect of visual cleanup.
   - Do not hardcode the current customer into product-core UI.
   - Do not turn prototype static numbers, fake records, or dev-only samples into runtime facts.
   - Do not make workflow task done mean inventory, shipment, finance, invoice, receivable, or payment fact posted.
   - For official menu changes, verify the menu/product contract and current authorization. Continue the authorized scope; pause only a material scope expansion that needs a user decision.
