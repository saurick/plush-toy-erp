# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件 | 范围 |
| --- | --- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水。 |
| `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md` | 截至 2026-06-22 项目级 AGENTS skill 维护规则补充前的完整过程流水。 |
| `docs/archive/progress-2026-06-24-before-menu-request-lifecycle.md` | 截至 2026-06-24 菜单请求生命周期修复前的完整过程流水。 |
| `docs/archive/progress-2026-06-26-before-input-caret-line-height.md` | 截至 2026-06-26 输入框 caret line-height 修复前的完整过程流水，包含 6 月 24-26 日 JSON-RPC 拆分、业务文案、输入控件焦点环、相关单据和清空按钮等记录。 |

## 最近活跃事项

- 业务页数据新鲜度主路径：切换菜单、切换主视图 Tab、顶部“刷新当前页”都应重新请求后端；不得用页内业务数据缓存替代真实读取。
- 菜单交互主路径：切换到不同菜单触发目标页面加载；重复点击当前菜单不刷新，避免请求风暴。需要强制重读时使用顶部“刷新当前页”。
- 业务用户可见字段继续禁止裸主键、幂等键、内部引用、source ID / source line ID 和 `#数字` 兜底；真实业务对象展示名称、编号、来源单据、状态、数量或“已关联”反馈。
- 输入控件主路径：`control-foundation.css` 管 token / 圆角 / 裁剪，`business-control-rhythm.css` 管业务控件高度和真实 input / placeholder / caret 节奏，`control-focus.css` 管 focus ring；不要在单页重复写 caret、line-height 或 focus 补丁。

## 2026-06-26 输入控件 caret line-height 全局收口

- 完成：按真实页面 computed style 定位污染源，销售订单新建弹窗里“客户订单号 / 联系电话 / 联系邮箱”的外层 `ant-input-affix-wrapper` 为 36px 且 `overflow:hidden`，但真实 `input.ant-input` 仍是 22px height / 22px line-height，导致 caret 和 placeholder 看起来被压短、不居中。
- 完成：`control-radius.css` 将业务表单、业务 action form 和业务筛选的单行 input / affix wrapper 统一为纵向 padding 归零、inner input 以控件内高计算 line-height；保留外框高度、圆角和 inset focus ring，不使用 `!important`。
- 完成：`business-responsive.css` 收掉业务记录、权限和状态原因弹窗里的旧 `22px` 单行 input 行高，32px 控件改为 30px line-height，避免其他弹窗继续复现同类问题。
- 完成：`style:l1` 的单行输入垂直节奏断言补扫直接 input 和 affix inner input，比较业务控件内高与真实 line-height，防止 36px 外框里退回 22px input；登录页大尺寸密码框保持 AntD 居中规则，不纳入业务控件内高约束。
- 完成：顺手修复 `business-tables.css` 里已有的 link 按钮 hover / focus 选择器顺序，解除 `corepack pnpm css` 的 `no-descending-specificity` 阻断，不改变按钮视觉属性。
- 验证：追加前已归档 `progress.md` 到 `docs/archive/progress-2026-06-26-before-input-caret-line-height.md`；Playwright computed style 复测确认“客户订单号 / 联系电话 / 联系邮箱”真实 input 均为 `height:34px / line-height:34px / padding-block:0`，外框仍为 36px 且 focus ring 为 inset；`corepack pnpm css`、`corepack pnpm exec eslint --no-warn-ignored scripts/styleL1.mjs`、`STYLE_L1_BASE_URL=http://localhost:4173 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop,business-menu-groups-desktop corepack pnpm style:l1`、`STYLE_L1_BASE_URL=http://localhost:4173 corepack pnpm style:l1`、`corepack pnpm test`、`git diff --check` 均通过；完整 L1 覆盖 66 个场景，前端单测 409 条通过。
- 下一步：后续新增第三方输入、自定义可编辑控件或新业务弹窗时，必须让真实 input、placeholder/search input 和 wrapper 进入 L1 垂直节奏扫描；不要在单页叠加局部 caret 补丁。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区已有多组非本轮文案 / 原型 / 页面改动，本轮未回退、未提交。

## 2026-06-26 搜索框 placeholder 完整显示收口

- 完成：共享 `SearchInput` 和来源导入弹窗搜索框支持短 placeholder + 完整 `aria-label/title` 说明；收短销售订单、采购订单、出货、库存流水、正式业务壳、主数据产品 / SKU、SKU/材料/出货来源导入等会在紧凑搜索栏截断的长搜索提示，完整搜索范围保留在 `searchHint`。
- 完成：`style:l1` 在业务筛选栏盒模型回归中新增搜索框 placeholder 可见宽度断言，后续若再把长说明塞回 placeholder 会在浏览器级回归中失败。
- 验证：追加时 `progress.md` 已处于归档后的最近活跃事项页，追加后为 38 行、6273 字节，未达到归档阈值；`corepack pnpm exec eslint --no-warn-ignored ...`、限定 `git diff --check`、`STYLE_L1_PORT=4176 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,purchase-receipts-table-control-columns-desktop,material-master-header-desktop corepack pnpm style:l1`、`corepack pnpm css`、`corepack pnpm test` 均通过；定向 L1 覆盖 6 个场景，前端单测 409 条通过。
- 下一步：若后续发现非业务筛选栏或 dev-only 页面也存在真实截断，应按对应页面容器单独补短 placeholder / 完整 hint，不把说明性长句直接塞回 placeholder。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；未运行完整 `pnpm lint`，因为该脚本会 `--fix` 整个 `src/`，当前工作区已有多组非本轮改动，已用定向 no-fix ESLint 替代。

## 2026-06-26 共享控件样式边界治理

- 完成：将职责过载且命名过窄的 `control-radius.css` 拆成 `control-foundation.css`、`business-control-rhythm.css`、`control-focus.css` 三层，并在 `app.css` 最后按 foundation -> rhythm -> focus 导入，明确共享控件样式的层叠边界。
- 完成：`control-foundation.css` 只保留 ERP 控件 token、AntD / 原生控件圆角、wrapper 裁剪、portal 控件基线和嵌套原生 input 透明化；`business-control-rhythm.css` 只保留业务表单、业务 action modal、筛选控件、业务记录 / 权限 / 状态原因弹窗的控件高度和真实 input / placeholder / search input line-height；`control-focus.css` 只保留 focus / focus-within ring 和内层原生 input 的浏览器 / Tailwind focus ring 清理。
- 完成：从 `business-responsive.css` 移出非响应式的业务记录 / 权限 / 状态原因弹窗控件节奏和 modal focus 规则，避免响应式文件继续承接共享控件基线；同步 `web/README.md` 记录三层职责、禁止项和后续维护规则。
- 完成：完整 L1 暴露销售 / 采购 / 委外共用的带单位数量字段在 `件（PCS）` 后缀下输入本体宽度不足，已将 `.erp-line-item-field--quantity` 标准宽度从 `252px` 调整为 `264px`，保持中文单位可读且输入本体满足 112px 下限。
- 验证：`corepack pnpm css`、`corepack pnpm exec eslint --no-warn-ignored scripts/styleL1.mjs`、`corepack pnpm test`、`STYLE_L1_PORT=4189 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop corepack pnpm style:l1`、`STYLE_L1_PORT=4190 corepack pnpm style:l1`、`git diff --check` 均通过；完整 L1 覆盖 66 个场景，前端单测 409 条通过。
- 下一步：后续新增第三方输入、自定义可编辑控件或新业务弹窗时，先判断属于 foundation、rhythm 还是 focus，再补对应 L1 浏览器断言；不要恢复单个 `control-radius.css` 或在页面 CSS 写局部控件补丁。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区已有多组非本轮文案 / 原型 / 页面改动，本轮未回退、未提交。

## 2026-06-26 数量单位后缀完整显示

