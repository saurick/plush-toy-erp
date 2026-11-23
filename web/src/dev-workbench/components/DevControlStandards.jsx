import React, { Suspense, useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button, Typography } from 'antd'
import {
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
import MobileFilterPopover from '@/erp/mobile/components/MobileFilterPopover.jsx'
import MobileFilterChoices from '@/erp/mobile/components/MobileFilterChoices.jsx'
import NavigationCountBadge from '@/common/components/navigation/NavigationCountBadge'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import SearchInput from '@/common/components/SearchInput'
import { Loading } from '@/common/components/loading'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import { getBusinessPagePresentation } from '@/erp/config/businessUsabilityCatalog.mjs'
import { useERPTheme } from '@/common/theme/erpTheme'
import ERPThemeScope from '@/common/theme/ERPThemeScope'
import { BusinessOperationPanel, SearchInput as BusinessSearchInput } from '@/erp/components/business-list/BusinessListLayout.jsx'
import BusinessChainDesignPicker from './flow-state/BusinessChainDesignPicker.jsx'
import { businessChainRoleHighlight } from '../config/devBusinessChainDesignView.mjs'
import { CONTROL_USAGE_LOCATIONS } from '../config/devControlUsageLocations.mjs'
import DevUIFeedbackExamples from './DevUIFeedbackExamples.jsx'
import DevSharedComponentGuide, { DevUIConsumerName, SHARED_COMPONENT_SEARCH_TEXT } from './DevSharedComponentGuide.jsx'
import DevControlUsageTable from './DevControlUsageTable.jsx'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import DevUIDirectoryExample from './DevUIDirectoryExample.jsx'
import DevUIPaginationExample from './DevUIPaginationExample.jsx'
import DevUIPageStateExamples from './DevUIPageStateExamples.jsx'
import DevUIEmptyExamples from './DevUIEmptyExamples.jsx'
import {
  BasicInputExample,
  DateInputExample,
  GroupedSelectExample,
  SelectLongValueExample,
  SelectOperationParameterExample,
} from './DevUIInputExamples.jsx'
import {
  CountedFilterExample,
  FilterPopoverExample,
  FilterSelectExample,
  SearchInputExample,
  TableExample,
} from './DevUISingleControlExamples.jsx'
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

const COMPONENT_GUIDE = {
  key: 'components',
  title: '组件使用指南',
  description: '按用途找组件，可直接查看用法要求或打开交互样例。',
}

const TOPICS = [
  {
    key: 'business-form-modal',
    directoryGroup: 'overlays',
    title: '业务编辑弹窗',
    component: 'BusinessFormModal',
    description: '编辑一份草稿，体验字段校验、保存失败、结果未知和关闭保护。',
    usageInSample: true,
    usageRules: [
      ['标题', 'required', '写清正在办理的动作和对象，保留单据上下文。', 'header'],
      ['编辑内容', 'required', '字段和必填校验由办理事项决定。', 'body'],
      ['保存与关闭', 'default', '提供保存和退出入口，关闭后归还焦点。', 'footer'],
      ['离开保护', 'conditional', '修改后未保存，取消时先确认。', 'cancel'],
      ['保存失败', 'conditional', '保留当前输入并说明原因，可以继续编辑或重试。', 'failure'],
      ['结果未知', 'conditional', '先查询本次结果，再决定是否提交。', 'unknown'],
    ],
    checks: [
      '在用法要求中点选一个部位，核对高亮及关闭后归还的焦点。',
      '空标题保存，核对字段错误。',
      '修改后关闭，取消确认后核对输入仍在。',
      '切换保存结果，试重试、查询结果和连续点击。',
    ],
    consumer: { ...PURCHASE_PAGE, task: '选中采购单并打开局部办理弹窗，核对关闭与焦点恢复。' },
  },
  {
    key: 'app-modal',
    directoryGroup: 'overlays',
    title: '通用弹窗',
    component: 'AppModal',
    description: '在原页面上查看系统信息，体验弹窗标题、页脚和键盘关闭。',
    usageInSample: true,
    usageRules: [
      ['标题与内容', 'required', '标明当前任务，正文由调用方提供。系统信息和外观设置使用标准模式。', 'heading'],
      ['遮罩与焦点', 'default', '打开时聚焦弹窗，关闭后回到打开入口。', 'frame'],
      ['尺寸与页脚', 'optional', '按内容和任务选择尺寸与底部动作。', 'footer'],
    ],
    checks: ['打开标准弹窗，核对标题和页脚。', '按 Esc 关闭，核对焦点回到打开按钮。'],
    consumer: { title: '系统信息与外观设置', task: '从应用导航打开系统信息或外观设置，核对关闭后的焦点。' },
  },
  {
    key: 'business-modal',
    directoryGroup: 'overlays',
    title: '业务弹窗',
    component: 'BusinessModal',
    description: '在原页面上打开业务详情或预览，体验共享尺寸和关闭入口。',
    usageInSample: true,
    usageRules: [
      ['业务标题与正文', 'required', '说明当前记录和任务，正文提供所需详情或预览。', 'heading'],
      ['业务尺寸', 'default', '按任务选择共享尺寸，关闭后可继续使用来源页面。', 'frame'],
      ['带草稿的编辑', 'conditional', '需要字段校验或离开保护时使用业务编辑弹窗。', 'editor'],
    ],
    checks: ['打开预览，核对正文、标题和关闭动作。', '关闭后重新打开，核对来源仍可操作。'],
    consumer: { ...PURCHASE_PAGE, task: '查看采购详情，核对业务弹窗的标题、尺寸和关闭。' },
  },
  {
    key: 'drawer',
    directoryGroup: 'overlays',
    title: '详情抽屉',
    component: 'AppDrawer',
    description: '从侧边打开记录摘要，退出后继续查看来源。',
    usageInSample: true,
    usageRules: [
      ['标题与上下文', 'required', '说明正在查看的对象，保留来源记录的上下文。', 'heading'],
      ['侧边展开', 'default', '共享组件处理滚动、遮罩和焦点，按 Esc 可关闭。', 'frame'],
      ['宽度与附加动作', 'optional', '按内容选择宽度，只呈现当前任务所需的动作。', 'body'],
    ],
    checks: ['打开采购摘要，核对标题和内容。', '按 Esc 关闭，核对焦点和来源状态。'],
    consumer: { ...TASK_PAGE, task: '打开流程跟踪详情，核对侧边内容和关闭后的来源状态。' },
  },
  {
    key: 'alert-dialog',
    directoryGroup: 'feedback',
    title: '会话提示',
    component: 'AlertDialog',
    description: '演示桌面 ERP 登录状态失效时的提示。',
    usageInSample: true,
    usageRules: [
      ['提示名称与下一步', 'required', '说明当前会话状态，提供明确动作，例如重新登录。', 'heading'],
      ['关闭与焦点', 'default', '按 Esc 或点击遮罩可关闭，关闭后焦点回到入口。', 'frame'],
      ['补充说明', 'optional', '标题与动作不足以说明情况时提供正文。', 'message'],
      ['异步确认', 'conditional', '处理期间阻止重复点击，失败时保留提示和重试动作。', 'action'],
    ],
    checks: [
      '打开提示，核对标题和“重新登录”按钮的焦点。',
      '点击“重新登录”，核对样例关闭。',
      '分别按 Esc 和点击遮罩，核对提示关闭和焦点返回。',
    ],
    consumer: { title: '桌面 ERP 登录失效', task: '登录状态失效时，点击“重新登录”进入登录页。' },
  },
  {
    key: 'feedback',
    directoryGroup: 'patterns',
    title: '操作反馈',
    summary: '复制成功提示',
    description: '对照短提示（Toast）、可关闭的复制提示、持续通知和原处恢复。',
    usageRules: [
      ['操作结果', 'required', '用岗位语言说明实际结果和下一步。'],
      ['即时结果', 'default', '用短消息说明结果，保留当前操作焦点。'],
      ['复制成功', 'conditional', '每次复制单独显示一条提示，可点 × 关闭其中一条。'],
      ['可恢复错误', 'conditional', '在原处或持续通知中提供错误原因和恢复入口。'],
    ],
    checks: [
      '触发短提示，核对消失后仍能继续操作。',
      '连续点复制成功 Toast，核对叠放上限和单条关闭。',
      '触发持续通知或区域错误，试一次恢复。',
    ],
    source: 'message / notification · Alert',
    consumer: { ...PURCHASE_PAGE, task: '查看采购操作结果，核对短消息和需要恢复的错误提示。' },
  },
  {
    key: 'attachment-drawer',
    directoryGroup: 'patterns',
    title: '抽屉内查看附件',
    summary: '附件预览和逐层返回',
    description: '打开采购单摘要，在抽屉内预览附件，关闭后继续查看同一份摘要。',
    usageRules: [
      ['来源记录', 'required', '从当前记录详情打开附件，保留记录上下文。'],
      ['附件预览', 'conditional', '有可查看的附件且具备权限时打开预览。'],
      ['逐层返回', 'default', '关闭预览后保留抽屉，焦点归还给预览入口。'],
    ],
    checks: ['打开上下文抽屉，再打开附件预览。', '关闭预览，核对原摘要仍在。', '关闭抽屉，回到来源入口。'],
    componentRefs: ['AppDrawer', 'BusinessModal'],
    consumer: { ...PURCHASE_PAGE, task: '打开记录详情及其附件，核对逐层关闭和焦点恢复。' },
  },
  {
    key: 'danger-confirm',
    directoryGroup: 'patterns',
    title: '危险操作确认',
    summary: '作废草稿、默认取消和结果',
    description: '作废前先说明影响。用同一份演示草稿核对取消、确认和重复操作。',
    usageRules: [
      ['对象与后果', 'required', '明确要操作哪条记录以及确认后的影响。'],
      ['取消与焦点', 'default', '默认聚焦保留草稿的动作，取消后保持原状态。'],
      ['动作结果', 'conditional', '确认后执行。成功后展示实际结果，并阻止重复作废。'],
    ],
    checks: ['打开确认框，核对作废后果和默认焦点。', '取消后核对草稿仍在。', '确认后核对作废结果和入口禁用。'],
    source: 'App modal.confirm',
    consumer: { ...PURCHASE_PAGE, task: '打开订单状态操作的确认框，核对后果和取消后的原记录状态。' },
  },
  {
    key: 'business-form',
    directoryGroup: 'patterns',
    title: '业务表单与明细',
    variants: [
      { value: 'form', label: '表单编辑' },
      {
        value: 'wide-lines',
        label: '多列明细',
        keywords: '长值与多列 横向滚动 BusinessLineItemsTable',
        description: '在窄区域内填写多列明细，核对锁定值、列宽和横向滚动。',
        checks: [
          '对照长短名称，展开候选核对编码等识别信息。',
          '搜索并选择仓库，再清空。核对批次同步清空。',
          '切换窄区域和增加 4 列，横向查看右侧字段，再恢复初始内容。',
        ],
        consumer: { ...getBusinessPagePresentation('shipments'), task: '打开出货编辑页，核对产品、SKU、仓库、批次与明细横向滚动。' },
      },
    ],
    summary: '整页编辑、校验与离开保护',
    description: '直接使用整页表单与明细组合，编辑本地草稿，核对增删、长文本、校验、离开保护和保存恢复。',
    usageRules: [
      ['整页编辑', 'required', '保留输入、分区和返回上下文，局部专项动作使用业务编辑弹窗。'],
      ['草稿明细', 'conditional', '有明细时复用分组、增删与错误定位。来源、校验和保存由调用方负责。'],
      ['多列明细', 'conditional', '按任务分配最小列宽，列数增加时让明细区域横向滚动。'],
      ['明细表头', 'default', '普通明细、紧凑明细与联系人共用表头、必填标记和表框。'],
      ['行操作', 'optional', '按权限及业务状态提供复制或移除，沿用共享描边和危险色。'],
      ['备注', 'default', '至少两行起步并随文本增高。编辑时显示计数，查看时保留全文。'],
      ['失败与离开', 'conditional', '保存失败保留输入，修改后未保存时先确认离开。演示保存更新本地样例。'],
    ],
    checks: [
      '打开草稿，核对整单与明细备注至少两行；输入多行再清空，检查高度和计数恢复。清空名称保存，核对字段错误。',
      '关闭草稿后切换普通明细、紧凑字段明细与联系人，核对表头、外框、复制与移除规格；联系人复制不复制主联系人身份。',
      '移除明细查看空态，再添加；修改后返回列表，先继续编辑，再放弃修改。',
      '选择首次失败后重试，编辑并保存；核对输入保留及重试结果。',
    ],
    componentRefs: [
      'BusinessFormPage', 'BusinessFormSection', 'BusinessLineItemsSection',
      'BusinessLineItemsTable', 'BusinessLineItemRow', 'BusinessLineTable', 'BusinessLineItemActionButton',
      'ContactFormList', 'BusinessTextArea', 'DateInput',
    ],
    consumer: { ...PURCHASE_PAGE, task: '打开新建或编辑，核对整页表单、材料明细与返回列表；浏览验证无需保存真实单据。' },
  },
  {
    key: 'source-picker',
    directoryGroup: 'overlays',
    title: '来源选择',
    component: 'SourceImportPickerModal',
    summary: '搜索、跨页多选与关闭恢复',
    description: '使用正式来源选择弹窗操作本地材料清单，核对搜索、跨页选择、停用限制、空态和读取恢复。',
    usageRules: [
      ['来源与确认', 'required', '明确选择范围和何时应用。字段映射、去重及业务写入由调用方负责。'],
      ['搜索与分页', 'default', '共用搜索和分页，翻页时保留选择。'],
      ['大量远程资料', 'conditional', '使用 RemoteReferencePicker 或 RemoteReferenceSelect，沿用读取、分页、取消及权限。'],
      ['停用、加载与失败', 'conditional', '对应选择或确认不可用时说明限制。读取失败保留上次清单并允许重读。'],
      ['关闭与清空', 'default', '取消保留已确认结果，重开清理临时选择，主动清空后保留空值。'],
    ],
    checks: [
      '选择第一页和第二页的材料，核对已选汇总；停用材料不可选。',
      '输入关键词后搜索，再清空筛选；取消后重新打开，确认临时选择已清空。',
      '加载时确认不可用；空列表或读取失败时重新加载，再确认并清空结果。',
    ],
    componentRefs: [
      'SourceImportPickerModal', 'BusinessModal', 'SearchInput', 'AppTable', 'AppPagination',
      'RemoteReferencePicker', 'RemoteReferenceSelect',
    ],
    consumer: { ...PURCHASE_PAGE, task: '进入编辑页的“从材料库添加”，核对远程搜索、跨页选择与清空；取消返回，不提交业务数据。' },
  },
  {
    key: 'business-toolbar',
    directoryGroup: 'patterns',
    title: '业务工具栏组合',
    summary: '采购与生产对照、职责标注与增长场景',
    description: '先操作采购与生产的并排样例，比较查看角度与办理职责如何决定页签位置；再核对库存、采购、待办与历史的工具栏组合。',
    usageRules: [
      ['入口层级', 'required', '独立办理入口靠标题，同一业务的分类靠查询区。采购切换列表与跟进，生产按计划、执行、记录和处置办理。'],
      ['内容分类', 'conditional', '少量稳定分类用左侧下划线页签并保持挂载，较多分类按组点选。'],
      ['同范围展示', 'optional', '按任务提供明细与分布或列表与日历切换，保留原查询范围。'],
      ['查询、工具与主动作', 'optional', '按任务和权限组合搜索、筛选、列设置及记录动作。'],
      ['分类或选项增长', 'conditional', '分类增多时核对导航位置，数据选项增多时使用可搜索筛选。'],
    ],
    checks: [
      '对照采购与生产：切换全部页签、搜索并查看记录，核对导航位置、办理职责与各视图的搜索恢复。',
      '切换两种增长场景，按组选择分类或搜索第 30 个数据选项。关闭职责标注比较实际布局。',
      '往返四种业务，查看详情、翻页、调整列和导出；恢复示例后回到初始状态。',
    ],
    componentRefs: [
      'BusinessToolbarWorkspace', 'BusinessOperationPanel', 'BusinessDataTable',
      'BusinessViewSwitch', 'BusinessStatusFilter', 'ColumnOrderModal',
    ],
    source: '规范：交互设计说明 #business-toolbar-composition',
    consumer: { ...PURCHASE_PAGE, task: '对照库存查询、采购订单、工作台和历史记录；此样例仅使用本地虚构数据，业务权限与提交由真实页面负责。' },
  },
  {
    key: 'table',
    directoryGroup: 'tables',
    title: '数据表格',
    component: 'AppTable',
    description: '用共享表格查看样例材料，操作排序和行选择。',
    usageRules: [
      ['列与行标识', 'required', '调用方提供列定义和稳定的行标识。'],
      ['布局与读取反馈', 'default', '共用列对齐、滚动和空态样式，等待时显示读取状态。'],
      ['排序、选行与分页', 'optional', '按任务接入，调用方管理查询、选中记录和读取结果。'],
    ],
    checks: ['按编码排序，核对行次序。', '勾选一行，再切换排序并核对选择。'],
    consumer: { ...MATERIAL_PAGE, task: '在材料列表核对表头排序和当前行选择。' },
  },
  {
    key: 'pagination',
    directoryGroup: 'tables',
    title: '分页',
    component: 'AppPagination',
    summary: '翻页、条数与读取恢复',
    description: '表格内分页与独立分页使用同一套控件；切换样例数据和读取状态，核对当前记录与分页结果。',
    usageRules: [
      ['当前页、总数与读取', 'required', '提供与已显示结果对应的页码和总数，并处理翻页。'],
      ['页码与记录范围', 'default', '表格内和独立分页共用翻页、范围文案与窄屏模式。'],
      ['每页条数', 'optional', '允许改变批次时显示条数选择。条数或查询范围变化后回到第一页。'],
      ['加载与失败', 'conditional', '等待时避免重复读取。失败保留上次结果和页码，提供重试入口。'],
      ['手机任务', 'conditional', '沿用任务列表的分批续取方式。'],
    ],
    checks: [
      '翻到第二页，再修改每页条数，核对首项与范围回到第一页。',
      '切换表格内与独立分页，再试单页、空列表和恢复初始内容。',
      '切换加载中与加载失败，核对禁用、内容保留和重试恢复。',
    ],
    componentRefs: ['common/components/table/AppTable', 'common/components/pagination/AppPagination'],
    source: 'common/utils/pagination.mjs',
    consumer: { ...MATERIAL_PAGE, task: '操作主列表的页码、每页条数和筛选，核对记录范围与读取恢复。' },
  },
  {
    key: 'inputs',
    directoryGroup: 'patterns',
    title: '基础输入',
    summary: '文本、备注、选择与项目主题',
    description: 'Button、Input 继承项目主题；下拉统一使用 AppSelect / FilterSelect，选中后保留用途，清空后恢复提示。',
    usageRules: [
      ['字段名称', 'required', '显示字段用途。可编辑值支持清空，必填由表单校验。'],
      ['占位提示', 'optional', '需要示例或操作提示时使用短文案，按实际宽度呈现。'],
      ['关键规则', 'conditional', '金额计算、留空含义和提交条件写在所属字段或明细区，填写后仍可查看。'],
      ['补充帮助', 'optional', '需要额外解释时通过 BusinessHelpLabel 原处查看。'],
      ['普通备注', 'default', '两行起步并随内容增高，编辑时显示计数，清空恢复初始高度。'],
      ['搜索与业务筛选', 'conditional', '共用搜索与筛选。聚焦查看搜索范围，提交或失焦后收起，清空取消条件。'],
      ['领域选择', 'conditional', '使用正式领域选择器承接读取、搜索和来源快照。'],
    ],
    checks: ['修改名称和类别，核对当前结果；输入多行备注，观察字数和高度。', '清空内容，再恢复初始值。', '切换禁用与错误，核对值保留、计数和状态外观。'],
    componentRefs: ['Input', 'BusinessTextArea', 'AppSelect', 'FilterSelect', 'Button'],
    source: 'Ant Design · common/components/select · common/theme/erpAntdTheme.mjs · erp/styles/app/control-*.css',
    consumer: { ...MATERIAL_PAGE, task: '打开新建或编辑，核对字段输入、选择、清空与禁用；取消返回。' },
  },
  {
    key: 'input',
    directoryGroup: 'inputs',
    title: '单行输入',
    component: 'Input',
    description: '录入名称，核对正常、禁用、校验错误和清空状态。',
    usageRules: [
      ['字段名称', 'required', '用可见标签标明名称、编码等填写对象。'],
      ['占位与清空', 'optional', '按需提供短示例和清空入口。必填由所属表单决定。'],
      ['错误与禁用', 'conditional', '校验错误在字段旁提示，禁用时保留可读的当前值。'],
    ],
    checks: ['编辑后清空输入。', '切换禁用或错误，核对文字和焦点。'],
    consumer: { ...MATERIAL_PAGE, task: '打开材料编辑，核对名称输入、清空和校验。' },
  },
  {
    key: 'text-area',
    directoryGroup: 'inputs',
    title: '多行文本',
    component: 'BusinessTextArea',
    description: '输入多行备注，观察自动增高、清空和字数限制。',
    usageRules: [
      ['字段名称与长度', 'required', '显示字段用途，文本上限沿用该业务字段的规则。'],
      ['备注高度', 'default', '至少两行起步并随内容增高，清空后恢复初始高度。'],
      ['清空与计数', 'optional', '按编辑场景提供清空和字数查看。'],
      ['只读或禁用', 'conditional', '保留全文，隐藏编辑计数。'],
    ],
    checks: ['粘贴多行，核对增高和计数。', '清空后核对初始高度，禁用时核对全文。'],
    consumer: { ...PURCHASE_PAGE, task: '编辑采购备注，核对长文本、字数和清空。' },
  },
  {
    key: 'help',
    directoryGroup: 'feedback',
    title: '补充说明',
    component: 'SupplementalHelp',
    summary: '信息图标、悬停、键盘与点按',
    description: '直接操作统一说明气泡，比较短说明、效果示意与完整页面帮助。',
    usageRules: [
      ['帮助对象与正文', 'required', '明确说明对应的字段、选项、口径或范围。'],
      ['打开与收起', 'default', '悬停或键盘聚焦查看，点击固定。再次点击、外部点击或 Esc 收起。'],
      ['效果示意', 'optional', '需要比较时在同一气泡内加入效果示意。'],
      ['页面帮助与警告', 'conditional', '保留完整帮助和警告的入口。按 Esc 先收起补充说明，表单可继续编辑。'],
    ],
    checks: [
      '悬停或 Tab 聚焦备注旁的 ⓘ，点击固定后再点一次收起。',
      '切换查看密度示意；在弹窗中打开说明，按 Esc，核对弹窗和草稿保留。',
      '打开页面帮助，核对完整内容；警告不随说明开关隐藏。',
    ],
    componentRefs: ['SupplementalHelp', 'BusinessHelpLabel', 'ERPAppearanceHelp'],
    source: '规范：交互设计说明 #input-hints',
    consumer: { ...TASK_PAGE, task: '在任务详情查看进度或处理记录的范围说明，再核对字段说明、完整页面帮助和原有警告。' },
  },
  {
    key: 'select',
    directoryGroup: 'inputs',
    title: '下拉选择',
    component: 'AppSelect',
    description: '对照普通输入、分组选值、长名称和始终需要有效值的操作参数。',
    variants: [
      { value: 'basic', label: '基础选择', keywords: '普通下拉 清空 禁用' },
      {
        value: 'grouped',
        label: '分组下拉',
        keywords: '分组选项 单选 多选 分类标题',
        checks: ['区分分类标题、缩进选项和勾选。', '点击分类或禁用项，再用方向键选择。', '核对清空和重新选择。'],
      },
      {
        value: 'long-value',
        label: '长名称',
        keywords: '长值 长文本 完整值 窄区域',
        checks: ['在窄区域核对名称完整换行和候选编码。', '改选短名称，核对高度恢复。', '清空后核对用途提示。'],
      },
      {
        value: 'operation-parameter',
        label: '操作参数',
        keywords: '统计币种 不可清空 allowClear',
        checks: ['切换统计币种，核对字段用途可读且始终保有一个有效值。'],
      },
    ],
    usageRules: [
      ['字段名称', 'required', '选中后仍清楚这个下拉框在选什么。'],
      ['清空', 'default', '有值时提供清空入口。必填字段可在编辑时暂时清空，保存时由表单校验。'],
      ['分组选择', 'conditional', '有稳定分类时按组点选。分类标题和禁用项不可选。'],
      ['关闭清空', 'conditional', <>仅用于始终需要有效值的操作参数，设置 <code>{'allowClear={false}'}</code>。</>],
    ],
    checks: ['清空后点保存样例，再重新选值并保存。', '切换禁用或错误，核对原值和提示仍可读。'],
    source: 'historySourceSelectOptions · useSelectPopupWidth · control-foundation.css',
    consumer: { ...HISTORY_PAGE, task: '展开记录类型，核对基础资料与业务单据两类，以及清空和重新选择后的结果。' },
  },
  {
    key: 'filter-select',
    directoryGroup: 'filters',
    title: '筛选下拉',
    component: 'FilterSelect',
    description: '按姓名查找办理人，选中后只看该办理人的任务。',
    usageRules: [
      ['筛选名称与候选', 'required', '说明用途，调用方提供有效选项与查询空值。'],
      ['生效与清空', 'default', '选中后更新筛选条件，清空恢复不限。'],
      ['候选搜索', 'optional', '平铺的动态名单可按名称搜索。'],
    ],
    checks: [
      '在“办理人”输入“王”，候选只显示王小禾。',
      '选择王小禾，结果缩小到 2 条任务。',
      '点击下拉框右侧的 ×，恢复“不限 · 4 条任务”。',
    ],
    consumer: { ...TASK_PAGE, task: '打开“待我处理”的筛选面板，按姓名查找并选中办理人，再清空核对结果。' },
  },
  {
    key: 'search-input',
    directoryGroup: 'filters',
    title: '搜索框',
    component: 'SearchInput',
    description: '用材料名称或编码查询，对照提交前的草稿和提交后的结果。',
    usageRules: [
      ['搜索范围', 'required', '用可见名称或提示说明可以查询的对象。'],
      ['提交与清空', 'default', '按 Enter 或点击搜索提交，清空后撤销该条件。'],
      ['补充范围提示', 'optional', '搜索对象较多时在聚焦时展示完整范围，提交或失焦后收起。'],
    ],
    checks: ['输入关键词，对照提交前后的结果。', '搜索不存在的材料，再清除条件。'],
    consumer: { ...MATERIAL_PAGE, task: '按名称或编码查材料，核对提示范围和清空后的列表。' },
  },
  {
    key: 'chain-view-picker',
    directoryGroup: 'inputs',
    title: '分组选择（单选／多选）',
    component: 'BusinessChainDesignPicker',
    summary: '流程范围单选、岗位高亮多选',
    description: '流程范围点选即切换。岗位高亮可同时勾选采购和仓库，查看各自和共同参与的示例步骤。',
    usageRules: [
      ['流程范围单选', 'required', '画布保有一个当前范围，选择后更新按钮内容并收起面板。'],
      ['岗位多选', 'optional', '需要比较时可连续勾选岗位，共同参与步骤带「共同」标记。'],
      ['键盘操作', 'default', '单选用方向键和 Enter，多选用 Tab 和空格，Esc 关闭后回到入口。'],
    ],
    checks: [
      '打开流程范围，核对分组、当前勾选和尖角位置。',
      '选择另一项，核对面板收起和按钮当前值。',
      '勾选采购和仓库，核对各自与共同参与的步骤。再选「全链路视角」清除高亮。',
    ],
    componentRefs: ['BusinessChainDesignPicker'],
    source: '交互设计说明 #workbench-patterns',
    consumer: { title: '流程探索', task: '切换链路并选择高亮岗位，核对画布范围、节点高亮与数量。' },
  },
  {
    key: 'date',
    directoryGroup: 'inputs',
    title: '日期输入',
    component: 'DateInput',
    description: '在日历中选日期或清空日期，核对输入和当前值。',
    usageRules: [
      ['只需要年月日', 'default', '选中即写入日期，清空恢复未设置。'],
      ['字段用途', 'required', '显示日期所对应的业务字段，例如采购交期。'],
      ['禁用或校验失败', 'conditional', '禁用时保留已选日期，校验失败在字段旁说明原因。'],
    ],
    checks: ['选一个日期，核对当前值。', '清空，再试错误和禁用状态。'],
    consumer: { ...PURCHASE_PAGE, task: '编辑采购交期，核对选日和清空。' },
  },
  {
    key: 'date-time',
    directoryGroup: 'inputs',
    title: '日期时间',
    component: 'DateTimeInput',
    description: '设置跟进截止时间，精确到分钟，也可使用常用截止选项。',
    usageRules: [
      ['需要精确截止时间', 'default', '选择时分或使用快捷截止，立即写入当前值。'],
      ['字段用途和精度', 'required', '显示所选业务时间的用途，按分钟填写。'],
      ['快捷截止', 'optional', '由业务提供常用截止时间，选择后立即回填。'],
    ],
    checks: ['用快捷截止设置时间。', '按 Esc 关闭后核对焦点，并清空当前值。'],
    consumer: { ...TASK_PAGE, task: '设置跟进截止时间，核对快捷选项和实际保存值。' },
  },
  {
    key: 'date-range',
    directoryGroup: 'filters',
    title: '日期范围筛选',
    component: 'DateRangeFilter',
    description: '按下单或交货日期筛选，核对日期范围生效与倒置校验。',
    usageRules: [
      ['按日期口径缩小结果', 'default', '快捷范围立即生效。手选起止日期后点应用，起止倒置时显示提示。'],
      ['日期口径与条件', 'required', '显示所用业务日期和已应用的范围。'],
      ['口径切换与快捷范围', 'optional', '有多个业务日期时提供口径选择，常用范围可配快捷项。'],
    ],
    checks: ['切换交货日期，设置起止日并应用。', '查看倒置范围，再清空或重置。'],
    consumer: { ...PURCHASE_PAGE, task: '按采购日期查询并清除日期范围。' },
  },
  {
    key: 'directory',
    directoryGroup: 'navigation',
    title: '目录导航',
    component: 'Directory',
    description: '体验同一组件的分级目录和一级目录，点选条目定位正文。',
    variants: [
      { value: 'nested', label: '分级目录', keywords: '分组 展开 收起 子项 章节' },
      { value: 'flat', label: '一级目录', keywords: '平级 无子项' },
    ],
    usageRules: [
      ['目录条目', 'required', '点击内容条目直接打开对应内容，当前项保持高亮，键盘焦点独立可见。'],
      ['层级与开合', 'conditional', '子项统一缩进并显示细竖线。分类标题下的条目直接展示，能单独开合的分组在标题旁显示箭头。'],
      ['章节定位', 'conditional', '点击章节跳到正文，滚动时跟随高亮。小节由标题栏批量开合，收起时高亮所属主章。'],
    ],
    checks: ['切换一级目录，核对条目对齐，并点选条目定位正文。', '在分级目录选中小节，再收起和展开，核对高亮位置。'],
    componentRefs: ['DirectoryHeader', 'DirectoryItem', 'DirectoryBranch'],
    consumer: { title: '组件设计、项目文档', task: '在组件设计目录点击组标题，核对箭头和独立开合。在项目文档核对章节跳转、滚动高亮和批量开合。' },
  },
  {
    key: 'tabs',
    directoryGroup: 'navigation',
    title: '内容页签',
    component: 'SlidingTabs',
    description: '在同一订单里切换产品明细和关联任务。',
    usageRules: [
      ['页签与内容对应', 'required', '为同一对象的内容提供明确名称，切换后仍可确认当前对象。'],
      ['选中指示与键盘', 'default', '显示当前页签，支持方向键切换。'],
      ['禁用页签', 'conditional', '内容暂不可用时禁用该入口。'],
    ],
    checks: ['用鼠标和键盘切换页签，核对关联内容。', '尝试禁用的页签。'],
    consumer: { ...PURCHASE_PAGE, task: '在订单详情切换内容，核对标题和当前订单。' },
  },
  {
    key: 'tab-list',
    directoryGroup: 'navigation',
    title: '受控页签条',
    component: 'SlidingTabList',
    description: '独立控制页签条和下方内容，核对选中指示与键盘切换。',
    usageRules: [
      ['当前项与切换回调', 'required', '父级管理当前页签，保持页签条挂载并更新下方内容。'],
      ['选中指示与键盘', 'default', '显示当前选中页签，支持左右方向键。'],
      ['二级页签', 'optional', '有独立子内容时，在所属区域内提供一组页签。'],
    ],
    checks: ['用左右方向键切换视图。', '切换二级页签，核对标题与内容。'],
    consumer: { ...TASK_PAGE, task: '切换流程进度与异常跟踪，核对内容和选中指示。' },
  },
  {
    key: 'segmented',
    directoryGroup: 'navigation',
    title: '分段选择',
    component: 'SlidingSegmented',
    description: '在同一任务内切换电脑版和手机版入口。',
    usageRules: [
      ['互斥选项与当前值', 'required', '为同一任务提供少量可比较的工作方式，保留当前选择。'],
      ['选择反馈', 'default', '同时显示选项和当前高亮，点击立即切换。'],
      ['禁用选项', 'conditional', '某个方式暂不可用时保留该项的状态反馈。'],
    ],
    checks: ['切换工作入口，核对当前选择。'],
    consumer: { title: '登录', task: '切换进入电脑版或手机版，核对当前选项。' },
  },
  {
    key: 'filter-chip',
    directoryGroup: 'filters',
    title: '筛选按钮',
    component: 'FilterChip',
    description: '用一个带数量的快捷条件筛选记录。',
    usageRules: [
      ['条件名称与选中状态', 'required', '按钮文字和选中状态共同说明当前结果范围。'],
      ['数量与补充说明', 'optional', '有可核对的条数时显示数量，需要解释时附说明入口。'],
      ['禁用', 'conditional', '条件不可用时阻止触发，保持当前状态可读。'],
    ],
    checks: ['选中后再次点击，核对条件恢复。', '尝试禁用按钮。'],
    consumer: { ...TASK_PAGE, task: '点击快捷条件，核对选中状态和结果范围。' },
  },
  {
    key: 'filter-chip-group',
    directoryGroup: 'filters',
    title: '筛选按钮组',
    component: 'FilterChipGroup',
    description: '在同一组条件之间切换，观察范围和数量。',
    usageRules: [
      ['固定选项与当前条件', 'required', '提供同组条件、当前值和切换逻辑，同组一次只选一项。'],
      ['组名和数量', 'optional', '用途需要说明时给出组名，有相应条数时显示计数。'],
      ['恢复不限', 'conditional', '可以撤销筛选时使用 allowClear，并用 emptyValue 对齐查询空值。'],
    ],
    checks: ['选择一种状态，核对结果范围与数量。', '切回不限，核对全量结果。'],
    consumer: { ...TASK_PAGE, task: '按状态调整列表范围，核对当前高亮和数量。' },
  },
  {
    key: 'navigation',
    directoryGroup: 'patterns',
    title: '页签与视图',
    summary: '区分页签、分段与筛选',
    description: '先看点击后是换视图、选入口或展示方式，还是缩小结果。只有页签分一级、二级。',
    usageRules: [
      ['切换结果', 'required', '让用户清楚将要切换的是办理内容、展示方式还是当前结果范围。'],
      ['页签', 'conditional', '切换办理、内容或查询视图。一级靠标题，二级留在所属内容区，查询页签可与搜索同排。'],
      ['分段选择', 'optional', '同一任务有不同的工作入口或展示方式时使用共享圆角底轨。'],
      ['筛选', 'optional', '用独立按钮缩小当前结果。有条数时显示数量，需要说明范围时显示组名。'],
    ],
    checks: [
      '切到关联任务：订单身份保持不变。',
      '点手机版和冻结：一个换工作入口，一个只缩小批次结果。',
      '用方向键和快速反向切换，核对禁用项与减少动态效果。',
    ],
    componentRefs: ['SlidingTabs', 'SlidingSegmented', 'FilterChipGroup'],
    source: 'control-affordance.css；规范：交互设计说明 #business-toolbar-composition',
    consumer: { ...TASK_PAGE, task: '切换待办、已办和流程跟踪，核对页签保持挂载及当前内容。' },
  },
  {
    key: 'filter-popover',
    directoryGroup: 'filters',
    title: '筛选浮层',
    component: 'AnchoredControlPopover',
    description: '从筛选按钮打开条件面板，调整状态、从右上角清空并收起。',
    usageInSample: true,
    usageRules: [
      ['打开入口与面板名称', 'required', '带漏斗的「筛选」按钮打开面板，尖角指向该入口。', 'trigger'],
      ['清空与收起', 'default', '面板内提供清空与收起，关闭后焦点回到入口。', 'actions'],
      ['筛选条件', 'optional', '按业务提供需要集中调整的条件，调用方管理查询结果。', 'fields'],
    ],
    checks: ['打开筛选，核对尖角和条件。', '更改状态、清空后收起，核对焦点返回。'],
    componentRefs: ['FilterPopoverPanel', 'FilterPopoverButton'],
    consumer: { ...TASK_PAGE, task: '打开电脑端总筛选，核对条件清空与收起。' },
  },
  {
    key: 'filters',
    directoryGroup: 'patterns',
    title: '筛选与搜索',
    summary: '缩小同一份结果',
    description: '点状态、提交关键词或改变范围，观察同一份虚构记录如何变化。',
    usageInSample: true,
    usageRules: [
      ['结果范围', 'required', '搜索和筛选缩小当前查询范围，保留正在生效的条件。', 'result'],
      ['常用条件', 'optional', '用快捷按钮呈现同组常用条件，有数量时随文字显示。', 'quick'],
      ['手机快捷项', 'conditional', '保留 32px 外观和至少 44px 可触区，窄屏同一行横向滚动。', 'mobile-quick'],
      ['主搜索', 'optional', '在搜索按钮或 Enter 提交时生效，手机聚焦展开、提交后收起。', 'search'],
      ['次级条件', 'conditional', '集中在「筛选」浮层。条件即时生效，可连续调整后收起。', 'secondary'],
      ['面板清空', 'default', '清除面板里可重置的条件。关键词由搜索框单独清除。', 'clear'],
    ],
    checks: [
      '选择逾期：结果与数量一起变化。',
      '输入期间结果不变；提交不存在的关键词后，出现无结果与清除入口。',
      '打开总筛选，核对尖角指向。电脑上调整记录范围及负责人，从面板右上角清空，再收起。',
    ],
    componentRefs: ['AnchoredControlPopover', 'FilterPopoverPanel', 'BusinessOperationPanel', 'FilterSelect', 'FilterChip', 'SearchInput', 'HorizontalScroll', 'MobileSearchInput', 'MobileFilterPopover', 'MobileFilterChoices'],
    consumer: { ...TASK_PAGE, task: '组合任务范围与关键词，再清空和返回，核对当前条件及结果。' },
  },
  {
    key: 'actions',
    directoryGroup: 'feedback',
    title: '按钮',
    component: 'Button',
    summary: '主次、禁用与执行反馈',
    description: '同一组突出一个主动作，文字、状态与反馈共同说明点击的结果。',
    usageRules: [
      ['动作名称', 'required', '明确点击后的动作，图标按钮也要有可访问名称。'],
      ['主次优先级', 'default', '一组只强调一个主要动作。刷新、返回等次要动作使用描边。'],
      ['辅助动作', 'optional', '低频辅助动作可用文字按钮，保留键盘焦点。'],
      ['加载与禁用', 'conditional', '执行期间或操作不可用时阻止触发。危险动作按专项规则确认。'],
    ],
    checks: [
      '用 Tab 定位保存，再按 Enter。',
      '点击刷新与取消：就地看到各自结果。',
      '禁用项不触发；加载项保留原按钮尺寸。',
    ],
    componentRefs: ['Button'],
    source: 'Ant Design · control-affordance.css',
    consumer: { ...PURCHASE_PAGE, task: '比较未选、已选和只读记录的操作入口；动作权限与状态由真实页面决定。' },
  },
  {
    key: 'app-empty',
    directoryGroup: 'feedback',
    title: '空提示',
    component: 'AppEmpty',
    description: '对照列表、表单和下拉候选中的空提示规格。',
    usageRules: [
      ['空态说明', 'required', '说明无内容的原因，区分暂无数据、筛选未命中和读取失败。'],
      ['列表规格', 'default', '列表使用居中布局说明当前结果。'],
      ['恢复或新建', 'optional', '存在可用动作时提供清空、重试或新建入口。'],
      ['表单与下拉', 'conditional', '表单使用左对齐行内规格，候选下拉使用紧凑规格并保留搜索。'],
    ],
    checks: ['切换表单、列表和下拉候选。', '对照暂无数据、筛选无结果和失败恢复。'],
    consumer: { ...MATERIAL_PAGE, task: '清空材料筛选，核对空提示和可执行动作。' },
  },
  {
    key: 'empty',
    directoryGroup: 'patterns',
    title: '页面状态',
    summary: '空提示规格、加载与恢复',
    description: '比较列表、表单和下拉的空提示，操作手机任务与电脑切页样例，核对读取、失败与权限反馈。',
    usageRules: [
      ['页面状态', 'required', '区分读取中、暂无记录、筛选未命中、读取失败和无权限。'],
      ['首次读取与切页', 'conditional', '手机首次读取用卡片骨架，栏目或桌面切页在内容区等待，保留导航和筛选。'],
      ['同一查询刷新', 'default', '保留当前内容、选择和滚动，失败时说明结果尚未更新。'],
      ['暂无记录或未命中', 'conditional', '使用中性空态，保留查询范围，按实际能力提供清除或新建。'],
      ['读取失败', 'conditional', '保留查询上下文并提供重试。'],
      ['场景规格', 'conditional', '列表居中，表单行内左对齐，候选下拉紧凑排布并保留搜索。'],
    ],
    checks: [
      '切换首次加载、栏目读取和刷新，完成读取后比较卡片与页签的位置。',
      '选择一张卡片后刷新并模拟失败；核对选择保留、重试和清除条件。',
      '选择电脑切页，在等待期间点击另一导航；手机样例可切换宽度和外观。',
    ],
    componentRefs: ['AppEmpty', 'AppTable', 'AppSelect', 'MobileTaskListContent', 'MobileTaskListSkeleton', 'WorkflowTaskCard', 'Loading', 'Alert'],
    consumer: { ...TASK_PAGE, task: '切换任务范围并刷新，核对内容区等待与恢复；手机组件另在岗位任务端核对。' },
  },
  {
    key: 'counts',
    directoryGroup: 'feedback',
    title: '数字提醒',
    component: 'NavigationCountBadge',
    summary: '有待办才提示，点开范围一致',
    description: '菜单数字帮助发现待办；办理后更新，打开页面不会清零。',
    usageRules: [
      ['统计范围与口径', 'required', '数字与打开后的清单范围一致，未结束任务按责任范围去重计数。'],
      ['数字显示', 'default', '普通提醒用低强调数字。零隐藏，大数量缩写为 99+，悬停与读屏可查看完整数字。'],
      ['风险色', 'optional', '有明确风险含义的异常入口可以使用风险色。'],
      ['读取中或失败', 'conditional', '用等待或待更新标识说明状态，失败保留上次数量并标记。'],
    ],
    checks: [
      '打开任务管理样例：清单与数字一致，浏览不清零。',
      '办理一项：清单和数字一起减少，归零后隐藏。',
      '切换大数量、读取中和失败，核对显示及重试。',
    ],
    componentRefs: ['NavigationCountBadge'],
    source: '服务端任务管理总数',
    consumer: { ...TASK_PAGE, task: '比较侧栏任务数字与实际清单范围，不能用演示数字判断真实待办。' },
  },
].map(({ componentRefs = [], source, ...topic }) => ({
  ...topic,
  componentRefs,
  source: [...new Set([topic.component, ...componentRefs, source].filter(Boolean))].join(' · '),
}))

const PRIMARY_COMPONENTS = new Map(
  TOPICS.filter(({ component }) => component).map((topic) => [topic.component.toLowerCase(), topic])
)
const DIRECTORY_GROUPS = [
  { key: 'inputs', label: '录入与选值' },
  { key: 'filters', label: '搜索与筛选' },
  { key: 'tables', label: '表格与分页' },
  { key: 'navigation', label: '导航与视图' },
  { key: 'overlays', label: '弹窗与抽屉' },
  { key: 'feedback', label: '操作与反馈' },
  { key: 'patterns', label: '组合样例' },
]

function findDirectoryEntries(query) {
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const exact = PRIMARY_COMPONENTS.get(words.join(''))
  if (exact) return [{ topic: exact }]

  const primary = words.map((word) => PRIMARY_COMPONENTS.get(word)).find(Boolean)
  return (primary ? [primary] : TOPICS).flatMap((topic) => {
    const related = topic.componentRefs
      .map((reference) => reference.split('/').at(-1))
      .filter((name) => !PRIMARY_COMPONENTS.has(name.toLowerCase()))
    const searchable = [topic.title, topic.component, topic.summary, topic.description, ...related]
      .join(' ').toLowerCase()
    const variant = topic.variants?.find(({ label, keywords }) => {
      const terms = [label, keywords].join(' ').toLowerCase()
      return words.some((word) => terms.includes(word)) &&
        words.every((word) => searchable.includes(word) || terms.includes(word))
    })
    return variant || words.every((word) => searchable.includes(word))
      ? [{ topic, variant }]
      : []
  })
}

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

function NavigationExample({ only }) {
  const [entry, setEntry] = useState('desktop')
  const [batchFilter, setBatchFilter] = useState('all')
  const currentBatchFilter = NAVIGATION_BATCH_FILTERS.find(
    ({ value }) => value === batchFilter
  )
  return (
    <div className="erp-control-example-stack">
      <section aria-label={only ? undefined : '三类控件对照'}>
        {!only && <h3>三类控件对照</h3>}
        <div
          className={only ? undefined : 'erp-control-navigation-comparison'}
        >
          {(!only || only === 'tabs') && (
            <div>
              <h4>页签 · 切换订单内容</h4>
              <div className="erp-control-example-context">
                订单 SO-DEMO · 同一张订单
              </div>
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
          )}
          {(!only || only === 'segmented') && (
            <div>
              <h4>分段选择 · 选工作入口</h4>
              <div className="erp-control-example-context">
                登录页 · 选择进入哪个界面
              </div>
              <SlidingSegmented
                aria-label="登录工作入口样例"
                value={entry}
                onChange={setEntry}
                options={NAVIGATION_ENTRY_OPTIONS}
              />
              <p role="status">
                示例入口：{entry === 'desktop' ? '电脑版' : '手机版'}
              </p>
            </div>
          )}
          {(!only || only === 'filter-chip-group') && (
            <div>
              <h4>筛选 · 缩小批次结果</h4>
              <div className="erp-control-example-context">
                库存批次 · 同一类记录
              </div>
              <FilterChipGroup
                aria-label="库存批次状态样例"
                value={batchFilter}
                onChange={setBatchFilter}
                options={NAVIGATION_BATCH_FILTERS}
              />
              <p role="status">
                库存批次：{currentBatchFilter.label}，共{' '}
                {currentBatchFilter.count} 条（示例）
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ControlledTabListExample() {
  const [view, setView] = useState('orders')
  const [trackingView, setTrackingView] = useState('progress')
  return (
    <div className="erp-control-example-stack">
      <div>
        <h3>进度工作区，切换内容</h3>
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
        <h3>同一工作下的第二层内容</h3>
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
          当前查看：{trackingView === 'progress' ? '流程进度' : '异常跟踪'}
          。 内容导航保留下划线：两种状态均使用 500 字重，2px
          主题线随当前位置连续移动。 手机页面左右保留 12px，层间留白
          4–8px，点击区域至少 44px；
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

const PICKER_EXAMPLE_FLOW_GROUPS = [
  { key: 'sales', label: '销售、生产与出货', options: [{ value: 'sales_to_production', label: '销售受理到生产准备' }] },
  {
    key: 'purchase',
    label: '采购、委外与库存',
    options: [
      { value: 'purchase_to_inventory', label: '采购下单到入库应付' },
      { value: 'outsourcing_to_inventory', label: '委外发料到回货应付' },
    ],
  },
]
const PICKER_EXAMPLE_STEPS = [
  { label: '核对采购订单', roles: ['purchase'] },
  { label: '交接到货', roles: ['purchase', 'warehouse'] },
  { label: '登记入库', roles: ['warehouse'] },
]
const PICKER_EXAMPLE_ROLE_GROUPS = [
  {
    key: 'present',
    label: '本图有节点',
    options: [
      { value: 'purchase', label: '采购' },
      { value: 'warehouse', label: '仓库' },
    ].map((option) => ({ ...option, count: PICKER_EXAMPLE_STEPS.filter(({ roles }) => roles.includes(option.value)).length })),
  },
  { key: 'absent', label: '本图暂无节点', options: [{ value: 'finance', label: '财务' }] },
]

function BusinessChainPickerExample() {
  const [scope, setScope] = useState('outsourcing_to_inventory')
  const [highlightedRoles, setHighlightedRoles] = useState([])
  const selectedRoles = PICKER_EXAMPLE_ROLE_GROUPS.flatMap(({ options }) => options).filter(({ value }) => highlightedRoles.includes(value))

  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row erp-control-example-compact" data-chain-picker-example="">
        <BusinessChainDesignPicker kind="scope" value={scope} groups={PICKER_EXAMPLE_FLOW_GROUPS} onChange={setScope} />
        <BusinessChainDesignPicker kind="role" value={highlightedRoles} groups={PICKER_EXAMPLE_ROLE_GROUPS} onChange={setHighlightedRoles} />
      </div>
      <div className="erp-control-table-scroll">
        <table className="erp-control-table" data-table-lines="appearance" aria-label="岗位高亮示例步骤">
          <thead><tr><th>示例步骤</th><th>高亮岗位</th></tr></thead>
          <tbody>
            {PICKER_EXAMPLE_STEPS.map(({ label, roles }) => {
              const highlight = businessChainRoleHighlight(roles, selectedRoles)
              return <tr key={label}><td>{label}</td><td>{highlight ? <strong>{highlight.text}</strong> : '—'}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FILTER_EXAMPLE_OWNERS = [...new Set(RECORDS.map(({ owner }) => owner))].map((owner) => ({ label: owner, value: owner }))

const FILTER_USAGE_ANCHORS = {
  result: '[data-filter-example-result]',
  quick: '[aria-label="演示风险筛选"]',
  'mobile-quick': '[aria-label="演示风险筛选"]',
  search: '.erp-business-operation-panel__search, .erp-mobile-search',
  secondary: '.erp-business-operation-panel__filter .erp-anchored-control-trigger',
  clear: '.erp-business-operation-panel__filter .erp-anchored-control-trigger',
}
const FILTER_DIALOG_PARTS = ['secondary', 'clear']

function markSampleUsage(target, reveal = true) {
  target.setAttribute('data-sample-usage-highlight', '')
  if (reveal) target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return () => target.removeAttribute('data-sample-usage-highlight')
}

function FiltersExample({ usageId, usageRules }) {
  const [device, setDevice] = useState('desktop')
  const [risk, setRisk] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [searchDraft, setSearchDraft] = useState()
  const [scope, setScope] = useState('active')
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState('')
  const [usagePart, setUsagePart] = useState(null)
  const exampleRef = useRef(null)
  const panelRuleRef = useRef(null)
  const mobile = device === 'mobile'
  const pointsToPanel = FILTER_DIALOG_PARTS.includes(usagePart)
  useLayoutEffect(() => {
    if (!usagePart) return
    const anchor = exampleRef.current?.querySelector(FILTER_USAGE_ANCHORS[usagePart])
    if (!anchor) return
    if (!pointsToPanel) return markSampleUsage(anchor)
    if (open) anchor.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [usagePart, pointsToPanel, open])
  useLayoutEffect(() => {
    const rule = panelRuleRef.current
    if (!rule) return
    const trigger = exampleRef.current?.querySelector(FILTER_USAGE_ANCHORS.secondary)
    if (!open) {
      panelRuleRef.current = null
      if (document.activeElement === trigger || document.activeElement === document.body) {
        rule.focus({ preventScroll: true })
      }
    } else if (pointsToPanel) {
      const panelId = trigger?.getAttribute('aria-controls')
      const panel = panelId && document.getElementById(panelId)
      const target = panel?.getClientRects().length ? panel : trigger
      target?.focus({ preventScroll: true })
    }
  }, [open, pointsToPanel, usagePart])
  const changeDevice = (next) => {
    if (next === device) return
    setSearchDraft(exampleRef.current?.querySelector('input[aria-label="演示搜索"]')?.value)
    setDevice(next)
  }
  const changeOpen = (next) => {
    setOpen(next)
    if (next && pointsToPanel) setUsagePart(null)
  }
  const locateUsage = (part, rule) => {
    const needsPanel = FILTER_DIALOG_PARTS.includes(part)
    if (!needsPanel && part === usagePart) {
      setUsagePart(null)
      return
    }
    setUsagePart(part)
    panelRuleRef.current = needsPanel ? rule : null
    if (needsPanel) changeDevice('desktop')
    if (part === 'mobile-quick') changeDevice('mobile')
    setOpen(needsPanel)
  }
  const changeScope = (nextScope) => {
    setScope(nextScope)
    if (!demoRiskAvailable(risk, nextScope)) setRisk('all')
  }
  const resetFilters = () => {
    changeScope('active')
    if (!mobile) setOwner('')
  }
  const matching = RECORDS.filter(
    (row) =>
      (scope === 'all' || row.scope === scope) &&
      (mobile || !owner || row.owner === owner) &&
      `${row.number} ${row.product} ${row.owner}`
        .toLowerCase()
        .includes(keyword.trim().toLowerCase())
  )
  const rows = matching.filter((row) => risk === 'all' || row.risk === risk)
  const scopeLabel = PROGRESS_SCOPE_OPTIONS.find(
    ({ value }) => value === scope
  )?.label
  const FilterRow = mobile ? HorizontalScroll : 'div'
  const quickFilters = (
    <FilterRow
      key="filters"
      className={mobile ? 'erp-control-example-row' : 'erp-control-example-row erp-control-example-compact'}
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
        initialDraft={searchDraft}
        onSearch={setKeyword}
        onFocus={() => setOpen(false)}
      />
      <MobileFilterPopover
        contextLabel="演示"
        title="演示筛选"
        open={open}
        onOpenChange={changeOpen}
        count={scope === 'active' ? 0 : 1}
        onReset={resetFilters}
      >
        <MobileFilterChoices
          label="演示记录范围"
          value={scope}
          onChange={changeScope}
          options={PROGRESS_SCOPE_OPTIONS}
        />
      </MobileFilterPopover>
    </div>
  )
  return (
    <div
      className="erp-control-example-stack erp-control-filter-example"
      ref={exampleRef}
      data-filter-usage={usagePart ?? undefined}
    >
      <SlidingSegmented
        aria-label="筛选样例设备"
        value={device}
        onChange={(next) => {
          panelRuleRef.current = null
          changeDevice(next)
          setOpen(false)
          setUsagePart(null)
        }}
        options={[
          { label: '电脑', value: 'desktop' },
          { label: '手机', value: 'mobile' },
        ]}
      />
      <div className={`erp-control-filter-preview${mobile ? ' erp-mobile-controls erp-control-filter-preview--mobile' : ''}`}>
        {mobile ? <>{searchControls}{quickFilters}</> : (
          <>
            <BusinessOperationPanel
              showSelection={false}
              filtersOpen={open}
              onFiltersOpenChange={changeOpen}
              activeFilterCount={Number(scope !== 'active') + Number(Boolean(owner))}
              onClearFilters={resetFilters}
              filters={[
                <BusinessSearchInput key="search" aria-label="演示搜索" placeholder="单号、产品、负责人" value={keyword} initialDraft={searchDraft} onSearch={setKeyword} />,
                <FilterChipGroup key="scope" label="演示记录范围" value={scope} options={PROGRESS_SCOPE_OPTIONS} onChange={changeScope} />,
                <FilterSelect key="owner" label="演示负责人" value={owner} options={FILTER_EXAMPLE_OWNERS} onChange={setOwner} showSearch />,
              ]}
            />
            {quickFilters}
          </>
        )}
      </div>
      <p role="status" data-filter-example-result="">
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
              resetFilters()
            }}
          >
            清除条件
          </Button>
        </Empty>
      )}
      <DevControlUsageTable
        id={usageId}
        rows={usageRules}
        hint="点整行可定位并高亮样例部位"
        activeTarget={usagePart}
        dialogTargets={FILTER_DIALOG_PARTS}
        onLocate={locateUsage}
      />
    </div>
  )
}

function ActionsExample() {
  const [message, setMessage] = useState('选择一个动作，查看就地反馈。')
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row erp-control-example-compact">
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
      <div className="erp-control-action-legend erp-control-example-compact">
        <span>主动作：实心</span>
        <span>次动作：描边</span>
        <span>辅助动作：文字</span>
      </div>
    </div>
  )
}

const SELECT_DEMOS = {
  basic: <BasicInputExample field="select" />,
  grouped: <GroupedSelectExample />,
  'long-value': <SelectLongValueExample />,
  'operation-parameter': <SelectOperationParameterExample />,
}

const BUSINESS_FORM_DEMOS = {
  form: <DevUIBusinessExamples type="business-form" />,
  'wide-lines': <DevSelectValueExample />,
}

function SampleVariants({ variant, examples }) {
  const [visited, setVisited] = useState([variant])
  if (!visited.includes(variant)) setVisited([...visited, variant])
  return visited.map((key) => (
    <div key={key} hidden={key !== variant}>{examples[key]}</div>
  ))
}

const SAMPLE_COMPONENTS = {
  'business-form-modal': ({ usageId, usageRules }) => (
    <DevUIFeedbackExamples sample="editor" usageId={usageId} usageRules={usageRules} />
  ),
  'app-modal': ({ usageId, usageRules }) => <DevUIFeedbackExamples sample="standard" usageId={usageId} usageRules={usageRules} />,
  'business-modal': ({ usageId, usageRules, onEditorExample }) => (
    <DevUIFeedbackExamples sample="record" usageId={usageId} usageRules={usageRules} onEditorExample={onEditorExample} />
  ),
  drawer: ({ usageId, usageRules }) => <DevUIFeedbackExamples sample="drawer" usageId={usageId} usageRules={usageRules} />,
  'alert-dialog': ({ usageId, usageRules }) => <DevUIFeedbackExamples sample="alert" usageId={usageId} usageRules={usageRules} />,
  feedback: () => <DevUIFeedbackExamples sample="feedback" />,
  'attachment-drawer': () => <DevUIFeedbackExamples sample="attachment-drawer" />,
  'danger-confirm': () => <DevUIFeedbackExamples sample="danger-confirm" />,
  'business-form': ({ variant }) => <SampleVariants variant={variant} examples={BUSINESS_FORM_DEMOS} />,
  'source-picker': () => <DevUIBusinessExamples type="source-picker" />,
  'business-toolbar': DevUIBusinessToolbarExample,
  table: TableExample,
  pagination: DevUIPaginationExample,
  inputs: BasicInputExample,
  input: () => <BasicInputExample field="name" />,
  'text-area': () => <BasicInputExample field="note" />,
  help: DevSupplementalHelpExample,
  select: ({ variant }) => <SampleVariants variant={variant} examples={SELECT_DEMOS} />,
  'filter-select': FilterSelectExample,
  'search-input': SearchInputExample,
  'chain-view-picker': BusinessChainPickerExample,
  date: () => <DateInputExample field="date" />,
  'date-time': () => <DateInputExample field="time" />,
  'date-range': () => <DateInputExample field="range" />,
  directory: DevUIDirectoryExample,
  navigation: NavigationExample,
  tabs: () => <NavigationExample only="tabs" />,
  'tab-list': ControlledTabListExample,
  segmented: () => <NavigationExample only="segmented" />,
  'filter-chip': CountedFilterExample,
  'filter-chip-group': () => <NavigationExample only="filter-chip-group" />,
  filters: FiltersExample,
  'filter-popover': FilterPopoverExample,
  actions: ActionsExample,
  'app-empty': DevUIEmptyExamples,
  empty: DevUIPageStateExamples,
  counts: CountExample,
}

function DirectoryEntry({ topic, active, onClick }) {
  return (
    <DirectoryItem
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span>{topic.title}</span>
    </DirectoryItem>
  )
}

function ControlSample({ Component, onReady, sampleRef, usageLocation, ...props }) {
  useLayoutEffect(() => {
    onReady?.()
  }, [onReady])
  useLayoutEffect(() => {
    const stage = sampleRef.current
    if (!usageLocation || !stage) return
    const locate = (selector) => Array.from(stage.querySelectorAll(selector))
      .find((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    let highlighted
    let clearHighlight
    const syncHighlight = (reveal) => {
      const target = locate(usageLocation.anchor) || locate(usageLocation.fallback)
      if (target === highlighted) return
      clearHighlight?.()
      highlighted = target
      clearHighlight = target ? markSampleUsage(target, reveal) : undefined
    }
    syncHighlight(true)
    const observer = new MutationObserver(() => syncHighlight(false))
    observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] })
    return () => {
      observer.disconnect()
      clearHighlight?.()
    }
  }, [sampleRef, usageLocation, props.variant])
  return <Component {...props} />
}

export default function DevControlStandards() {
  const [params, setParams] = useSearchParams()
  const { accent, appearance, effectiveTheme } = useERPTheme()
  const [mode, setMode] = useState(effectiveTheme)
  const [locatedUsage, setLocatedUsage] = useState(null)
  const isGuide = params.get('control') === COMPONENT_GUIDE.key
  const openUsage = !isGuide && params.get('controlSection') === 'usage'
  const current = isGuide ? COMPONENT_GUIDE : TOPICS.find((topic) => topic.key === params.get('control')) ?? TOPICS[0]
  const variant = current.variants?.find(({ value }) => value === params.get('example')) ?? current.variants?.[0]
  const details = { ...current, ...variant }
  const Sample = SAMPLE_COMPONENTS[current.key]
  const query = params.get('controlq') || ''
  const searching = Boolean(query.trim())
  const matches = findDirectoryEntries(query)
  const guideMatches = query.trim().toLowerCase().split(/\s+/u).every((word) =>
    (`${COMPONENT_GUIDE.title} ${SHARED_COMPONENT_SEARCH_TEXT}`).toLowerCase().includes(word)
  )
  const contentRef = useRef(null)
  const sampleRef = useRef(null)
  const directoryRef = useRef(null)
  const groupsRef = useRef(null)
  const groupIdPrefix = useId()
  const headingId = useId()
  const usageId = useId()
  const focusUsage = useCallback(() => {
    const usage = document.getElementById(usageId)
    usage?.scrollIntoView({ block: 'start', inline: 'nearest' })
    usage?.focus({ preventScroll: true })
  }, [usageId])
  const [directory, setDirectory] = useState(() => ({
    control: current.key,
    searching,
    expanded: new Set(DIRECTORY_GROUPS.map(({ key }) => key)),
  }))
  if (directory.control !== current.key || directory.searching !== searching) {
    const expanded = new Set(directory.expanded)
    if (current.directoryGroup && (directory.control !== current.key || !searching)) {
      expanded.add(current.directoryGroup)
    }
    setDirectory({ control: current.key, searching, expanded })
  }
  const toggleGroup = (key) => {
    setDirectory((previous) => {
      const expanded = new Set(previous.expanded)
      if (expanded.has(key)) expanded.delete(key)
      else expanded.add(key)
      return { ...previous, expanded }
    })
  }
  const setAllGroupsExpanded = (expanded) => {
    setDirectory((previous) => ({
      ...previous,
      expanded: new Set(expanded ? DIRECTORY_GROUPS.map(({ key }) => key) : []),
    }))
  }
  const allGroupsExpanded = directory.expanded.size === DIRECTORY_GROUPS.length
  const currentGroupExpanded = directory.expanded.has(current.directoryGroup)
  const update = (values) => {
    const next = new URLSearchParams(params)
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key)
    )
    setParams(next, { replace: Object.keys(values).length === 1 && Object.hasOwn(values, 'controlq') })
  }
  const selectEntry = (topic, example) => {
    setLocatedUsage(null)
    update({ control: topic.key, example, controlSection: '' })
  }
  const activeUsage = locatedUsage?.control === current.key &&
    (!locatedUsage.variant || locatedUsage.variant === variant?.value) ? locatedUsage : null
  const locateRule = (item) => {
    if (activeUsage?.item === item) {
      setLocatedUsage(null)
      return
    }
    const locations = CONTROL_USAGE_LOCATIONS[current.key]
    const selected = locations.items?.[item]
    const location = typeof selected === 'string' ? { anchor: selected } : selected
    const nextVariant = location?.variant ?? locations.variant
    setLocatedUsage({
      control: current.key,
      item,
      anchor: location?.anchor ?? locations.anchor,
      fallback: location?.fallback ?? locations.anchor,
      variant: nextVariant,
    })
    if (nextVariant && variant?.value !== nextVariant) update({ example: nextVariant })
  }
  useLayoutEffect(() => {
    if (!openUsage && contentRef.current) contentRef.current.scrollTop = 0
  }, [current.key, openUsage])
  useLayoutEffect(() => {
    const groups = groupsRef.current
    const active = groups.querySelector('[aria-current]')
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    else groups.scrollTop = 0
  }, [current.key, currentGroupExpanded, query])
  const isNavigation = current.key === 'navigation'
  const rules = !isGuide && !current.usageInSample && (
    <DevControlUsageTable
      id={usageId}
      rows={current.usageRules.map(([item, requirement, description]) => [item, requirement, description, item])}
      hint="点整行可定位并高亮样例部位"
      activeTarget={activeUsage?.item}
      onLocate={locateRule}
    >
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
    </DevControlUsageTable>
  )

  return (
    <section className="erp-control-library" aria-label="组件设计">
      <aside className="erp-control-library-directory" ref={directoryRef}>
        <SearchInput
          aria-label="搜索组件设计"
          placeholder="用途或组件名"
          searchHint="可搜索：组件代码名、使用场景或样例名称"
          value={query}
          allowClear
          onSearch={(value) => update({ controlq: value })}
        />
        <Directory
          aria-label="组件设计目录"
          allExpanded={allGroupsExpanded}
          onToggleAll={searching ? undefined : () => setAllGroupsExpanded(!allGroupsExpanded)}
          title={<Typography.Text strong>组件目录</Typography.Text>}
        >
          <div className="erp-directory-list">
            <DirectoryEntry
              topic={COMPONENT_GUIDE}
              active={isGuide}
              onClick={() => update({ control: COMPONENT_GUIDE.key, example: '', controlq: '' })}
            />
          </div>
          <div className="erp-directory-list erp-control-library-groups" ref={groupsRef}>
            {DIRECTORY_GROUPS.map(({ key, label }) => {
              const entries = matches.filter(({ topic }) => topic.directoryGroup === key)
              if (!entries.length) return null
              const expanded = searching || directory.expanded.has(key)
              const entriesId = groupIdPrefix + key
              return (
                <section key={key} aria-label={label}>
                  {searching ? (
                    <h2 className="erp-directory-group-title">{label}</h2>
                  ) : (
                    <h2 className="erp-control-library-group-heading">
                      <DirectoryItem
                        expanded={expanded}
                        aria-current={current.directoryGroup === key && !expanded ? 'location' : undefined}
                        aria-controls={entriesId}
                        onClick={() => toggleGroup(key)}
                      >
                        <span>{label}</span>
                      </DirectoryItem>
                    </h2>
                  )}
                  <DirectoryBranch id={entriesId} hidden={!expanded}>
                    {expanded && entries.map(({ topic, variant: match }) => (
                      <DirectoryEntry
                        key={topic.key}
                        topic={topic}
                        active={current.key === topic.key}
                        onClick={() => selectEntry(topic, match?.value)}
                      />
                    ))}
                  </DirectoryBranch>
                </section>
              )
            })}
            {!matches.length && !guideMatches && (
              <div className="erp-control-library-no-results">
                <p>没有匹配的组件或样例</p>
                <Button onClick={() => {
                  update({ controlq: '' })
                  directoryRef.current?.querySelector('input')?.focus()
                }}
                >
                  清除搜索
                </Button>
              </div>
            )}
          </div>
        </Directory>
      </aside>
      <div className="erp-control-library-content" ref={contentRef}>
        <header className="erp-control-library-heading">
          <div>
            <h2 id={headingId}>{current.title}</h2>
            {current.component && (
              <code className="erp-control-library-component-name" lang="en">{current.component}</code>
            )}
            <p>{details.description}</p>
          </div>
          <div className="erp-control-library-theme">
            {!isGuide && (
              <>
                <span>样例外观</span>
                <SlidingSegmented
                  aria-label="组件样例主题"
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
        {isGuide ? (
          <DevSharedComponentGuide topics={TOPICS} labelledBy={headingId} />
        ) : (
          <>
            {isNavigation ? rules : null}
            <div
              className={`erp-control-library-layout${current.key === 'business-toolbar' ? ' erp-control-library-layout--toolbar' : ''}`}
              data-usage-rules={rules && !isNavigation && current.key !== 'business-toolbar' ? '' : undefined}
            >
              <section
                className="erp-control-library-demo"
                aria-label="交互样例"
                ref={sampleRef}
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
                  {variant && (
                    <SlidingSegmented
                      aria-label="样例变体"
                      className="erp-control-library-variants"
                      value={variant.value}
                      options={current.variants}
                      onChange={(value) => {
                        setLocatedUsage(null)
                        update({ example: value })
                      }}
                    />
                  )}
                  <Suspense fallback={<Loading title="正在加载组件示例" />}>
                    <ControlSample
                      key={current.key}
                      Component={Sample}
                      variant={variant?.value}
                      usageId={usageId}
                      usageRules={current.usageRules}
                      onEditorExample={() => update({ control: 'business-form-modal', example: '', controlSection: 'usage' })}
                      sampleRef={sampleRef}
                      usageLocation={activeUsage}
                      onReady={openUsage ? focusUsage : undefined}
                    />
                  </Suspense>
                </ERPThemeScope>
              </section>
              {!isNavigation && current.key !== 'business-toolbar' ? rules : null}
              <aside className="erp-control-library-checks">
                <h3>按这 {details.checks.length} 步核对</h3>
                <ol>
                  {details.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ol>
                <h3>真实页面核对</h3>
                <DevUIConsumerName consumer={details.consumer} />
                <p>{details.consumer.task}</p>
              </aside>
            </div>
            {current.key === 'business-toolbar' ? rules : null}
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
