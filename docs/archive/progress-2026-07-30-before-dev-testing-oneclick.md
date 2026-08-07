# plush-toy-erp progress 归档 / Progress Archive

> 归档原因：原活跃页已接近项目 `80 KiB` 阈值，在新增开发测试固定动作记录前完整归档并收缩活跃页。
>
> 原始快照：`348 lines / 81671 bytes`；SHA-256 `67b2f47e2af9a3eedcd5fb3ea6a1c737fe38667a14b41feb49f474d587c5ed2e`。除本归档标题与元数据外，以下正文保持原样。

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 传统专业系统能力映射

- 完成：在 `docs/product/零到一产品架构.md` 增加“传统专业系统能力映射”，用一张多对多表说明客户 / 销售、产品工程、采购、生产 / 委外、库存 / 出货、质量、财务、Workflow 和看板 / 集成分别与 CRM、PLM / PDM、SRM / MRP、MES / APS、WMS / WCS、QMS、BPM、BI / EAI 等传统标签的关系。映射明确只用于产品定位和能力解释，不作为系统拆分、部署拓扑、代码目录、数据表归属或成熟度真源；专业能力只有在深度、实时性、合规性、负载或团队边界形成真实需求时才评审外接，并继续保持一项数据一个权威 owner。
- 完成：`docs/product/README.md` 增加“判断本项目属于 ERP / MES / CRM 等哪类系统”的读者入口，继续链接既有模块边界、Workflow / Fact 边界和产品能力台账；没有新增独立 Markdown、frontmatter、第二份能力台账或复杂图，也不需要改动 `docs/文档清单.md`。
- 验证：固定 Node `24.14.0` 下 `node --test scripts/qa/docs-inventory.test.mjs` 通过 `5 / 5`，读回 `302` 份 Markdown，并确认清单、外部参考隔离、退役项目名和活跃文档本地链接均通过；专业标签、解释边界、唯一 owner 和读者入口定向扫描及 scoped `git diff --check` 通过。
- 下一步：本表保持稳定解释口径；只有产品定位、专业能力覆盖或外接门槛发生正式变化时才更新。当前实现成熟度继续只维护在产品能力台账，精确数据与行为继续回到代码、schema、migration、测试和目标环境证据核对。
- 阻塞 / 风险：本轮仅更新产品架构说明和文档路由，没有改变 runtime、schema、migration、API、RBAC、Workflow / Fact、菜单、客户配置、部署或客户验收；文档映射不能证明完整 CRM、MES、PLM、WMS、QMS、BPM、财务、BI 或集成平台已经实现。


- 完成：页面数据目录、readiness、fresh 空库基线、浏览器与本地验收合同同步纳入上述两页；query-proven 目标由 40 个增至 42 个，10 个仅能由浏览器证明的打印目标保持不变。搜索无匹配、未选择详情、当前没有异常 / 待办 / 红冲等真实业务空状态仍允许为空，不把所有空白页机械填满。
- 验证：代码与正式文档已经完成本批写入；语法、定向 Node 测试、文档门禁、8300 长期场景库计划 / 应用和权威读回将在释放共享 writer 后执行，当前不提前记为通过。
- 下一步：释放本批 writer 后先执行静态与定向合同；绿色后对已登记的本地 8300 场景库执行带计划摘要的幂等补数，读回 4 / 4 / 3 固定矩阵及 52 个页面目标。若任何正式接口、状态或关联关系不满足预期，按 fail closed 停止，不用 fixture 或页面 mock 冒充运行态。
- 阻塞 / 风险：本轮不改 schema、migration、RBAC、客户配置、页面业务动作或生产环境；本地场景数据和自动化即使绿色，也不等于已部署、真实岗位 smoke 或客户 UAT。共享 worktree 仍包含其他任务的独立改动，本批只归属申报的场景数据、验收合同、正式说明和本独立 progress 小节。

### 页面刷新入口去重

- 完成：删除生产订单操作区的“刷新当前页”和权限管理审批责任区的刷新图标；生产订单改为向 ERP 壳层注册 `loadOrders`，审批责任编辑弹窗的未保存状态同步纳入父页全局刷新 / 离开保护。新增 28 个桌面 ERP 页面源码的局部刷新控件守卫，只保留权限版本冲突时“刷新并保留当前勾选”这一项有独立语义的例外；移动岗位页、错误重试和单条权威重读不在本轮删除范围。
- 验证：固定 Node `24.14.0` 下，刷新与页面定向合同 `44 / 44`、Web 全量 Node 测试 `2021 / 2021`、Web lint、CSS、脚本语法和 scoped `git diff --check` 通过。独立 Chromium 的 `business-production-orders-refresh-entrypoint` 与 `permission-center-approval-responsibility` 两个 Style L1 场景 `2 / 2` 通过；生产订单同时覆盖 1440px、520px、壳层刷新成功提示和无横向溢出，截图已目检确认内容区不再存在第二个刷新按钮。
- 下一步：按共享 Local 队列释放 writer 并登记 `hold`；等待用户决定是否本地提交，以及是否另行推送。现有业务标准原型已明确“只保留最小必要工具动作”，本轮不改原型状态或正文。
- 阻塞 / 风险：真实 Chromium 的超长 `business-core-pages-desktop` 在本轮目标断言和两张生产订单截图均通过后，继续运行到范围外的生产排程页时被既有“待办任务”文案断言阻断，因此改由独立场景提供可归因绿色证据，未越界修复排程页。持久化写测试 `production-order-browser-e2e.mjs` 只更新了壳层选择器和静态合同，没有连接真实后端执行；本轮未改 API、RBAC、Workflow / Fact、schema、migration 或客户配置，也未部署、执行目标岗位 smoke 或客户 UAT。

### 财务 v1 术语、主流程与设计说明

- 完成：扩充 `docs/finance/财务第一版.md` 的读者路径，在现有详细合同前增加本系统财务 V1 的核心名词、主流程和设计原因。集中解释应收、应付、过账、对账、核销、部分核销、未核销金额、结清、收付款冲销 / 冲正、红冲、反向红冲、审批和业务发票；用 Mermaid 串起正式来源、收付款审批 / 显式过账、核销、结清和纠错，并以 1,000 元应收 / 600 元收款示例说明“来源可部分核销，但本次收付款金额必须全部分配”。同步校正 FinancePayment 当前 `DRAFT / APPROVED / REJECTED / POSTED / REVERSED / CANCELLED` 六状态及主路径，没有改变运行代码、schema、migration、API、RBAC、Workflow / Fact、页面或客户配置。
- 验证：Node `24.14.0` 下 `node --test scripts/qa/docs-inventory.test.mjs` 通过 `5 / 5`，读回 `302` 份 Markdown，并确认活跃文档本地链接全部可解析；使用 Web 已安装 Mermaid `11.15.0` 与 `happy-dom` 在 Node `24.14.0` 下解析新增流程图通过。章节 `1～10`、关键流程 / 六状态定向扫描和 `git diff --check` 通过。
- 下一步：本文继续作为财务 V1 业务语义和边界入口；后续如收付款状态、核销规则、银行 / 总账 / 税控范围或页面岗位流程发生正式变化，应同步更新本文并重新核对代码、测试和能力台账。
- 阻塞 / 风险：本轮是正式文档说明与现有状态漂移校正，没有运行服务端、数据库、浏览器岗位 smoke、目标环境发布或客户财务 UAT；文档与 Mermaid 解析绿色不表示银行、总账、税控或完整会计能力已经实现，也不替代目标环境读回和客户验收。

### 链、流及 P0/P1 边界收口

- 完成：以现有正式专题为集中入口，收口“流是规则与运行方式、链是已发生证据的排序投影”，把单据流纳入流的组成并将异常流明确为各正式流程必须描述的分支；同步七条正式 ProcessRuntime 的节点、责任池、异常出口和 Fact 边界，Shipment 统一为财务审批 / 放行门禁而非仓库审批任务。补齐 ProcessRuntime 业务轨迹、单任务处理记录、审批处理链、状态历史、数据来源、审计、Trace 和通知链的可查层级、排序 / 权限 / 缺失证据与 fail-closed 规则，明确甲方可编排流程选择和有限责任投影，但链只能按已发生事实查询，不能被编排或编辑。
- 完成：纠正库存人工调整审批、附件授权与完整性、客户 ProcessRuntime 选择范围等文档漂移；七条流程的八个注册变体新增规范化图合同测试，客户运行时 manifest 删除两段未被正式编译路径消费的退役 Fact 命令草稿，Shipment 页面动作守卫按当前服务端投影合同更新。任务事件查询使用 `limit + 1` 权威读回并显式返回 `truncated`，桌面抽屉和移动任务详情在记录被截断时提示“不是完整审批链”；附件下载按已持久化文件大小和 SHA-256 校验内容，不一致时 fail closed 且不向用户泄露原始内容或内部异常。
- 验证：服务端 T4 `go test -count=1 ./internal/core/... ./internal/biz ./internal/data ./internal/service ./internal/server` 全部通过；文档、客户配置、链 / 流 / Workflow-Fact、页面动作、mock、API、桌面抽屉和移动任务定向合同 `148 / 148` 通过，Style L1 mock `33 / 33` 通过。Web lint 与完整 Node 测试 `2016 / 2016` 通过；真实 Chromium 的 `erp-task-board-desktop`、`mobile-yoyo-role-task-projection` 两个 Style L1 场景 `2 / 2` 通过；`git diff --check` 通过。前端命令运行于 Node `26.5.0`，保留项目要求 `24.14.x` 的 engine warning。
- 下一步：代码与正式文档层已完成本地验证；目标环境仍需按独立授权执行对应版本 / 配置 revision 的发布与读回、真实岗位账号 smoke、移动岗位试用和客户 UAT。本轮未改 schema / migration，因此不运行 `make data`、Atlas migration 生成或数据库 apply，也未部署、登录真实客户账号或代替客户验收。