- 完成：保留业务可读中文单位，不退回仅显示 `KG / PCS`；`FieldWithUnitSuffix` 改为按中文 / 全角 / 英文混排估算后缀宽度，并通过 CSS 变量交给共享样式控制，补充 `title` 便于完整悬停查看。
- 完成：`erp-item-field-unit-suffix` 改为使用 `--erp-unit-suffix-width`，单位后缀保持固定不被输入框挤压；销售 / 采购 / 委外明细复用的数量字段宽度从 `236px` 放宽到 `252px`，避免后缀变宽后数量输入本体低于既有下限。
- 完成：`lineItemUnitAssertions` 增加后缀 `scrollWidth <= clientWidth` 盒模型断言，防止后续再次出现 `千克（KG）` 这类中文单位被裁切但值本身存在的假通过。
- 验证：`pnpm exec eslint --fix --ext .js --ext .jsx src/erp/components/business-list/FieldWithUnitSuffix.jsx`、`node --check scripts/style-l1/lineItemUnitAssertions.mjs`、`pnpm css`、`pnpm test` 均通过；`HEADED=1 STYLE_L1_PORT=4249 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 已跑过销售订单单位后缀断言，后续失败在 `business-v1-suppliers-form-modal` 的分页 Select focus 边框，非本轮数量单位链路。
- 下一步：若继续收口完整 `business-formal-module-shells-desktop`，应单独处理供应商弹窗分页 Select focus 样式；不要把该阻塞误判成销售订单数量单位问题。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；未更新原型，原因是这是运行态共享控件的显示完整性修复，不改变原型结构、业务意义或入口状态。

## 2026-06-26 搜索框 placeholder 二次收口

- 完成：按截图复核后确认材料、工序、客户 / 供应商等主数据搜索框仍会截断；将业务筛选栏 placeholder 规则改为只展示对象级短入口，如“搜索材料 / 搜索订单 / 搜索入库单”，完整字段范围统一放入 `searchHint`、`aria-label` 和 `title`。
- 完成：同步收短销售订单、采购订单、出货、入库、质检、库存流水、Workflow、运营事实、委外、正式业务壳和来源导入弹窗的搜索 placeholder；更新采购入库真实写入 smoke 与 L1 里按 placeholder 定位的旧文案。
- 完成：`style:l1` 新增每个场景可见业务搜索框和来源导入搜索框的 placeholder 宽度扫描，不再只在部分 toolbar 断言中检查首个搜索框。
- 验证：`corepack pnpm exec eslint --no-warn-ignored ...`、限定 `git diff --check`、`STYLE_L1_PORT=4178 STYLE_L1_SCENARIOS=material-master-header-desktop corepack pnpm style:l1`、`STYLE_L1_PORT=4180 STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop corepack pnpm style:l1`、`STYLE_L1_PORT=4181 STYLE_L1_SCENARIOS=shipment-date-filter-desktop corepack pnpm style:l1`、`STYLE_L1_PORT=4182 STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop corepack pnpm style:l1`、`corepack pnpm css`、`corepack pnpm test` 均通过；前端单测 409 条通过。
- 下一步：如果后续仍发现 Dashboard、权限中心或 dev-only 页面也有真实截断，应按对应页面单独治理；本轮只收口正式业务页筛选栏和来源导入搜索框。
- 阻塞/风险：`business-formal-module-shells-desktop` 本轮两次在 `Target page, context or browser has been closed` 处失败，未给出 placeholder 宽度断言失败；已用材料、采购、出货、入库等更窄场景覆盖当前截图和主要正式业务搜索框。未改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态。

## 2026-06-27 业务页头部摘要卡窄宽重叠修复

- 完成：将共享 `PageHeaderCard` 的摘要区从强制横向 grid 改为可换行 flex，并给头部卡片启用 inline-size container；空间足够时摘要仍靠右，窄内容区时整体落到标题 / 标签下方，避免委外订单等业务页头部摘要卡覆盖说明和标签。
- 完成：`style:l1` 的业务页头部断言从“永远右侧单行”改为“右侧或下方均可，但不得覆盖标题说明区、不得横向溢出、标签不得省略”；补充委外订单桌面和移动窄宽路径断言。当前工作区已有委外摘要项收窄为 4 项的非本轮改动，本轮按当前 runtime 真源验证，不回退该现场。
- 验证：`pnpm css`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`pnpm test`、`git diff --check` 均通过；目标 L1 覆盖正式业务页、委外订单桌面、暗色切换后的移动窄宽路径和相邻表格 / 操作区；前端单测 409 条通过。
- 下一步：后续若新增超过 4 个页头摘要的业务页，继续复用共享 `PageHeaderCard`，不要在单页通过绝对定位、负 margin 或隐藏摘要项处理空间不足。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；未运行 `pnpm lint`，因为该脚本会 `--fix` 整个 `src/`，当前工作区已有大量非本轮改动，已用 `pnpm css`、`pnpm test`、目标浏览器回归和 `git diff --check` 覆盖本次风险。

## 2026-06-27 业务页头部摘要统一治理

- 完成：按 `plush-page-design-governance` 复核正式业务页 `PageHeaderCard` 摘要，移除头部里的 `已选...` 操作反馈和委外 / 运营事实页过密的关闭 / 取消类状态摘要；选中态继续由当前操作条、来源选择器或弹窗内摘要承接。
- 完成：`PageHeaderCard` 不再在每张头部指标卡上重复显示“摘要”徽标，保留 `aria-label` 的只读摘要语义、默认光标和 L1 只读断言。
- 完成：在 `docs/product/prototypes/business-module-page-standard-v1/README.md` 增加标准页头部摘要规则：默认 2-4 项，只放对象总量、当前筛选结果、最关键状态或只读模式；状态分布回到筛选、表格、看板或详情，操作反馈不进入标题摘要。
- 验证：`node --check` 覆盖本轮触达的 `.mjs` 配置和 L1 脚本；`/usr/local/bin/pnpm exec eslint --ext .js --ext .jsx --ext .mjs ...` 定向通过；限定 `git diff --check` 通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,business-formal-module-shells-desktop,material-master-header-desktop /usr/local/bin/pnpm style:l1` 通过，共 5 个场景。
- 下一步：后续新增业务页摘要时优先复用本规则，不强行统一成同一组字段；按页面主任务选择少量能改变判断的只读信息。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；未运行完整 `pnpm lint / pnpm test / pnpm style:l1`，因为当前工作区已有大量非本轮改动，本轮使用定向 ESLint、grep、diff-check 和相关 L1 场景验证。

## 2026-06-27 业务页头部摘要横向排列修复

- 完成：针对材料档案截图里摘要卡在桌面右侧竖排占用大量 y 轴空间的问题，将共享 `.erp-business-page-header-card__stats` 从桌面 flex wrap 改回横向 grid；桌面使用 `grid-auto-flow: column` 固定横向排列，移动端继续通过响应式规则两列排列。
- 完成：同步 `style:l1` 头部摘要断言，明确桌面必须横向排列，不能竖排占用高度；移动端按紧凑视口允许两列换行，避免为手机硬撑单行导致横向溢出。
- 验证：`node --check web/scripts/styleL1.mjs`、`/usr/local/bin/pnpm exec eslint --ext .mjs scripts/styleL1.mjs`、`/usr/local/bin/pnpm css`、限定 `git diff --check` 均通过；`STYLE_L1_SCENARIOS=material-master-header-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1` 通过，共 5 个场景。
- 下一步：若后续再次遇到头部摘要和标题区抢空间，应优先控制摘要项数量和桌面横向排列宽度；不要把桌面摘要退回竖排。
- 阻塞/风险：本轮只改共享样式和 L1 断言，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态。

## 2026-06-27 业务页工作台对齐 trade-erp 样式

- 完成：严格参考 trade-erp 采购合同页的业务页工作台形态，调整共享 `PageHeaderCard` 和 `BusinessOperationPanel`：标题摘要卡在桌面右侧横向排列并按 trade-erp 的 `104-130px` 紧凑 tile 尺寸收敛；筛选区按“搜索 + 日期 + 状态/候选/排序 + 清空筛选”组织为紧凑网格，中宽桌面自动换成两行，避免日期输入或排序控件互相覆盖。
- 完成：将空选中当前操作条统一为“请选择一条记录”，选中后仍显示真实业务单号、名称或来源摘要；导出按钮文案统一从“导出当前筛选”改为 trade-erp 口径“导出筛选结果”。保留“新建订单 / 新建采购订单 / 生成质检草稿”等页面真实动作文案，不把业务动作边界误改成泛化“新建记录”。
- 完成：同步 `docs/product/prototypes/business-module-page-standard-v1/README.md`，把标准页口径从分散的筛选条 / 结果工具条收敛为“业务工作台”，记录摘要横向、空选中和导出文案规则。
- 验证：`/usr/local/bin/pnpm css`、定向 `/usr/local/bin/pnpm exec eslint --ext .js --ext .jsx --ext .mjs ...`、限定 `git diff --check` 均通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,business-formal-module-shells-desktop,material-master-header-desktop /usr/local/bin/pnpm style:l1` 通过，共 5 个场景。
- 下一步：后续新增正式业务页时继续复用共享工作台，不在单页重复写筛选网格、页头统计或空选中文案；如果某页需要特殊新建文案，必须按真实业务动作命名，不为视觉统一牺牲语义。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区仍有多组非本轮改动，本轮未回退、未提交。

## 2026-06-27 业务页页头响应式节奏修正

- 完成：按截图反馈修正页头摘要响应式节奏：移除 `business-responsive.css` 在 980px 下强制页头单列的旧规则，改为让 `PageHeaderCard` 按自身内容宽度判断；窗口逐步缩小时先让左侧描述换行，只有内容区继续收窄后才让摘要组整体落到描述下方。
- 完成：将共享头部摘要 tile 宽度从上一轮的 `132-150px` 收回到 trade-erp 的 `104-130px` 口径；同步 `style:l1` 尺寸断言，防止后续再次把摘要卡做大。
- 验证：`/usr/local/bin/pnpm css`、`/usr/local/bin/pnpm exec eslint --ext .mjs scripts/styleL1.mjs`、限定 `git diff --check` 均通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,business-formal-module-shells-desktop,material-master-header-desktop /usr/local/bin/pnpm style:l1` 通过，共 5 个场景；Playwright 采样 `/erp/master/materials` 在 1440/1240/1100/980/900/840/760 宽度确认：1240、980、900 先描述换为两行且摘要仍在右侧，840 后摘要落到描述下方，760 移动端摘要按两列换行。
- 下一步：后续页头响应式调整必须同时看描述行数、摘要位置和 tile 尺寸；不要只按截图宽度写单一媒体查询。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区仍有多组非本轮改动，本轮未回退、未提交。

