# Page Implementation / 页面实现与浏览器验证

布局、主题、表单、键盘行为或运行交互变化时读取。代码块以当前任务仓库根为工作目录；仅选择受影响场景。

DEV 工作台沿用 `docs/product/自动化测试策略.md` 的浅色桌面 smoke：核对受影响页面的渲染、关键交互和页面级横向溢出；不增加暗色、移动端、通用键盘流程或每次成功截图门禁。业务岗位移动端的既有合同保持有效。

<a id="workbench-patterns"></a>

## 工作台页面组合 / Workbench Patterns

1. 写出本页的使用任务、判断和下一步，按[统一页面样板](../../../../docs/product/ui-design/交互设计说明.md#workbench-patterns)选择目录与检索、执行与诊断、结果与核验或阅读与关系。实际打开 `/__dev/ui-design?page=workbench` 的对应样板，再核对受影响真实页面；既有有效能力保留。
2. 查看 `web/src/dev-workbench/components/WorkbenchPattern.jsx`、`DevWorkbenchStandards.jsx` 和该类型已有消费者，复用组合并连接当前页面数据及动作。共享组合缺能力时连同样板扩展；领域逻辑留在原页。不创建平行主题、第二套状态判定或以继续叠 CSS 代替父子布局修复。
3. 核对默认范围、结果 / 阻断、下一步是否容易找到，删除重复说明和空壳，再处理间距。详细尺度与状态规则只在正式设计维护，不复制到 Skill。
4. 按改动运行样板或真实消费者的相关浏览器场景；共享组合变化两者都验证，新消费者同步 `scripts/qa/affected.mjs` 的定向映射。完成实际任务路径，并按正式设计核对延迟、刷新失败保留、范围切换、历史恢复、长文本与桌面收缩。涉及独立模式时执行[制品浏览器验收](../../../../server/deploy/workbench/README.md#artifact-browser-acceptance)，不能只测 Vite 或服务端桩页面。静态通过和几何数字只作辅助；交付说明实际迁移范围，不能将样板存在写成所有页面已治理。

## Implement with the existing design system.
   - Reuse current page shells, shared business-page components, theme tokens, CSS variables, and existing interaction patterns before adding new abstractions.
   - Keep the themes actually supported by the changed page readable. Printing/PDF previews remain fixed light unless a separate design explicitly changes screen preview behavior.
   - 新增或调整页面、表格及自定义组件时，按[全局外观合同](../../../../docs/engineering/前端实现与交互约定.md#主题模式--theme-mode)核对本次涉及的主题、密度、表格线条等偏好在组件及实际调用页面生效；专用版式的例外沿用正式合同，并按影响验证切换、恢复和响应式行为。
   - 菜单主列表的新增 / 编辑（含客户、供应商、材料、产品、产品规格、加工环节、BOM、业务单据、事实草稿与员工资料）使用 `BusinessFormPage` 在模块主内容区整页编辑，底部固定返回列表和保存；新建、编辑与已支持的只读查看复用同一骨架。返回保留列表筛选、选择与滚动位置，未保存内容离开前提示；保存中阻止离开和重复提交。Drawer 继续用于任务、导航和上下文侧栏。
   - 编辑中的快捷新建、局部确认、来源选择、附件预览与审批、核销、冲销等专项动作继续使用适当宽度的 Modal；展示容器由入口任务决定，不按是否带 items 决定。不新增后端未支持的新建 / 编辑动作。完整单据明细留在同一编辑页，横向滚动收口到明细容器。BOM 共用一块表头，同物料和单位合并身份栏，部位支持行内添加、复制与粘贴。
   - Preserve accessibility and keyboard behavior for interactive surfaces: opening focus, logical Tab order, Escape/close behavior, disabled/loading states, aria labels for icon-only controls, focus return after modal close, and keyboard access for draggable/resizable or overflow controls.
   - Prefer scoped component styles. Do not add `!important` unless the source cannot be controlled and the reason is documented in the final response.
   - Use real controls for real actions: buttons for commands, tabs for views, menus for option sets, checkboxes/toggles for binary settings, and tables for scan/compare workflows.
   - Tab / button recognizability is part of the shared component contract, not just motion. Read `docs/engineering/研发效能工作台与CI-CD设计.md#interaction-controls` and use the live workbench sample at `/__dev/ui-design?page=controls`; result filters use `FilterChip`. Page CSS owns geometry while `control-affordance.css` owns appearance. Verify visible boundaries, selected markers and focus in the actual page rather than accepting animation alone.
   - Mobile list filtering follows the same interaction-controls contract. Keep high-frequency chips visible; when there are only 2–4 shallow filter groups, use a viewport-bounded popover anchored below the filter trigger and apply selections immediately. Center filter headings, segmented option labels, and the reset action on one alignment system. Scope search and filters to their peer tab: switching restores that tab's own values, the popover reset restores only the current tab's direct-select filters, and the search clear action handles that tab's keyword. Neither action changes a peer tab. Reserve full-screen layers or bottom drawers for deep or numerous options. Do not copy paired desktop date inputs into mobile list filters; prefer fixed time presets, and add a dedicated mobile calendar flow only when exact dates are a proven frequent need.
   - Keep one free-text search per mobile list. Put order numbers, customers, products, responsible people, and other searchable identities into that primary search contract; the filter popover contains direct-select conditions and must not ask the user to search again.
   - A mobile list that presents one continuous result stream keeps server-side batching but appends the next batch as the user nears the bottom. Do not expose previous/next buttons or page numbers. Preserve loaded rows on append failure and retry at the list tail. Grouped or intentionally collapsed sections may still use an explicit show-more control.
   - Tab motion is a shared interaction contract. Use `SlidingTabs` for Ant-style tab navigation, `SlidingSegmented` for compact mutually exclusive views, and `SlidingTabList` for custom tab markup. Keep the tab strip and indicator mounted at a stable DOM position while the active view changes; render the controlled content below it, do not place the switch inside mutually exclusive content branches, and do not change its React `key` per view. Table/visualization switches use `BusinessViewSurface` when that existing shell fits. Do not add local duration/easing or disable indicator animation; `tabs-motion.css` owns motion and `prefers-reduced-motion` is the only global opt-out.

## Visual Finish

简洁是减少不必要的信息和操作，仍需完成对齐、文字层级、留白节奏、状态区分与主题适配。不要用增加装饰或套更多卡片代替这些检查。

日期、标签和紧凑选择器含可选数量或说明时，主标签与选中标记的对齐须在空值、单项和多项下保持稳定；辅助内容不能靠空白占位把主标签挤偏。居中标题以整栏为基准，不能被两侧不等宽的操作推偏。

已确认的视觉缺陷应补到现有浏览器回归中：根据该组件的设计，测量主标签与选中标记中心、标题与整栏中心、重复列的对齐及溢出；居中允许约 1 CSS px 的舍入差异。截图同时核对整体层次与密度，不能只证明按钮能点击或 CSS 写了 `center`。测试范围仍按实际触达的状态、主题与设备选择。

## Validate as regression, not just screenshot review.
   - Cover default, interaction, recovery, and adjacent-area states.
   - For visible layout or interaction changes, verify the exact changed state and relevant boundaries in the real browser. Use named screenshots or Playwright artifacts for visual review or failure diagnosis; fix and recheck affected states when they expose a product defect.
   - Select visual evidence by state and risk rather than screenshot count. Cover default, changed interaction, recovery, relevant boundary and affected adjacent geometry; add print/PDF, mobile/dark or editor states only when touched. Reuse unchanged evidence for the same candidate.
   - Check DOM/box metrics for layout-sensitive changes: bounding boxes, overflow, scrollWidth/clientWidth, offsetHeight/clientHeight/scrollHeight, wrapping, and neighboring overlap.
   - Include long text, many tags, and wide numbers when the changed area can receive variable data. Add mobile or dark cases only when the page supports them and the change affects them.
   - Treat anti-aliasing, subpixel, font-rendering, or screenshot compression differences as rendering noise unless readability, geometry, interaction, or print output changes. Treat overlap, clipping, wrong focus, wrong row/cell selection, stale artifacts, missing text, or misleading business UI as product defects.
   - For field chain changes, validate relevant stale/missing value paths: new value replaces old value, source switching clears or replaces old values, missing truth is not fabricated, snapshot gaps fall back only by documented rules, and historical records do not display incorrect values.
   - For interactive controls, validate focus, keyboard, disabled/loading, and accessible-name behavior in the changed surface.
   - For changed tabs or view switches, verify at least one real intermediate indicator position, stable tab-strip box metrics before/after switching, the final active state, and zero-duration behavior under reduced motion. A computed transition declaration alone is not evidence because a remounted indicator can still jump directly to its destination.
   - 页签、分段和筛选切换的稳定性须在实际调用页面逐帧核对：同一视口下，导航、搜索和相邻操作的节点、位置及尺寸保持稳定（允许 1 CSS px 舍入差异），选中状态不得回跳。覆盖全部到少量结果、空结果、清除及往返切换；检查条件出现的数量 / 重置按钮、选中字重、滚动条和父容器换行是否推动布局。稳定占位或现有组件能解决时不增加延迟、局部动效参数或整页最小高度。结果内容可自然增减，目录列宽不随筛选结果数量重新分配。反复出现的抖动补到对应页面浏览器回归，组件动效测试和切换后截图不能替代此项。
   - For navigation-sensitive pages, validate fast route/menu/tab switching. Confirm that stale requests are cancelled or ignored, no stale request produces a toast on the next page, and repeated clicks on the active menu entry do not trigger duplicate reads.
   - If prototype assets, prototype registry, or prototype tests changed, run the relevant prototype inventory and frontend regression checks named by the repo.
   - Use `$plush-test-governance` and the affected plan to choose the checks below; they are entry points, not a mandatory full run:
     ```bash
     (cd web && pnpm lint && pnpm css && pnpm test)
     (cd web && STYLE_L1_SCENARIOS=... pnpm style:l1)
     ```
   - 小范围页面改动从当前场景 registry 选择 `STYLE_L1_SCENARIOS`，说明覆盖与盲区。当前目标必要的验证沿用实施授权；全量 Style L1 或更广验收按 `$plush-test-governance` 的目标、风险与资源预算判断，显著超出任务范围或预算时才说明新增范围、开销与停止条件并确认。
