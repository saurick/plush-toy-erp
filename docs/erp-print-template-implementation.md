# ERP 打印模板实现原理

> 目的：把当前毛绒 ERP 打印模板的共享编辑壳层、窗口级状态和正文真源收口到一份正式文档，避免后续继续把“普通路由页 + 模板共用一份 localStorage 草稿”的旧认知当成主实现。

## 1. 当前结论

- 当前正式模板只有 `采购合同`、`加工合同` 两套。
- 两套模板都通过同一条“业务页或打印中心 -> 独立弹窗 -> 右侧纸面 DOM 输出 PDF / 打印”的主链打开；业务页入口会先把当前选中业务记录映射成窗口级打印草稿，打印中心入口仍按默认样例进入。
- 这条主链已收口为：先开壳页、再进入模板工作台、窗口级 `state` 隔离草稿、工作台稳定后持续回写整窗 HTML 快照，刷新时优先由壳页直接恢复当前窗口。
- 当前正文继续由 React 工作台渲染，不是 builder + 独立静态 runtime，但分页运行时已经统一收口到共享 `printPageMargin` 主链。

## 2. 当前代码真源

| 层 | 当前文件 | 职责 |
| --- | --- | --- |
| 业务页打印入口 | `web/src/erp/pages/BusinessModulePage.jsx` + `web/src/erp/utils/businessRecordPrintDraft.mjs` | 在辅材/包材采购、加工合同/委外下单页选中记录后生成带值草稿并打开独立弹窗 |
| 打印中心入口 | `web/src/erp/pages/PrintCenterPage.jsx` | 选模板、按默认样例打开独立弹窗 |
| 共享窗口状态真源 | `web/src/erp/utils/printWorkspace.js` | 生成窗口 `state`、构建弹窗 URL、维护 shell URL、窗口级草稿 key 与整窗 HTML 快照持久化 |
| 壳页 | `web/public/print-window-shell.html` | 优先恢复当前窗口的整窗 HTML 快照；快照缺失时回退到对应模板工作台 |
| 共享编辑壳层 | `web/src/erp/components/print/PrintWorkspaceShell.jsx` | 工具栏、左侧字段面板、搜索、分行编辑区域、准备态 |
| 共享分页运行时 | `web/src/erp/utils/printPageMargin.mjs` | A4 续页判定、动态 `@page` 边距、continued class |
| 采购合同正文 | `web/src/erp/components/print/MaterialPurchaseContractWorkbench.jsx` | 采购合同字段、表格、条款、签字区与 PDF / 打印动作 |
| 加工合同正文 | `web/src/erp/pages/ProcessingContractPrintWorkspacePage.jsx` + `web/src/erp/components/print/ProcessingContractPaper.jsx` | 加工合同字段、表格、条款、签字区、页底附件位和 PDF / 打印动作 |
| PDF 输出 | `web/src/erp/utils/printPdf.mjs` | 冻结当前纸面 DOM 快照，走后端 `/templates/render-pdf` 生成 PDF |

## 3. 当前打开链路

### 3.1 从业务页打开

`BusinessModulePage` 在 `辅材/包材采购` 和 `加工合同/委外下单` 两个业务页显示合同打印按钮：

1. 用户先选中一条业务记录
2. `businessRecordPrintDraft.mjs` 按当前业务记录和明细行生成对应合同草稿
3. `openPrintWorkspaceWindow(templateKey, { entrySource: 'business', initialDraft })` 生成窗口级 `stateID`
4. 前端把 `initialDraft` 写入当前窗口专属草稿 key
5. 再打开 `/print-window-shell.html?state=:stateID`
6. 工作台按窗口级草稿恢复，进入可编辑打印窗口

当前只做“业务记录 -> 打印草稿”的前端带值，不反向回写业务记录，也不生成后端打印 DTO。

### 3.2 从打印中心打开

`PrintCenterPage` 调用 `openPrintWorkspaceWindow(templateKey, options)`：

1. 生成窗口级 `stateID`
2. 生成实际模板工作台 URL：`/erp/print-workspace/:templateKey?...&state=:stateID`
3. 先把 `{ templateKey, workspaceURL }` 落到 localStorage 的窗口状态 key
4. 优先打开 `/print-window-shell.html?state=:stateID`
5. 壳页首次若只读到 `workspaceURL`，先进入工作台
6. 工作台稳定后再把 `{ templateKey, workspaceURL, windowHTML }` 回写到同一份窗口状态