### 业务公式与计算口径总索引

- 完成：新增 `docs/product/业务公式与计算口径.md`，按 `Current · Formal / Preview / Print Draft / Current implementation · Pending / Not Implemented` 分层登记 25 条服务端正式或当前实现公式、4 类前端预览和 2 类打印草稿规则，覆盖订单金额、采购收货 / 退货 / 应付、委外、库存 / 预留 / 出退货容量、盘点、BOM / 生产用料 / WIP、出货金额 / 净重、财务分配 / 未结 / 冲回。每项同时记录状态集合、计算粒度、舍入点、冻结或派生方式、代码和测试入口；同步产品 README 与文档清单，没有建立第二套运行真源。
- 完成：把采购入库预览未纳入已过账数量调整、采购 / 委外应付未统一显式 `Round6`、异常历史订单金额 / 单价优先级、采购退货不重开收货容量、人工净重 fallback、打印草稿使用 JS `Number`、工程总用量只有快照和看板无业务比例等当前差异显式列为待收口项；质量“估算不良比例”、税额 / 汇率、成本 / 毛利、MRP / APS、单位换算和毛重继续不补造公式。
- 验证：`bash scripts/qa/affected.sh --run` 的 T0 / T1 全部通过，文档清单、活跃文档边界、本地链接和客户岗位手册定向测试 `15 / 15` 通过并读回 `302` 份 Markdown；前端定点数、订单汇总、采购入库预览、预留、出货来源 / 净重、财务分配和两类打印草稿定向 Node 测试 `140 / 140` 通过。服务端 `core/calc`、biz 行金额 / 净重 / 盘点 / WIP 及 data 采购数量、生产用料 / 返工、出货预留 / 净重、财务分配 / 未结定向 Go 测试通过；`git diff --check` 与新文档尾随空白检查通过。
- 下一步：本文后续随领域公式变更同步维护；已知待收口项必须分别经过业务政策、服务端 Decimal / 事务、PostgreSQL 写入读回和消费者测试后再改状态，不能由页面 fallback 自行统一。本批不修改运行代码、schema、migration、API、RBAC、Workflow / Fact 或客户配置。
- 阻塞 / 风险：本轮是当前代码与测试合同的文档整理，没有执行数据库 migration、PostgreSQL 舍入专项、全站 `full / prepare-push`、目标环境部署、岗位 smoke 或客户 UAT；因此不把本地文档和定向测试绿色表述为待确认公式已冻结、目标环境已更新或客户已验收。

### 权限页操作生效说明

- 完成：复用权限管理页现有“菜单与操作说明”问号，不新增重复帮助入口；帮助卡片新增“岗位可用操作 = 系统允许 ∩ 模块已启用 ∩ 当前版本已开放 − 岗位撤销”的业务语言解释，并说明交集、扣除、多岗位分别计算后合并，以及实际办理仍受数据范围、负责岗位、单据状态和前置审批约束。现有入口继续支持 hover、键盘聚焦和点击，不改权限计算、页面结构、后端、客户配置、Workflow / Fact、schema 或 migration。
- 验证：用户可见技术字段与权限中心文案守卫 `63 / 63` 通过，Web 正式 `pnpm lint` 通过；现有 `permission-center-desktop` Chromium 场景已通过本次帮助入口的定位、文案、浮层尺寸和截图步骤，目检 `permission-center-help-popover-card.png` 与整页截图确认内容完整、自然换行且无横向溢出。该场景随后被本批范围外的旧“命中 3/6 个员工账号”断言阻断，因此不把整条场景记为通过。
- 下一步：释放共享 Local writer 并按 `hold` 登记；等待用户决定是否本地提交，以及是否另行推送。
- 阻塞 / 风险：浏览器证据使用 Style L1 mock，前端命令运行于 Node `26.5.0`，保留项目要求 `24.14.x` 的 engine warning；未部署、未执行目标岗位 smoke 或客户 UAT。无关账号计数断言漂移未在本批越界修改。

### 数据库 74 表数据字典与零漂移门禁

- 完成：新增 `server/cmd/schema-doc` 只读生成器和严格 `table-catalog.json`，从当前 Ent generated `migrate.Tables` 提取 74 张 Product Core 应用表的 1143 个字段、139 个外键、329 个显式索引（其中 29 个 partial index）和 247 个 CHECK，再结合人工审查的用途、领域分类、生命周期、写入边界、敏感字段与正式参考生成 1 份总入口和 7 份分域数据字典。每张应用表都有独立锚点与字段、主键、外键、索引、CHECK、schema source 和业务真源说明；截图中的 Atlas revision 表明确登记为非应用表。同步后端 / docs / scripts 导航、文档清单、fast required files 和 affected 映射，schema、migration、catalog、生成器或生成 Markdown 漂移都会触发定向检查。
- 验证：服务端 `go test ./...` 全量通过；`go run ./cmd/schema-doc --check` 读回 `tables=74 catalog=74 columns=1143 foreignKeys=139 indexes=329 checks=247 outputs=8` 且 `missing / changed / stale / unexpected` 均为 0。`schema-docs + affected + docs-inventory + gate-profiles` 定向 Node 合并执行 `42 / 42` 通过，文档清单读回 325 份 Markdown，触达 JavaScript 均通过 `node --check`。完整 Node 分组唯一性门禁本轮另被并行批次新增但尚未登记的 `yoyoosun-role-business-action-projection.test.mjs` 阻断；本批新增的 `schema-docs.test.mjs` 已登记到 fast，未越界代改并行批次。
- 下一步：按共享 Local 队列释放本批 writer；当前 `commit_policy=hold`，等待用户决定仅本地提交、提交并推送或继续保持未提交。本项不需要 `make data`、Atlas migration 生成、数据库 apply、部署或客户 UAT。
- 阻塞 / 风险：数据字典是仓库当前 Ent generated migration descriptor 与人工 catalog 的生成投影，不是 PostgreSQL `COMMENT`，也不证明任一目标库已 apply 或无漂移；目标环境仍须独立执行 migration status 与结构读回。Ent 的 Go 侧 validator、`Default(time.Now)`、`UpdateDefault`、`Immutable` 和 `Sensitive` 不一定进入 descriptor，关键业务边界仍以 schema、usecase 和正式文档为准。本批没有修改 schema / migration 或连接数据库，未暂存、提交、推送、建分支、部署或代做 UAT。

### 外部参考原文与相邻项目来源退役

- 完成：删除 `docs/reference/**` 下 24 份已跟踪的其他项目 / GPT 参考原文，不迁入 `docs/archive/**`；仓库当前不再维护外部原文。把已被项目吸收的生命周期、流程边界、字段联动、来源选择、页面密度和 51 项菜单候选改写为 plush 自有正式口径，并从活跃文档、原型和开发工作台说明中移除相邻项目名称与已删除来源路径。`docs/archive/**` 继续只保留本项目历史证据，Git 历史不改写。
- 完成：同步 `AGENTS.md`、docs 入口 / 清单 / 当前真源 / 治理地图、产品与架构专题、yoyoosun 决策日志 D-009、原型中心、DEV 文档 / 测试 / 原型配置和 `$plush-docs-governance`；新增文档门禁，阻止外部原文目录或退役相邻项目名重新进入活跃 Markdown。未新增 frontmatter 或 metadata，也未改 schema、migration、API、RBAC、Workflow / Fact 或正式菜单。
- 验证：文档、DEV 入口、阶段命名、Skill 和原型定向 Node 测试 `65 / 65` 通过，文档清单读回 301 份当前维护 Markdown；触达 DEV 配置 ESLint、phase 全仓扫描、Skill health `3 / 3`、YAML、canonical Skill validator、AGENTS 体积 `15409 bytes` 和 `git diff --check` 通过。`dev-docs-dark-desktop`、`dev-testing-dark-desktop`、`dev-prototypes-dark-desktop` 三个真实 Chromium Style L1 场景 `3 / 3` 通过。全仓扫描确认活跃文档没有退役相邻项目名，已删除路径只剩防止重新索引 / 引入的负向测试守卫。
- 下一步：释放共享 Local writer 并按 `hold` 登记本批；依 Codex App 规则，取得用户确认后才允许本地提交或推送。本项不需要 migration、后端重启、部署、目标环境 smoke 或客户 UAT。
- 阻塞 / 风险：`docs/reference/` 下仍可能存在被 Git 忽略的系统元数据，但没有可维护文档；历史 commit 和 `docs/archive/**` 中的历史表述继续可追溯，不属于当前真源。本地文档与 Chromium 绿色只证明当前 worktree 的退役和入口闭环，不代表部署或客户验收。

### 全页面业务动作可用性与角色投影收口

- 验证：共享动作 helper、页面与既有合同定向 Node 测试 `73 / 73`，九岗位与特殊身份投影测试 `4 / 4`，Web 全量 Node 测试 `2015 / 2015`、lint、CSS 和 production build 通过。`affected.sh` 的 T0–T5 影响面门禁全部通过，包含文档清单 `13 / 13`、直接影响测试 `30 / 30`、Go T3 repository 与 T4 service / server。真实 Chromium 的财务岗位、收窄超级管理员、仓库退货 / 出货、生产异常和代表页面五个 Style L1 场景 `5 / 5` 通过；DOM 门禁覆盖动作稳定位置、可见 / 禁用状态、禁用原因和无横向溢出，并目检财务草稿、出货待审批、生产异常待审批和已收货退货截图。
- 下一步：释放共享 Local writer 并按 `hold` 登记本批；根据 Codex App 的显式授权要求，取得用户确认后再本地提交或推送。本项无需 migration、后端重启或原型阶段晋级。
- 阻塞 / 风险：浏览器使用 Style L1 mock，九岗位已做静态权限投影，代表岗位已进真实 Chromium，但没有机械执行九岗位乘十四页面的完整笛卡尔组合；本地自动化与浏览器绿色不等于目标环境部署、岗位 smoke 或客户 UAT。前端命令运行于 Node `26.5.0`，保留项目要求 `24.14.x` 的 engine warning；出货 `PENDING` 的更细粒度按钮文案仍需以后端权威流程投影为前提。

