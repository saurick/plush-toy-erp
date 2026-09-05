# Plush Template Runtime / 模板实现与验证

模板字段、布局、编辑、图片、分页或输出变化时读取。仅执行本次影响面相关的分支；代码块以当前任务仓库根为工作目录。

- Product Core 默认样例应使用中性展示值；模板样例文字默认黑色，颜色/加粗是编辑能力，不是默认样式证据。
- Product Core 默认样例不要按甲方长表塞满。若编号作业行、材料行、色卡行或合同明细行行为一致，默认只保留 2-5 条代表行；长清单、分页和性能用 fixture、页面级浏览器回归（Style L1）和 PDF 回归覆盖，不靠默认样例复制所有源行。

## 映射 source regions 到 plush runtime concepts。
   - Header / company / title / product metadata -> editable 或 mapper-fed draft fields。
   - Detail / material / color / instruction rows -> repeatable row model；源文件编号行暗示重复操作时支持 insert above / below。
   - `裁床` 等 section headings -> 若 runtime 行为相同，作为同一 instruction model 的 section row 或统一 row type。
   - Product images 和 row images -> 只属于 current-window image slots，不替代 business attachments 或 Product Core facts。
   - Remarks / signatures -> template footer / remark area，不是实现下方重复源模块的理由。
   - Extracted images 和 sample row images -> customer asset / sample boundary，并保留 source provenance；runtime uploads 仍是 current-window draft images，不是 customer raw-source archives。
   - Repeated rows -> 一个 shared row model 加 compact samples。行为一致时保留 2-5 条 default rows；只有源行语义不同或首屏预览确实需要时才增加默认样例行。
   - Source-positioned images -> source-aligned runtime slots。例如 header / product cell 里的产品图按源 cell ratio 和 position；行图片进入 eligible row image area；footer / signature image 只有源文件如此放置时才进 footer / signature region。

## 精确定义 controls。
   - Top / side toolbar buttons 必须对应真实操作：select row、insert above / below、delete row、add image、remove image、clear / blank template、preview PDF、download PDF、print。
   - selected operation row 和 section row 行为一致时，统一 row target model 和 toolbar actions，不保留两套让人困惑的术语。
   - Row / cell selection 不进入 content editing；content editing 不应意外切换 selected target。
   - Printed table / grid cells 里的 editable text 必须铺满单元格，匹配 purchase / processing contract workbench pattern：visible editable layer 覆盖 cell 宽高、继承对齐方式，让整格成为稳定 click / focus target；不要只让 bordered cell 里的小 inline `span` 可编辑。
   - Active editable focus 在 official templates 中统一使用 solid / inset treatment；虚线只保留给 placeholders、image drop zones 或 source / reference aids。row / cell selection 可以独立高亮，但不能像第二套编辑边框。
   - Image upload 应支持任何 eligible instruction row，图片先横向排列，宽度不足时在 cell 内换行。
   - Image slots 必须有明确尺寸。Header / product images 跟随 source cell ratio、source anchor 和 source visual footprint；row images 使用 row image area 内的 bounded thumbnails / cards；footer / end-of-template images 只有源文件或需求定义时才使用 bounded appendix area。多图放不下一行时，在同一行内换行，或按模板合同进入 appendix / new page。
   - 加图不能静默把 row height 压到不可用比例；打印模板优先 bounded image size + row / page growth，不用 hidden overflow 或 distorted aspect ratio。
   - Rich text 必须可逆：能标红就必须能取消标红；bold 不可靠时移除按钮，不展示假能力。

## 在现有 print workspace path 上实现。
   - 复用 `printWorkspace.js`、`PrintWorkspaceShell`、existing draft / mapper helpers、engineering template data structures、scoped print CSS 和 PDF utilities。
   - editor side padding 可以为了纸面比例收紧，但不能牺牲 toolbar readability 和 paper centering。
   - 修 layout 时不要隐藏或删除正式 docs / source files；只在 runtime template 中排除 duplicate source regions，并写明原因。
   - 约束 runtime cost：images / rows 只 normalize 一次，避免 repeated full-paper remeasure loops；localStorage / window snapshots 保持在现有 print workspace model 内；shared row / image model 足够时，不做 per-customer special branches。
   - 新增 official template 或大改模板时，更新 coverage matrix：source version、template key、mapper / view model、renderer、PDF module guard、interaction coverage 和 known blind spots。

## Validation / 验证要求

- Source screenshot 和 runtime screenshot 要一起用，不能只依赖其中一个。
- 对发生变化的布局或交互保留命名截图 / 浏览器 artifact，并结合 DOM / box metrics 验证；仅选择本次涉及的编辑、选择、增删行、图片或 PDF 状态。发现真实缺陷后修复并重验受影响状态。
- 按本次变更选择 source / runtime baseline、目标交互、相关边界及必要 PDF / print 输出；不固定截图数量，同一候选未变的证据可复用。
- Layout 验证要检查真实 cell geometry：table width、column ratios、row heights、font size、line height、borders、padding、overflow 和 adjacent boxes。
- Cell editing 要比较 editable layer 与 parent cell 的 bounding box，确认它铺满 printable cell area；除非该 cell 明确是 label-only 或 non-editable，否则 focus / selection highlight 不应暴露一个更小的 inline editor。
- Edit-focus styling 要在浏览器里检查 computed styles：official templates 的 active editable cells 不应混用 dashed 和 solid borders；selection 与 editing focus 要保持视觉区分。
- Image rows 要测试 one image、multiple images、wide image、tall image 和 wrap behavior。
- Fixed / product / static images 要对比 source anchor、display box、aspect ratio 和 nearby cell geometry，不只看图片是否出现。
- Sample rows 要确认重复行使用 compact default sample；长清单行为用 separate fixture / regression 覆盖。
- Row operations 要覆盖 default row、section row、blank row、selected row、insert above / below、delete、add image、remove image 和 edit recovery。
- PDF / print 要确认使用同一份 current paper DOM，editor highlights / toolbars 不进入打印结果。
- 发现噪点时先分类为 source / rendering / runtime product noise；不要把源噪点照搬进模板，也不要用“噪点”掩盖真实运行时错位、遮挡、缺字或错误选择。
- 职业任务文案要检查模板标题、按钮、导出/PDF、帮助提示和正式打印件，确认业务用户看到的是岗位任务语言，不是开发者术语。
- Performance / quality 要检查本轮最高风险 bound：image count / size、DOM node growth、localStorage snapshot size、image load 后 layout settling、无 repeated measurement loop、编辑区域无明显 lag。
- Source provenance 输出 manifest / checksum 结果、workbook / PDF 结构证据、real used range decision，涉及图片时输出 image-anchor provenance。
- Official template coverage 要确认 `printTemplates.mjs`、server PDF module gate、docs、tests、页面级浏览器回归场景（Style L1）和 blind-spot notes 对齐。
- Skill-only / docs-only changes 运行 skill validator、YAML / metadata / 引用检查与 `git diff --check`；progress 只在命中 `AGENTS.md` 的过程记录条件时更新。
- Runtime implementation changes 按 plush docs 和 touched files 选择检查；page / style work 通常需要相关 `style:l1` browser-level regression。