## 2026-06-27 业务页筛选区布局回退

- 完成：按 BOM 管理截图反馈，撤回上一轮把 `.erp-business-operation-panel__filters` 改成固定列 grid 的处理，恢复原有 `flex + wrap` 自适应布局；移除筛选项排序、宽度 100% 和 1600px grid 断点，避免筛选项少的页面被横向拉散。
- 完成：日期范围控件恢复原来的桌面基线宽度，移动端仍由 `business-responsive.css` 纵向适配；页头摘要响应式修复保持不变。
- 验证：`/usr/local/bin/pnpm css`、限定 `git diff --check` 均通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,material-master-header-desktop /usr/local/bin/pnpm style:l1` 通过，共 5 个场景；Playwright 采样 `/erp/purchase/material-bom` 确认筛选区 `display:flex`、`flex-wrap:wrap`、`gridTemplateColumns:none`，BOM 筛选控件间距恢复为 8px。
- 下一步：后续借鉴 trade-erp 时只吸收页面层级和业务语义，不能把固定列网格硬套到所有 plush 筛选栏；筛选项数量少的页面必须保持自然贴合。
- 阻塞/风险：本轮只回退共享筛选区布局，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区仍有多组非本轮改动，本轮未回退、未提交。

## 2026-06-27 Workflow 页头边界摘要移除

- 完成：移除 Workflow 业务页 `PageHeaderCard` 的页头 summary，不再在首屏展示“主路径 workflow_tasks / 只处理协同任务 / 边界说明”这一行，减少页面头部说明文字和 y 轴占用。
- 完成：保留 `Workflow V1 / 不写事实层` 标签、操作条 `boundaryText`、导出禁用提示和任务抽屉边界提示，确保 Workflow / Fact 边界仍在实际操作上下文中可见。
- 验证：`/usr/local/bin/pnpm exec eslint --ext .jsx src/erp/pages/WorkflowBusinessModulePage.jsx`、`/usr/local/bin/pnpm css` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1` 通过，共 1 个场景；`rg` 确认页头文件不再包含 `主路径 workflow_tasks`，边界文案仍保留在配置和操作提示上下文。
- 下一步：后续 Workflow 页头只放模块标题、描述、少量识别标签和必要统计；流程边界说明优先放在具体操作区、禁用原因或任务抽屉中。
- 阻塞/风险：本轮只改 Workflow 页头展示，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或部署脚本；当前工作区仍有多组非本轮改动，本轮未回退、未提交。

## 2026-06-27 当前操作长说明全局移除

- 完成：按截图反馈将共享 `SelectionActionBar` 从当前操作条中移除 `boundaryText` 渲染，所有复用 `BusinessOperationPanel` 的正式业务页不再在当前操作下方显示长段 Workflow / Fact 边界说明；调用方保留业务边界数据线索但不展示。
- 完成：将当前操作 copy 区从纵向 grid 调整为可换行横向 flex，并设置当前操作行最小高度，横向紧凑态下标题、选中标签和按钮组按同一中线垂直居中；移动端多行堆叠只检查不渲染长说明。
- 完成：补充 `businessDateFilterUsage.test.mjs` 静态守卫和 `business-formal-module-shells-desktop` L1 浏览器断言，防止后续把页面级边界说明重新接回当前操作条。
- 验证：`node --test src/erp/utils/businessDateFilterUsage.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/BusinessListLayout.jsx src/erp/utils/businessDateFilterUsage.test.mjs scripts/style-l1/businessFormalScenarios.mjs`、`/usr/local/bin/pnpm css`、`STYLE_L1_PORT=4247 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1`、`/usr/local/bin/pnpm test` 均通过；`style:l1` 覆盖供应商、客户、销售订单、产品、BOM、库存、质检、出货、委外、Workflow 等共享当前操作条路径。
- 下一步：后续如果确实需要展示 Workflow / Fact 边界，优先放在页面头部短标签、禁用原因、弹窗说明或任务抽屉等具体上下文，不再塞回当前操作条第二行。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区仍有多组非本轮/并行改动，本轮未回退、未提交。

## 2026-06-27 业务页头 summary 插槽彻底移除

- 完成：按 `plush-page-design-governance` 将 `PageHeaderCard` 的页头底部 `summary` 能力从共享组件层删除，不再只是单页不传参；同步清理 `.erp-business-page-header-card__summary` 和 `.erp-business-module-hero__footer` 对应样式。
- 完成：新增 `businessPageHeader.test.mjs` 静态守卫并接入 `/usr/local/bin/pnpm test`，禁止 `PageHeaderCard` 恢复 `summary` 参数、页面调用点传 `summary`，以及 CSS 中残留页头 summary/footer 视觉样式。
- 完成：`style:l1` 的业务页头统计断言新增 DOM 检查，正式业务页壳场景会验证页面运行时不再渲染页头底部 summary 区域；委外订单页同步收口旧边界说明断言，保留短业务提示，不再要求操作边界长句出现在首屏。
- 验证：`/usr/local/bin/pnpm exec node --test src/erp/utils/businessPageHeader.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js --ext .jsx --ext .mjs scripts/styleL1.mjs scripts/style-l1/businessFormalScenarios.mjs src/erp/utils/businessPageHeader.test.mjs src/erp/components/business-list/BusinessListLayout.jsx`、`/usr/local/bin/pnpm css`、`/usr/local/bin/pnpm test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1` 均通过；`rg` 复核确认业务页 `PageHeaderCard` 不再出现 summary 调用，剩余 `summary = null` 仅属于 `BusinessFilterPanel` 侧栏摘要。
- 下一步：后续业务页头只允许标题、描述、少量标签和必要统计；需要解释边界时放到禁用原因、弹窗、任务抽屉或正式帮助文档，不恢复页头底部长说明区域。
- 阻塞/风险：本轮只改前端共享页头、样式和测试守卫，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区仍有多组非本轮/并行改动，本轮未回退、未提交。

## 2026-06-27 对账管理路由复用白屏修复

- 完成：修复 `OperationalFactWorkspace` 在 SPA 路由复用时保留旧 `activeKey` 导致单视图页面取不到 `activeConfig.defaultDateField` 的问题；渲染、加载、选择、分页、日期筛选、工具栏、附件和行操作统一使用当前页面允许的 `currentActiveKey`。
- 完成：在 `business-formal-module-shells-desktop` L1 场景中补充“生产进度 -> 侧边栏对账管理”的真实菜单跳转回归，覆盖直达 URL 测不到的同组件跨路由状态复用路径。
- 验证：Playwright 真实复现 `/erp/production/progress` 点击侧边栏“对账管理”进入 `/erp/finance/reconciliation`，无 pageerror；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1` 通过，共 1 个场景；限定 `git diff --check` 通过。
- 下一步：后续新增单视图复用页时继续通过共享 workspace 的 resolved key 收口，不在单页额外硬编码旧 key 清理逻辑。
- 阻塞/风险：本轮只改前端共享 operational facts 页面状态解析和 L1 回归，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区已有多组非本轮改动，本轮未回退、未提交。

## 2026-06-27 Operational Fact 请求生命周期防护

- 完成：按 `plush-page-design-governance` 对 `OperationalFactWorkspace` 补充列表请求版本防护；快速路由、菜单、筛选、刷新或 tab 切换产生重叠请求时，只允许最新请求更新 rows、selection、total、loading 和错误 toast，组件卸载时未完成请求同步失效。
- 完成：保持页面主职责不变：生产、出库、应收、应付、发票、对账仍只展示和处理当前 operational fact / finance fact 视图；未改 schema、migration、JSON-RPC、RBAC、菜单、WorkflowUsecase 或 Fact usecase。
- 验证：`/usr/local/bin/pnpm exec eslint --ext .jsx src/erp/pages/OperationalFactsPage.jsx`、限定 `git diff --check` 通过；Playwright 人为挂起 `/erp/production/progress` 的 `list_production_facts`，切到 `/erp/finance/reconciliation` 后再 abort 旧请求，验证无 pageerror、无 AntD message、无旧“加载生产进度”错误串页；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm style:l1` 通过，共 1 个场景。
- 下一步：后续如果其它共享业务页也出现快速菜单 / tab 切换后旧请求串页，应优先在对应共享 workspace 建 latest-request guard，而不是在单页吞错误或硬延时。
- 阻塞/风险：本轮仍只处理 Operational Fact 共享页的列表读取生命周期；没有全局改造 JSON-RPC abort signal，也没有扫描和修改其它业务页的请求生命周期。

## 2026-06-27 岗位任务端首屏骨架屏

