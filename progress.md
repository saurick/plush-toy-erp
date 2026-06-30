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

## 2026-06-28 开发测试入口白名单治理

- 完成：按 `plush-test-governance` 将 `/__dev/testing` 从全量 `docs/**/*.md` 关键词聚合改为当前维护入口白名单，只读取自动化测试策略、项目 / 前端 / 后端 / 脚本 README 和部署说明；`docs/reference/**`、`docs/archive/**` 不再作为可复制命令来源。
- 完成：收紧 fenced command block 抽取，只保留 shell 命令和续行，避免把输出文件清单、参考方案代码块或未来命令当成当前测试入口；同步 dev hub 文案、`web/README.md`、`docs/当前真源与交接顺序.md` 和 L1 断言。
- 验证：`node --test web/src/erp/config/devTesting.test.mjs web/src/erp/config/devHub.test.mjs`、`cd web && corepack pnpm exec eslint --ext .js --ext .jsx src/erp/config/devTesting.mjs src/erp/config/devTesting.test.mjs src/erp/pages/DevTestingPage.jsx src/erp/config/devHub.mjs src/erp/config/devHub.test.mjs ../web/scripts/style-l1/scenarios.mjs`、`cd web && corepack pnpm css`、`cd web && corepack pnpm gen:error-codes && node --test $(node -e "const p=require('./package.json'); process.stdout.write(p.scripts.test.replace(/^node --test\\s*/, ''))")`、`cd web && STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-testing-light-desktop corepack pnpm style:l1`、`git diff --check -- web/src/erp/config/devTesting.mjs web/src/erp/config/devTesting.test.mjs web/src/erp/config/devHub.mjs web/src/erp/config/devHub.test.mjs web/src/erp/pages/DevTestingPage.jsx web/scripts/style-l1/scenarios.mjs web/README.md docs/当前真源与交接顺序.md progress.md` 通过；真实构建数据为 8 篇当前入口文档、342 行可复制命令、reference/archive 命中 0。
- 下一步：若后续新增长期 QA 文档，应先登记到测试入口白名单或自动化测试策略，再进入 `/__dev/testing`；历史 reference 继续只作为设计输入，不直接暴露为命令入口。
- 阻塞/风险：本轮只治理 dev-only 测试入口、前端单测、L1 断言和说明文档；不改 schema、migration、JSON-RPC、RBAC、WorkflowUsecase、Fact usecase、真实写入 E2E、发布脚本或正式 ERP 菜单。当前工作区已有多组并行改动，本轮未回退、未提交。

## 2026-06-28 各类流程建模边界收口

- 完成：新增 `docs/architecture/各类流程建模边界评审.md`，把 `docs/reference/第四次20260627/erp各类“流”的边界与实现参考.md` 收敛为 plush 当前 Product Core、Workflow / Fact、页面表达和客户配置边界，不照搬流程模板平台。
- 完成：同步 `docs/architecture/README.md`、`docs/README.md` 和 `docs/文档清单.md`，登记正式架构入口、可视化图索引和 reference 吸收关系。
- 验证：`git diff --check -- docs/architecture/各类流程建模边界评审.md docs/architecture/README.md docs/README.md docs/reference/第四次20260627/erp各类“流”的边界与实现参考.md docs/文档清单.md progress.md` 通过；targeted `rg` 已确认正式入口和 reference 吸收关系，`tenant_id`、流程模板和扩展点只出现在禁止 / 边界语境；不运行 runtime、migration、浏览器或部署验证。
- 下一步：若后续要把某类流推进实现，应按模块实施治理拆成单个可验证闭环，先确认真源、状态机、RBAC、usecase 和测试，不从 reference 直接施工。
- 阻塞/风险：本轮不改 AGENTS、schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置包、导入脚本、部署脚本或页面 runtime；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-30 Skill 自动选择规则补充

- 完成：更新 `AGENTS.md`，新增“Skill 自动选择规则”，明确用户未指定 skill 时先评估明显匹配；项目专属 skill 优先；通用 skill 只在任务明确匹配时使用；无明显匹配或会引入不必要复杂度时可以不选 skill。
- 完成：规则同时要求开始工作前用一句话说明选择或不选择 skill 的原因，并禁止为了“必须使用 skill”机械套用不相关 skill。
- 验证：`progress.md` 更新前已检查规模为 320 行、65KB，低于归档阈值；按 docs-only 边界执行 `git diff --check -- AGENTS.md progress.md`。
- 下一步：后续如新增、删除、重命名或调整项目 skill 职责，再按项目专属 skill 维护约定运行 validator、YAML 解析和 metadata 扫描。
- 阻塞/风险：本轮只改项目级协作规则和进度记录，不改运行时代码、schema、测试脚本、部署流程、skill 内容或 `docs/文档清单.md`。