这样做的目标有两个：

- 保留“先有壳页，再进正文”的统一打开方式
- 给刷新恢复预留统一入口，而不是每个模板页自己猜该回哪里

### 3.3 工作台加载后

两套合同工作台都会：

- 根据 `state` 计算当前窗口专属草稿 key
- 首次加载时先读窗口级草稿；若没有，再兼容回读旧模板级草稿
- 调用 `syncPrintWorkspaceShellHistory(stateID)` 把当前弹窗地址收口到 `/print-window-shell.html?state=...`
- 监听当前整窗 DOM 的变更并持续回写最新 `windowHTML` 快照

这意味着：

- 弹窗当前显示的仍是 React 渲染后的工作台 DOM
- 但浏览器地址栏已经被收口到壳页 URL
- 用户刷新当前弹窗时，壳页会先尝试直接恢复上一轮整窗 HTML；只有快照缺失时，才会回退到 `workspaceURL`

## 4. 草稿与输出真源

### 4.1 草稿真源

- 当前窗口级草稿 key：`__plush_erp_print_workspace_draft__:<templateKey>:<stateID>`
- 旧模板级草稿 key 仅保留兼容回读：
  - 采购合同：`__plush_erp_material_purchase_contract_print_draft__`
  - 加工合同：`__plush_erp_processing_contract_print_draft__`

当前规则：

- 新打开的弹窗默认写窗口级草稿
- 只有当前窗口级草稿不存在时，才回读旧 key
- 不再默认把同模板的多个弹窗强行绑到同一份 localStorage 草稿上

### 4.2 PDF / 打印真源

- 浏览器打印：直接打印当前弹窗里的右侧纸面 DOM
- 在线预览 PDF / 下载 PDF：`printPdf.mjs` 会先 blur 当前焦点元素，再 clone 当前窗口文档、移除运行时脚本和高亮类，并只保留右侧纸面主区域后交给后端 `/templates/render-pdf`
- 加工合同纸样 / 图样附件会先在前端转成可持久化图片快照，再并入右侧纸面 DOM 的页底附件位，保证刷新恢复、PDF 预览 / 下载和浏览器打印读取的是同一份附件内容

因此当前正式口径是：

- 右侧纸面 DOM 才是打印输出真源
- 左侧字段面板只是同窗编辑入口，不是另一套打印模板
- 左侧附件上传条负责维护附件快照，但真正输出仍以右侧页底附件位的 DOM 为准
- PDF 和浏览器打印都不应该再维护第二份独立 HTML
- 两套合同在当前纸面高度超过单页 A4 时，会动态把整次浏览器打印与在线 PDF / 下载 PDF 的 `@page` 切到 `margin: 5mm 0 5mm`；未跨页时保持 `0` 页边距，避免本应单页的合同被额外挤出空白尾页。

## 5. 当前实现边界

已经收口的部分：

- 独立弹窗编辑，不在打印中心页内直接改纸面
- 先开壳页，再进模板工作台
- 窗口级 `state` 和窗口级草稿隔离
- 首屏准备态
- 壳页优先恢复整窗 HTML 快照
- PDF / 打印都从当前弹窗里的同一份纸面 DOM 输出
- 两套合同继续共用同一条 A4 续页判定与动态页边距主链

仍未完成的部分：

- 当前正文仍是 React 路由页，不是 builder + 共享 runtime 的纯静态 HTML 输出
- 当前只覆盖两套合同模板，还没有收口成多模板统一 runtime

## 6. 后续改造守则

- 若继续扩模板，优先复用 `printWorkspace.js + print-window-shell.html + PrintWorkspaceShell.jsx` 这条主链，不要再为新模板单独发明新的弹窗入口和新的草稿 key。
- 若后续继续扩展打印能力，优先补更强的共享编辑 runtime，不要重新退回“每个模板页自己兜刷新 / 自己猜分页”的分叉写法。
- 若修改打印输出逻辑，必须同时检查：
  - 左侧字段面板是否仍和右侧纸面同步
  - 当前窗口级草稿是否仍独立
  - PDF 和浏览器打印是否仍读取同一份右侧 DOM
  - 跨页时是否仍会统一切到续页页边距，确保第 `2` 页起正文不会贴页顶开始排