- 完成：按 `plush-page-design-governance` 为岗位任务端 `/m/<role>/tasks` 增加首屏轻量骨架屏；骨架只在首次加载且没有旧数据时显示，刷新时保留旧任务列表并只切换刷新按钮状态，避免把“加载中”误判为“暂无任务”。
- 完成：新增 `MobileTaskListSkeleton` 组件，骨架固定 4 个指标占位、4 个筛选占位和 4 条任务行占位；样式收口在 `mobileRoleTasks.css` 的 `mobile-role-skeleton-*` scoped class，覆盖暗色和 `prefers-reduced-motion`，不新增依赖、不使用 `!important`、不渲染可聚焦假控件。
- 完成：岗位任务页请求增加 latest-request guard；切换岗位、刷新或重叠请求时，只有最新请求可更新任务、loading、首屏加载完成状态和 toast，避免旧请求回写当前页面。
- 完成：同步岗位任务端 Current/as-built 原型参考 `mobile-role-tasks-v1/implemented-reference.html` 和 README，只记录首屏加载占位，不改变业务样例、权限、Workflow / Fact 语义或原型状态。
- 验证：`pnpm lint`、`pnpm css`、`pnpm test`、`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1`、`pnpm build:desktop`、`git diff --check` 均通过；`mobile-tasks-dark` 覆盖首屏骨架可见、节点数量受控、无可聚焦元素、无高成本滤镜、reduced-motion 动画降级、加载完成后卸载、空态恢复、暗色长列表、刷新失败保留旧数据、详情页动作栏和跨岗位说明。
- 下一步：后续如果要把骨架模式扩展到桌面业务页，应先评审共享组件边界，不能把移动端岗位任务骨架直接泛化成全站 loading 框架。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC 合同、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或部署脚本；未跑全量 `pnpm style:l1`，本轮浏览器回归限定在受影响的 `mobile-tasks-dark` 场景。

## 2026-06-27 全局路由加载态文案简化

- 完成：按 `plush-page-design-governance` 将全局路由懒加载 fallback 从“页面加载中 + 正在准备当前模块和界面资源，请稍候...”简化为单句“正在加载中”，保留现有 Loading 组件、暗色样式、`role=status` 和 `aria-live` 反馈。
- 验证：`/usr/local/bin/pnpm exec eslint --ext .jsx src/erp/router.jsx`、`/usr/local/bin/pnpm css`、`/usr/local/bin/pnpm test`、限定 `git diff --check -- web/src/erp/router.jsx progress.md` 均通过；`pnpm test` 覆盖 413 个前端单测。
- 下一步：若后续继续收敛其它加载态文案，优先保留能区分业务动作的必要提示；路由资源加载这种纯等待态保持短文案即可。
- 阻塞/风险：本轮只改前端路由加载态 copy，不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态；当前工作区已有多组非本轮/并行改动，本轮未回退、未提交。

## 2026-06-28 第四次 GPT 参考资料入库

- 完成：新增 `docs/reference/第四次20260627/`，放入同一 GPT 会话最终收敛版《多甲方角色能力模块组合流程编排设计-效率优先部署导入版-20260627.md》。
- 完成：新增批次 README，明确该材料仅为 Reference Only，不是当前实现、schema、migration、API、测试或部署真源，并标注 overlay、未来 QA runner、真实导入和低配部署边界。
- 完成：同步 `docs/文档清单.md`，登记第四次 GPT 参考资料 README 与正文文件。
- 验证：本轮按 docs-only / reference-only 范围执行静态检查；未运行 runtime、migration、浏览器或部署验证。
- 下一步：若后续吸收其中结论，应拆到正式产品 / 架构 / 测试 / 部署文档逐条评审，不从 reference 直接施工。
- 阻塞/风险：本轮不改 AGENTS、README、schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或部署脚本；参考资料中的过期和未来化内容已在 README 标注，仍需使用者回到当前真源复核。

## 2026-06-28 多甲方角色能力优先级与 Workflow/RBAC 边界收口

- 完成：新增 `docs/product/多甲方角色能力流程编排优先级.md`，把第四次 GPT 参考材料收敛为不使用阶段编号的执行顺序；同步 `docs/product/README.md` 和 `docs/文档清单.md`。
- 完成：Workflow JSON-RPC 不再采信客户端提交的 `actor_role_key`；`update_task_status` 和 `urge_task` 改为根据当前管理员角色、任务 owner、PMC / boss 或 super admin 身份服务端推导事件角色。
- 完成：移除岗位任务端、桌面任务看板、业务模块页和采购 / 委外页面调用里的 `actor_role_key` 参数，前端不再提交事件角色。
- 完成：`list_tasks` 为非 super admin 注入当前管理员可见范围，repo 层按 owner role 集合或 assignee 组合过滤；super admin 保持全量可见。
- 完成：engineering 进入内置 RBAC 角色、移动端访问权限和权限同步清单，补齐 boss 审批后工程任务可被真实工程角色承接的最小角色基础。
- 验证：`go test ./internal/biz -run 'TestBuiltinRoleWorkflowPermissionMatrix|TestMobileRoleAccessPermissionIncludesEngineering|TestCanAdminHandleWorkflowTaskEnforcesOwnerAssigneeAndStatus|TestWorkflowUsecase_ListTasksNormalizesFilter'`、`go test ./internal/service -run 'TestJsonrpcDispatcher_Workflow(ListTasksPassesTaskGroupFilter|UpdateTaskStatusAllowsOwnerRoles|UpdateTaskStatusIgnoresClientActorRole|UrgeTaskRecordsEventIntent)'`、`go test ./internal/data -run 'TestWorkflowRepo_ListWorkflowTasks(FiltersByTaskGroup|AppliesVisibilityScope)'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/pages/DashboardPage.jsx src/erp/pages/WorkflowBusinessModulePage.jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/components/purchase-orders/usePurchaseOrderWorkflowActions.mjs src/erp/components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs`、`git diff --check` 通过。
- 下一步：普通 UI 仍有 `create_task` / `upsert_business_state` 直接调用，不能靠删权限硬切；下一步应把岗位端派生任务和业务状态迁到后端 WorkflowUsecase / 领域命令，再收紧普通 UI 入口。
- 阻塞/风险：本轮不改 schema、migration、前端页面、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；`NormalizeAdminRoleKeys` 转向有效角色配置仍需结合 role repo / 账号管理链路单独评审。

## 2026-06-28 各类流程建模边界收口

- 完成：新增 `docs/architecture/各类流程建模边界评审.md`，把 `docs/reference/第四次20260627/erp各类“流”的边界与实现参考.md` 收敛为 plush 当前 Product Core、Workflow / Fact、页面表达和客户配置边界，不照搬流程模板平台。
- 完成：同步 `docs/architecture/README.md`、`docs/README.md`、`docs/reference/第四次20260627/README.md` 和 `docs/文档清单.md`，登记正式架构入口、可视化图索引和 reference 吸收关系。
- 验证：`git diff --check -- docs/architecture/各类流程建模边界评审.md docs/architecture/README.md docs/README.md docs/reference/第四次20260627/README.md docs/文档清单.md progress.md` 通过；targeted `rg` 已确认正式入口和 reference 吸收关系，`tenant_id`、流程模板和扩展点只出现在禁止 / 边界语境；不运行 runtime、migration、浏览器或部署验证。
- 下一步：若后续要把某类流推进实现，应按模块实施治理拆成单个可验证闭环，先确认真源、状态机、RBAC、usecase 和测试，不从 reference 直接施工。
- 阻塞/风险：本轮不改 AGENTS、schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置包、导入脚本、部署脚本或页面 runtime；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 客户配置包流程结构 preview 闭环

