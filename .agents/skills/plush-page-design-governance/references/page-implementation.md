# Page Implementation / 页面实现与浏览器验证

布局、主题、表单、键盘行为或运行交互变化时读取。代码块以当前任务仓库根为工作目录；仅选择受影响场景。

DEV 工作台沿用 `docs/product/自动化测试策略.md` 的浅色桌面 smoke：核对受影响页面的渲染、关键交互和页面级横向溢出；不增加暗色、移动端、通用键盘流程或每次成功截图门禁。业务岗位移动端的既有合同保持有效。

## Implement with the existing design system.
   - Reuse current page shells, shared business-page components, theme tokens, CSS variables, and existing interaction patterns before adding new abstractions.
   - Keep the themes actually supported by the changed page readable. Printing/PDF previews remain fixed light unless a separate design explicitly changes screen preview behavior.
   - 菜单主列表的新增 / 编辑（含客户、供应商、材料、产品、产品规格、加工环节、BOM、业务单据、事实草稿与员工资料）使用 `BusinessFormPage` 在模块主内容区整页编辑，底部固定返回列表和保存；新建、编辑与已支持的只读查看复用同一骨架。返回保留列表筛选、选择与滚动位置，未保存内容离开前提示；保存中阻止离开和重复提交。Drawer 继续用于任务、导航和上下文侧栏。
   - 编辑中的快捷新建、局部确认、来源选择、附件预览与审批、核销、冲销等专项动作继续使用适当宽度的 Modal；展示容器由入口任务决定，不按是否带 items 决定。不新增后端未支持的新建 / 编辑动作。完整单据明细留在同一编辑页，横向滚动收口到明细容器。BOM 共用一块表头，同物料和单位合并身份栏，部位支持行内添加、复制与粘贴。
   - Preserve accessibility and keyboard behavior for interactive surfaces: opening focus, logical Tab order, Escape/close behavior, disabled/loading states, aria labels for icon-only controls, focus return after modal close, and keyboard access for draggable/resizable or overflow controls.
   - Prefer scoped component styles. Do not add `!important` unless the source cannot be controlled and the reason is documented in the final response.
   - Use real controls for real actions: buttons for commands, tabs for views, menus for option sets, checkboxes/toggles for binary settings, and tables for scan/compare workflows.

## Validate as regression, not just screenshot review.
   - Cover default, interaction, recovery, and adjacent-area states.
   - For visible layout or interaction changes, verify the exact changed state and relevant boundaries in the real browser. Use named screenshots or Playwright artifacts for visual review or failure diagnosis; fix and recheck affected states when they expose a product defect.
   - Select visual evidence by state and risk rather than screenshot count. Cover default, changed interaction, recovery, relevant boundary and affected adjacent geometry; add print/PDF, mobile/dark or editor states only when touched. Reuse unchanged evidence for the same candidate.
   - Check DOM/box metrics for layout-sensitive changes: bounding boxes, overflow, scrollWidth/clientWidth, offsetHeight/clientHeight/scrollHeight, wrapping, and neighboring overlap.
   - Include long text, many tags, and wide numbers when the changed area can receive variable data. Add mobile or dark cases only when the page supports them and the change affects them.
   - Treat anti-aliasing, subpixel, font-rendering, or screenshot compression differences as rendering noise unless readability, geometry, interaction, or print output changes. Treat overlap, clipping, wrong focus, wrong row/cell selection, stale artifacts, missing text, or misleading business UI as product defects.
   - For field chain changes, validate relevant stale/missing value paths: new value replaces old value, source switching clears or replaces old values, missing truth is not fabricated, snapshot gaps fall back only by documented rules, and historical records do not display incorrect values.
   - For interactive controls, validate focus, keyboard, disabled/loading, and accessible-name behavior in the changed surface.
   - For navigation-sensitive pages, validate fast route/menu/tab switching. Confirm that stale requests are cancelled or ignored, no stale request produces a toast on the next page, and repeated clicks on the active menu entry do not trigger duplicate reads.
   - If prototype assets, prototype registry, or prototype tests changed, run the relevant prototype inventory and frontend regression checks named by the repo.
   - Use `$plush-test-governance` and the affected plan to choose the checks below; they are entry points, not a mandatory full run:
     ```bash
     (cd web && pnpm lint && pnpm css && pnpm test)
     (cd web && STYLE_L1_SCENARIOS=... pnpm style:l1)
     ```
   - For a narrow page change, select `STYLE_L1_SCENARIOS` from the current scenario registry and report coverage/risks. Full Style L1 or wider acceptance still requires the explicit authorization defined by `$plush-test-governance`.
