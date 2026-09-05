# Plush Source Analysis / 源文件识别

引入、替换或重新解释源文件时读取。仓库内引用相对当前任务仓库根解析；客户私有资料仍按已授权的受控入口读取。

- 客户源文件里的轻微干扰和噪点不能照着实现：扫描污点、截图边缘、临时批注、手工审阅痕迹、重复拼接缝、Excel 临时辅助行、偶发错位或孤立格式异常，默认先归为 source noise，除非能证明它是稳定模板结构、客户固定要求或可编辑业务元素。
- 噪点分级：source noise 是源文件污点 / 临时痕迹 / 偶发错位；rendering noise 是截图压缩、抗锯齿、字体 hinting 或 1px 内 subpixel 差；runtime product noise 是真实 UI / PDF 错位、遮挡、缺字、误高亮、错误焦点或业务误导。前两类通常记录或排除，第三类必须修或列为 remaining risk。
- 噪点只有在重复出现、锚定到 workbook / PDF 结构、有业务含义、影响阅读/操作/打印，或被客户 / 用户明确确认时，才升级为模板元素、客户配置或测试断言。
- Excel workbook 可能混有 print templates、summary sheets、vendor / customer reference data、import-prep clues、hidden helper rows 和 styled blank regions；任何内容进入 Product Core 或 customer config 前，都要先分类 sheet / region。
- Excel dimensions 可能被样式或 drawings 撑大；必须计算真实内容区，并独立解析 drawing / image anchors。图片 anchor 在文本 used range 外，不等于可以丢弃。
- 提取或生成的 customer assets 必须保留 provenance：workbook path、sheet name、drawing file / id、row / column anchor、crop / layout、source dimensions、runtime URL，以及它是 customer sample 还是 editable runtime slot。
- 图片尺寸和位置先按甲方源文件理解：产品图、色卡图、样板图、签章/签名或其他固定图片如果在源文件中有明确单元格、合并区域、坐标框或占位比例，运行时默认应落在同一语义区域并保持接近源文件的视觉尺寸；不能因为实现方便改放到文件末尾、通用上传条或任意缩略图区。

## 先理解 source，再匹配像素。
   - 检查 workbook / PDF 结构，不只看截图：sheets / pages、print areas、duplicated upper / lower blocks、hidden rows / columns、merged cells、dimensions、fonts、borders、images 和 page setup。
   - 使用 spreadsheet / PDF tooling 或 bundled libraries 做 source inspection；screenshot 只用于 visual regression，不是唯一 source parser。
   - yoyoosun raw files 成为当前真源前，先运行或引用 `customerSourceManifestCheck.mjs`；输出里报告 unregistered file、checksum drift 或 duplicate-source relationship。
   - real used range、print area 和 drawing anchors 分开检查；styled `max_column` 或 off-table image anchor 只是分类证据，不能直接扩大 / 裁掉模板。
   - 判断一份完整模板在哪里结束。作业指导书里第一个 `备注` / footer 常可作为模板结束线，下面内容可能是 repeated source module。
   - 编码前先拆开 reusable template body、duplicate blocks、sample text、customer data 和 runtime fields。
   - 编码前先拆开 source noise；对比 repeated source blocks、neighboring rows、workbook metadata 和 customer docs，只实现稳定结构，不实现孤立噪点。