### 收付款与核销列表工具收口

- 完成：`收付款与核销` 的“收付款记录 / 红冲记录”两个正式财务事实页签均接入真实“导出筛选结果 / 列顺序”。两个页签使用独立账号列偏好；导出按当前页签筛选条件通过既有严格分页器逐页读取全部匹配记录，不只导出当前 20 条，并按当前列顺序输出业务可读方向、往来方、状态、核销摘要、来源类型和时间，不导出内部 ID。空结果和加载中明确禁用；旧请求取消或失效时不弹错误。未改列表分页、筛选本身、业务动作、RBAC、Workflow / Fact、schema、migration、菜单或客户配置。
- 验证：API / 页面 / 严格分页定向 Node 测试 `18 / 18`、Web lint、CSS、全量 Node 测试 `2010 / 2010` 和 scoped `git diff --check` 通过；`STYLE_L1_PORT=15280 STYLE_L1_SCENARIOS=exception-finance-payment-dark-desktop pnpm --dir web style:l1` 通过 `1 / 1`，真实 Chromium 实际下载并读取收付款 CSV，验证列顺序保存 / 恢复、空红冲导出禁用、两个页签独立列顺序弹窗、暗色布局和无横向溢出，并目检 4 张相关截图。
- 下一步：释放共享 Local writer 并登记 hold 批次；按 Codex App 显式授权要求，取得用户确认后再本地提交或推送。本项不需要原型晋级、后端重启、migration、部署或客户 UAT。
- 阻塞 / 风险：浏览器场景使用 Style L1 mock，未以大于 200 条真实财务记录做运行态多页导出；完整分页由共享严格分页器和现有分页测试覆盖。本地自动化 / Chromium 绿色不等于目标环境部署或岗位验收。

### 生产异常处置列表工具收口

- 完成：`生产异常处置` 的“处置申请 / 待审批”两个页签现在都只展示真实可用的“列顺序”，不再显示“导出筛选结果”或不可用导出占位；处置申请复用共享账号列偏好与表头列设置，并使用独立 `production-exceptions-decisions` 偏好键，避免覆盖待审批任务列顺序。共享工具新增默认兼容的显隐开关，生产排程和出货放行等其他页面保持现状。未改筛选、选择、业务动作、API、RBAC、Workflow / Fact、schema、migration、菜单或客户配置。
- 验证：Web 全量 Node 测试 `2005 / 2005`、`pnpm lint`、`pnpm css` 与 scoped `git diff --check` 通过；`STYLE_L1_SCENARIOS=business-production-exception-tabs-desktop pnpm style:l1` 通过 `1 / 1`，真实 Chromium 覆盖两个页签的列顺序弹窗、导出按钮缺席、筛选 / 当前操作相邻布局、暗色桌面和手机宽度，并目检 5 张截图无横向溢出或按钮残留。
- 下一步：按共享 Local 队列释放 writer；根据 Codex App 的显式授权要求，取得用户确认后再本地提交或推送。本项不需要原型晋级、后端重启、migration、部署或客户 UAT。
- 阻塞 / 风险：浏览器场景使用本地 Style L1 mock，前端命令运行于 Node `26.5.0` 并保留项目要求 `24.14.x` 的 engine warning；本地视觉与自动化绿色不等于目标环境部署或岗位验收。共享 Local 仍有其他任务修改，本项只归属所列前端、回归和本独立 progress 小节。

### 已阻塞任务附件写权限

- 完成：任务附件上传不再借用“转为 blocked”的 Workflow 状态动作判断，改为独立校验任务状态、后端 RBAC、责任岗位和精确指派人。`ready / blocked` 的合法责任人可补充任务附件；老板监督可见但不负责的任务、assigned-other、`done / rejected` 终态和未知状态继续拒绝。正式 ProcessRuntime 任务按自身不可变 config revision 解析责任范围，并把同一次授权产生的 `expected_version`、actor 与角色范围直接传入 repo；repo 锁行后再次校验版本、终态和责任归属。
- 完成：已保存附件新增只读上传审计投影，列表和元数据按 `uploaded_by` 批量解析当前管理员账号，上传响应直接回显本次认证账号；即使账号已禁用或注销，历史附件仍显示原账号名。共享附件面板展示“上传账号 / 上传时间”，旧数据缺账号或时间时明确显示“未记录”，不把数值用户 ID、`uploaded_by` 字段名、MIME 或存储路径暴露给业务用户。未改附件表、Workflow 状态机、Fact、schema、migration、RBAC、客户配置或上传权限范围。
- 验证：T4 service 定向回归覆盖 ready owner、缺后端 update 权限、截图对应的 blocked boss owner、blocked exact assignee、wrong owner、boss 监督只读、assigned-other、done、rejected、未知状态和正整数版本门禁；另覆盖 superseded task revision、不完整 runtime anchor、super admin 监督只读和上传审计 JSON 投影。T3 SQLite repo 覆盖 stale version、terminal、reassignment、零插入、禁用账号名称解析和旧附件缺上传者。独立 Chromium 在 1440 × 900 的真实出货放行任务附件弹窗确认 `demo_boss` 与上传时间可见，内部 ID / MIME 不可见，弹窗和附件行无横向溢出；截图为 `web/output/playwright/attachment-uploader-audit.png`。共享混合工作区的 affected 门禁最高 T5，T0 / T1 / T3 / T4 / T5、Web lint、CSS 和全量 Node 测试 `2008 / 2008` 通过。
- 下一步：按共享 Local 队列释放 writer；根据 Codex App 的显式授权要求，取得用户确认后再本地提交。当前 `8300` 后端仍是修复前制品，提交后需用项目 `make dev_restart` 预检、重建并重启，再以 demo boss 对已阻塞任务补附件做本地运行态读写验证。
- 阻塞 / 风险：完整 `business-core-pages-desktop` Style L1 在进入附件步骤前被共享 Workflow 页面已变化的“待办任务”旧锚点阻断；本项使用同一 RPC mock 与真实页面补做了独立附件浏览器验证，但未越界修改其他任务文件。本轮尚未执行真实附件写入、PostgreSQL 并发门禁、后端重启、目标环境发布或客户 UAT；本地 T3 / T4 / T5 与浏览器绿色不能替代这些证据。

### 开发工作台主题切换

- 完成：研发效能工作台的共享侧栏新增“跟系统 / 浅色 / 暗色”主题入口，复用全站 `ERPThemeProvider`、`ERPThemeToggle` 和 `plush_erp_theme_mode`，所有 `/__dev/**` 页面同步生效且刷新后保持，不建立第二套主题状态。桌面侧栏显示当前模式并占满操作区，窄屏收为自适应按钮，手机端只保留图标；可访问名称始终带当前模式，点击区域不小于 40px。
- 验证：Node `26.5.0` 下，主题与开发工作台定向测试 46 / 46、Web 全量 Node 测试 1996 / 1996、Web lint、CSS、样式脚本语法和 scoped `git diff --check` 通过，包装命令保留仓库要求 Node `24.14.x` 的 engine 提示。显式使用 Node `24.14.0` 运行 `dev-testing-dark-desktop`、`dev-testing-light-desktop`、`dev-all-pages-mobile` 三个 Style L1 场景全部通过并目检截图；独立 Playwright 会话实际完成暗色切换、刷新持久化和切回浅色，控制台 0 error / 0 warning。
- 下一步：本项无需原型阶段、schema、migration、API、RBAC、菜单、Workflow / Fact、客户配置、部署或客户 UAT；尚未暂存、提交或推送。
- 阻塞 / 风险：共享 Local 仍包含财务帮助、任务看板、数据准备、Workflow 等其他任务现场；本项只归属共享开发导航主题入口、响应式样式、静态合同、Style L1 精确门禁、Web 主题说明及本独立小节，不格式化、暂存或提交其他 hunks。本地混合工作区的绿色验证不替代 clean exact SHA、目标环境 smoke 或发布证据。

### 收付款冲销与红冲术语帮助

- 完成：在“收付款与核销”页头的“冲销 / 红冲”标签旁增加唯一问号帮助入口，复用现有 Ant Design `Popover` 模式，同时支持鼠标悬停、键盘聚焦和触屏点击。说明按本系统真实语义区分“冲销收付款会恢复未核销金额”与“红冲会调减应收 / 应付未核销金额”，并明确两者都不代表税控红字发票、总账凭证或银行对账完成；按钮、状态、API、RBAC、Workflow / Fact 与财务领域 usecase 均未改。
- 验证：仓库 Node `24.14.0` 下，新增术语帮助合同测试 1 / 1、触达页面定向 ESLint、scoped `git diff --check` 与 `exception-finance-payment-dark-desktop` Style L1 Chromium 场景通过。独立真实 Chromium 在 1280px 暗色桌面完成悬停与键盘聚焦，在 390px 触屏手机完成真实点击；浮层均在视口内，手机页面 `scrollWidth = 390` 无横向溢出，截图已目检。
- 下一步：本项实现与定向回归已完成，无需原型、schema、migration、后端、权限、菜单、客户配置或正式专题文档变更；尚未暂存、提交、推送、部署或执行客户 UAT。
- 阻塞 / 风险：当前共享 Local 仍有其他任务的混合修改；本项只归属 `FinancePaymentsPage.jsx` 的术语帮助 hunk、新增窄合同测试及本独立小节，不格式化、暂存或提交其他现场。本地页面绿色不替代目标环境岗位 smoke、税控 / 总账核对或客户验收。

