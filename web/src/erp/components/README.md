# ERP 组件 / ERP Components

本文是 `web/src/erp/components/` 的目录入口。前端整体结构、登录、主题和构建说明仍先看 [web/README.md](../../../README.md)；业务对象、状态和事实边界仍以当前代码、后端 usecase、JSON-RPC、正式产品 / 架构文档和测试为准。

## 目录职责

`web/src/erp/components/` 放 ERP 桌面后台的共享壳层、业务列表组件、领域表单 / 列配置、打印工作台和 Workflow 动作抽屉。组件负责展示、收集输入、调用既有 action 或 hook；不在前端补造库存、出货、质检、财务或 Workflow 事实。

## 主要分组

| 分组             | 典型路径                                                                       | 职责                                                           |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 页面壳和通用展示 | `ERPLayout.jsx`、`business-list/*` | 布局、列表页头、导航和状态展示 |
| 账号身份 | `AccountIdentity.jsx`、`accountIdentity.css` | 桌面账号入口和手机“我的”共用的默认文字头像、姓名、账号及实际所属岗位；头像颜色按账号固定，完整岗位在账号卡片换行展示 |
| 业务列表共享层   | `business-list/*`                                                              | 列表壳、表单弹窗、附件、明细行、列顺序、协同任务面板和来源选择 |
| 主数据和源单据   | `master-data/*`、`sales-orders/*`、`purchase-orders/*`、`outsourcing-orders/*` | 领域列配置、表单、业务动作面板和来源生成入口                   |
| 事实和质量       | `operational-facts/*`、`quality-inspections/*`、`shipments/*`                  | Operational Fact、质检、出货相关展示和表单入口                 |
| 库存台账 | `inventory/inventoryLedgerPresentation.jsx`、`useInventoryReferences.js` | 列配置和只读显示规则、按有效权限读取参考资料；页面管理筛选、选择和业务动作 |
| 质检参考资料 | `quality-inspections/useQualityInspectionReferences.js` | 按有效权限读取来源选项，统一处理取消、失效响应、失败清空和重试 |
| 工作台与任务看板视图 | `workflow/WorkflowDashboardViews.jsx` | 只读任务呈现和导航；请求与身份范围缓存由 `../hooks/useWorkflowDashboardData.js` 管理 |
| 收付款与核销 | `finance/useFinancePayment*`、`useFinanceCreditActions.mjs`、`Finance*Editor.jsx` | 列表读取和恢复、付款创建、核销、冲销、红冲及导出各自管理状态与请求；表单只消费所属 hook 的 form 实例与动作，共享页面级提交状态和防重尝试记录 |
| 工程资料和打印   | `bom/*`、`print/*`                                                             | BOM 头 / 明细、打印模板工作台和纸面预览                        |
| Workflow 展示与动作 | `workflow/*` | 任务动作抽屉、提交前解释合同消费；`WorkflowTaskCurrentSummary.jsx` 供电脑和手机共用当前责任、原因与时间摘要，当前责任优先呈现，前序步骤及记录默认展开并保留手动收起；`WorkflowTaskCalendar.jsx` 供两端共用待办月历、日期列表和跨月逾期 / 无截止入口，读取服务端完整统计并复用现有办理入口 |
| 进度总览与详情 | `business-visualizations/ProgressCompactContent.jsx`、`BusinessProgressDrawer.jsx` | 桌面与手机共用单据身份、快照交期、实际数量及当前关注；完整环节和图片按需下钻 |

## 边界

