# Page Implementation / 页面实现与浏览器验证

布局、主题、表单、键盘行为或运行交互变化时读取。代码块以当前任务仓库根为工作目录；仅选择受影响场景。

DEV 工作台沿用 `docs/product/自动化测试策略.md` 的浅色桌面 smoke：核对受影响页面的渲染、关键交互和页面级横向溢出；不增加暗色、移动端、通用键盘流程或每次成功截图门禁。业务岗位移动端的既有合同保持有效。

## Implement with the existing design system.
   - Reuse current page shells, shared business-page components, theme tokens, CSS variables, and existing interaction patterns before adding new abstractions.
   - Keep the themes actually supported by the changed page readable. Printing/PDF previews remain fixed light unless a separate design explicitly changes screen preview behavior.
   - For desktop ERP business objects, use Modal as the unified create/edit/view surface. Do not introduce Drawer as the primary business-form interaction; keep Drawer for workflow task handling, navigation, or contextual side panels that do not save a complete business object.
   - Size modals by task complexity: confirmation/delete/simple prompts around 420-520px, master-data create/edit around 640-880px, and business documents such as purchase orders, sales orders, shipments, quality inspections, BOM, and outsourcing orders around `min(1720px, calc(100vw - 96px))` with a fixed footer action area. Keep complex line items inside the same business modal through sections, tables, horizontal scroll, or a second-level source picker; do not split business editing into drawers.
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