### 逾期任务相关单据入口

- 验证：仓库 Node `24.14.0` 下，入口、权限与处理提示定向测试 23 / 23、Web 全量 Node 测试 1996 / 1996、四个触达文件 ESLint 和 scoped `git diff --check` 通过；真实 Chromium 工作台场景通过并目检模拟逾期任务无源单提示、长文案换行和相邻布局。
- 下一步：本项无需 schema、migration、后端、RBAC、Workflow / Fact、客户配置或原型阶段变更；尚未暂存、提交、推送、部署、执行目标岗位 smoke 或客户 UAT。
- 阻塞 / 风险：四类正式源单的路径、精确 ID 参数、后端 `source_access` 与菜单门禁已由合同测试覆盖；当前浏览器夹具只覆盖无权威源单的负向显示，未把本地合同绿色表述为目标环境正式源单点击验收。

### 业务页头数值摘要治理

- 完成：标准业务页头 `PageHeaderCard.stats` 全局收口为非负安全整数计数，`0` 保留，数字字符串、文字状态、视图名、负数、`NaN` 和无穷值不再进入大号主值；库存台账删除重复的“查看内容 / 当前页签”文字卡，只保留“筛选结果 / 本页显示”，当前视图继续由页签表达。Product Core 总览同步删除重复的“业务数据 / 未连接”文字卡，剩余“业务功能 / 系统设置”改用真实数字并均分两列；未连接状态继续放在说明与标签中。
- 完成：业务标准页和指标卡语义样板明确“没有合适数值就减少卡片，不用重复文字或虚构 0 补位”；业务看板与任务看板的数据不可用状态仍保留 `— / 暂不可用`，不把请求失败伪装为真实零值。共享浏览器门禁改为分别读取标签与 `<strong>` 主值，并直接验证非负整数。
- 验证：仓库 Node `24.14.0` 下，新增 / 触达定向 Node 测试 33 / 33、Web 全量 Node 测试 1995 / 1995、Web lint、CSS、样式脚本语法与 `git diff --check` 通过。真实 Chromium 使用独立辅助端口 `15280` 验证 `inventory-visible-copy-desktop`、`inventory-numeric-summary-dark-mobile`、`erp-dashboard-desktop` 三个场景；DOM 门禁覆盖库存三页签、两张数值卡、手机无溢出和暗色可读，已目检桌面库存、暗色手机页头元素与 Product Core 首页截图。
- 下一步：本项无需 schema、migration、API、RBAC、Workflow / Fact、客户配置或原型阶段晋级；尚未暂存、提交、推送、部署、执行目标岗位 smoke 或客户 UAT。
- 阻塞 / 风险：共享 Local 仍包含审批、任务看板、数据准备、ProcessRuntime 等其他任务现场；本项只归属共享页头数值门禁、库存摘要、Product Core 两张数字卡、对应测试 / 文档 / 浏览器场景及本段记录，不格式化、暂存或提交其他 hunks。定向浏览器绿色证明本地当前混合工作区的受影响页面，不替代 clean exact SHA 的完整 Style L1、发布或客户验收。

### Codex App Git 收口队列治理

- 完成：新增项目 Skill `$plush-git-closeout-queue`，把共享 Local 的唯一 writer、稳定 `event_id` + 精确 ACK、批次登记、热点文件继续排队、独立 push owner 和 fail-closed 边界收口为长期协议。AGENTS 只保留入口，动态查找同项目唯一置顶的 `Git 收口队列`，不保存易漂移的 task id、当前 owner、批次或 Git OID。
- 完成：协议升级为 revision 2。队列仍默认休眠并由 ready / release 消息唤醒，但安全批次现在默认 `auto_local`，只有用户明确“不提交 / 先别提交”才 `hold`；被唤醒后按登记顺序逐批精确本地提交，不等待并不存在的全局 idle 信号。升级治理批次必须先进入 HEAD 并确认 index 复空，随后协议 1 的 `commit_authorized:false` 才不再被误判为暂停；无明确禁止提交证据的旧批次重新排队，未知或 mixed hunk 无法证明归属时仍 fail closed。
- 完成：App 重启或旧任务漏报时仍只按用户明确的 `RECONCILE_REQUEST` 做一次只读盘点，不能因为“已无任务运行”就盲目 `git add -A`。上下文过长时通过 compact snapshot 交给同项目空白新任务，确认接管后再归档旧队列，避免 fork 复制长历史或同时保留两个正式队列；push 始终独立明确授权。
- 验证：官方 Codex 手册确认任务历史可重新读取 / resume 和上下文压缩能力，但未提供 App 关闭期间跨任务离线投递保证；协议因此以 ACK 和幂等重发为准。项目 Skill validator、YAML / metadata、引用扫描、AGENTS 体积门禁和 scoped `git diff --check` 均纳入本次验证；不改变 runtime、schema、API 或测试行为。
- 下一步：现有和未来顶层写任务在每次新轮次重新读取 AGENTS / Skill，完成切片后发送带 exact scope 与验证的 `BATCH_READY`；队列在安全边界满足时自动本地收口，显式 `hold`、遗留 reconcile 和手动分组才需要额外解除或 `CLOSEOUT_REQUEST`。需要更换队列时由用户明确触发 `QUEUE_ROTATE_REQUEST`。
- 阻塞 / 风险：任务历史可恢复不等于跨任务消息必达，外部 GitHub Desktop / 终端也不受 Codex 协议预先锁定；无匹配 ACK、归属不明、index 污染、并发 Git 或 remote ref 漂移时均保留现场并停止，不自动 pull、merge、rebase、force、重试或猜测提交范围。

### 工作台与移动端“待我审批”

- 完成：移动端不增加独立审批卡或第五个底栏入口；无审批权限时待办分段行显示“全部 / 风险 / 超时”，有审批权限时显示“全部 / 审批 / 风险 / 超时”，并继续从独立服务端 `approval` 投影读取审批集合。加载骨架同步按权限预留 3 / 4 项，滑块宽度和位置按真实项目数计算。“我负责”已移除：旧实现只按当前已加载 `todo` 和未指派岗位池做客户端近似计算，常与“全部”重复且没有完整服务端游标；底部“我的”主导航保持不变。移动 Current 原型、专题说明和 Web 说明已同步。
- 验证：实现完成时，仓库 Node `24.14.0` 下 Web 全量 Node 测试 1996 / 1996、Web lint、CSS 和 production build 通过；最终热点释放后的最新文件身份下，两份样式脚本语法、移动任务 / Current 原型定向测试 79 / 79 与本项 scoped diff check 通过。`mobile-tasks-dark`、`mobile-yoyo-role-task-projection` 两个真实 Chromium 场景 2 / 2 通过；截图目检确认 390px 有审批暗色为“全部 / 审批 / 风险 / 超时”、430px 无审批浅色为“全部 / 风险 / 超时”，数量胶囊完整、底部“我的”保留且无横向溢出。
- 下一步：本项本地实现与最终只读验证已完成，等待共享 Local 的统一 Git 收口。本项无需 schema、migration、后端、RBAC、Workflow / Fact 写入、部署或客户 UAT；尚未暂存、提交或推送。
- 阻塞 / 风险：共享 Local 仍包含任务看板视觉、数据准备、ProcessRuntime 等其他任务现场；本项只归属审批 Tab / 筛选简化、对应自动化、Current 原型 / 说明及本段记录，不回退、格式化、暂存或提交其他 hunks。全量共享 Style L1 的其他并行断言不作为本项绿色前提；审批入口按当前生效权限显示，权限被收回后立即隐藏，但既有 Workflow / Fact 审计记录不删除。

### 任务看板四分类视觉区分

- 完成：任务看板四个泳道增加统一的浅中性承载底板、白色内容面和轻量边框；常规待办、阻塞、到期提醒、已结束分别使用蓝灰、红、琥珀和中性灰的浅色标题底与左侧语义色条，暗色主题使用同语义的低透明度色面。颜色只辅助区分类别，标题和状态标签仍承担主要语义；“已结束”包含完成与退回 / 拒绝，因此保持中性灰而不使用全成功含义的绿色。泳道内容现在统一按卡片 18px 外圆角裁切，修复标题色面越过裁切区后遮住右上角边框圆弧的问题。现有桌面 Overview 移除、顶部四色指标、局部刷新、筛选与任务状态语义均未改写。
- 验证：仓库 Node `24.14.0` 下，Web lint、CSS、全量 Node 测试 1983 / 1983、样式脚本语法与 `git diff --check` 通过。真实 Chromium `erp-task-board-desktop`、`erp-task-board-mobile`、`erp-task-board-dark-wide-desktop` 三个场景通过；DOM 门禁确认四个泳道类别、四种标题背景、四条语义色条、外圆角裁切、无卡片重叠和页面横向溢出，并目检浅色桌面、暗色宽屏和局部刷新骨架截图。
- 下一步：本项无需原型阶段、schema、migration、API、RBAC、菜单、Workflow / Fact、客户配置或正式文档变更；尚未暂存、提交、推送、部署或执行目标岗位 smoke / 客户 UAT。
- 阻塞 / 风险：共享 Local 仍包含数据准备、ProcessRuntime、搜索 / 筛选宽度等其他任务现场；本项只归属 `DashboardPage.jsx` 的泳道类别 class、`task-center.css` 与 `theme-overrides.css` 的四分区样式、`styleL1.mjs` 的视觉门禁及本段进度记录，不格式化、暂存或提交共享文件中的其他 hunks。

### 任务看板分类与翻页局部刷新