- 完成：新增 `config/catalog/`、`config/schemas/` 和 `config/customers/yoyoosun/customerPackage.mjs`，按 `workflows / businessFlows / stateMachines / processPolicies` 收口 yoyoosun 客户配置包流程结构预览；当前保持 `runtimeEnabled=false`、`previewOnly=true`，不 publish、不 activate、不 rollback。
- 完成：新增 `scripts/qa/customer-package-lint.mjs` 和单测，并接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`；脚本可生成 `output/customers/yoyoosun/customer-package-preview.json` 本地预览报告，但不纳入 git。
- 完成：开发态 `/__dev/customer-config` 的客户配置包预检控制台接入流程结构只读预览，在“包预检 / Preflight”视图展示 workflow、business flow、state machine 和 policy，并保留客户包选择只写 URL query、不写后端或运行时配置的边界。
- 完成：同步 `README.md`、`web/README.md`、`config/README.md`、`config/customers/yoyoosun/README.md`、`scripts/README.md`、`docs/当前真源与交接顺序.md`、`docs/文档清单.md`、`docs/customers/yoyoosun/客户配置草案.md`、客户交付矩阵、客户差异台账和产品能力证据详情。
- 验证：`node scripts/qa/customer-package-lint.mjs --customer yoyoosun`、`node --test scripts/qa/customer-package-lint.test.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、`node --test src/erp/config/devCustomerConfig.test.mjs`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun --out output/customers/yoyoosun/customer-package-preview.json`、`/usr/local/bin/pnpm exec eslint --ext .jsx,.mjs src/erp/pages/DevCustomerConfigPage.jsx src/erp/config/devCustomerConfig.mjs`、`/usr/local/bin/pnpm css`、`/usr/local/bin/pnpm test -- src/erp/config/devCustomerConfig.test.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-customer-config-mobile /usr/local/bin/pnpm style:l1`、`git diff --check` 通过；preview 报告写入 ignored `output/`。
- 下一步：若要把 preview 推进 publish / activate / rollback 或真正流程 runtime，必须另开后端领域任务，先评审 schema、migration、RBAC、WorkflowUsecase、Fact usecase、审计、幂等和回滚。
- 阻塞/风险：本轮不改 Ent schema、Atlas migration、JSON-RPC、后端 RBAC、WorkflowUsecase、Fact usecase、真实导入、部署脚本或生产 runtime；当前工作区已有并行文档/参考资料改动，本轮未回退、未提交。

## 2026-06-28 成品返工 Workflow 后端收口

- 完成：新增后端 `finished_goods_rework` 特殊规则；返工任务 done 写 `production_processing` business state，blocked / rejected 写回 `qc_failed`，均不派生新任务。
- 完成：移动端岗位任务 hook 删除成品返工完成后的前端 `upsertWorkflowBusinessState` follow-up；成品抽检、成品入库、成品返工和出货放行链路统一交回后端 WorkflowUsecase。
- 完成：更新 `finishedGoodsFlow.test.mjs` 源码守卫，确认移动端不再存在 `runFinishedGoodsFollowUp`、`completeFinishedGoodsReworkTask` 或成品返工本地状态常量。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已部分推进及剩余链路。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_FinishedGoods(Rework|QC|Inbound)|TestWorkflowUsecase_SameNameNonFinishedGoods'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/finishedGoodsFlow.test.mjs`、`/usr/local/bin/pnpm exec node --test src/erp/utils/finishedGoodsFlow.test.mjs`、`/usr/local/bin/pnpm test`、`git diff --check` 通过。
- 下一步：普通 UI 仍有委外回货跟踪、委外入库后应付、财务应收 / 开票 / 应付 / 对账等前端 `create_task` / `upsert_business_state` follow-up；这些需要继续逐条迁入后端 WorkflowUsecase / 领域命令。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 委外返工 Workflow 后端收口

- 完成：新增后端 `outsource_rework` 特殊规则；返工任务 done 写 `production_processing` business state，blocked / rejected 写回 `qc_failed`，均不派生新任务。
- 完成：移动端岗位任务 hook 删除委外返工完成后的前端 `upsertWorkflowBusinessState` follow-up；委外返工业务状态投影交回后端 WorkflowUsecase。
- 完成：更新 `outsourceReturnFlow.test.mjs` 源码守卫，确认移动端不再存在 `completeOutsourceReworkTask` 或委外返工本地生产中状态常量。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已覆盖成品返工和委外返工。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_Outsource(ReturnQC|Rework)|TestWorkflowUsecase_SameNameNonOutsource'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/outsourceReturnFlow.test.mjs`、`/usr/local/bin/pnpm exec node --test src/erp/utils/outsourceReturnFlow.test.mjs`、`/usr/local/bin/pnpm test`、`rg -n "\bP[0-9]\b|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段" docs/product/多甲方角色能力流程编排优先级.md`、`git diff --check` 通过；`pnpm test` 共 416 个前端测试通过，阶段编号扫描无命中。
- 下一步：普通 UI 仍有委外回货跟踪、委外入库后应付、财务应收 / 开票 / 应付 / 对账等前端 `create_task` / `upsert_business_state` follow-up；继续逐条迁入后端 WorkflowUsecase / 领域命令。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 委外回货跟踪 Workflow 后端收口

- 完成：新增后端 `outsource_return_tracking` 特殊规则；生产端跟踪任务 done 写 `qc_pending` business state，并派生品质 `outsource_return_qc` 任务。
- 完成：移动端岗位任务 hook 删除委外回货跟踪完成后的前端 `upsertWorkflowBusinessState` 和本地 `createWorkflowTask` follow-up；回货检验任务派生交回后端 WorkflowUsecase。
- 完成：更新 `outsourceReturnFlow.test.mjs` 源码守卫，确认移动端 hook 不再本地调用 `completeOutsourceReturnTrackingTask`、`buildOutsourceReturnQcTask` 或委外 `qc_pending` 状态常量。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已覆盖委外回货跟踪、成品返工和委外返工。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_Outsource(ReturnTracking|ReturnQC|Rework)|TestWorkflowUsecase_SameNameNonOutsource'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/outsourceReturnFlow.test.mjs`、`/usr/local/bin/pnpm exec node --test src/erp/utils/outsourceReturnFlow.test.mjs`、`/usr/local/bin/pnpm test`、`rg -n "\bP[0-9]\b|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段" docs/product/多甲方角色能力流程编排优先级.md`、`git diff --check` 通过；`pnpm test` 共 416 个前端测试通过，阶段编号扫描无命中。
- 下一步：普通 UI 仍有委外入库后应付、财务应收 / 开票 / 应付 / 对账等前端 `create_task` / `upsert_business_state` follow-up；继续逐条迁入后端 WorkflowUsecase / 领域命令。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 委外入库应付 Workflow 后端收口

- 完成：新增后端 `outsource_warehouse_inbound` 特殊规则；仓库委外入库任务 done 写 `inbound_done` finance business state，并派生财务 `outsource_payable_registration` 任务。
- 完成：移动端岗位任务 hook 删除委外入库完成后的前端 `upsertWorkflowBusinessState` 和本地 `createWorkflowTask` follow-up；委外应付登记任务派生交回后端 WorkflowUsecase。
- 完成：更新 `outsourceReturnFlow.test.mjs` 源码守卫，确认移动端 hook 不再本地调用 `completeOutsourceWarehouseInboundTask`、`buildOutsourcePayableRegistrationTask` 或委外 `inbound_done` 状态常量。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已覆盖委外入库后应付。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_Outsource(ReturnTracking|ReturnQC|WarehouseInbound|Rework)|TestWorkflowUsecase_SameNameNonOutsource'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/outsourceReturnFlow.test.mjs`、`/usr/local/bin/pnpm exec node --test src/erp/utils/outsourceReturnFlow.test.mjs src/erp/utils/payableReconciliationFlow.test.mjs`、`/usr/local/bin/pnpm test`、`rg -n "\bP[0-9]\b|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段" docs/product/多甲方角色能力流程编排优先级.md`、`git diff --check` 通过；`pnpm test` 共 416 个前端测试通过，阶段编号扫描无命中。
- 下一步：普通 UI 仍有财务应收 / 开票 / 应付 / 对账等前端 `create_task` / `upsert_business_state` follow-up；继续逐条迁入后端 WorkflowUsecase / 领域命令。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；`inbound_done` 仍是 Workflow 协同投影，不代表应付事实或付款流水落账。

## 2026-06-28 应收开票 Workflow 后端收口

- 完成：新增后端 `receivable_registration` 和 `invoice_registration` 特殊规则；应收登记 done 写 `reconciling` finance business state 并派生财务 `invoice_registration` 任务，开票登记 done 写 `reconciling` finance business state。
- 完成：移动端岗位任务 hook 删除应收完成后的前端开票任务创建和应收 / 开票完成后的前端 `upsertWorkflowBusinessState` follow-up；正常完成链路交回后端 WorkflowUsecase。
- 完成：新增 `workflow_shipment_finance_test.go` 覆盖应收派生开票、重复完成幂等、开票完成只写状态、同名非目标任务不误触发；更新 `shipmentFinanceFlow.test.mjs` 源码守卫，确认移动端不再本地调用应收 / 开票完成派生函数。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已覆盖财务应收 done 和开票 done。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_(ReceivableRegistration|InvoiceRegistration|SameNameNonShipmentFinance)'`、`/usr/local/bin/pnpm exec node --test src/erp/utils/shipmentFinanceFlow.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/shipmentFinanceFlow.test.mjs` 通过。
- 下一步：普通 UI 财务应付 / 对账完成链路和财务 blocked / rejected 预警投影已在后续记录迁入后端；后续若继续推进，应转向 Workflow 对应领域命令闭环或有效角色配置真源收口。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；`reconciling` 仍是 Workflow 协同投影，不代表应收、发票或对账事实落账。

## 2026-06-28 应付对账 Workflow 后端收口

- 完成：新增后端 `purchase_payable_registration`、`outsource_payable_registration`、`purchase_reconciliation`、`outsource_reconciliation` 特殊规则；应付登记 done 写 `reconciling` finance business state 并按 `payable_type` 派生采购 / 委外对账任务，对账 done 写 `settled` finance business state。
- 完成：移动端岗位任务 hook 删除应付完成后的前端对账任务创建和应付 / 对账完成后的前端 `upsertWorkflowBusinessState` follow-up；正常完成链路交回后端 WorkflowUsecase。
- 完成：新增 `workflow_payable_reconciliation_test.go` 覆盖采购 / 委外应付派生对账、重复完成幂等、对账完成只写状态、同名非目标任务不误触发；更新 `payableReconciliationFlow.test.mjs` 源码守卫，确认移动端不再本地调用应付 / 对账完成派生函数。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 收口已覆盖财务应付 done 和对账 done。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_(PayableRegistration|PayableReconciliation|SameNameNonPayable)'`、`go test ./internal/biz -run 'TestWorkflowUsecase_(ReceivableRegistration|InvoiceRegistration|SameNameNonShipmentFinance|PayableRegistration|PayableReconciliation|SameNameNonPayable)'`、`/usr/local/bin/pnpm exec node --test src/erp/utils/shipmentFinanceFlow.test.mjs src/erp/utils/payableReconciliationFlow.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/shipmentFinanceFlow.test.mjs src/erp/utils/payableReconciliationFlow.test.mjs` 通过。
- 下一步：普通 UI 财务 blocked / rejected 预警投影已在后续记录迁入后端；后续若继续推进，应转向 Workflow 对应领域命令闭环或有效角色配置真源收口。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；`settled` 仍是 Workflow 协同投影，不代表付款、收款或财务事实落账。