- 共享组件改动默认按影响面评估：触达 `business-list/*`、`ERPLayout.jsx`、打印壳或通用状态展示时，至少检查受影响页面和 `style:l1` 场景。
- 业务导航共用 `../hooks/useBusinessNavigate.js` 与 `business-list/BusinessLink.jsx`；链接和对象式路径在手机中保留当前岗位、查询、锚点及返回原任务的上下文，桌面路径沿用桌面壳。
- 菜单主列表的整页编辑复用 `business-list/BusinessFormPage.jsx`，统一管理保存、离开保护及桌面可选全屏；容器与恢复合同见[桌面业务编辑](../../../../docs/engineering/前端实现与交互约定.md#桌面业务编辑与弹窗约定)。
- 桌面账号同步首次失败时不挂载业务页；已验证页面遇到临时断连时，由 `SessionRecoveryDialog` 保留本页内存中的编辑内容并隔离交互，JSON-RPC 暂停新的认证业务请求，不排队或重放写操作。恢复必须重新读取账号和有效业务配置；访问范围变化时重建业务页，登录失效或账号切换时清除旧页面。刷新、关闭或离开页面不属于内存保留范围；真实授权始终由后端校验。
- 业务列表、弹窗明细与研发工作台的 Ant Design 表格共用 [`AppTable`](../../common/components/table/AppTable.jsx)；列对齐和序号规则见[表格对齐](../../../../docs/engineering/前端实现与交互约定.md#表格对齐--table-alignment)。
- 业务弹窗通过 `business-list/BusinessModal.jsx` 共享尺寸和滚动规则，`BusinessFormModal` 在其上保留表单标题与焦点恢复。尺寸取 [`modalSizes.mjs`](../utils/modalSizes.mjs)：`confirm` 用于简短确认与原因（480px），`localAction` 用于局部表单（最大 860px），`recordDetails` 用于复杂表单与摘要详情（最大 1120px），`columnOrder` 用于列排序与图片预览（最大 960px）。采购到货、多条退货或调整、材料汇总、完整单据明细、业务记录和生产工序使用 `lineItems`：窗口的 94%，最大 1800px，两侧至少留 16px。各入口使用尺寸名称；只有手机全屏或调用方已提供共享尺寸时传入 `width`。
- 未收到用户明确的尺寸调整要求时，页面重设计沿用原有尺寸档位；表格改卡片、减少默认字段或当前只有一条明细均不构成降档理由，也不得为新实现放宽既有尺寸验收。采购到货的浏览器回归独立验证 `min(1800px, 94vw, calc(100vw - 32px))` 的实际宽度，覆盖单条、多条、窄屏、超宽屏和暗色。
- 采购到货使用 `lineItems` 尺寸：上方录入收货信息，下方按采购材料分组，每种材料内追加卷包记录。数量核对与材料实点合计随录入更新，空白记录不提交，已填写记录逐字段校验；辅助说明按需展开。新增卷包后定位数量输入，关闭未保存内容前提醒，保存中禁止关闭和重复提交，材料读取失败可在弹窗内重试。
- 弹窗高度随内容增长，桌面总高度不超过可视窗口减 64px，窄屏减 28px；正文纵向滚动，标题与底部操作保留在可视区域。宽表统一在表格容器内横向滚动，明细卡片随可用宽度换行。手机材料汇总保留现有全屏与安全区规则。只读详情关闭后释放明细状态，重新打开从第一页读取。
- 销售、采购、加工与采购入库通过当前记录的“查看详情”打开单头与完整明细；出货、生产订单与 BOM 沿用各自的完整只读查看入口。主列表保留选择与业务操作，查看后返回原列表上下文。共享详情使用 `BusinessRowItemCards`：桌面左侧显示明细编号，右侧按业务关联分行，窄屏编号移到上方；每行随可用宽度排成一、二、四或六列。页面在字段配置上通过 `rowStart` 分行、`wide` 占两列、`strong` 突出名称、`media` 在六列布局中跨两行放图片、`tone` 表示状态；备注、工艺要求等 `fullWidth` 字段独占一行，标签和值左右排列，保留长文本和换行符。共享明细弹窗默认 10 条/页，支持 10 / 20 / 50 条切换；切换条数回到第一页，换页滚回明细起点，关闭重开恢复默认。总条数固定在底部左侧，右侧依次显示每页条数、方框页码和关闭；手机将总数与条数选择、简洁页码与关闭分成两行。完整明细读取继续遵守权限、单据版本校验、失败重试与取消请求边界。
- 业务明细中的名称、部位、加工说明、包装说明和备注使用 `business-list/BusinessTextArea.jsx`，按内容和宽度自动换行增高，保留字段长度限制，不设置内部滚动的行数上限。数字、日期等结构化控件维持原类型；明细表内已选名称完整换行，整张宽表统一横向滚动。BOM 的多列粘贴仍按列分配，单个加工说明 / 备注内的多行粘贴保留为一个字段。
- 领域组件可以隐藏未完成入口，但不能在前端本地补造后端事实、状态流转或权限结论。
- 列配置、表单默认值、来源选择、导出 / 打印字段涉及业务字段链路时，必须检查新建、编辑、切换来源、清空来源、列表、详情、打印 / 导出和旧数据回补路径。
- 打印组件只负责预览和模板渲染；打印留档、合同事实、采购 / 委外 / 出货 / 财务状态仍由后端和正式文档定义。
- 合同条款共用 `print/ContractClauseTools.jsx`，支持分组增删、名称编辑与排序，以及组内条目操作；分组名称的左侧和纸面入口写入同一份有序草稿。明细和工程行共用 `PrintWorkspaceTools.jsx` 的调序与清空工具。结构操作只修改窗口草稿，清空保留条目，删除才移除条目；空组标题及编号规则见[打印字段与编辑清单](../../../../docs/打印模板字段与编辑行为清单.md#条目编辑)。工具和留白导航不进入纸面输出。
- Workflow 组件只消费 `explain_action_access`、`explain_task_assignment` 和受控 action API；不能重新直连 raw workflow 写入口或把 task done 当成 Fact posted。

## 修改后验证

按影响面选择最小命令：

```bash
node --test web/src/erp/components/operational-facts/OperationalFactForms.test.mjs
node --test web/src/erp/utils/businessLineItems.test.mjs
node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs
pnpm --dir web css
git diff --check
```

如果改动共享列表、表单弹窗、打印壳、移动可见入口或布局样式，应补对应浏览器级回归，例如：

```bash
STYLE_L1_SCENARIOS=business-core-pages-desktop pnpm --dir web style:l1
```

## 页面职责拆分

- `help/HelpScenarioContent` 生成岗位帮助的办理概览与说明切换，并直接显示完成标准、交接和常见问题；`HelpScenarioIllustration` 只展示标明的操作样例。`HelpHandbookChapter` 同源渲染通用与业务章节，使用统一正文卡片与按需展开的章内导航，详细办理内容来自 `businessHandbookOperations.mjs`；`HelpReferenceContent` 保留完整词条深链；首页推荐、账号阅读范围、办理入口权限、地址恢复与离线下载由 `HelpCenterPage` 管理。`HelpManualDirectory` 提供三册统一章节目录，`HelpProjectManualContent` 安全渲染受控的管理与运维 Markdown。三册手册入口见[项目手册](../../../../docs/manuals/README.md)。
- `permission-center/` 的 `usePermissionCenterData` 负责账号与岗位加载，`usePermissionRoleSettings` 负责岗位草稿和权限预览，`PermissionAdminAccounts` 自持账号表单与弹窗；页面只协调页签与未保存提醒。
- `workflow/useSourceOrderWorkflowActions.mjs` 统一采购和委外源单的 Workflow 动作；页面提供场景标识。
- `outsourcing-orders/` 的 `useOutsourcingOrder*` 按查询、编辑、协同任务和生命周期动作管理状态；`useOutsourcingSourceFacts` 管理委外来源事实与回货质检，应付操作由专用 Hook 管理。
- `operational-facts/useOperationalFactQuery` 负责来源筛选、分页、详情与导出查询，`useOperationalFactMutations` 负责过账、结清和取消；页面消费这些状态与动作。
- `production-orders/useProductionFactActions.mjs` 与 `finance/useFinanceReconciliationAction.mjs` 管理事实工作台对应操作的表单状态、请求失效和重试。
- 工程打印的基础编辑组件及三类纸面位于 `print/`；页面保留窗口草稿和工具栏编排，业务数据仍只读。
- `purchase-orders/usePurchaseOrderContractPrint` 统一采购列表与工程用料汇总表的合同读取及打开流程，按同一供应商和一致合同条件归并，逐行保留来源单号。`print/MaterialPurchaseContractBatchWorkbench` 保留完整来源、选择与可编辑的窗口草稿，每次最多输出 20 份合同；条件不同的合同在清单说明原因，缺值在窗口内补齐，逐份独立起页，不回写采购业务数据。

- 任务详情的两端信息布局共用 `workflow/WorkflowTaskInfoCard.jsx`，复用身份、责任、时间、附件与复制真源；三步引导从首屏可见，业务页与返回保持当前移动端岗位。