- 完成：任务看板首次进入仍使用整卡加载；已有数据后切换四类指标、筛选或分页时，保留同一非分类筛选范围的顶部数量、选中指标和筛选摘要，只让下方目标泳道进入局部骨架并在当前请求返回后替换列表。切换绑定目标请求键并临时保持看板高度，避免泳道收缩使页面滚动位置回弹；严格请求键仍阻止旧列表进入新筛选。已移除的桌面 Overview、移动端优先事项和已提交的四色指标均未恢复或改写。
- 验证：仓库 Node `24.14.0` 下，任务看板定向 Node 测试 28 / 28、Web 全量 Node 测试 1983 / 1983、Web lint、CSS、触达 JS 格式检查与 `git diff --check` 通过。真实 Chromium `erp-task-board-desktop` 已验证切换中外层卡片不 loading、唯一泳道 loading、`aria-busy`、顶部数值 / 选中态 / 几何位置稳定，并目检切换前、局部加载和完成后三张截图；`erp-task-board-mobile` 通过。
- 下一步：本项完成精确本地提交后停止，不推送、不部署、不执行目标岗位 smoke 或客户 UAT；无需 schema、migration、API、RBAC、菜单、Workflow / Fact、客户配置或原型阶段变更。
- 阻塞 / 风险：共享 `erp-task-board-dark-wide-desktop` 在本项检查之外，被另一任务新增的“泳道标题背景应互不相同”断言阻断（当前 1 种背景、4 种色条阴影）；共享 `scenarios.mjs` 另有其他任务格式告警。本项不越界修复这些视觉现场，Git 收口必须只取局部刷新归属 hunks。

### 任务看板筛选控件宽度

- 完成：任务看板筛选区由等分三列网格改为紧凑弹性布局；搜索框按 280–420px 自适应，状态、岗位、截止时间和业务下拉固定为 160px，“清空筛选”保持内容宽度。空间不足时控件自然换行，960px 及以下继续使用整行触控，不改变筛选值、URL、清空范围、API、RBAC、Workflow / Fact 或客户配置。
- 验证：Web lint、CSS、任务看板定向 Node 测试 8 / 8、脚本语法和 `git diff --check` 通过；真实 Chromium `erp-task-board-single-role-scope-desktop` 与 `erp-task-board-mobile` 通过，并以 DOM box metrics 断言桌面搜索框 / 下拉 / 清空按钮宽度、无溢出和手机端整行宽度，已目检桌面与手机筛选截图。
- 下一步：任务看板原型仍准确，本项只是 Current 运行态密度修正，无需改原型、schema、migration、后端、菜单、正式专题文档或部署；尚未暂存、提交、推送或执行客户 UAT。
- 阻塞 / 风险：暗色宽屏场景已证明筛选区为 1262px × 64px 且未在本项宽度处失败，但随后被共享现场已有的“泳道标题背景应可区分”断言阻断；本项不越界修改该并行主题样式。当前 Node `26.5.0` 与仓库声明的 `24.14.x` 不同，命令保留引擎版本提示。

### 任务看板搜索组合框连续性

- 完成：修正共享控件圆角真源对 Ant Design `Input.Search` 连接语义的覆盖；搜索输入只保留左侧外圆角，搜索按钮只保留右侧外圆角，中间接缝为直边且仍复用统一 12px 控件圆角。清空、回车搜索、焦点和按钮行为未改，任务筛选、API、RBAC、Workflow / Fact 与客户配置均未触达。
- 完成：新增控件基础样式合同，并把 Style L1 的通用输入圆角门禁收口为两类真实规则：普通输入继续要求四角圆；组合搜索框要求两段同高、接缝无空隙、外圆内直。任务看板原型仍准确，本次只是当前运行态样式细节修正，未改原型结构、交互或状态登记。
- 验证：Web lint、CSS、定向合同测试与 `git diff --check` 通过；真实 Chromium `erp-task-board-desktop`、`erp-task-board-single-role-scope-desktop` 两个场景通过，覆盖有值 / 清空、焦点、回车提交、默认岗位筛选和单岗位筛选布局。除共享现场中尚未跟上 Dashboard 当前实现的未跟踪 `DashboardPageLoading.test.mjs` 外，其余 Web Node 测试 1775 / 1775 通过；完整 `pnpm test` 的唯一已知失败不归本项。
- 下一步：本项无需 schema、migration、后端、菜单、正式文档或部署变更；尚未暂存、提交、推送、部署或执行客户 UAT，Git 收口须重新取得共享 checkout 的明确提交租约。
- 阻塞 / 风险：深色宽屏任务看板场景在进入本项搜索框检查前，被共享现场已有的“泳道标题背景应互不相同”断言阻断，本项未越界修改该并行样式；当前 Node `26.5.0` 与仓库声明的 `24.14.x` 不同，相关命令保留引擎版本提示。

### 角色任务进度展示

- 完成：经页面复审，桌面工作台删除与任务看板重复的“当前可见任务概览”及其额外 `get_task_board` 请求，直接进入优先处理队列与当前任务详情；完整总量、常规待办 / 阻塞 / 到期提醒 / 已结束四类互斥指标继续只由任务看板承接，刚提交的四色语义色条保持不变。任务抽屉、移动任务详情与确认成功后的回执继续共享 ProcessRuntime“执行轨迹”，不把任务完成包装成 Fact 入账，也不按可能分支推算百分比。
- 完成：移动端删除筛选上方重复的“优先事项”卡；“当前已加载任务分布”只保留在待办页，用于说明分页加载池构成，已办页直接进入已办任务与完成 / 退回状态列表，不再重复待办、卡住、退回、完成四类整池分布。筛选、任务列表、详情、办理和可信回执主路径不变；Current 原型、移动登录回跳 smoke 及 README 口径已同步。
- 验证：仓库 Node `24.14.0` 下，Web lint、CSS、全量 Node 测试 1996 / 1996、移动任务与原型定向测试 35 / 35、两个脚本语法检查及 `git diff --check` 通过；最新文件身份下 `mobile-yoyo-role-task-projection`、`mobile-tasks-dark` 两个 Style L1 场景通过。另在真实 Chrome 390 × 844 视口核对：待办分布组件为 1 个，切到已办后为 0 个，页面 `scrollWidth = clientWidth = 390`，已办列表直接承接页头且无横向溢出。
- 下一步：本项无需 schema、migration、后端、Fact、RBAC、菜单或客户配置变更；尚未暂存、提交、推送、目标环境部署、岗位 smoke 或客户 UAT，需按共享 Local 的统一收口顺序另行处理。
- 阻塞 / 风险：独立 `smoke:mobile-auth-login-route` 在进入本改动页面前被共享 mock 账号的 `/entry?reason=mobile-role-unassigned` 岗位投影阻断，因此未把该脚本包装成已通过；`affected.sh --plan` 保守要求 T8，但共享 dirty worktree 未冻结且本轮无提交 / 推送授权，未执行仓库 full gate 或 prepare-push。移动列表 API 仍没有岗位全量 `total`，所以待办分布明确只代表当前已加载结果。

### 任务看板指标语义色条

- 完成：任务看板顶部四个筛选指标不再把左侧色条与选中态混成同一种蓝色；常规待办、阻塞、到期提醒、已结束分别使用蓝、红、橙、中性灰的稳定类别色条，未选中时仍可辨认。选中态继续由浅色背景、加深外边框和 `aria-pressed` 表达；“已结束”包含完成与退回 / 拒绝，因此不使用代表全部成功的绿色。
- 验证：仓库固定 Node `24.14.0` 下，Web lint、CSS 和全量 Node 测试 1979 / 1979 通过；`erp-task-board-desktop`、`erp-task-board-mobile`、`erp-task-board-dark-wide-desktop` 三个真实 Chromium 场景通过，浅色与暗色截图确认色条可辨、指标卡与相邻布局无挤压。指标语义样板和任务看板样板仍为 To Implement，本次仅修正运行态样式细节，未改变其结构、交互或阶段登记。
- 下一步：本项无需 schema、migration、API、RBAC、菜单、Workflow / Fact、客户配置或部署变更；后续随当前共享工作区统一 Git 收口。
- 阻塞 / 风险：共享 Local 仍包含 DEV 服务目录、数据准备、Workflow / 手机任务、导航与权限中心等其他未提交现场；本项只归属任务看板指标色条及其测试，不把本地绿色解释为目标环境 smoke 或客户 UAT。

### 业务场景一键造数运行态修复

- 完成：`scenario-demo` 一键造数改用长期工作台档位 `long-lived-workbench / WORKBENCH1`；固定生成九岗位各 20 条模拟任务，其中每个岗位 12 条为无截止时间的稳定“待我处理”，总计 `actionable=108 / risk=40 / history=32`。同批重复执行只做精确创建或读回，不要求 `make dev restart`，也不会把 180 条继续叠加。
- 完成：旧 `PLAIN5` 任务批次通过正式 Workflow 生命周期动作退出，不物理删除、不写 Fact；实际读回 180 条旧任务 `activeAfter=0`。旧批次整体不存在时允许幂等跳过，部分缺失或身份漂移继续 fail closed。
- 完成：已在登记本地开发库 `192.168.0.106:5432/plush_erp`、本机后端 `8300` 完成真实固定 V5 执行，读回 `Source=27 / ProcessRuntime=5 / Fact=1634`；readiness 为 `40 / 50` 数据前置通过、0 失败、10 项浏览器证据待验。九个 `demo_<role>` 账号直查均证明新批次 `20 / role`、稳定“待我处理” `12 / role`；叠加原有业务任务后的页面实际数为老板 12、销售 22、采购 21、生产 12、仓库 12、财务 13、PMC 12、质检 12、工程 21。
- 验证：造数、readiness、dataset runner 与 browser 合同定向 Node 测试 139 / 139 通过；成功运行绑定 plan digest `1460137a491a5e9bd641475d7cb49b8ab62ecd7c52869c7b4d3dbd776f5e054c`，岗位工作台 API 权威读回与 scoped `git diff --check` 通过。
- 下一步：用户可直接刷新业务工作台或重新登录查看，无需重启开发服务；本轮没有自动代替岗位执行按钮、打印、移动端等 10 项真实浏览器人工验收。
- 阻塞 / 风险：以上均为本地开发库的脱敏模拟数据和技术读回，不代表真实客户导入、目标环境发布或客户 UAT；共享 worktree 仍含其他并行改动，本项未 stage、commit 或 push。