## 2026-06-28 财务异常投影 Workflow 后端收口

- 完成：新增后端财务 blocked / rejected 特殊规则；应收 / 开票异常写 `blocked` finance business state，应付 / 对账异常写 `blocked` finance business state，并保留 trimmed reason、decision、transition_status 和来源 payload。
- 完成：移动端岗位任务 hook 删除最后的 `upsertWorkflowBusinessState` follow-up；普通业务前端不再本地创建 Workflow 下游任务或直接写 Workflow business state，只提交 `updateWorkflowTaskStatus`。
- 完成：更新 `shipmentFinanceFlow.test.mjs` 和 `payableReconciliationFlow.test.mjs` 源码守卫，确认移动端不再导入 blocked state builder 或调用 `upsertWorkflowBusinessState`；补充后端 reason 必填、残值清理和同名非目标任务测试。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 当前状态，标明普通 UI `create_task` / `upsert_business_state` 本轮业务前端收口已完成。
- 验证：`go test ./internal/biz -run 'TestWorkflowUsecase_(ShipmentFinance|PayableFinance|ReceivableRegistration|InvoiceRegistration|PayableRegistration|PayableReconciliation|SameNameNonShipmentFinance|SameNameNonPayable)'`、`go test ./internal/biz ./internal/data ./internal/service`、`/usr/local/bin/pnpm exec node --test src/erp/utils/shipmentFinanceFlow.test.mjs src/erp/utils/payableReconciliationFlow.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js,.jsx,.mjs src/erp/mobile/hooks/useMobileRoleTaskActions.js src/erp/utils/shipmentFinanceFlow.test.mjs src/erp/utils/payableReconciliationFlow.test.mjs`、`/usr/local/bin/pnpm test`、`rg -n "\bP[0-9]\b|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段" docs/product/多甲方角色能力流程编排优先级.md`、`rg -n "createWorkflowTask|upsertWorkflowBusinessState" web/src/erp/mobile web/src/erp/pages web/src/erp/components`、`git diff --check` 通过；`pnpm test` 共 418 个前端测试通过，阶段编号扫描和业务页面 / 组件 create/upsert 扫描均无命中。
- 下一步：后续若继续推进优先级文档，应转向 Workflow 对应领域命令闭环、有效角色配置真源收口，或客户配置包门禁；不要回到移动端本地派生任务。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单真源、Fact usecase、客户配置包、导入脚本或部署脚本；`blocked` 仍是 Workflow 协同预警投影，不代表财务事实冲正或付款 / 收款状态变化。

## 2026-06-28 客户配置包预检控制台页面收口

- 完成：按 `plush-page-design-governance` 将 `/__dev/customer-config` 从客户配置开发总控收口为客户配置包预检控制台；新增预检步骤、资产摘要、校验结果、差异预览、版本门禁和真实导入阻断展示，保留菜单 / 字段 / 流程 / 导入工具只读边界。
- 完成：更新 dev hub 入口文案为“客户配置包预检 / Package Preflight”，并更换 `favicon-customer-config.svg` 为配置包预检图标；同步 `web/README.md` 和 `docs/当前真源与交接顺序.md` 的 dev-only 入口口径。
- 验证：`/usr/local/bin/pnpm exec node --test src/erp/config/devCustomerConfig.test.mjs src/erp/config/devHub.test.mjs src/common/consts/favicon.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .js --ext .jsx --ext .mjs src/erp/pages/DevCustomerConfigPage.jsx src/erp/pages/DevHubPage.jsx src/erp/config/devCustomerConfig.mjs src/erp/config/devHub.mjs src/erp/config/devCustomerConfig.test.mjs scripts/style-l1/scenarios.mjs src/common/consts/favicon.mjs src/common/consts/favicon.test.mjs`、`/usr/local/bin/pnpm css`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-customer-config-mobile,dev-hub-dark-desktop /usr/local/bin/pnpm style:l1`、`/usr/local/bin/pnpm lint`、`/usr/local/bin/pnpm test`、`git diff --check` 均通过；`pnpm test` 共 415 个前端测试通过。
- 下一步：若后续要从 preview 进入真实上传 / 发布 / 回滚，需要单独评审 API、RBAC、schema、migration、审计、备份 evidence 和真实导入门禁，不能从 dev-only 页面直接升级。
- 阻塞/风险：本轮只改 dev-only 前端页面、数据汇总、favicon、样式、L1 断言和说明文档；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、真实导入脚本或部署脚本；当前工作区仍有多组非本轮/并行改动，本轮未回退、未提交。

## 2026-06-28 客户配置包导入命令展示修正

- 完成：修正 `/__dev/customer-config` 工具边界页展示的 `customerImportExecute.mjs` 复制命令，改用真实 CLI 参数 `--dry-run-package` 并补齐必需的 `--backup-evidence`。
- 完成：补充 `devCustomerConfig.test.mjs` 断言，锁住 execution report 命令参数，避免 dev-only 可复制命令再次漂移。
- 验证：`node --test src/erp/config/devCustomerConfig.test.mjs`、`/usr/local/bin/pnpm exec eslint --ext .mjs src/erp/config/devCustomerConfig.mjs src/erp/config/devCustomerConfig.test.mjs` 和 `git diff --check` 通过。
- 下一步：无。
- 阻塞/风险：本轮只改 dev-only 页面数据汇总和对应测试，不改真实导入 loader、后端、schema、migration、RBAC、WorkflowUsecase、Fact usecase、部署脚本或生产 runtime；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 开发测试入口白名单治理

- 完成：按 `plush-test-governance` 将 `/__dev/testing` 从全量 `docs/**/*.md` 关键词聚合改为当前维护入口白名单，只读取自动化测试策略、项目 / 前端 / 后端 / 脚本 README 和部署说明；`docs/reference/**`、`docs/archive/**` 不再作为可复制命令来源。
- 完成：收紧 fenced command block 抽取，只保留 shell 命令和续行，避免把输出文件清单、参考方案代码块或未来命令当成当前测试入口；同步 dev hub 文案、`web/README.md`、`docs/当前真源与交接顺序.md` 和 L1 断言。
- 验证：`node --test web/src/erp/config/devTesting.test.mjs web/src/erp/config/devHub.test.mjs`、`cd web && corepack pnpm exec eslint --ext .js --ext .jsx src/erp/config/devTesting.mjs src/erp/config/devTesting.test.mjs src/erp/pages/DevTestingPage.jsx src/erp/config/devHub.mjs src/erp/config/devHub.test.mjs ../web/scripts/style-l1/scenarios.mjs`、`cd web && corepack pnpm css`、`cd web && corepack pnpm gen:error-codes && node --test $(node -e "const p=require('./package.json'); process.stdout.write(p.scripts.test.replace(/^node --test\\\\s*/, ''))")`、`cd web && STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-testing-light-desktop corepack pnpm style:l1`、`git diff --check -- web/src/erp/config/devTesting.mjs web/src/erp/config/devTesting.test.mjs web/src/erp/config/devHub.mjs web/src/erp/config/devHub.test.mjs web/src/erp/pages/DevTestingPage.jsx web/scripts/style-l1/scenarios.mjs web/README.md docs/当前真源与交接顺序.md progress.md` 通过；真实构建数据为 8 篇当前入口文档、342 行可复制命令、reference/archive 命中 0。
- 下一步：若后续新增长期 QA 文档，应先登记到测试入口白名单或自动化测试策略，再进入 `/__dev/testing`；历史 reference 继续只作为设计输入，不直接暴露为命令入口。
- 阻塞/风险：本轮只治理 dev-only 测试入口、前端单测、L1 断言和说明文档；不改 schema、migration、JSON-RPC、RBAC、WorkflowUsecase、Fact usecase、真实写入 E2E、发布脚本或正式 ERP 菜单。当前工作区已有多组并行改动，本轮未回退、未提交。

## 2026-06-28 `/__dev` 开发导航简化

