# ERP 组件 / ERP Components

本文是 `web/src/erp/components/` 的目录入口。前端整体结构、登录、主题和构建说明仍先看 [web/README.md](../../../README.md)；业务对象、状态和事实边界仍以当前代码、后端 usecase、JSON-RPC、正式产品 / 架构文档和测试为准。

新增或调整组件时，先按[组件复用与使用入口](../../../../docs/engineering/前端实现与交互约定.md#组件复用与使用入口--shared-component-entrypoints)核对当前任务的正式入口、已有封装与允许底层使用的边界，再阅读本目录职责与对应实现。

空提示使用通用层的 [`AppEmpty`](../../common/components/empty/AppEmpty.jsx)；业务明细通过 `BusinessLineItemsEmpty` 选用文本规格，详情、来源选择与工作台沿用同一呈现入口。规格见[空提示与读取反馈](../../../../docs/product/ui-design/交互设计说明.md#empty-states)。

## 目录职责

`web/src/erp/components/` 放 ERP 桌面后台的共享壳层、业务列表组件、领域表单 / 列配置、打印工作台和 Workflow 动作抽屉。组件负责展示、收集输入、调用既有 action 或 hook；不在前端补造库存、出货、质检、财务或 Workflow 事实。

## 主要分组

| 分组             | 典型路径                                                                       | 职责                                                           |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 页面壳和通用展示 | `ERPLayout.jsx`、`ERPPageActions.jsx`、`business-list/*` | 布局、列表页头、导航和状态展示；账号固定侧栏底部，刷新与窄屏导航共用页面操作组件 |
| 桌面分栏与表单身份 | `BusinessSplitWorkspace.jsx`、`BusinessSplitHeader.jsx`、`BusinessSplitCollapseButton.jsx`、`business-list/BusinessForm.jsx`、`business-list/BusinessSplitContext.jsx` | 选页、刷新、分栏布局与收起融入已有标题行，附加页下拉框内清空只退出页面并检查草稿，栏右侧叉号在栏内弹窗或抽屉打开时仍可收起并保留输入和浮层，分栏菜单仅保留宽度与互换，编辑时合并重复模块标题；标题上下文单独订阅布局变化，按菜单目录选页并复用原路由和编辑器；隔离查询、读取反馈和表单 DOM 名称，互换与收起保留实例。关联建档只回填发起组，独立建档只更新候选，主数据表单返回后可继续编辑保留的输入；保存后重读另一栏已登记数据 |
| 账号身份 | `AccountIdentity.jsx`、`accountIdentity.css` | 桌面账号入口和手机“我的”共用的默认文字头像、姓名、账号及实际所属岗位；头像颜色按账号固定，完整岗位在账号卡片换行展示 |
| 业务列表共享层   | `business-list/*`                                                              | 列表壳、表单弹窗、附件、明细行、列顺序和来源选择 |
| 工具栏组合样例 | [`DevUIBusinessToolbarExample.jsx`](../../dev-workbench/components/DevUIBusinessToolbarExample.jsx) | 工作台“控件设计 → 业务工具栏组合”直接使用正式工具栏、表格、筛选、详情与列设置；四业务、职责标注及增长场景只处理本地样例，不导入真实页面或调用业务偏好 hook |
| 关联资料选择与更新 | `RemoteReferenceSelect.jsx`、`ReferenceRecordsContext.jsx` | 远程搜索、分页与已选资料回显；物料保存后按权限定点重读，`BusinessFormPage` 承接可重试的读取提示，保留表单草稿与冻结快照 |
| 产品图片图集 | `business-list/BusinessProductGallery.jsx`、`BusinessDocumentProductGallery.jsx`、`workflow/WorkflowTaskImagePreview.jsx` | 单据列表以主图缩略图和去重款数打开全部关联产品；预览采用常驻产品条与合并操作行，选中边框与底衬跟随主题色，切换不改变尺寸。单图收起翻页，帮助按需展开；单品身份共用主辅图、缩放、失败重试和关闭恢复。批量摘要仅支持正式关联，物料和未关联需求不借图 |
| 业务日期输入和范围筛选 | [`business-list/BusinessDateInputs.jsx`](business-list/BusinessDateInputs.jsx) | `DateInput`、`DateTimeInput`、`DateRangeFilter` 共用格式与范围约束；`InheritedDateInput` 供销售、采购、委外明细显示整单交期，单独改期后保存行值，清空恢复沿用。采购优先沿用供应商确认日期 |
| 主数据和源单据   | `master-data/*`、`sales-orders/*`、`purchase-orders/*`、`outsourcing-orders/*` | 领域列配置、表单、业务动作面板和来源生成入口                   |
| 共用资料目录操作条 | [`business-list/MaintenanceSelectionBar.jsx`](business-list/MaintenanceSelectionBar.jsx) | 仓库设置与付款方式共用选中摘要、清选及顶部维护动作布局；调用方持有独立选择、权限与状态，不继承来源页面的动作宿主。配合 AppTable 空白单选列表头与整行选择，提交及错误恢复仍归业务组件 |
| 付款方式录入与目录维护 | [`PaymentMethodInput.jsx`](PaymentMethodInput.jsx)、[`PaymentMethodManager.jsx`](PaymentMethodManager.jsx) | `PaymentMethodField` 供四类表单搜索选择及标签行管理入口；`PaymentMethodEntry` 供基础资料列表集中维护。字段标签与新增窗保留“管理付款方式”入口，下拉只保留候选及查无匹配时的新增并选用，取消仅本次使用；快捷新增可切换管理并返回保留名称，成功后选用并返回；维护窗口整行单选、选择列表头留空；顶部集中改名、启停及删除，未选择时禁用，切换查询 / 状态 / 页码或刷新清空选择；搜索行右侧新增，底部编辑保存 / 取消、删除确认及返回固定可达，单页隐藏翻页。按状态保留搜索与页码，每页只挂载 20 项。支持启停、撤销；删除未使用项由独立 payment_method.delete 授权，默认仅超级管理员可用，返回保留草稿；历史快照和付款周期独立 |
| 仓库设置与物料快捷建档 | [`inventory/WarehouseSettingsModal.jsx`](inventory/WarehouseSettingsModal.jsx)、[`bom/BOMMaterialCreateModal.jsx`](bom/BOMMaterialCreateModal.jsx) | 复用居中、限高和固定底部的局部表单弹窗。仓库先整行选中，再从顶部编辑；按编号 / 名称 / 用途提交式搜索，新增位于工具行右侧，编辑保存 / 取消在底部，编辑期间锁定目录选择。每页 5 项，翻页清选，保护未保存修改；物料快捷建档通过 `MasterDataFormFields` 的 `compact` 呈现保留同一字段与校验，完整档案页继续使用默认分区 |
| 委外明细办理 | [`outsourcing-orders/OutsourcingOrderHandlingItems.jsx`](outsourcing-orders/OutsourcingOrderHandlingItems.jsx) | 合同的整页“办理明细”和手机任务共用明细读取、完整性检查、取消及重试；详情字段只展示信息，办理字段按原权限和状态追加动作 |
| 页内视图与滚动恢复 | `business-visualizations/BusinessVisualizationFrame.jsx` | `BusinessViewPanels` 按有限分类保留已访问的界面，隐藏视图及浮层不可交互，返回应用最新数据和权限；`BusinessViewSurface` 同时管理当前分类的滚动恢复。生命周期与隔离复用共享 overlay scope，数据读取和业务写入仍由页面原有主路径管理 |
| 页签响应与内容等待 | `BusinessSwitchContent.jsx`、共享 `useResponsiveSwitch` | 普通模块导航、采购列表／跟进和库存分类先完成离开保护，再反馈选择并在下一帧之后提交内容更新；后续选择替换待提交目标。等待内容保留节点并隔离操作及浮层，路由或页面状态提交后恢复；分栏沿用各栏原有保护与导航 |
| 事实和质量       | `operational-facts/*`、`quality-inspections/*`、`shipments/*`                  | Operational Fact、质检、出货相关展示和表单入口                 |
| 库存台账 | `inventory/inventoryLedgerPresentation.jsx`、`useInventoryReferences.js` | 列配置和只读显示规则、按有效权限读取参考资料；页面管理筛选、选择和业务动作 |
| 质检参考资料 | `quality-inspections/useQualityInspectionReferences.js` | 按有效权限读取来源选项，统一处理取消、失效响应、失败清空和重试 |
| 工作台与任务看板视图 | `workflow/WorkflowDashboardViews.jsx` | 只读任务呈现和导航；请求与身份范围缓存由 `../hooks/useWorkflowDashboardData.js` 管理 |
| 收付款与核销 | `finance/useFinancePayment*`、`useFinanceCreditActions.mjs`、`Finance*Editor.jsx` | 列表读取和恢复、付款创建、核销、冲销、红冲及导出各自管理状态与请求；表单只消费所属 hook 的 form 实例与动作，共享页面级提交状态和防重尝试记录 |
| 工程资料和打印   | `bom/*`、`print/*`                                                             | BOM 头 / 明细、打印模板工作台和纸面预览                        |
| Workflow 展示与动作 | `workflow/*` | 任务动作抽屉、提交前解释合同消费；`WorkflowTaskIdentity.jsx` 及其 `WorkflowTaskAssociation` 共用关联区、无关联语义占位、按种类计数与完整清单；`WorkflowTaskTiming.jsx` 与 `workflowTaskTiming.mjs` 统一有值、缺失和无效时间；列表、日历、详情、回执、关联任务和复制摘要保留适用的核心缺值提示；`WorkflowTaskCurrentSummary.jsx` 供电脑和手机共用当前责任、原因与时间摘要，当前责任优先呈现，前序步骤及记录默认展开并保留手动收起；`WorkflowTaskCalendar.jsx` 供两端共用待办月历、日期列表和跨月逾期 / 无截止入口，读取服务端完整统计并复用现有办理入口 |
| 进度总览与详情 | `business-visualizations/ProgressCompactContent.jsx`、`BusinessProgressDrawer.jsx` | 桌面与手机共用单据身份、快照交期、实际数量及当前关注；完整环节和图片按需下钻 |

## 边界

- 共享组件改动默认按影响面评估：触达 `business-list/*`、`ERPLayout.jsx`、打印壳或通用状态展示时，至少检查受影响页面和 `style:l1` 场景。
- `workflow/WorkflowTaskImagePlaceholder.jsx` 只按传入状态展示产品／物料的无图、加载、失败或无权限占位，供真实图片组件和工作台样例共用；附件读取、权限判断、缓存、预览与重试仍由 `WorkflowTaskProductImage.jsx` 和 `master-data/ProductIdentity.jsx` 负责。表单通过 `common/theme/erpThemeContext.jsx` 读取外层主题上下文，偏好加载与保存归主题 Provider。
- 业务导航共用 `../hooks/useBusinessNavigate.js` 与 `business-list/BusinessLink.jsx`；链接和对象式路径在手机中保留当前岗位、查询、锚点及返回原任务的上下文，桌面路径沿用桌面壳。
- 菜单主列表的整页编辑复用 `business-list/BusinessFormPage.jsx`，统一管理保存、离开保护及桌面可选全屏。默认保存前校验当前表单；采购需先清理纯空白新行、批量导入需预检全部草稿时，使用 `validateOnSave={false}` 交给保存器整理后校验，仍须调用所属 form 的 `validateFields`；校验失败通过 `errorFields` 复用分区展开和字段聚焦。容器与恢复合同见[桌面业务编辑](../../../../docs/engineering/前端实现与交互约定.md#桌面业务编辑与弹窗约定)。
- 局部弹窗由 `BusinessFormSectionScope` 提供独立聚焦范围；整页表单仍由 `BusinessFormBody` 提供目录、阅读位置及焦点，已有字段和浮层不重建。已有分组使用 `BusinessFormSection`，普通子标题继续使用 `BusinessFormSectionTitle`；查看、复制、导入及加载 / 空态 / 错误分支均保留标题。
- 分区定位与聚焦复用 `BusinessFormBody`、`BusinessFormSection`；普通分区及 BOM 标题共用 `business-list/businessFormSections.css` 的 32px 紧凑标题带，以短竖线、主题文字和淡主题色底区分表头及只读框，当前分区底色加深。外观与当前分区不派生业务状态，不改变输入、明细行组或整单保存语义。
- `BusinessFormBody` 共用“目录 / 页签”导航：目录连续展示整单，页签用 `SlidingTabList` 保持横向导航可见，任务共用滚动区时吸顶；窄屏横滑页签。切换保留字段挂载、阅读位置与整单校验，显示方式统一在账号“外观与密度”中设置，编辑页标题栏不重复提供入口。
- `BusinessFormSection` 的 `fieldLayout="adaptive"` 按字段内容换行，`erp-business-action-form__field--short` / `__field--wide` 只控制字段区域预算；`fieldLayout="support"` 组织备注与附件，窄区域顺排。默认栅格及 Excel 明细结构保留，样式集中在 `businessFormSections.css`。
- `BusinessLineItemsTable` 保持同一表头与滚动区域；`BusinessLineItemGroupHeading` 统一提供整条标题点击、箭头状态及键盘展开收起，保留标题内图片预览的独立操作。出货页用它归组相邻产品身份，`BusinessLineItemRow` 仍逐条维护字段、序号与浮层焦点，不改变 `Form.List` 的顺序和 key。业务归组适用范围见[编辑页归组](../../../../docs/product/ui-design/交互设计说明.md#editor-line-grouping)。
- 明细标题、组数、批量展开、横向查看和来源操作统一交给 `BusinessLineItemsHeader`；`BusinessGroupedLineItems` 通过 `title`、`headerActions` 接入，BOM 与采购到货保留自身字段结构并复用同一标题组件。滚动入口仅挂入所属明细工具栏，布局与恢复合同见[明细录入](../../../../docs/engineering/前端实现与交互约定.md#明细录入)。
- 非 BOM 明细通过 `business-list/BusinessLineEditor.jsx` 提供独立 form 范围的单行选择及顶部操作槽，`BusinessLineEditorRowControls` 将原按钮投射到该槽，保持权限、确认与回调；`actions` 只放行操作，业务字段留在 `cells` 或资料区。桌面选择与输入焦点分开，切换选中对象会重建动作浮层而不重建业务字段；手机与窄区域保留就近操作。`BusinessCompactFieldTable` 用列的 `actions: true` 标记操作列，宽区域不再显示该列；固定来源无动作时不增加选择。多个来源表可用 `scrollControlsInToolbar` 共用顶部横向查看入口，`stickyHeader` 单独决定是否吸顶列名。
- BOM 的 `BOMMaterialGroupsForm` 保留专用物料 / 部位表格，通过 `BOMSelectionScope` 在所属 Form.List 生命周期内维护两层单选；按稳定 field key 定位当前对象，使用原 add / remove 和复制快照清理规则。顶部动作区不套用普通明细的中性外观，原字段列序、合并单元格、组尾汇总、精确计算及只读行为保持；移除整组需要确认部位数，表单重置或所选组收起时清除选择。
- `BusinessGroupedLineItems` 桌面默认平铺，按需启用分组；手机保留原分组。`BusinessLineItemRow` 的资料默认收起，行号旁箭头控制可见性，字段保持挂载；原同步错误展开链路继续使用。采购 `PurchaseOrderLineSummary` 只读取下单名称和颜色，数量与单位共享一列但保留独立字段、精度及快照。生产路线等必要信息及 BOM 编辑器保持原边界。
- 长明细表通过 [`TableScrollRegion`](../../common/components/table/TableScrollRegion.jsx) 的 `stickyHeader` 接入 [`TableStickyHeader`](../../common/components/table/TableStickyHeader.jsx)，与同一区域的标题工具栏配合吸顶。原表保留唯一字段与无障碍表头；吸顶层仅镜像列名并同步实际列宽、主题及横向位置，离开明细区自动退出。
- 桌面账号同步首次失败时不挂载业务页；已验证页面遇到临时断连时，由 `SessionRecoveryDialog` 保留本页内存中的编辑内容并隔离交互，JSON-RPC 暂停新的认证业务请求，不排队或重放写操作。恢复必须重新读取账号和有效业务配置；访问范围变化时重建业务页，登录失效或账号切换时清除旧页面。刷新、关闭或离开页面不属于内存保留范围；真实授权始终由后端校验。
- 业务列表、弹窗明细与研发工作台的 Ant Design 表格共用 [`AppTable`](../../common/components/table/AppTable.jsx)；列对齐和序号规则见[表格对齐](../../../../docs/engineering/前端实现与交互约定.md#表格对齐--table-alignment)。
- 业务弹窗通过 `business-list/BusinessModal.jsx` 共享尺寸、滚动和浮层离开守卫，`BusinessFormModal` 在其上保留表单标题、真实脏状态及焦点恢复。抽屉使用通用层 [`AppDrawer`](../../common/components/drawer/AppDrawer.jsx)，命令式确认使用 `useModal()`；分栏内沿用同一编辑器并在所属栏展示，见[分栏浮层规则](../../../../docs/engineering/前端实现与交互约定.md#desktop-split-workspace)。

  尺寸取 [`modalSizes.mjs`](../utils/modalSizes.mjs)：`confirm` 用于简短确认、原因及少量字段（480px），`localAction` 用于需要较宽上下文的局部表单（最大 860px），`recordDetails` 用于复杂表单与摘要详情（最大 1120px），`columnOrder` 用于列排序与图片预览（最大 640px）。BOM 修订与保存回执、生成委外草稿、纠正复检、回货送检、财务来源建草稿、出货建账草稿、质检办理确认、采购应付差额和撤销抵扣共用紧凑档位；保留必要的来源、业务后果及验证错误。明细表、复杂处置和图片标注按内容保留较宽档位。所有档位默认居中，超出可用高度时只滚动正文，底部操作保持可达；分栏内相对所属工作区居中，手机整页办理保持独立布局。

  采购到货、多条退货或调整、材料汇总、完整单据明细、业务记录和生产工序使用 `lineItems`：窗口的 94%，最大 1800px，两侧至少留 16px。各入口使用尺寸名称；只有手机全屏或调用方已提供共享尺寸时传入 `width`。
- 未收到用户明确的尺寸调整要求时，页面重设计沿用原有尺寸档位；表格改卡片、减少默认字段或当前只有一条明细均不构成降档理由，也不得为新实现放宽既有尺寸验收。采购到货的浏览器回归独立验证 `min(1800px, 94vw, calc(100vw - 32px))` 的实际宽度，覆盖单条、多条、窄屏、超宽屏和暗色。
- 采购到货使用 `lineItems` 尺寸：上方录入收货信息，下方按采购材料分组，每种材料内追加卷包记录。数量核对与材料实点合计随录入更新，空白记录不提交，已填写记录逐字段校验；辅助说明按需展开。新增卷包后定位数量输入，关闭未保存内容前提醒，保存中禁止关闭和重复提交，材料读取失败可在弹窗内重试。
- 弹窗高度随内容增长，桌面总高度不超过可视窗口减 64px，窄屏减 28px；正文纵向滚动，标题与底部操作保留在可视区域。宽表统一在表格容器内横向滚动，明细卡片随可用宽度换行。手机材料汇总保留现有全屏与安全区规则。只读详情关闭后释放明细状态，重新打开从第一页读取。
- 销售、采购、加工与采购入库通过当前记录的“查看详情”打开单头与完整明细；出货、生产订单与 BOM 沿用各自的完整只读查看入口。主列表保留选择与业务操作，查看后返回原列表上下文。共享详情使用 `BusinessRowItemCards`：桌面左侧显示明细编号，右侧按业务关联分行，窄屏编号移到上方；每行随可用宽度排成一、二、四或六列。

  多条长明细由 `BusinessDetailItemGroups` 组织：销售按相邻已关联产品，采购及入库按相邻材料与单位，加工合同按相邻对象类型、产品或材料及工序归组；编辑与详情共用 `sourceDocumentLineGroupKeys.mjs` 和 `adjacentLineItemRuns.mjs`，不按名称合并、不重排或合计原行。首组默认展开，分组标题支持键盘和同时展开多组；同页标题栏提供全部展开 / 全部收起。收起后只显示业务标题与条数，数量、单位、金额、日期及普通状态随完整字段一起隐藏，展开后按原权限查看。完整字段和独立图片保持原组件，独立办理入口、读取失败与附件反馈沿用原位置；折叠不改变读取、状态或权限。只有一条明细及未配置 `getItemGroup` 的紧凑详情直接展示。

  页面在字段配置上通过 `rowStart` 分行、`wide` 占两列、`strong` 突出名称、`media` 在六列布局中跨两行放图片、`tone` 表示状态；备注、工艺要求等 `fullWidth` 字段独占一行，标签和值左右排列，保留长文本和换行符。共享明细弹窗默认 10 条/页，支持 10 / 20 / 50 条切换；切换条数回到第一页，换页滚回明细起点。分组与批量展开按本页计算，各页展开选择在本次查看中独立保留；关闭重开或切换单据恢复第一页、10 条及首组展开，重新读取完整明细。

  总条数固定在底部左侧，右侧依次显示每页条数、方框页码和关闭；手机将总数与条数选择、简洁页码与关闭分成两行。完整明细读取继续遵守权限、单据版本校验、失败重试与取消请求边界。
- 业务明细中的名称、部位、加工说明、包装说明和备注使用 `business-list/BusinessTextArea.jsx`，默认两行起步，按内容和宽度自动换行增高，保留字段长度限制，不设置内部滚动的行数上限。所有备注（含明细）至少两行；非备注短字段可显式设为一行。数字、日期等结构化控件维持原类型；明细表内已选名称完整换行，整张宽表统一横向滚动。BOM 的多列粘贴仍按列分配，单个加工说明 / 备注内的多行粘贴保留为一个字段。
- 领域组件可以隐藏未完成入口，但不能在前端本地补造后端事实、状态流转或权限结论。
- 任务来源资料共用 `business-list/BusinessRecordDetails.jsx` 的紧凑布局：`taskDetailRole` 将单据身份、状态和图片分组，`taskDetailOrder` 排列其余字段，未配置的有值字段继续保留；容器宽度决定标签和值同行或上下排列，复制、图片预览和业务入口沿用原实现。普通选填空值省略，来源列的 `taskDetailEmptyValue(record)` 在真实缺值时返回提示、已有原因和 `tone`，有值时返回 `null`。缺值使用同字号、中等字重的原位文字，需补齐或确认用深橙色，暂未生成和历史未记录用灰色；不使用 Tag，响应未返回的字段不计缺失。资料区不追加办理按钮，沿用任务原有入口，详见[前端实现约定](../../../../docs/engineering/前端实现与交互约定.md)。
- 列配置、表单默认值、来源选择、导出 / 打印字段涉及业务字段链路时，必须检查新建、编辑、切换来源、清空来源、列表、详情、打印 / 导出和旧数据回补路径。
- 打印组件只负责预览和模板渲染；打印留档、合同事实、采购 / 委外 / 出货 / 财务状态仍由后端和正式文档定义。
- 合同条款共用 `print/ContractClauseTools.jsx`，支持分组增删、名称编辑与排序，以及组内条目操作；分组名称的左侧和纸面入口写入同一份有序草稿。明细和工程行共用 `PrintWorkspaceTools.jsx` 的调序与清空工具。结构操作只修改窗口草稿，清空保留条目，删除才移除条目；空组标题及编号规则见[打印字段与编辑清单](../../../../docs/打印模板字段与编辑行为清单.md#条目编辑)。工具和留白导航不进入纸面输出。
- Workflow 组件只消费 `explain_action_access`、`explain_task_assignment` 和受控 action API；不能重新直连 raw workflow 写入口或把 task done 当成 Fact posted。

## 展示说明的按需查看

`BusinessHelpLabel` 优先读取原有岗位帮助条目，也可用 `description` 承载当前组件已有的补充说明；两者均通过共享 `SupplementalHelp` 提供 ⓘ、悬停 / 聚焦查看、点击固定及再次点按 / 外部点击 / Escape 收起；Escape 只关闭说明，不能触发外层表单返回。业务详情只有显式设置 `descriptionInHelp` 才将通用查看教程移到标题帮助，默认继续显示原说明，权限与业务后果不自动隐藏。

图解说明通过 `renderContent(closeHelp)` 复用相同的 ⓘ、悬停、键盘和点按行为；关闭动作调用 `closeHelp` 并回到 ⓘ。任务详情的 [WorkflowTaskScopeHelp](workflow/WorkflowTaskScopeHelp.jsx) 负责解释相关任务、整单进度和两档处理记录的范围，图示只说明查询范围，不读取数据或授予权限。

采购明细通过 `BusinessLineItemsSection.headerActions` 复用现有标题操作区；原手工添加、页脚统计和其他调用方的标题内容保持原合同。

可编辑明细的完整行组由 `business-list/businessLineItemGroups.css` 维护交替底色、组间分隔、序号和焦点提示，供单据明细、紧凑明细、联系人及 BOM 物料组共用；序号跨行及补充字段布局由各自组件维护。合同与窄屏边界见[明细录入](../../../../docs/engineering/前端实现与交互约定.md#明细录入)。

任务卡保留来源、实际办理人、岗位、截止和异常原因，分类与进入岗位时间从 `WorkflowTaskInfoCard` 的任务信息查看；本任务记录默认展开，单条详情保留分类、精确时间与版本。该层只调整呈现，不改变查询、权限、校验、提交和事实边界。

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

- `help/HelpScenarioContent` 生成岗位帮助的办理概览与说明切换，并直接显示完成标准、交接和常见问题；`HelpScenarioIllustration` 只展示标明的操作样例。

  `HelpHandbookChapter` 同源渲染通用与业务章节，使用统一正文卡片与按需展开的章内导航，详细办理内容来自 `businessHandbookOperations.mjs`；`HelpReferenceContent` 保留完整词条深链；首页推荐、账号阅读范围、办理入口权限、地址恢复与离线下载由 `HelpCenterPage` 管理。

  `HelpManualDirectory` 提供三册统一章节目录，`HelpProjectManualContent` 安全渲染受控的管理与运维 Markdown。三册手册入口见[项目手册](../../../../docs/manuals/README.md)。
- `permission-center/` 的 `usePermissionCenterData` 负责账号与岗位加载，`usePermissionRoleSettings` 负责岗位草稿和权限预览，`PermissionAdminAccounts` 自持账号表单与弹窗；页面只协调页签与未保存提醒。
- `workflow/useSourceOrderWorkflowActions.mjs` 供来源单据的“任务协作”入口统一办理 Workflow 动作；入口提供场景标识。
- `outsourcing-orders/` 的 `useOutsourcingOrder*` 按查询、编辑和生命周期动作管理状态；`useOutsourcingSourceFacts` 管理委外来源事实与回货质检，应付操作由专用 Hook 管理。
- `operational-facts/useOperationalFactQuery` 负责来源筛选、分页、详情与导出查询，`useOperationalFactMutations` 负责过账、结清和取消；页面消费这些状态与动作。
- `production-orders/useProductionFactActions.mjs` 与 `finance/useFinanceReconciliationAction.mjs` 管理事实工作台对应操作的表单状态、请求失效和重试。
- 采购、加工及工程打印共用 `print/PrintEditableText.jsx`，草稿监听继续复用 `usePrintEditableDraftSync.js`；模板保留各自的文本规范化、富文本清理和焦点规则。采购合同纸面与静态预览共用 `MaterialContractMetaPair.jsx` 的元信息双列布局。工程打印的基础编辑组件及三类纸面也位于 `print/`；页面保留窗口草稿和工具栏编排，业务数据仍只读。
- `purchase-orders/usePurchaseOrderContractPrint` 统一采购列表与工程用料汇总表的合同读取及打开流程，按同一供应商和一致合同条件归并，逐行保留来源单号。`print/MaterialPurchaseContractBatchWorkbench` 保留完整来源、选择与可编辑的窗口草稿，每次最多输出 20 份合同；条件不同的合同在清单说明原因，缺值在窗口内补齐，逐份独立起页，不回写采购业务数据。

- 任务详情的两端信息布局共用 `workflow/WorkflowTaskInfoCard.jsx`，复用身份、责任、时间、附件与复制真源；三步引导从首屏可见，业务页与返回保持当前移动端岗位。