### DEV-only 开发服务目录收口

- 完成：把原先散落在 `web/` 根目录的 17 个 DEV-only Vite / Node Bridge 实现与测试集中到 `web/dev-server/`，抽出共享 loopback / Host 安全校验，并同步 Vite 注册、客户预览脚本、QA profile、迁移 source identity、测试入口和目录文档。新增边界测试，禁止同类模块重新散落到 `web/` 根目录；浏览器端 `/__dev` 仍独立位于 `web/src/dev-workbench/`，正式业务代码未迁入该目录。
- 验证：目录相关 Node 合同 120 / 120、文档清单 3 / 3、定向 ESLint、Shell 语法和 `git diff --check` 通过；production Vite build 通过，123 个产物文件的 DEV-only 边界扫描通过且无 source map；真实 Chromium 确认 production 直访 `/__dev` 会重定向到 `/admin-login`。
- 下一步：本轮不涉及 schema、migration、API、RBAC、业务事实或客户部署；提交后仍不自动推送，后续发布继续按 exact SHA、完整门禁和目标环境证据另行处理。
- 阻塞 / 风险：共享工作区的全量 Web 测试曾执行到 1971 / 1972，唯一失败来自另一项未提交 `DashboardPage.jsx` 文案与静态可见字段合同不一致；本轮未修改或暂存该并行现场。上述本地绿色不代表目标环境 smoke 或客户 UAT。

### 岗位使用帮助导航展开状态

- 完成：岗位导航的“更多功能”展开判断改为读取路由导航真源 `currentNavigationEntry.menuPath`；进入或刷新 `/erp/help-center` 时继续显示并选中“岗位使用帮助”，返回看板或常用工作后仍自动收起。业务菜单权限继续使用 `resolveMenuPermissionKey`，未把登录态帮助入口并入 RBAC 菜单权限。
- 验证：岗位帮助、菜单权限和岗位导航定向 Node 测试 27 / 27 通过；触达文件定向 ESLint 与 `git diff --check` 通过；`STYLE_L1_SCENARIOS=yoyoosun-sales-role-guided-navigation-help pnpm style:l1` 通过，真实 Chromium 已断言点击后展开、刷新后恢复、帮助项选中、返回看板收起和无横向溢出，并目检四张定向截图。
- 下一步：本修复无需 schema、migration、API、RBAC、客户配置、原型或部署变更；后续发布仍按当前统一收口流程处理，不把本地浏览器绿色视为目标环境岗位 smoke 或客户 UAT。
- 阻塞 / 风险：共享 Local 同时存在另一项 Workflow / 手机任务 / 工作台改动；全量 Web lint、CSS 和 Node 测试分别被该范围内的数组解构、样式选择器顺序及页面静态合同失败阻断。本轮不修改、不暂存也不提交这些并行现场；当前 Node 26.5.0 仍会提示项目要求 Node 24.14.x。

### “更多功能”与管理员菜单统一分组

- 完成：`role_guided` 侧栏不再维护资料 / 生产 / 出货 / 工具四类合并分组，改为直接复用当前管理员可见菜单的 section 名称与顺序；基础资料、销售管理、产品工程、采购管理、质检管理、库存管理、委外管理、生产管理、出货管理、财务管理、运营工具、系统管理和使用帮助按实际权限过滤空组。客户菜单配置产生的改名、重排和扩展也沿用最终投影，岗位帮助固定为最后一个叶子。权限中心编辑器、草稿预览、保存路径和运行侧栏消费同一分组投影；常用工作继续全局排序，更多功能只调整同一菜单分组内顺序，权限或跨区移动变化后自动归组。
- 验证：仓库固定 Node `24.14.0` 下，岗位导航 / 帮助 / 权限定向测试 30 / 30、Web lint、CSS、全量 Node 测试 1983 / 1983、文档清单 / 链接 / 试用角色文档测试 4 / 4 与 `git diff --check` 通过。销售手机暗色、销售帮助展开、老板 / 财务桌面、自定义导航、权限中心桌面保存读回和手机暗色共 7 个真实 Chromium 场景通过；DOM 门禁与截图确认 Admin 同名分组顺序、叶子计数、帮助置底、不可交互标题、暗色可读和无横向溢出。
- 下一步：本项完成精确本地提交后停止，不自动推送、部署或执行客户 UAT；后续目标发布仍需绑定 exact SHA 重新做岗位 smoke。
- 阻塞 / 风险：分组只改变前端导航投影和岗位布局编辑，不改变 `secondary_menu_paths` 成员合同、RBAC、客户页面投影、API、schema、migration、Workflow 或 Fact。共享 Local 仍包含数据准备、ProcessRuntime、任务看板和其他页面任务现场；本项不会暂存、提交或宣称这些并行改动已验收。

### 近期产品与研发能力统一收口

- 当前共享 Local 已冻结为一个完整收口范围，共包含配置、正式文档、QA / 本地运行脚本、Go 服务端、Ent / Atlas、正式 Web 与 DEV-only 工作台改动。详细任务过程已归档到 `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`。
- 研发能力包括数据准备、测试覆盖率采集、共享开发库 migration 工作台、affected / full / prepare-push 去重与版本中心交互。DEV-only 能力继续受 loopback、same-origin、固定 action、目标身份、幂等 operation 和生产制品边界约束。
- `roles.secondary_menu_paths` 与退出数据库自定义执行对象的两个 Atlas migration 已纳入提交 `6e911995`。合入 CI/CD 修复前，`server/make data` 已读回 migration 目录与 Ent schema 零漂移，`db-guard` 已通过；尚未把这些 migration 写入 133。
- 开发期既有定向验证只证明对应切片，不替代最终 clean exact SHA 的 full、GitHub CI、目标 migration / readback、岗位 smoke 或客户 UAT。

### CI/CD 与防重复构建边界

- `origin/main` 的三个 CI/CD 前向修复已通过普通非改写 merge 进入本地候选；OCI config / manifest 双身份、仓库 / release 根路径与 promotion / rollback 回执修复均保留。历史失败操作和完整证据见 `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`。
- merge 候选 `60778b03` 的首次有效 `prepare-push` 在 fast Node 阶段停止，未进入 Web 构建、浏览器、Go、PostgreSQL 或 push：它准确发现一个已过期的质量角色筛选断言和一处审批保存失败可能透传原始异常。两处已按当前业务合同与用户提示边界修正，fast Node 复验为 504 / 504 通过、0 skip；修复提交将形成新的最终候选 SHA。
- 修复候选 `76e663c8` 的唯一一次 `prepare-push` 已完成 full Node 1561 / 1561，随后停在客户配置静态边界：新增且已有专门 Go 测试的工作台岗位监督读入口未计入旧的调用数断言。生产权限未改，静态合同已纳入该正式入口；客户配置后续静态门禁与工作台监督读定向 Go 测试均通过，下一提交将形成新的最终候选 SHA。
- 修复候选 `e0d0ca07` 已通过前述门禁、Web 构建、真实 Chromium、存量升级和关键 PostgreSQL 矩阵，随后因普通 Go 全量发现 1 个 skip 停止：岗位设置并发 PostgreSQL 测试未登记到关键数据库唯一清单。该测试族现已纳入隔离数据库矩阵与 required prefix，覆盖率采集改为直接读取同一清单；定向门禁 24 / 24 及完整 migration 后的真实并发测试均通过。
- 同一个候选 SHA 只执行一次 `prepare-push`；push 后只等待该 SHA 的一次自动 CI，不在本轮手工触发 Immutable Release。
- 只有 CI 绿色且另行明确进入发布流程后，才允许为 exact SHA 构建一套不可变制品。测试服务器和 133 只消费同一制品，不在目标机重新构建。
- fixture、mock、文案、开发工作台或证据展示问题若不影响生产正确性，记录为后续事项，不为当前候选重复扩门禁、改代码并重跑完整 lifecycle。

### 移动岗位任务窄屏标签可读性修正

- 完成：岗位任务端“当前已加载任务分布”移除不承载额外业务语义且会挤占四等分宽度的状态图标，待处理、卡住、已退回、完成保持单行完整显示；全部、风险、超时、我负责筛选把标签与数量独立排版，移除 `truncate`，并补充可读的数量 `aria-label`。
- 验证：仓库固定 Node `24.14.0` 下，Web lint、CSS、移动任务组件合同 15 / 15 与 `git diff --check` 通过；真实 Chromium 的 `mobile-tasks-dark` 390px 暗色场景和 `mobile-yoyo-role-task-projection` 430px 浅色场景通过。DOM 门禁确认分布标签无图标、单行且无溢出，四个筛选无换行、无 `ellipsis`、无隐藏裁切；截图确认“我负责(50)”和四项分布均完整可读。
- 下一步：本项停止在本地页面修正与 T5 定向回归，不自动暂存、提交、推送、部署或执行客户 UAT。
- 阻塞 / 风险：未改 API、RBAC、客户配置、Workflow / Fact、schema、migration 或任务数量口径；Current 原型参考原本就是无状态图标且标签完整显示，本轮小型样式修正无需改原型资产。共享 Local 仍有其他任务的 mixed hunks，本项不声明其完成或验收。