- 完成：将 `/__dev` 从说明型“开发入口总控”降级为简洁开发导航；保留搜索、分组、入口跳转和本地置顶，删除默认指标区、规则说明区、空置顶提示、卡片边界标签和新标签打开行为。
- 完成：入口卡片改为当前标签进入子页，`/__dev/` 尾斜杠路径已在浏览器回归中覆盖；同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `style:l1` 场景口径。
- 验证：真实浏览器 runtime 覆盖桌面 `/__dev/` 默认态、移动端搜索 / 置顶 / 当前标签跳转和无横向溢出；`/usr/local/bin/pnpm exec node --test src/erp/config/devHub.test.mjs src/common/consts/favicon.test.mjs`、目标 eslint、`/usr/local/bin/pnpm css`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop /usr/local/bin/pnpm style:l1`、`/usr/local/bin/pnpm test`、`git diff --check` 通过。
- 下一步：若后续新增 `/__dev/*` 入口，只扩展 `DEV_HUB_ITEMS` 和对应 dev-only 页面；不要把它接入正式菜单、seedData、RBAC 或生产构建。
- 阻塞/风险：本轮不改正式菜单、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、客户配置包或真实导入；未运行全量 `pnpm lint`，因为该脚本含 `--fix`，当前工作区有多组并行改动，避免写入非本轮文件。

## 2026-06-28 流程建模边界文档跳转修正

- 完成：将 `docs/architecture/各类流程建模边界评审.md` 中通知流落点的裸文件名改为指向 `../workflow/通知预警催办与升级第一版.md` 的相对链接，方便读者从架构评审直接跳转。
- 验证：`test -f docs/workflow/通知预警催办与升级第一版.md`、`git diff --check -- docs/architecture/各类流程建模边界评审.md progress.md` 和 targeted `rg` 通过。
- 下一步：无。
- 阻塞/风险：本轮只改正式文档跳转和过程记录，不改 runtime、schema、migration、RBAC、WorkflowUsecase、Fact usecase、页面代码、客户配置包、导入脚本或部署脚本；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 客户配置包预检控制台决策页收口

- 完成：按 `plush-page-design-governance` 将 `/__dev/customer-config` 总览收口为预检决策页；新增人工评审结论、决策卡、评审清单、预检命令和来源路径，让页面直接回答“可进入 review evidence、不可真实导入、不可发布 / 激活 / 回滚”。
- 完成：补强 `devCustomerConfig.mjs` 的配置包 console summary，锁住 `REVIEW_READY`、`blocked_by_design`、预检报告命令、source references 和 preview-only 边界；页面 H1 对齐“客户配置包预检控制台 / Package Preflight Console”。
- 完成：补充浅色 / 暗色 / 移动端样式和 `style:l1` 断言，确保决策卡、评审清单、命令块、来源路径在窄屏不横向溢出。
- 验证：`node --test src/erp/config/devCustomerConfig.test.mjs`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun`、`/usr/local/bin/pnpm exec eslint --ext .jsx,.mjs src/erp/pages/DevCustomerConfigPage.jsx src/erp/config/devCustomerConfig.mjs`、`/usr/local/bin/pnpm lint`、`/usr/local/bin/pnpm css`、`/usr/local/bin/pnpm test -- src/erp/config/devCustomerConfig.test.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-customer-config-mobile /usr/local/bin/pnpm style:l1` 通过；`pnpm test` 按项目脚本实际跑全量前端单测，416 个通过。
- 下一步：若要把配置包从预检进入真实上传、发布、激活、回滚或真实客户数据导入，必须另开 domain / release / security 边界评审，补 API、RBAC、schema、migration、审计、备份 evidence 和回滚门禁。
- 阻塞/风险：本轮只改 dev-only 前端页面、配置汇总、样式、L1 断言和过程记录；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、真实导入脚本、部署脚本或生产 runtime。当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-28 客户配置包预检页简化

- 完成：按 `plush-page-design-governance` 将 `/__dev/customer-config?customer=yoyoosun` 默认总览压缩为预检结论、决策卡和下一步动作三块；移除默认态大指标卡、重复资产摘要和边界全文堆叠，详细信息保留在预检、差异、菜单字段和工具边界视图。
- 完成：修正资产卡重复渲染数值的问题，清理不再命中的旧 metric / boundary / quick-stat 样式，补充暗色和移动端响应式规则；quick-action 可直接切到预检、差异和工具视图。
- 验证：真实浏览器 runtime 覆盖桌面默认态和移动端默认态，确认默认页 3 个 panel、3 张决策卡、3 个下一步动作、无旧指标卡、无重复资产值、无横向溢出；`/usr/local/bin/pnpm exec node --test src/erp/config/devCustomerConfig.test.mjs src/erp/config/devHub.test.mjs src/common/consts/favicon.test.mjs`、目标 eslint、`/usr/local/bin/pnpm css`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-customer-config-mobile /usr/local/bin/pnpm style:l1`、`/usr/local/bin/pnpm test`、`git diff --check` 通过。
- 下一步：如果后续要继续降密度，应优先评审 Preflight / Assets / Tools 子视图的信息分组，不把 preview-only 页面升级成真实导入或发布页面。
- 阻塞/风险：本轮只改 dev-only 前端页面、派生展示数据、样式和 L1 断言；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、客户配置包 runtime、真实导入或部署脚本；未运行全量 `pnpm lint`，因为该脚本含 `--fix`，当前工作区有多组并行改动。

## 2026-06-28 自定义角色合法性收口

- 完成：将 `NormalizeAdminRoleKeys` 从 `BuiltinRoles()` 内置清单过滤改为只做 trim / 去空 / 去重，避免客户配置或数据库中已有的自定义角色在账号分配前被静默丢弃。
- 完成：账号创建和角色更新改为先读取当前 `roles` 配置，只有存在且未停用的角色可以分配；不存在或 disabled 角色返回 `ErrRoleNotFound`，不会清空账号原有角色。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，把“自定义角色合法性”更新为已落地基础收口。
- 验证：`go test ./internal/biz -run 'TestNormalizeAdminRoleKeysKeepsConfiguredRoleKeys|TestAdminManageUsecase_SetRolesAllowsConfiguredCustomRole|TestAdminManageUsecase_SetRolesRejectsMissingOrDisabledRole'`、`go test ./internal/biz -run 'TestAdminManageUsecase_Create|TestAdminManageUsecase_SetRoles|TestBuiltinRoleWorkflowPermissionMatrix|TestAdminCanAccessMobileRoleUsesPermissionCode'`、`go test ./internal/biz ./internal/data ./internal/service`、`rg -n "\bP[0-9]\b|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段" docs/product/多甲方角色能力流程编排优先级.md` 和 `git diff --check` 通过；阶段编号扫描无命中。
- 下一步：继续按优先级推进客户配置包门禁或领域命令闭环；不要把自定义角色再写回内置角色常量表。
- 阻塞/风险：本轮不新增角色创建 API、不改 schema / migration / seed / 客户配置包真实导入；当前角色可分配集合仍以现有 `roles` 表为准，角色从配置包落库需要后续门禁闭环。

## 2026-06-28 客户配置包门禁模式收口

- 完成：为 `scripts/qa/customer-package-lint.mjs` 增加 `--mode validate|compile|preview|activate|rollback`；默认 validate，`--out` 兼容为 preview，compile 只生成受限 preview 对象不写 runtime。
- 完成：脚本入口直接拒绝 `activate` 和 `rollback`，并继续校验客户包不能携带 raw rows、secret、SQL、Go / JS 可执行 payload 或发布 / 激活 / 回滚开关。
- 完成：同步 `config/README.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确当前只有 validate / compile / preview 门禁，没有真实 publish / activate / rollback runtime。
- 验证：`node scripts/qa/customer-package-lint.mjs --customer yoyoosun`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/customer-package-lint.test.mjs` 通过。
- 下一步：若要进入真实上传、发布、激活、回滚或 runtime loader，需另开 release / security / domain 评审并补 API、RBAC、schema、migration、审计、备份 evidence 和回滚门禁。
- 阻塞/风险：本轮只补 QA 门禁模式、测试和说明文档；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、真实导入脚本或部署脚本。

## 2026-06-28 Workflow / Fact 边界守卫

- 完成：新增 `scripts/qa/workflow-fact-boundary.test.mjs`，静态扫描 Workflow usecase、repo 和 JSON-RPC 源码，阻止 `update_task_status` 链路直接引用 Operational Fact、库存、出货或财务事实写入口。
- 完成：将该守卫接入 `scripts/qa/fast.sh` 和 `scripts/qa/strict.sh`，同步 `scripts/README.md`、`docs/product/自动化测试策略.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：`node --test scripts/qa/workflow-fact-boundary.test.mjs` 通过。
- 下一步：真实领域命令闭环仍应从 OperationalFact / Inventory / Shipment / Finance usecase 的显式入口推进；不能把 Workflow task done 自动当成 Fact posted。
- 阻塞/风险：本轮只补边界守卫和文档，不把客户配置包 `domain_command_preview` 接入 runtime，不改 schema、migration、WorkflowUsecase、Fact usecase 或真实写入路径。

## 2026-06-28 基础 QA 门禁串联

- 完成：`scripts/qa/fast.sh` 和 `scripts/qa/strict.sh` 已串联客户配置包 validate + compile、客户包测试和 Workflow / Fact 边界守卫，覆盖多甲方角色流程优先级文档中的基础门禁要求。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，将测试、导入和部署门禁标为基础 QA 收口，并明确真实导入、目标环境备份恢复、部署回滚仍需专项执行。
- 验证：`bash -n scripts/qa/fast.sh scripts/qa/strict.sh`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/workflow-fact-boundary.test.mjs`、`go test ./internal/biz ./internal/data ./internal/service`、优先级文档阶段编号扫描和 `git diff --check` 通过。
- 下一步：若要声称目标环境发布门禁完整覆盖，必须按 release evidence、production preflight、备份恢复和回滚 runbook 做真实环境证据，不靠本地 QA 脚本替代。
- 阻塞/风险：本轮不运行真实导入、不部署、不执行目标环境 migration、不做备份恢复或回滚演练。

## 2026-06-28 reference 全量吸收审计

- 完成：复核 `docs/reference/**` 四批参考资料，确认 20260627 第四批为本主题最新输入，旧批次只作为 Workflow / Fact、客户配置、生命周期、测试和部署边界的交叉参考，不覆盖当前仓库真源。
- 完成：补充 `docs/product/多甲方角色能力流程编排优先级.md` 的参考输入说明，列明 20260519、20260611、20260622、20260627 各批资料的吸收口径，并把第四批三份最新文档全部列入参考输入。
- 完成：同步 `docs/文档清单.md`，补登记 `docs/reference/第四次20260627/ERP客户配置包导入控制台设计规范.md`。
- 验证：已读取 `plush-page-design-governance`、`plush-docs-governance`、`docs/reference/README.md`、`docs/reference/第四次20260627/README.md` 和第四批三份参考文档；`rg -n "\bP[0-9]\b|Phase|phase|第一阶段|第二阶段|第三阶段|第四阶段|第五阶段|第六阶段|第 [0-9]+ 阶段|阶段" docs/product/多甲方角色能力流程编排优先级.md` 无命中，相关 QA 守卫、compile 命令和最新参考文档索引均可检索，`git diff --check` 通过。
- 下一步：无；后续只在新增参考资料或实现范围变化时，再按当前真源链重新复核。
- 阻塞/风险：本轮不改 reference 原文，不把旧批次资料提升为正式实现真源。

## 2026-06-28 多甲方角色流程优先级统一验证

- 完成：按业务闭环、真源边界、测试证据和交付门禁确认 `docs/product/多甲方角色能力流程编排优先级.md` 可作为本轮后续实现参考；不采用过程编号或英文字母批次作为执行组织方式。
- 完成：基础门禁已覆盖客户配置包 validate / compile、客户包测试、Workflow / Fact 边界守卫、后端 biz / data / service 包测试和前端业务目录直连调用扫描。
- 验证：`bash -n scripts/qa/fast.sh scripts/qa/strict.sh`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun`、`node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/workflow-fact-boundary.test.mjs`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`rg -n "createWorkflowTask|upsertWorkflowBusinessState" web/src/erp/mobile web/src/erp/pages web/src/erp/components`、`git diff --check` 通过。
- 下一步：若继续推进真实导入、目标环境发布、备份恢复、回滚或领域事实写入，需要按现有 release / domain / security 边界另做专项证据，不用本地 QA 门禁替代生产证据。
- 阻塞/风险：本轮不执行真实导入、不部署、不做目标环境 migration、备份恢复或回滚演练；Workflow task done 仍不等于 Fact posted。

## 2026-06-28 客户配置包测试版 UI Dry Run

- 完成：为本地 Vite 开发服务新增 dev-only `/__dev/api/customer-import/dry-run`，仅允许已登记 `yoyoosun` 客户包调用 `scripts/import/customerImportDryRun.mjs`，输出 ignored `output/customers/yoyoosun/ui-import-dry-run` evidence，不写数据库。
- 完成：`/__dev/customer-config?customer=yoyoosun` 的工具页新增“运行测试 Dry Run”按钮、运行中 / 失败 / 成功回显、报告路径和阻塞摘要；正式版导入继续以门禁卡锁住，不提供 upload / publish / activate / rollback 或真实导入执行。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `config/customers/yoyoosun/README.md`，把开发态 UI Dry Run 写清为本地 evidence 生成，不升级成正式导入。
- 验证：`node --check web/devCustomerImportDryRunPlugin.mjs && node --check web/vite.shared.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --fix --ext .js --ext .jsx devCustomerImportDryRunPlugin.mjs vite.shared.mjs src/erp/pages/DevCustomerConfigPage.jsx src/erp/config/devCustomerConfig.mjs src/erp/config/devCustomerConfig.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/config/devCustomerConfig.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-customer-config-light-desktop,dev-customer-config-mobile /usr/local/bin/pnpm --dir web style:l1`、`node --test scripts/import/customerImportDryRun.test.mjs scripts/import/customerImportExecute.test.mjs`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test`、`git diff --check` 通过；`web test` 共 418 个前端测试通过。
- 下一步：若要开放正式导入，必须另开 domain / security / release 专项，补后端 job / JSON-RPC usecase、RBAC、审批、备份 evidence、审计、幂等、失败恢复和回滚验证。
- 阻塞/风险：本轮不改 Ent schema、Atlas migration、后端 RBAC、正式菜单、seedData、WorkflowUsecase、Fact usecase、生产 runtime、真实导入执行或部署脚本；测试版 UI Dry Run 只在开发服务生效，生产构建不可访问。

## 2026-06-28 客户配置版本运行时最小闭环

- 完成：按多甲方角色流程优先级继续推进客户配置版本运行时；新增 Ent / Atlas 客户配置 revision、模块状态、角色画像、授权、责任池和责任池成员表，只保存受控编译后的配置，不新增业务事实表或多租户隔离字段。
- 完成：新增后端 `customer_config` JSON-RPC 域和 usecase / repo / RBAC：支持 `validate_customer_config`、`publish_customer_config`、`activate_customer_config`、`rollback_customer_config`、`get_effective_session`；active revision 不允许覆盖，发布 payload 禁止 secret、token、password、SQL、Go、JS 和 raw records。
- 完成：正式前端登录后读取 `get_effective_session`，把页面、动作、字段策略和责任池投影到当前 admin profile；该投影只收窄可见入口和交互提示，不扩大后端 RBAC，也不替代 Workflow / Fact / 领域 usecase。
- 完成：同步 `README.md`、`server/README.md`、`web/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`，区分 raw 客户包预检与 compiled revision 运行时。
- 验证：`make data`、`go test ./internal/biz -run 'TestCustomerConfigUsecase|TestBuiltinRoleWorkflowPermissionMatrix|TestAdminCanAccessMobileRoleUsesPermissionCode'`、`go test ./internal/service -run 'TestCustomerConfigJSONRPC'`、`go test ./internal/biz ./internal/data ./internal/service`、`go test ./...`、`node --test web/src/common/consts/brand.test.mjs web/src/erp/utils/adminProfileSync.test.mjs scripts/qa/customer-package-lint.test.mjs scripts/qa/workflow-fact-boundary.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过；默认 `bash scripts/qa/fast.sh` 曾因 Codex bundled pnpm 11.7.0 与项目要求 10.13.x 不匹配失败，改用 `/usr/local/bin/pnpm` 后通过。
- 下一步：若要继续做完整部署导入版，需要进入任意文件 upload、正式导入 job、生产发布 preflight、备份恢复、回滚演练、审计和真实客户数据导入专项；这些不能用当前 compiled revision API 或 dev-only dry-run 直接替代。
- 阻塞/风险：本轮不执行真实导入、不部署、不跑目标环境 migration、不做生产备份恢复或回滚；raw 客户包仍只做 lint / preview，不直接作为 runtime loader；Workflow task done 仍不等于 Fact posted。

## 2026-06-28 /__dev 页面统一治理

- 完成：按 `plush-page-design-governance` 复核 `/__dev`、`/__dev/governance`、`/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger`、`/__dev/customer-config?customer=yoyoosun`；将开发导航分组筛选从展开式 Segmented 收敛为 Select，移动端不再被筛选区挤占首屏。
- 完成：补充 dev-only 响应式盒模型规则，统一移动端 dev 页头、指标卡、长路径、标签和 capability ledger 视图切换的 `min-width`、换行和栅格约束；修复 capability ledger 在 390px 下 417px 横向溢出。
- 完成：新增 `dev-all-pages-mobile` L1 场景，逐页验证全部 `/__dev` 路由移动端根节点、标题和横向溢出；同步更新 hub L1 场景以覆盖 Select 分组筛选。
- 验证：`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/DevHubPage.jsx scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-all-pages-mobile,dev-governance-dark-desktop,dev-prototypes-dark-desktop,dev-testing-dark-desktop,dev-customer-config-dark-desktop,dev-customer-config-mobile /usr/local/bin/pnpm --dir web style:l1`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test`、`git diff --check` 通过；`http://localhost:5175` 上 7 个 dev 路由 390px DOM 抽检均无横向溢出。
- 下一步：后续若新增 `/__dev/*` 页面，应同步加入 `dev-all-pages-mobile` 或等价 L1 场景，避免开发入口再次出现隐藏横向滚动或首屏被控件挤占。
- 阻塞/风险：本轮只治理 dev-only 前端入口、样式和 L1 断言；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、真实导入、发布或部署路径。当前工作区仍有大量并行改动，本轮未回退、未提交。
