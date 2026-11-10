import React, { Suspense, useLayoutEffect, useRef, useState } from 'react'
import { Button, Popover } from 'antd'
import {
  DownOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import FilterChip from '@/common/components/navigation/FilterChip'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import HorizontalScroll from '@/common/components/scroll/HorizontalScroll'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import NavigationCountBadge from '@/common/components/navigation/NavigationCountBadge'
import SearchInput from '@/common/components/SearchInput'
import { Loading } from '@/common/components/loading'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import { getBusinessPagePresentation } from '@/erp/config/businessUsabilityCatalog.mjs'
import { useERPTheme } from '@/common/theme/erpTheme'
import ERPThemeScope from '@/common/theme/ERPThemeScope'
import DevUIFeedbackExamples from './DevUIFeedbackExamples.jsx'
import DevSharedComponentGuide, { DevUIConsumerName, SHARED_COMPONENT_SEARCH_TEXT } from './DevSharedComponentGuide.jsx'
import DevUIPaginationExample from './DevUIPaginationExample.jsx'
import DevUIPageStateExamples from './DevUIPageStateExamples.jsx'
import { BasicInputExample, DateInputExample, GroupedSelectExample } from './DevUIInputExamples.jsx'
import DevSelectValueExample from './DevSelectValueExample.jsx'
import DevSupplementalHelpExample from './DevSupplementalHelpExample.jsx'
import {
  PROGRESS_SCOPE_OPTIONS,
  progressQueryFromURL,
} from '../../erp/utils/businessProgress.mjs'
import '../styles/dev-ui-controls.css'

const DevUIBusinessExamples = lazyWithDynamicImportRetry(
  () => import('./DevUIBusinessExamples.jsx')
)
const DevUIBusinessToolbarExample = lazyWithDynamicImportRetry(
  () => import('./DevUIBusinessToolbarExample.jsx')
)
const PURCHASE_PAGE = getBusinessPagePresentation('accessories-purchase')
const MATERIAL_PAGE = getBusinessPagePresentation('materials')
const TASK_PAGE = getBusinessPagePresentation('task-board')
const HISTORY_PAGE = getBusinessPagePresentation('history-records')

const TOPICS = [
  {
    key: 'feedback',
    title: '弹窗与反馈',
    summary: '编辑、提交、消息与恢复',
    description: '在同一份样例里体验输入校验、保存失败、结果未知和关闭保护。',
    rules: [
      ['系统信息与外观设置', 'AppModal 标准模式', '通用弹窗使用共享入口，保留任务需要的尺寸、内容和页脚。'],
      [
        '局部编辑',
        '弹窗',
        '保留来源页面；标题、输入和保存动作组成一个完整任务。',
      ],
      ['即时结果', 'Toast', '短暂说明成功，不移走输入焦点。'],
      [
        '需要处理的错误',
        '区域提示 / 持续通知',
        '恢复入口与原因一起保留，不能几秒后消失。',
      ],
      ['结果未知', '查询结果', '先确认本次操作，避免重复提交。'],
    ],
    checks: [
      '空标题保存：错误定位到字段。',
      '修改后关闭：先确认，取消后输入仍在。',
      '切换保存结果：分别试重试、查询结果和连续点击。',
    ],
    source: 'BusinessFormModal · AppModal · message / notification',
    consumer: { ...PURCHASE_PAGE, task: '选中采购单，查看详情或打开局部办理弹窗，核对关闭与焦点恢复。' },
  },
  {
    key: 'components',
    title: '组件选用',
    summary: '按用途查正式入口与复用边界',
    description: '从当前实现约定查找基础控件、共享交互、业务组合和打印组件，再进入对应样例。',
    rules: [],
    source: SHARED_COMPONENT_SEARCH_TEXT,
  },
  {
    key: 'business-form',
    title: '业务表单与明细',
    summary: '整页编辑、校验与离开保护',
    description: '直接使用整页表单与明细组合，编辑本地草稿，核对增删、长文本、校验、离开保护和保存恢复。',
    rules: [
      ['完整单据编辑', 'BusinessFormPage / BusinessFormSection', '保留输入、分区与返回上下文；局部专项动作使用 BusinessFormModal。'],
      ['草稿明细', 'BusinessLineItemsSection / BusinessGroupedLineItems / BusinessLineItemRow', '共享业务归组、展开收起、增删与错误定位；折叠保留整单字段，来源、校验与保存由调用方负责。'],
      ['明细表头', 'BusinessLineTable', '普通明细、紧凑字段明细与联系人共用列头、必填标记、列宽、滚动和圆角外框；业务组件仅维护字段布局。'],
      ['行操作', 'BusinessLineItemActionButton', '复制和移除使用同一标准描边规格，移除使用危险色；权限、禁用、确认及回调继续由业务组件负责。'],
      ['备注', 'BusinessTextArea', '所有备注至少两行起步、随内容增高，明细同样适用；普通表单显示已输入字数与字段上限，查看时不显示计数。'],
      ['失败与离开', '原表单继续编辑', '失败保留输入；未保存离开须确认。演示保存只更新内存，不代表业务提交或过账。'],
    ],
    checks: [
      '打开草稿，核对整单与明细备注至少两行；输入多行再清空，检查高度和计数恢复。清空名称保存，核对字段错误。',
      '关闭草稿后切换普通明细、紧凑字段明细与联系人，核对表头、外框、复制与移除规格；联系人复制不复制主联系人身份。',
      '移除明细查看空态，再添加；修改后返回列表，先继续编辑，再放弃修改。',
      '选择首次失败后重试，编辑并保存；核对输入保留及重试结果。',
    ],
    source: 'BusinessFormPage · BusinessFormSection · BusinessLineItemsSection · BusinessLineItemRow · BusinessLineTable · BusinessLineItemActionButton · ContactFormList · BusinessTextArea · DateInput',
    consumer: { ...PURCHASE_PAGE, task: '打开新建或编辑，核对整页表单、材料明细与返回列表；浏览验证无需保存真实单据。' },
  },
  {
    key: 'source-picker',
    title: '来源选择',
    summary: '搜索、跨页多选与关闭恢复',
    description: '使用正式来源选择弹窗操作本地材料清单，核对搜索、跨页选择、停用限制、空态和读取恢复。',
    rules: [
      ['批量选择来源', 'SourceImportPickerModal', '只负责搜索、分页、选择与确认；字段映射、去重和业务写入由调用方维护。'],
      ['大量远程资料', 'RemoteReferencePicker / RemoteReferenceSelect', '沿用正式读取、分页、取消与有效权限；本地小清单不能证明远程加载或授权正确。'],
      ['停用、加载与失败', '禁用对应选择或确认', '限制说明保持可见；失败保留上次清单，重新加载后才继续。'],
      ['关闭与清空', '选择草稿与已确认结果分开', '取消不覆盖已确认结果，重新打开清空临时选择；显式清空结果后不自动回选。'],
    ],
    checks: [
      '选择第一页和第二页的材料，核对已选汇总；停用材料不可选。',
      '输入关键词后搜索，再清空筛选；取消后重新打开，确认临时选择已清空。',
      '加载时确认不可用；空列表或读取失败时重新加载，再确认并清空结果。',
    ],
    source: 'SourceImportPickerModal · BusinessModal · SearchInput · AppTable · AppPagination；远程消费者：RemoteReferencePicker / RemoteReferenceSelect',
    consumer: { ...PURCHASE_PAGE, task: '进入编辑页的“从材料库添加”，核对远程搜索、跨页选择与清空；取消返回，不提交业务数据。' },
  },
  {
    key: 'business-toolbar',
    title: '业务工具栏组合',
    summary: '采购与生产对照、职责标注与增长场景',
    description: '先操作采购与生产的并排样例，比较查看角度与办理职责如何决定页签位置；再核对库存、采购、待办与历史的工具栏组合。',
    rules: [
      ['入口层级', '独立办理入口靠标题，同业务分类靠查询', '采购在同一批订单中切换列表与跟进；生产切换计划、执行、记录与处置，各自有业务对象、职责和操作。'],
      ['内容分类', '少量稳定分类直达，较多分类搜索选择', '内容由业务决定；页内分类使用查询区左侧的下划线页签，切换保持挂载。'],
      ['同范围展示', '明细 / 分布、列表 / 日历按需出现', '展示方式与业务内容分类、快捷条件分开。'],
      ['查询、工具与主动作', '共用插槽与交互，按任务组合', '保留搜索提交、筛选、列设置和选中操作；职责名称只在设计中标注。'],
      ['功能与数据增长', '分别切换两种假设场景', '扩展分类是假设，30 个数据选项进入搜索筛选，不自动变成导航。'],
    ],
    checks: [
      '对照采购与生产：切换全部页签、搜索并查看记录，核对导航位置、办理职责与各视图的搜索恢复。',
      '切换两种增长场景，搜索分类或第 30 个数据选项；关闭职责标注比较实际布局。',
      '往返四种业务，查看详情、翻页、调整列和导出；恢复示例后回到初始状态。',
    ],
    source: 'BusinessToolbarWorkspace · BusinessOperationPanel · BusinessDataTable · BusinessViewSwitch · BusinessStatusFilter · ColumnOrderModal；规范：交互设计说明 #business-toolbar-composition',
    consumer: { ...PURCHASE_PAGE, task: '对照库存查询、采购订单、工作台和历史记录；此样例仅使用本地虚构数据，业务权限与提交由真实页面负责。' },
  },
  {
    key: 'pagination',
    title: '列表与分页',
    summary: '翻页、条数与读取恢复',
    description: '表格内分页与独立分页使用同一套控件；切换样例数据和读取状态，核对当前记录与分页结果。',
    rules: [
      ['表格内分页', 'AppTable', '表格统一接入公共分页配置，页面只提供当前页、总数和读取动作。'],
      ['独立分页', 'AppPagination', '复用尺寸、翻页图标、范围文案和窄屏模式；固定批次可关闭条数选择。'],
      ['条数与筛选', '回到第一页', '每页条数按接口支持的范围配置；改变范围时重新读取，避免保留失效页码。'],
      ['加载与失败', '禁用分页，保留当前内容', '加载中不重复翻页；失败由调用方提示并重试，已读取内容和当前页保留。'],
      ['手机任务', '连续加载', '手机任务列表沿用分批续取，不改为电脑页码导航。'],
    ],
    checks: [
      '翻到第二页，再修改每页条数，核对首项与范围回到第一页。',
      '切换表格内与独立分页，再试单页、空列表和恢复初始内容。',
      '切换加载中与加载失败，核对禁用、内容保留和重试恢复。',
    ],
    source: 'common/components/pagination/AppPagination · common/components/table/AppTable · common/utils/pagination.mjs',
    consumer: { ...MATERIAL_PAGE, task: '操作主列表的页码、每页条数和筛选，核对记录范围与读取恢复。' },
  },
  {
    key: 'inputs',
    title: '基础输入',
    summary: '文本、备注、选择与项目主题',
    description: 'Button、Input 继承项目主题；下拉统一使用 AppSelect / FilterSelect，选中后保留用途，清空后恢复提示。',
    rules: [
      ['普通文本与枚举', 'Input / AppSelect', '字段有明确提示和可见用途；可编辑值支持清空，必填仍由表单校验。'],
      ['占位提示', '简短且适合控件宽度', '标签说明填写对象，占位提示只提供短示例或操作提示；不按统一字数机械截断。'],
      ['关键规则', '字段或明细区常显一次', '金额计算、留空含义和提交条件在输入后仍可查看；同一组明细不逐行重复说明。'],
      ['补充帮助', 'BusinessHelpLabel', '需要额外解释时使用 ⓘ 原位查看，支持点击、键盘和触摸；含义清楚的字段保持简洁。'],
      ['普通备注', 'BusinessTextArea', '两行起步、自动增高，显示字数与字段上限；清空恢复初始高度，只读或禁用时隐藏计数。'],
      ['搜索与业务筛选', 'SearchInput / FilterSelect / SelectFilter', '搜索框用短提示点明主要对象，完整范围在聚焦时显示，提交、取消或失焦后收起；清空取消条件，下拉菜单不添加“全部……”占位项。'],
      ['领域选择', '已有来源或主数据选择器', '读取、搜索和来源快照合同由领域组件承接。'],
    ],
    checks: ['修改名称和类别，核对当前结果；输入多行备注，观察字数和高度。', '清空内容，再恢复初始值。', '切换禁用与错误，核对值保留、计数和状态外观。'],
    source: 'antd: Button / Input · BusinessTextArea · common/components/select · common/theme/erpAntdTheme.mjs · erp/styles/app/control-*.css',
    consumer: { ...MATERIAL_PAGE, task: '打开新建或编辑，核对字段输入、选择、清空与禁用；取消返回。' },
  },
  {
    key: 'help',
    title: '补充说明',
    summary: '信息图标、悬停、键盘与点按',
    description: '直接操作统一说明气泡，比较短说明、效果示意与完整页面帮助。',
    rules: [
      ['字段、选项、口径与范围', 'ⓘ 补充说明', '悬停或键盘聚焦查看，点击固定；再次点击、外部点击或 Esc 收起，同一时刻只显示一处。'],
      ['短说明与效果比较', '同一气泡，按内容组织', '短说明只放文字，需要比较时才给示意；查看说明不修改字段或保存外观。'],
      ['页面帮助与警告', '保留完整帮助和原有反馈', '页面帮助继续打开完整说明，警告保持可见；补充说明的 Esc 不关闭外层弹窗。'],
    ],
    checks: [
      '悬停或 Tab 聚焦备注旁的 ⓘ，点击固定后再点一次收起。',
      '切换查看密度示意；在弹窗中打开说明，按 Esc，核对弹窗和草稿保留。',
      '打开页面帮助，核对完整内容；警告不随说明开关隐藏。',
    ],
    source: 'SupplementalHelp · BusinessHelpLabel · ERPAppearanceHelp；规范：交互设计说明 #input-hints',
    consumer: { ...TASK_PAGE, task: '在任务详情查看进度或处理记录的范围说明，再核对字段说明、完整页面帮助和原有警告。' },
  },
  {
    key: 'grouped-select',
    title: '分组下拉',
    summary: '分类标题、组内选项与选中标记',
    description: '用共享选择框区分分类与可选项，核对单选、多选、搜索、清空和禁用状态。',
    rules: [
      ['分类标题', '中性底色与组间留白', '标题不可选择、不参与方向键定位；保持可读字号，不使用选项的悬停或选中外观。'],
      ['组内选项', '缩进与常规字重', '选项比分类标题向右缩进 18px；选中后使用高亮、较强字重和勾选标记。'],
      ['什么时候分组', '已有稳定业务分类', '适用于来源类型、定义分类与岗位候选；短枚举保持平铺，远程资料按原搜索和分页合同读取。'],
      ['分类来源', '领域选项构造器', '分类由页面业务数据提供；共享控件只负责呈现，不从名称猜分类，不改变权限或可选范围。'],
    ],
    checks: [
      '打开单选和多选，一眼区分浅底分类标题、缩进选项与当前勾选。',
      '点击分类标题、尝试禁用项，再用方向键选择；标题和禁用项不能成为选中值。',
      '搜索采购、尝试无结果，再清空和重新选择；切换浅深主题并核对窄窗口。',
    ],
    source: 'AppSelect · historySourceSelectOptions · control-foundation.css；规范：交互设计说明 #grouped-select-options',
    consumer: { ...HISTORY_PAGE, task: '展开记录类型，核对基础资料与业务单据两类，以及搜索、清空和选择后的结果。' },
  },
  {
    key: 'select-overflow',
    title: '长值与多列',
    summary: '名称优先、候选识别与明细横向滚动',
    description: '使用正式选择框和明细表，体验长名称、导入锁定值及列数增加后的读取与填写。',
    rules: [
      ['业务引用', 'AppSelect · 明细单元格', '选中后显示名称，编码、规格、厂商等保留在候选项；长名称完整换行，短枚举与筛选保持紧凑。'],
      ['搜索与选项', '独立浮层宽度', '可搜索单选默认提供较宽选项层，长名称换行；已有专用宽度和远程选择合同优先。'],
      ['多列明细', 'BusinessLineItemsTable', '按任务分配最小列宽；列数增加只在明细区域横向滚动，不压缩所有输入。'],
      ['锁定与清空', '读取和编辑分开', '锁定名称直接阅读；清空或更换值后同步更新，不改变业务权限。'],
    ],
    checks: [
      '先核对已选名称完整显示、没有附加编码行，再展开候选核对识别信息；短名称恢复正常框高。',
      '搜索仓库后选择，再清空；核对原批次同时清空，完整值不残留。',
      '切换长名称、窄区域和增加 4 列，横向查看右侧字段；恢复初始内容后继续填写。',
    ],
    source: 'AppSelect · useSelectPopupWidth · BusinessLineItemsTable · control-foundation.css',
    consumer: { ...getBusinessPagePresentation('shipments'), task: '打开出货编辑页，核对产品、SKU、仓库、批次的完整值与明细横向滚动；无需保存真实单据。' },
  },
  {
    key: 'dates',
    title: '日期与时间',
    summary: '日期、分钟与范围约束',
    description: '直接操作正式日期组件；正常、禁用与错误切换作用于上方两个输入，范围示例单独展示日期类型与起止约束。',
    rules: [
      ['单个日期', 'DateInput', '整框打开日历，选值立即回填，清空后保留空值。'],
      ['日期时间', 'DateTimeInput', '分钟选择即时生效；快捷截止沿用跟进任务的同一构造函数。'],
      ['起止筛选', 'DateRangeFilter', '组件组合日期类型与起止日期，限制倒置选择；已有倒置值保留错误提示并允许清空。'],
    ],
    checks: ['选择日期和分钟，核对下方值即时变化。', '使用截止快捷项，再切换禁用和错误。', '切换日期类型，查看倒置范围并清空、重置。'],
    source: 'erp/components/business-list/BusinessDateInputs.jsx · erp/utils/dateRange.mjs · erp/utils/workflowTaskTiming.mjs',
    consumer: { ...PURCHASE_PAGE, task: '核对列表日期范围，以及编辑页下单、到货日期的选择和清空。' },
  },
  {
    key: 'navigation',
    title: '页签与视图',
    summary: '区分页签、分段与筛选',
    description: '先看点击后是换视图、选入口或展示方式，还是缩小结果。只有页签分一级、二级。',
    rules: [
      ['页签', '细下划线', '切换办理、内容或查询视图；一级靠标题，二级留在所属内容区，查询页签可与搜索同排。'],
      ['分段选择', '共用圆角底轨', '选择工作入口、展示方式或设置，例如电脑版 / 手机版、余额明细 / 仓库分布。'],
      ['筛选', '独立圆角按钮', '缩小当前结果，例如库存批次的可用 / 冻结。有数量就显示；上下文明确时无需另加组名。'],
    ],
    checks: [
      '切到关联任务：订单身份保持不变。',
      '点手机版和冻结：一个换工作入口，一个只缩小批次结果。',
      '用方向键和快速反向切换，核对禁用项与减少动态效果。',
    ],
    source: 'SlidingTabs · SlidingTabList · SlidingSegmented · FilterChip · control-affordance.css；规范：交互设计说明 #business-toolbar-composition',
    consumer: { ...TASK_PAGE, task: '切换待办、已办和流程跟踪，核对页签保持挂载及当前内容。' },
  },
  {
    key: 'filters',
    title: '筛选与搜索',
    summary: '缩小同一份结果',
    description: '点状态、提交关键词或改变范围，观察同一份虚构记录如何变化。',
    rules: [
      [
        '常用条件',
        '带数量的筛选按钮',
        '直接看见队列与当前条件，数量不是第二个按钮。',
      ],
      ['手机快捷项', '32px 外观 / 至少 44px 触区', '保留字号、圆角矩形与数量底色；上下透明区域可点击，窄屏在同一行横向滑动。'],
      [
        '单号 / 产品 / 负责人',
        '一个主搜索',
        '点击搜索或按 Enter 提交；手机聚焦展开，提交后立即收起，清除后仍可继续输入。',
      ],
      [
        '少量次级条件',
        '按钮下方的轻量浮层',
        '覆盖内容，选择立即生效，不挤动列表。',
      ],
      ['重置筛选', '只恢复范围', '保留关键词；清除搜索由输入框单独处理。'],
    ],
    checks: [
      '选择逾期：结果与数量一起变化。',
      '输入期间结果不变；提交不存在的关键词后，出现无结果与清除入口。',
      '改变范围再重置：搜索词保持，其他页面条件不变。',
    ],
    source: 'FilterChip · HorizontalScroll · MobileSearchInput · Popover',
    consumer: { ...TASK_PAGE, task: '组合任务范围与关键词，再清空和返回，核对当前条件及结果。' },
  },
  {
    key: 'actions',
    title: '按钮与动作',
    summary: '主次、禁用与执行反馈',
    description: '同一组突出一个主动作，文字、状态与反馈共同说明点击的结果。',
    rules: [
      ['主要提交', '实心主按钮', '一组只强调一个最重要动作。'],
      ['刷新 / 返回', '描边按钮', '可操作但不抢主次；图标配有名称。'],
      ['低频辅助', '文字按钮', '降低视觉重量，保留键盘焦点。'],
      [
        '执行中 / 不可用',
        '加载 / 禁用',
        '防止重复操作；危险确认在“弹窗与反馈”中体验。',
      ],
    ],
    checks: [
      '用 Tab 定位保存，再按 Enter。',
      '点击刷新与取消：就地看到各自结果。',
      '禁用项不触发；加载项保留原按钮尺寸。',
    ],
    source: 'Ant Design Button · control-affordance.css',
    consumer: { ...PURCHASE_PAGE, task: '比较未选、已选和只读记录的操作入口；动作权限与状态由真实页面决定。' },
  },
  {
    key: 'empty',
    title: '页面状态',
    summary: '空提示规格、加载与恢复',
    description: '比较列表、表单和下拉的空提示，操作手机任务与电脑切页样例，核对读取、失败与权限反馈。',
    rules: [
      ['手机首次读取', '卡片骨架', '复用任务卡片布局，保留页签与筛选；未知数量不显示为零。'],
      ['栏目首次读取', '列表区等待', '不混入其他栏目的记录；页签保持挂载。'],
      ['同一查询刷新', '保留已有内容', '保留选择和滚动；失败时保留上次结果并明确提示尚未更新。'],
      ['电脑切页', '内容区等待', '使用共享 Loading，主导航始终可操作。'],
      ['尚无记录', '中性空状态', '没有风险，不显示黄色警告框。'],
      ['筛选未命中', '保留条件 + 清除入口', '让用户理解当前范围，继续调整。'],
      ['读取失败', '错误 + 重试', '不能伪装成空记录，也不能丢失查询上下文。'],
      ['列表与独立内容区', 'AppEmpty 默认规格', '居中图标和场景文案；仅在有真实恢复能力时提供清除或新建。'],
      ['表单内部', 'AppEmpty inline', '左对齐文字，默认左右 12px，与明细操作区对齐。'],
      ['下拉候选', 'AppEmpty compact', '保留搜索与选择，失败提供重新读取，无权限单独说明。'],
    ],
    checks: [
      '切换首次加载、栏目读取和刷新，完成读取后比较卡片与页签的位置。',
      '选择一张卡片后刷新并模拟失败；核对选择保留、重试和清除条件。',
      '选择电脑切页，在等待期间点击另一导航；手机样例可切换宽度和外观。',
    ],
    source: 'AppEmpty · AppTable · AppSelect · MobileTaskListContent · MobileTaskListSkeleton · WorkflowTaskCard · Loading / Alert',
    consumer: { ...TASK_PAGE, task: '切换任务范围并刷新，核对内容区等待与恢复；手机组件另在岗位任务端核对。' },
  },
  {
    key: 'counts',
    title: '数字提醒',
    summary: '有待办才提示，点开范围一致',
    description: '菜单数字帮助发现待办；办理后更新，打开页面不会清零。',
    rules: [
      ['任务管理', '低强调数字', '统计本人责任范围内未结束任务；同一任务只计一次。'],
      ['专门的异常入口', '风险色数字', '仅用于定义清楚的异常，不给所有模块总菜单挂红点。'],
      ['零 / 大数量', '隐藏 / 99+', '减少无效提示；悬停和读屏保留完整数量。'],
      ['读取中 / 失败', '省略号 / 待更新', '失败保留上次数量并标记；未知不能显示成零。'],
    ],
    checks: [
      '打开任务管理样例：清单与数字一致，浏览不清零。',
      '办理一项：清单和数字一起减少，归零后隐藏。',
      '切换大数量、读取中和失败，核对显示及重试。',
    ],
    source: 'NavigationCountBadge · 服务端任务管理总数',
    consumer: { ...TASK_PAGE, task: '比较侧栏任务数字与实际清单范围，不能用演示数字判断真实待办。' },
  },
]

const RECORDS = [
  {
    number: 'SO-DEMO-01',
    product: '布偶熊',
    owner: '小林',
    risk: 'overdue',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-02',
    product: '兔子挂件',
    owner: '小陈',
    risk: 'due',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-03',
    product: '抱枕',
    owner: '小林',
    risk: 'blocked',
    scope: 'active',
  },
  {
    number: 'SO-DEMO-04',
    product: '布偶熊礼盒',
    owner: '小陈',
    risk: 'normal',
    scope: 'ended',
  },
]
const RISK_LABELS = {
  overdue: '已逾期',
  due: '7天内到期',
  blocked: '任务受阻',
  normal: '已结束',
}

function CountExample() {
  const [count, setCount] = useState(3)
  const [state, setState] = useState('ready')
  const [opened, setOpened] = useState(false)
  return (
    <div className="erp-control-example-stack">
      <SlidingSegmented
        aria-label="数字提醒状态"
        value={state}
        onChange={(value) => {
          setState(value)
          setCount(value === 'large' ? 128 : value === 'zero' ? 0 : 3)
        }}
        options={[
          { label: '3 项', value: 'ready' },
          { label: '零项', value: 'zero' },
          { label: '大数量', value: 'large' },
          { label: '读取中', value: 'loading' },
          { label: '失败', value: 'error' },
        ]}
      />
      <Button className="erp-control-count-entry" onClick={() => setOpened(true)}>
        任务管理
        <NavigationCountBadge count={state === 'loading' ? null : count} loading={state === 'loading'} error={state === 'error'} />
      </Button>
      {state === 'error' && <Button onClick={() => setState('ready')}>重新读取数量</Button>}
      {opened && (
        <div className="erp-control-count-list" aria-label="待我处理样例">
          <h3>待我处理 · {state === 'loading' ? '读取中' : `${count} 项${state === 'error' ? '（待更新）' : ''}`}</h3>
          {state !== 'loading' && count > 0 ? (
            <>
              <ol>
                {['核对样品尺寸', '确认面料到货', '处理包装阻塞'].slice(0, count).map((label) => <li key={label}>{label}</li>)}
              </ol>
              {count > 3 && <p>其余 {count - 3} 项 · 数量不受当前展示条数限制</p>}
              <Button disabled={state === 'error'} onClick={() => setCount((value) => value - 1)}>办理一项</Button>
            </>
          ) : state !== 'loading' ? <Empty description="当前没有待办" /> : <p>等待读取结果，不展示零项。</p>}
        </div>
      )}
      <div className="erp-control-count-comparison">
        <span>普通待办 <NavigationCountBadge count={3} /></span>
        <span>明确风险 <NavigationCountBadge count={3} risk label="风险任务" /></span>
      </div>
    </div>
  )
}

const NAVIGATION_ENTRY_OPTIONS = [
  { label: '电脑版', value: 'desktop' },
  { label: '手机版', value: 'mobile' },
]

const NAVIGATION_BATCH_FILTERS = [
  { label: '不限状态', value: 'all', count: 5 },
  { label: '可用', value: 'available', count: 3 },
  { label: '冻结', value: 'frozen', count: 2 },
]

function NavigationExample() {
  const [view, setView] = useState('orders')
  const [trackingView, setTrackingView] = useState('progress')
  const [entry, setEntry] = useState('desktop')
  const [batchFilter, setBatchFilter] = useState('all')
  const currentBatchFilter = NAVIGATION_BATCH_FILTERS.find(({ value }) => value === batchFilter)
  return (
    <div className="erp-control-example-stack">
      <section aria-label="三类控件对照">
        <h3>① 三类控件对照</h3>
        <div className="erp-control-navigation-comparison">
          <div>
            <h4>页签 · 切换订单内容</h4>
            <div className="erp-control-example-context">订单 SO-DEMO · 同一张订单</div>
            <SlidingTabs
              aria-label="订单详情样例"
              items={[
                {
                  key: 'products',
                  label: '产品明细',
                  children: (
                    <dl className="erp-control-example-values">
                      <div>
                        <dt>产品</dt>
                        <dd>布偶熊</dd>
                      </div>
                      <div>
                        <dt>规格</dt>
                        <dd>20 cm</dd>
                      </div>
                      <div>
                        <dt>数量</dt>
                        <dd>120 件</dd>
                      </div>
                    </dl>
                  ),
                },
                {
                  key: 'tasks',
                  label: '关联任务',
                  children: (
                    <p>
                      当前：关联任务。订单身份仍在原位置。
                      <br />
                      核对包装样例 · 待处理
                    </p>
                  ),
                },
                { key: 'unavailable', label: '无权限', disabled: true },
              ]}
            />
          </div>
          <div>
            <h4>分段选择 · 选工作入口</h4>
            <div className="erp-control-example-context">登录页 · 选择进入哪个界面</div>
            <SlidingSegmented
              aria-label="登录工作入口样例"
              value={entry}
              onChange={setEntry}
              options={NAVIGATION_ENTRY_OPTIONS}
            />
            <p role="status">示例入口：{entry === 'desktop' ? '电脑版' : '手机版'}</p>
          </div>
          <div>
            <h4>筛选 · 缩小批次结果</h4>
            <div className="erp-control-example-context">库存批次 · 同一类记录</div>
            <FilterChipGroup
              aria-label="库存批次状态样例"
              value={batchFilter}
              onChange={setBatchFilter}
              options={NAVIGATION_BATCH_FILTERS}
            />
            <p role="status">库存批次：{currentBatchFilter.label}，共 {currentBatchFilter.count} 条（示例）</p>
          </div>
        </div>
      </section>
      <div>
        <h3>② 进度工作区，切换内容</h3>
        <SlidingTabList
          aria-label="进度视图样例"
          value={view}
          onChange={setView}
          options={[
            { label: '订单交付', value: 'orders' },
            { label: '生产执行', value: 'production' },
          ]}
        />
        <p role="status">
          当前查看：{view === 'orders' ? '订单交付' : '生产执行'}
        </p>
        <dl className="erp-control-example-values">
          {(view === 'orders'
            ? [
                ['订购', '120 件'],
                ['已交付', '80 件'],
                ['待交付', '40 件'],
              ]
            : [
                ['裁剪', '120 件'],
                ['车缝', '100 件'],
                ['充棉', '80 件'],
              ]
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3>③ 同一工作下的第二层内容</h3>
        <SlidingTabList
          aria-label="二级导航样例"
          value={trackingView}
          onChange={setTrackingView}
          options={[
            { label: '流程进度', value: 'progress' },
            { label: '异常跟踪', value: 'exceptions' },
          ]}
        />
        <p>
          当前查看：{trackingView === 'progress' ? '流程进度' : '异常跟踪'}。
          内容导航保留下划线：两种状态均使用 500 字重，2px 主题线随当前位置连续移动。
          手机页面左右保留 12px，层间留白 4–8px，点击区域至少 44px；
          完整布局与“我的”岗位切换见手机版任务样例。
        </p>
      </div>
    </div>
  )
}

function demoRiskAvailable(risk, scope) {
  const due = risk === 'due' ? 'due_soon' : risk
  const query = progressQueryFromURL(new URLSearchParams({
    scope,
    due_status: risk === 'blocked' ? 'all' : due,
    blocked_only: String(risk === 'blocked'),
  }))
  return risk === 'blocked' ? query.blocked_only : query.due_status === due
}

function FiltersExample() {
  const [device, setDevice] = useState('desktop')
  const [risk, setRisk] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useState('active')
  const [open, setOpen] = useState(false)
  const matching = RECORDS.filter(
    (row) =>
      (scope === 'all' || row.scope === scope) &&
      `${row.number} ${row.product} ${row.owner}`
        .toLowerCase()
        .includes(keyword.trim().toLowerCase())
  )
  const rows = matching.filter((row) => risk === 'all' || row.risk === risk)
  const scopeLabel = PROGRESS_SCOPE_OPTIONS.find(
    ({ value }) => value === scope
  )?.label
  const mobile = device === 'mobile'
  const FilterRow = mobile ? HorizontalScroll : 'div'
  const quickFilters = (
    <FilterRow
      key="filters"
      className="erp-control-example-row"
      role="group"
      aria-label="演示风险筛选"
    >
      {['all', 'overdue', 'due', 'blocked'].map((key) => (
        <FilterChip
          key={key}
          selected={risk === key}
          disabled={
            !demoRiskAvailable(key, scope)
          }
          count={
            key === 'all'
              ? matching.length
              : matching.filter((row) => row.risk === key).length
          }
          onClick={() => setRisk(key)}
        >
          {key === 'all' ? scopeLabel : RISK_LABELS[key]}
        </FilterChip>
      ))}
      <FilterChip disabled>暂不可用</FilterChip>
    </FilterRow>
  )
  const searchControls = (
    <div key="search" className="erp-control-example-search erp-mobile-controls erp-mobile-search-row">
      <MobileSearchInput
        aria-label="演示搜索"
        placeholder="单号、产品、负责人"
        value={keyword}
        onSearch={setKeyword}
        onFocus={() => setOpen(false)}
      />
      <Popover
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomRight"
        arrow={false}
        classNames={{
          root: 'erp-control-example-popover erp-mobile-controls',
        }}
        content={
          <div className="erp-control-example-options">
            <fieldset>
              <legend>演示记录范围</legend>
              <FilterChipGroup
                aria-label="演示记录范围"
                value={scope}
                onChange={(nextScope) => {
                  setScope(nextScope)
                  if (
                    !demoRiskAvailable(risk, nextScope)
                  ) setRisk('all')
                }}
                options={PROGRESS_SCOPE_OPTIONS}
              />
            </fieldset>
            <Button type="text" block onClick={() => setScope('active')}>
              重置筛选
            </Button>
          </div>
        }
      >
        <button
          type="button"
          className="erp-control-button"
          aria-expanded={open}
          data-active={scope !== 'active'}
        >
          <FilterOutlined aria-hidden="true" />
          筛选
          {scope !== 'active' && <span className="erp-control-count">1</span>}
          <DownOutlined aria-hidden="true" />
        </button>
      </Popover>
    </div>
  )
  return (
    <div className="erp-control-example-stack">
      <SlidingSegmented
        aria-label="筛选样例设备"
        value={device}
        onChange={(next) => {
          setDevice(next)
          setOpen(false)
        }}
        options={[
          { label: '电脑', value: 'desktop' },
          { label: '手机', value: 'mobile' },
        ]}
      />
      <div className={`erp-control-filter-preview${mobile ? ' erp-mobile-controls erp-control-filter-preview--mobile' : ''}`}>
        {mobile ? searchControls : quickFilters}
        {mobile ? quickFilters : searchControls}
      </div>
      <p role="status">
        样例结果：{rows.length} 条 · 搜索：{keyword || '未输入'} · 范围：
        {{ active: '在执行', all: '全部记录', ended: '已结束' }[scope]}
      </p>
      {rows.length ? (
        <div className="erp-control-table-scroll">
          <table className="erp-control-table" data-table-lines="appearance">
            <thead>
              <tr>
                <th>单号</th>
                <th>产品</th>
                <th>负责人</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.number}>
                  <td>{row.number}</td>
                  <td>{row.product}</td>
                  <td>{row.owner}</td>
                  <td>{RISK_LABELS[row.risk]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty description="没有符合条件的记录">
          <Button
            onClick={() => {
              setKeyword('')
              setRisk('all')
              setScope('active')
            }}
          >
            清除条件
          </Button>
        </Empty>
      )}
    </div>
  )
}

function ActionsExample() {
  const [message, setMessage] = useState('选择一个动作，查看就地反馈。')
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row">
        <Button
          type="primary"
          onClick={() => setMessage('演示反馈：已保存。没有写入业务数据。')}
        >
          保存
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setMessage('演示反馈：已刷新。')}
        >
          刷新
        </Button>
        <Button
          type="text"
          onClick={() => setMessage('演示反馈：已取消当前操作。')}
        >
          取消
        </Button>
        <Button disabled>无可操作记录</Button>
        <Button loading>保存中</Button>
      </div>
      <div className="erp-control-example-result" role="status">
        {message}
      </div>
      <div className="erp-control-action-legend">
        <span>主动作：实心</span>
        <span>次动作：描边</span>
        <span>辅助动作：文字</span>
      </div>
    </div>
  )
}

export default function DevControlStandards() {
  const [params, setParams] = useSearchParams()
  const { accent, appearance, effectiveTheme } = useERPTheme()
  const [mode, setMode] = useState(effectiveTheme)
  const current =
    TOPICS.find((topic) => topic.key === params.get('control')) || TOPICS[0]
  const query = params.get('controlq') || ''
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const matches = TOPICS.filter((topic) =>
    words.every((word) =>
      `${topic.title} ${topic.summary} ${topic.description} ${topic.rules.flat().join(' ')} ${topic.source}`
        .toLowerCase()
        .includes(word)
    )
  )
  const contentRef = useRef(null)
  const directoryRef = useRef(null)
  const update = (values) => {
    const next = new URLSearchParams(window.location.search)
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key)
    )
    setParams(next, {
      replace:
        Object.hasOwn(values, 'controlq') && !Object.hasOwn(values, 'control'),
    })
  }
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [current.key])
  const isNavigation = current.key === 'navigation'
  const rules = (
    <section className="erp-control-library-rules">
      <h3>{isNavigation ? '导航与切换控件' : '什么时候用，为什么这样设计'}</h3>
      <div className="erp-control-table-scroll">
        <table className="erp-control-table" data-table-lines="fixed">
          <thead>
            <tr>
              <th>场景</th>
              <th>设计选择</th>
              <th>原因与边界</th>
            </tr>
          </thead>
          <tbody>
            {current.rules.map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isNavigation || current.key === 'business-toolbar' ? (
        <p>
          {isNavigation ? (
            <>
              <Link to="/__dev/ui-design?page=controls&control=business-toolbar">库存工具栏样例</Link>
              {' · '}
              <Link to="/__dev/ui-design?page=login">登录页样例</Link>
              {' · '}
            </>
          ) : null}
          <Link to="/__dev/ui-design?view=specification&read=reference#business-toolbar-composition">
            页签层级与上下间距规范
          </Link>
        </p>
      ) : null}
    </section>
  )

  return (
    <section className="erp-control-library" aria-label="控件设计">
      <aside className="erp-control-library-directory" ref={directoryRef}>
        <SearchInput
          aria-label="搜索控件设计"
          placeholder="控件或场景"
          searchHint="可搜索：控件名称、使用场景、复用边界"
          value={query}
          allowClear
          onSearch={(value) => update({ controlq: value })}
        />
        <nav aria-label="控件设计目录">
          {matches.map((topic) => (
            <button
              key={topic.key}
              type="button"
              className="erp-dev-directory-item"
              aria-current={current.key === topic.key ? 'page' : undefined}
              onClick={() => update({ control: topic.key, controlq: '' })}
            >
              <span>
                <strong>{topic.title}</strong>
                <small>{topic.summary}</small>
              </span>
            </button>
          ))}
          {!matches.length && (
            <div className="erp-control-library-no-results">
              <p>没有匹配的控件</p>
              <Button
                onClick={() => {
                  update({ controlq: '' })
                  directoryRef.current?.querySelector('input')?.focus()
                }}
              >
                清除搜索
              </Button>
            </div>
          )}
        </nav>
        <p className="erp-control-library-note">
          选择用途 → 操作样例 → 核对规则
        </p>
      </aside>
      <div className="erp-control-library-content" ref={contentRef}>
        <header className="erp-control-library-heading">
          <div>
            <h2>{current.title}</h2>
            <p>{current.description}</p>
          </div>
          <div className="erp-control-library-theme">
            {current.key !== 'components' && (
              <>
                <span>样例外观</span>
                <SlidingSegmented
                  aria-label="控件样例主题"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { label: '浅色', value: 'light' },
                    { label: '深色', value: 'dark' },
                  ]}
                />
              </>
            )}
          </div>
        </header>
        {current.key === 'components' ? (
          <DevSharedComponentGuide topics={TOPICS} />
        ) : (
          <>
            {isNavigation ? rules : null}
            <div className={`erp-control-library-layout${current.key === 'business-toolbar' ? ' erp-control-library-layout--toolbar' : ''}`}>
              <section
                className="erp-control-library-demo"
                aria-label="交互样例"
              >
                <div className="erp-control-library-caption">
                  <strong>交互样例</strong>
                  <span>本地虚构数据 · 可反复操作</span>
                </div>
                <ERPThemeScope
                  mode={mode}
                  accent={accent}
                  density={appearance.density}
                  workbench
                  className="erp-control-library-stage"
                >
                  {current.key === 'help' ? (
                    <DevSupplementalHelpExample />
                  ) : current.key === 'counts' ? (
                    <CountExample />
                  ) : current.key === 'feedback' ? (
                    <DevUIFeedbackExamples />
                  ) : current.key === 'navigation' ? (
                    <NavigationExample />
                  ) : current.key === 'filters' ? (
                    <FiltersExample />
                  ) : current.key === 'actions' ? (
                    <ActionsExample />
                  ) : current.key === 'inputs' ? (
                    <BasicInputExample />
                  ) : current.key === 'grouped-select' ? (
                    <GroupedSelectExample />
                  ) : current.key === 'select-overflow' ? (
                    <DevSelectValueExample />
                  ) : current.key === 'dates' ? (
                    <DateInputExample />
                  ) : current.key === 'pagination' ? (
                    <DevUIPaginationExample />
                  ) : current.key === 'business-toolbar' ? (
                    <Suspense fallback={<Loading title="正在加载组件示例" />}>
                      <DevUIBusinessToolbarExample />
                    </Suspense>
                  ) : current.key === 'business-form' || current.key === 'source-picker' ? (
                    <Suspense fallback={<Loading title="正在加载组件示例" />}>
                      <DevUIBusinessExamples key={current.key} type={current.key} />
                    </Suspense>
                  ) : (
                    <DevUIPageStateExamples />
                  )}
                </ERPThemeScope>
              </section>
              <aside className="erp-control-library-checks">
                <h3>按这 {current.checks.length} 步核对</h3>
                <ol>
                  {current.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ol>
                <h3>真实页面核对</h3>
                <DevUIConsumerName consumer={current.consumer} />
                <p>{current.consumer.task}</p>
              </aside>
            </div>
            {!isNavigation ? rules : null}
            <details className="erp-dev-disclosure erp-control-library-source">
              <summary>共享实现与尺寸</summary>
              <p>{current.source}</p>
              <p>
                桌面常规控件 32–38px；手机可触区至少
                44px。页面只安排位置，外观与动效沿用共享样式；样例不写业务数据或外观偏好。
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  )
}