### 移动岗位任务文案与表头收敛

- 完成：待办页把“当前已加载任务分布”精简为“已加载任务分布”，删除常驻的分页加载实现说明；任务列表右表头由“业务状态 / 截止时间”精简为“状态 / 截止”并锁定单行。保留已加载统计口径、四项分布、筛选、分页、任务卡、详情、办理与回执语义。
- 验证：仓库固定 Node `24.14.0` 下，移动任务组件合同 15 / 15、两个脚本语法检查和本批路径 `git diff --check` 通过；390px / 430px 真实 Chromium 定向回归在释放共享 writer 后只读执行。
- 下一步：本项停止在本地 Current 页面与 T5 定向回归，不自动暂存、提交、推送、部署或执行客户 UAT。
- 阻塞 / 风险：未改 API、RBAC、客户配置、Workflow / Fact、schema、migration、任务数量或分页合同；Current v1 列表参考已同步。共享 Local 仍有其他任务的 mixed hunks，本项只归属上述 7 个路径的精确 hunks。

### 审批与任务业务轨迹收口

- 完成：桌面任务看板抽屉与九岗位移动任务详情统一展示 ProcessRuntime“业务轨迹”和“本任务处理记录”。业务轨迹显示来源单据、流程状态、已执行 / 当前 / 受阻节点与本任务锚点；当前任务记录对普通任务和审批任务都加载，按最新在前展示进度、异常 / 恢复、催办 / 升级 / 转交等责任流转、处理岗位、时间、版本和意见。审批任务使用审批语义，普通任务不误称审批；两条读链独立失败，均不写领域 Fact。
- 验证：当前共享工作树 `go test ./...` 与 Web `node --test` 2004 / 2004 通过；Web lint、CSS、production build、定向事件 / 抽屉 / 移动合同 30 / 30 通过。`erp-task-board-desktop`、`mobile-yoyo-role-task-projection`、`mobile-tasks-dark` 三个真实 Chromium 场景通过，桌面及 430px / 390px 截图目检确认责任摘要、事件内容、信息顺序和无横向溢出；`git diff --check` 与 affected T0 语法检查通过。
- 下一步：本批在释放共享 writer 后停止，不自动 stage、commit、push、部署或执行客户 UAT；若进入提交收口，仍须按精确路径 / hunk 归属处理 shared mixed worktree。
- 阻塞 / 风险：`list_task_events` 仍是最多 100 条的当前任务事件，不是来源单据跨节点、跨任务的完整审批人链；完整业务结果继续以 Source Document / Fact 为准。affected T8 full receipt 在数据库预检阶段因未提供 `DISPOSABLE_DATABASE_BASE_URL` 失败，未执行数据库矩阵；本轮没有 schema / migration 或数据库写入。当前 Web 命令使用 Node 26.5.0，项目声明版本为 24.14.x；本地绿色不代表目标环境发布、岗位 smoke 或客户 UAT。

### 移动岗位任务顶部计数标签收敛

- 完成：九岗位共用的待办、已办、提醒和我的分区删除顶部“已加载 N 条待处理 / 待我审批 / 已办 / 风险提醒”及重复岗位说明；数据时间和任务最近更新时间继续保留。待办筛选把括号数量改为独立数字胶囊，已办数量放到“已办任务”标题旁，提醒沿用预警 / 提醒子标签数字胶囊，“我的”不硬造计数。可访问名称继续明确这些数字是当前已加载数量，未把分页结果冒充岗位全量；Current v1 参考同步，并把历史动作的瞬时刷新反馈迁到独立 `status`，未随常驻摘要一起删除。
- 验证：仓库固定 Node `24.14.0` 下，移动任务组件与 Current 原型定向合同 36 / 36、Web lint、CSS、Style L1 脚本语法检查及本批路径 `git diff --check` 通过；390px / 430px 的浅色、暗色、三位数标签和主分区切换浏览器回归在释放共享 writer 后只读执行。
- 下一步：本项停止在本地 Current 页面与 T5 定向回归，不自动暂存、提交、推送、部署或执行客户 UAT。
- 阻塞 / 风险：未改 API、RBAC、客户配置、Workflow / Fact、schema、migration、服务端游标、任务数组或计数口径；只调整已存在计数的可见承载方式。共享 Local 仍有其他任务的 mixed hunks，本项只归属上述 8 个路径的精确 hunks。

### 移动任务回执与账号文案收敛

- 完成：“我的”页删除用户名下重复的“某岗位任务端”副标题，继续保留页头岗位标签、账号岗位、可用范围和入口安全。结果回执删除“结果边界”及流程锚点、未来分支、领域事实、审计记录等开发者说明；无正式流程锚点时不再渲染空流程卡，有锚点时仍从服务端读取并展示简洁的“当前流程”和真实执行轨迹。Current v1 / v2 参考同步，不删除办理结果、动作、状态、来源、用户反馈、处理说明或返回入口。
- 验证：仓库固定 Node `24.14.0` 下，移动任务组件与 Current 原型定向合同 36 / 36、Web lint、Style L1 脚本语法检查及本批代码 / 原型路径 `git diff --check` 通过；390px / 430px 的我的页、无锚点回执、暗色与无横向溢出浏览器回归在释放共享 writer 后只读执行。
- 下一步：本项停止在本地 Current 页面与 T5 定向回归，不自动暂存、提交、推送、部署或执行客户 UAT。
- 阻塞 / 风险：未改 API、RBAC、客户配置、Workflow / Fact、schema、migration、路由、分页或计数真源；正式文档原已限定“有 ProcessRuntime 锚点才展示流程位置”，本项只修正运行态空卡与用户文案。共享 Local 仍有其他任务的 mixed hunks，本项只归属上述 10 个路径的精确 hunks。

### 链、流与 P0/P1 能力真源收口

- 完成：新增“业务链与运行轨迹边界”唯一专题入口，集中区分流、业务链、ProcessRuntime 业务轨迹、本任务处理记录、审批处理链、状态历史、lineage、审计、Trace 和通知链，并同步流程地图、状态 / Fact、字段来源、动作责任权限、审计证据、文档路由、客户矩阵和手工验收口径。七条正式 ProcessRuntime 已按当前代码重核；Shipment 固定为财务 approval / 版本化放行门禁，真实 `SHIPPED + inventory OUT` 仍由独立领域事务写入。能力台账的库存人工调整审批矛盾已纠正，`8 个本地代码边界已闭环、4 个部分、1 个阻塞、1 个范围外` 的统计保持不变并明确排除审计 / 附件专项。
- 完成：控制面 `runtime_audit_events` 新事件从服务端请求上下文关联非敏感 `request_id`，丢弃调用方伪造或大小写变体并避免修改输入 payload；没有上下文时不伪造。桌面 / 移动任务轨迹标签、采购节点和 Shipment 文案按真实流程收口，销售提交反馈不再写死老板责任；新增链 / 流 / Shipment / 库存调整 / 动作矩阵 / 审计矩阵合同守卫，Style L1 旧“成品交付”断言同步为“出货财务放行”。
- 验证：`go test` 定向覆盖 runtime audit request_id、ProcessRuntime、任务轨迹 / 单任务事件、七流程异常合同、Shipment 财务放行、库存人工调整和库存预留基础合同；Node 定向覆盖 ProcessRuntime 展示、客户流程 API、桌面 Drawer、移动任务详情、销售订单、customer manifest、7 process key / 8 variants、页面 lineage、文档 inventory / 引用和新增 Workflow-Fact 守卫，均通过。`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-mobile pnpm style:l1` 2 / 2 通过并目检任务事件、审批箱和移动交互截图；触达文件 ESLint 与 `git diff --check` 通过。浏览器命令使用本机 Node `26.5.0`，保留项目声明 `24.14.x` 的 engine warning。
- 下一步：按共享 Local 队列释放本任务 writer；本轮按用户要求保持 `commit_policy=hold`，不 stage、commit、push、建分支、部署或代做 UAT。没有 schema / migration 变更，因此未执行 `make data`、Atlas migration 生成或 `db-guard`。
- 阻塞 / 风险：BOM SKU grain、采购需求真源 / 快照、在途与剩余量计算合同未确认，P1-A 保持 `blocked`；库存预留的产品 / SKU / 仓库可读专项投影、原 / 已消费 / 剩余数量和数据范围合同未冻结，P1-B 保持 `partial / blocked`，不改变原子预留消费。退款 / 换货 / 补发、真实客户数据写入、对象存储、通用审批链 / 状态历史链 / 通知链均未擅自实现。目标 migration / 结构读回、客户 revision 发布激活 / effective-session、真实岗位与移动 smoke、客户 UAT / 签收全部未执行；共享附件任务的代码和本文件顶部 hunk不属于本项。
- 补充完成：为“实际动作”交集公式增加集合符号、单角色 / 多角色计算、最小示例和“有效动作权限不等于当前可执行动作”的说明；业务链文档只引用主定义，未复制第二套口径。
- 补充验证与边界：文档 inventory、链接与 Workflow-Fact 合同守卫 `9 / 9` 通过，清单读回 325 份 Markdown；本补充不改 RBAC、API、客户配置、Workflow / Fact、schema 或 migration，下一步等待用户决定是否提交及推送，当前继续保持 hold。
- 补充完成：在“业务主链路数据流向与字段来源规则”的主路径后增加面向业务与实施读者的通俗分层说明，集中解释 MasterData、Source Document、Workflow / ProcessRuntime、Domain Usecase、Fact / Ledger 和派生读模型，并以 Shipment 明确“审批通过只打开门禁、领域命令才写事实”；未改 runtime、schema、API、RBAC、客户配置或目标环境状态。

### 开发测试入口信息层级收敛

- 完成：`/__dev/testing` 从“测试分层、命令入口、相关文档、覆盖状态”四个伪同级入口收敛为“验证层级 / T0–T8、执行命令 / Commands、覆盖证据 / Coverage”三个真实工作视图；移除重复 Markdown 阅读器和混合分类侧栏，完整文档继续由 `/__dev/docs` 负责。9 份白名单来源统一按“策略与口径、工程说明、执行脚本、部署与发布”一条职责轴筛选，关键词只过滤命令块；当前读回 147 个完整命令块，页头不再把命令行数误作命令块数。
- 完成：每个命令块增加真实来源文档入口，Dev Docs 补齐 `web/scripts` 与两份部署说明的开发态 glob；`view`、`role`、`q` query 支持刷新、前进后退和来源返回恢复，旧 `view=docs&doc=...` 深链规范化回验证层级。三个视图统一全宽，390px 下命令工具区单列、主视图标签完整换行，长命令只在自身代码块横向滚动；退役 sidebar、doc row/detail 样式与关键词命中文档模型已删除。
- 验证：仓库固定 Node `24.14.0` 下，Web lint、CSS 与完整 Node 测试 `2015 / 2015` 通过；Dev Testing / Dev Docs 定向合同 `27 / 27`、开发入口边界 `6 / 6`、脚本语法与 `git diff --check` 通过。真实 Chromium 的开发控件语义、三视图桌面明暗态、390px Commands、Coverage loading / missing / current-stale 共 8 个 Style L1 场景通过；DOM 同时验证全宽、无页面横溢出、按钮 containment、来源路径一致、筛选与旧深链恢复，桌面 / 移动截图已目检。
- 下一步：本项按共享 writer 协议释放，保持 `commit_policy=hold`，不 stage、commit、push、部署或执行客户 UAT；如需提交和推送，必须由用户另行明确授权。
- 阻塞 / 风险：本轮仅调整 DEV-only 前端信息架构、文档入口与测试合同，不改 API、RBAC、客户配置、Workflow / Fact、schema 或 migration，也未重新采集 coverage baseline。共享 worktree 的 affected plan 因其他任务 44 个 dirty 路径扩到 T7；本项没有执行或宣称其他任务的服务端、PostgreSQL、发布、目标环境 smoke 或客户验收。

### 研发效能工作台交互层级收敛

- 完成：全面复核 4 个一级区域与 10 个子入口，把一级区域上下文和唯一当前子页拆成不同状态；区域页不再重复展示二级入口，移动端一级 / 二级导航分成两条独立横向轨道，导航改为真实链接。工作视图统一使用可键盘切换的 tab 语义，`质量` / `交付` 收口为 `质量验证` / `交付运行`；流程观察台只在当前视图展示相关筛选和叠加层。
- 完成：客户配置删除试跑、测试应用和发布门禁的重复主按钮，应用测试配置明确为危险动作，正式执行器模板只在门禁通过后成为主动作；数据库迁移历史表只保留查看，唯一升级动作留在 ready 区；版本中心区分部署与回滚危险级别，并对并发 mutation、未终态 operation 和弹窗执行中关闭做失败关闭。文档空搜索不再保留越界选中项或阅读工具，文档页也不再提供指向自身的来源按钮；数据准备修正嵌套 label，工作台置顶改为次级按钮，原型搜索补齐可访问名称。
- 验证：DEV 工作台配置与开发入口 Node 合同 `146 / 146`、定向 ESLint、导航 CSS、Prettier、脚本语法、production build 和 `git diff --check` 通过；11 个受影响 Style L1 场景通过，覆盖文档、客户配置、流程状态、工作台总览 / 区域、14 个移动端页面和控件语义。真实 Chrome 在 1440px 与 390px 复核 14 个路由、父子当前态、tab 键盘切换、文档空搜索、流程筛选显隐、客户配置唯一动作和页面横向溢出，控制台 0 error，并目检移动导航与客户配置截图。
- 补充修正：根据区域首页运行态反馈撤销“区域页隐藏二级入口”策略；产品工程、质量验证和交付运行首页持续显示各自二级入口，但不伪造二级当前项。进入具体子页后仍保持一级区域上下文与唯一二级当前页，只有总览没有二级入口。
- 补充验证：Dev Hub 定向合同 `11 / 11`、工作台 ESLint、目标文件 Prettier 和 Style L1 脚本语法通过；`dev-all-pages-mobile` 与 `dev-workbench-areas-dark-desktop` 两项 Chromium 场景 `2 / 2` 通过。真实浏览器在 1440px、390px 复核交付运行首页与客户配置子页：首页三个二级入口常驻且总当前项为 1，子页为一级上下文 + 唯一二级当前项，页面无横向溢出，console 0 error / 0 warning，并完成三张截图目检。
- 下一步：本批按共享 writer 协议释放，保持 `commit_policy=hold`，不 stage、commit、push、部署或执行客户 UAT；如需提交与推送，仍须由用户另行明确授权。
- 阻塞 / 风险：本轮只改 DEV-only 信息架构、交互保护与测试合同，不改正式 ERP 菜单、API、RBAC、客户配置真源、Workflow / Fact、schema 或 migration。验证使用本机 Node `26.5.0`，项目声明 `24.14.x`，因此保留 engine warning；本地 build 与浏览器绿色不代表目标环境 smoke、发布或客户验收。

## 下一步与停止条件

1. 完成 merge 提交后复跑 `make data`、`db-guard`、受影响测试与浏览器门禁；任何生成物变化先形成新 clean SHA。
2. 对最终 clean exact SHA 只运行一次 `bash scripts/qa/prepare-push.sh`，随后立即非强制推送。
3. 只观察本次 push 自动产生的 GitHub CI；失败时固定 exact SHA 和唯一失败阶段，不自动重建、不触发 Release。
4. 本轮不部署 133、不 apply 目标 migration、不执行客户 UAT。后续发布必须重新确认 commit / image、backup、migration、health / ready、客户配置、岗位 smoke 和 rollback point。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署必须各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- 133 上较早固定 V5 的技术试用证据不能证明当前 Product Core HEAD。客户配置 V7、V5 → V7 激活边界、目标 migration 和岗位 smoke 都必须以本次 promotion 后的目标读回为准。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- Git、CI、Release、promotion 和部署只允许一个收口 owner 串行推进。

## 归档索引

- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：本次近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录；归档前为 323 行 / 80,399 bytes，SHA-256 `2d8d7f536e7b2844de9e8d2e35fa5b44a3fc2c508086fa54cad859f50e2b43c3`。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：本次 OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：异常流 V1 四项收口最终 Handoff 前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。

### 全局业务记录动作可发现性收敛

- 完成：全量盘点 14 类正式带记录选择的业务页面，并按九个客户岗位能力复核动作入口。统一合同为：当前角色有权限、但尚未选择记录时，可能执行的动作继续可见并置灰，同时提供“请先选择记录”等可读原因；选择记录后只展示当前记录结构上适用的动作；无权限、已完成或终态动作继续隐藏。销售订单、采购订单和委外订单的提交、关闭、取消等生命周期动作已补齐空选择态，窄屏“更多操作”作为发现入口可以打开，抽屉内真实动作仍保持置灰。
- 验证：业务动作与消费页定向合同 `35 / 35`、完整 Web Node 测试 `2022 / 2022`、文档门禁 `15 / 15`、production build、触达 JSX / MJS ESLint、脚本语法与本批路径 `git diff --check` 通过；四个定向 Style L1 场景 `4 / 4` 通过，覆盖无对应权限、代表性销售 / 采购页面、390px 暗色窄屏抽屉和生产订单刷新入口。销售桌面五状态场景中，本批相关的空选择、状态切换、布局与动作断言均已执行通过，最终停在任务外的旧成功提示文案断言，不把该场景整体记为绿色；桌面与移动截图已目检动作发现性和无横向溢出。
- 下一步：本批按共享 writer 协议释放并保持 `commit_policy=hold`，不 stage、commit、push、建分支、部署或执行客户 UAT；是否提交与推送由用户另行明确决定。
- 阻塞 / 风险：本轮未改 API、RBAC、客户配置、Workflow / Fact、schema 或 migration。共享 worktree 的 affected plan 因 82 个其他任务脏路径扩大到 T7 和本地数据库步骤，本批未越权执行；验证使用本机 Node `26.5.0`，项目声明 `24.14.x`，保留 engine warning。本地静态、Node、build 和 Chromium 绿色不代表目标环境发布、真实岗位 smoke 或客户验收。

### V1 主链验收计划口径修正

- 完成：活动入口改为 V1 主链验收计划与证据边界；文档、脚本、测试、报告、DEV 预设和清单引用同步改名，删除旧文件与别名，并分开计划生成、本地完整技术验收、目标发布和客户 UAT。
- 验证：定向合同 `29 / 29`、文档 inventory `5 / 5`、脚本语法、计划 CLI、目标文件 Prettier、退役引用扫描及 scoped `git diff --check` 通过。
- 下一步：保持 `hold`，等待用户决定是否提交 / 推送；本轮不执行 full、部署或 UAT。
- 阻塞 / 风险：`affected --plan` 因共享 112 个脏路径扩到 T8，本批未越权运行；未改 runtime、schema、API、RBAC、Workflow 或 Fact。

### 成品返工补制闭环

- 完成：完工绑定确切包装 WIP 批次；REWORK 过账原子创建来源根批次、事件和异常任务；CLOSED 仅允许该来源链办理和补完工。
- 验证：Go 核心包、Node 121 项、文档 17 项、db-guard、build 与 4 个生产 Style L1 场景通过。
- 下一步：隔离 PostgreSQL 验证后再 apply、发布和岗位 UAT。
- 阻塞 / 风险：本轮未配置 opt-in PostgreSQL 测试库；migration 未 apply，未部署、未 UAT。
