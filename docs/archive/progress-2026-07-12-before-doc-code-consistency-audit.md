# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-12 生产订单可读引用选项与销售来源 eligibility

完成：新增 canonical `list_production_order_reference_options`，以 `pmc.plan.read` 和 production readable module gate 提供产品、SKU、单位、销售订单行、Active BOM 五类服务端分页投影。搜索与 `selected_ids` 历史回显严格互斥；历史模式不依赖级联字段，失效或缺失引用只返回不可选择的业务说明。销售订单行支持先搜索来源，再一次带回产品、SKU、单位；无前端全量 join、N+1 或 fallback。

完成：create/save/release 在同一事务锁定销售父单和来源行，并复核父单 active、行 open、产品/SKU/单位一致；精确 receipt 重放仍先于当前 eligibility。失败保持零订单部分写入、零状态推进和零 receipt。

验证：biz/data/service 定向测试、Go 全仓、build、`-race`、canonical API 与 critical PostgreSQL gate 静态守卫通过。新增真实 PostgreSQL 锁序测试已纳入 critical gate，但当前受控执行环境禁止连接本机 `127.0.0.1:55432`，因此本轮没有把该测试、full 或 strict 冒充为通过。

下一步：在允许访问隔离 PostgreSQL 的环境完成 critical/full/strict 后，再进入 production order UI / 通用菜单独立切片。

阻塞/风险：尚无 UI、菜单、seed、客户配置、部署或客户签收；共享工作区改动未暂存、未提交、未推送。

## 2026-07-12 生产订单 API/RBAC runtime

完成：注册 production order repo/usecase provider、Wire 和独立 `production_order` JSON-RPC 域，只开放 `create/save/release/close/cancel/get/list` 七个 canonical snake_case 方法。create/save 接聚合 items，生命周期命令强制稳定 idempotency key，非 CREATE 强制 expected_version；业务 intent hash 继续只由服务端 usecase 计算。get 在 repeatable-read 只读事务内读取 header 与按 line_no 排序的 items，list 只返回受控 header 分页并支持状态、日期、关键词和白名单排序。

完成：API 顶层与行项目均使用 allowlist，拒绝 camelCase、`id` / `actor_id` / `customer_key` / receipt 字段和未知字段；整数强制 JSON 安全整数，数量只接十进制定点字符串，时间只接 Unix 秒。actor 仅取认证管理员，客户 scope 仅取 `ERP_CUSTOMER_KEY` 部署上下文。权限复用 `pmc.plan.read/create/update` 和 production 模块 gate：read_only 只读、disabled 拒绝；固定客户 super_admin 缺 active revision fail closed，不新增重复权限体系。

完成：统一错误码真源新增 `ResourceVersionConflict(40922)`，生成前端码表并在手写消费层登记“记录已被其他操作更新，请刷新后重试”。同 key 改 intent 继续使用 40920，不用版本冲突冒充幂等冲突。生产订单请求日志只保留 domain ID、版本、分页 / 排序和 item_count，idempotency key 脱敏，不记录订单号、关键词、备注或行内容。

验证：production order service/data/biz 定向测试、全量 `go test ./...`、错误码生成 / 消费测试和 provider/Wire runtime 合同测试通过；覆盖未登录、非管理员、disabled、无权限、PMC / 生产角色、local super_admin、固定客户 super_admin fail closed、enabled/read_only/disabled 模块、strict params、CREATE 精确重放与 changed intent、stale CAS 40922、save/release/close、get/list 聚合和日志脱敏。fresh PostgreSQL 16 从空库应用 57 项 migration / 400 条 SQL，critical transaction、production order `-race`、Wire / 错误码零漂移、docs inventory、`full.sh` 与 `strict.sh` 均通过。

下一步：独立评审 production order UI / 菜单；本轮不接页面、菜单、seed、Workflow 派生、`MATERIAL_ISSUE / REWORK`、部署或目标环境。

阻塞/风险：当前只达到本地 L6 API Ready，不代表可试用、已部署或客户签收。共享工作区仍含数百项其他会话改动，本轮不暂存、不提交、不推送。

## 2026-07-12 生产订单 Close 完成量与事实纠错边界

完成：生产订单 Close 已从无条件 `RELEASED -> CLOSED` 收口为同一订单行锁和事实事务内的逐行完成量校验。每行有效 POSTED `FINISHED_GOODS_RECEIPT` 恰好达到计划量时允许无原因正常关闭；任一行未完成时必须填写短关闭原因；来源行、产品、SKU、单位异常或有效量越界均 fail closed。Close 继续使用 expected_version CAS，精确 receipt 重放先于当前状态和 CAS，同 key 改 reason 冲突，失败零 receipt、零部分状态。

完成：明确 Source Document 关闭不封死 Fact / Ledger 纠错。新事实创建和过账仍只允许 RELEASED 订单；既有已过账事实在订单 CLOSED 后仍可按原锁序取消，写 production fact CANCELLED 和库存 REVERSAL。Close 与事实过账 / 冲正统一按 `production_orders -> production_facts` 加锁：冲正先行时无原因 Close 因未完成失败；Close 先行时后续冲正仍成功，订单保持 CLOSED、close_reason 不自动补造、既有 Close receipt 不改写。

验证：SQLite biz/data 定向测试通过；真实 PostgreSQL race 定向通过，覆盖全部完成无原因关闭、未完成短关闭、冲正后未完成、多行逐行核对、异常来源 / 越量、精确重放、失败零 receipt、Close 与过账 / 冲正八轮竞争、CLOSED 后事实 CANCELLED 和库存 REVERSAL。critical PostgreSQL gate 已锁住四组 Close 测试名；正式文档同步当前真源、边界评审、路线图、能力台账和证据详情。

下一步：按已完成的 API/RBAC 合同评审进入 production order runtime 独立切片；本轮没有注册 provider、JSON-RPC、权限、页面或 seed。

阻塞/风险：当前只证明本地领域层和 PostgreSQL 行为，不代表 API 已接、目标环境已部署或客户可用。共享工作区仍含数百项其他会话改动，本轮未暂存、未提交、未推送。

## 2026-07-12 生产订单 Source Document repo / usecase

完成：新增 `ProductionOrderUsecase` 与 `ProductionOrderRepo`，只承接生产订单 Source Document 命令，不接 Workflow 或生产 Fact。DRAFT 新建和整单编辑在一个短事务内保存 header、全量 items 和成功 receipt；发布、关闭、DRAFT 取消按状态与 expected_version CAS 推进。公开 usecase 输入只接业务草稿、actor、expected version 和 idempotency key，不接受状态、intent hash、receipt 或快照字段；产品、SKU、单位、销售来源行和 Active BOM 的可读快照由 repo 从当前主数据真源生成。

完成：CREATE receipt 使用 actor + CREATE + key，不依赖新订单 ID；SAVE / RELEASE / CLOSE / CANCEL 使用订单 + actor + command + key。业务 intent hash 排除 expected_version 与传输字段，精确重放在 CAS / 终态判断前返回首次 V1 aggregate；同 key 改订单、行、数量或原因返回 `ErrIdempotencyConflict`。receipt reader 对 contract、命令对应状态、订单 ID / version、非空行、正数量和重复行 fail closed。发布在同一事务重新校验 active 产品 / SKU / 单位、销售行产品-SKU-单位和 Active BOM 产品归属并刷新快照；任一引用失效、CAS 失败、唯一冲突或 receipt 写入失败都会回滚 header、items、版本和事件。

完成：生命周期当前安全开放 `DRAFT -> RELEASED -> CLOSED` 与 `DRAFT -> CANCELLED`。设计中的 `RELEASED -> CANCELLED` 必须等下一轮 production fact linkage 能原子确认没有任何已过账生产事实后再开放；本轮没有为了补齐状态图而偷接 Fact 查询或放宽取消。

验证：SQLite repo/usecase 定向测试通过，覆盖聚合保存、快照真源、CREATE/SAVE/RELEASE 精确重放、忽略重放请求 expected_version、同 key 改 intent、发布后编辑拒绝、关闭/取消非法状态、跨产品 SKU / 销售行 / BOM 拒绝、发布时失效引用复核和失败事务回滚。fresh PostgreSQL 16 从空库应用 57 项 migration、pending 0；真实并发测试证明相同 CREATE key / intent 只保留一个订单聚合和 receipt、同 key 改 intent 只有一个赢家且 loser 整体回滚、相同 RELEASE key 返回同一 version、不同 key 同 expected_version 只有一个 CAS 赢家；重复编号保存失败保持原 header/items/version 且零 SAVE receipt。critical PostgreSQL gate 已纳入 `TestProductionOrderPostgres*`；`go test -race` 定向并发、完整 biz/data、`go vet`、server build、docs inventory、`full.sh` 与 `strict.sh` 均通过。

下一步：独立进入 production order fact linkage，原子校验 RELEASED 订单来源、行产品/SKU/单位、累计有效成品入库量与取消/事实创建并发赢家；之后再分别评审 API/RBAC 与 UI。当前不注册正式 server provider，不接 JSON-RPC、RBAC、UI、seed、部署或目标环境。

阻塞/风险：本地 repo/usecase 不是客户可用 runtime，也不证明目标环境 migration、API 权限或客户签收。RELEASED 取消仍明确关闭；共享工作区含大量其他会话改动，任何提交必须重新核对并精确暂存。

## 2026-07-12 生产订单 Source Document schema / migration

完成：按已评审边界新增 `production_orders`、`production_order_items`、`production_order_events` 三个 Ent schema，并生成 Atlas migration `20260712071319_migrate.sql`。订单保存 `DRAFT / RELEASED / CLOSED / CANCELLED` 生命周期、版本、计划时间和成对操作者 / 时间；行保存产品、可选 SKU、单位、数量、可选销售行 / BOM 引用和发布快照；事件只保存 `CREATE / SAVE / RELEASE / CLOSE / CANCEL` 成功 receipt。CREATE partial unique 使用 actor + CREATE + key，不依赖新订单 ID；其他命令使用订单 + actor + command + key。事件 mutation_result、V1 contract、intent hash、状态和版本均为必填，事件通过 Ent hook 保持 append-only，订单通过生命周期删除 hook 和引用 FK 防止直接删除。

完成：约束保持 PostgreSQL / SQLite 可移植。修正 Ent SQLite 对以局部括号开头的 OR CHECK 解析问题，用完整外层括号表达 actor/time pair 和 reason scope；取消原因、生命周期 bundle、计划日期、正数量、单内行号、订单版本、receipt 状态 shape 和两类 partial unique 均落入生成 migration。schema 只保证 SKU、销售行和 BOM FK 存在；它不能用普通跨表 CHECK 证明这些引用属于当前产品，该一致性明确留给下一轮 repo/usecase 在事务内复核。

验证：`make data` 报 migration directory synced，并重新生成 Ent；SQLite 定向 schema / hook / portable CHECK 2 项通过；全新本地 PostgreSQL 16 从空库应用 57 项 migration，状态为 current `20260712071319`、pending 0。`TestProductionOrderSchemaPostgres` 通过，真实拒绝取消缺原因、发布缺操作者、反向计划日期、重复订单号 / 行号、非正数量、未知产品 FK、跨订单重复 CREATE key、同订单重复非 CREATE key、取消 receipt 缺原因、缺 mutation_result 和删除被引用订单；critical PostgreSQL transaction gate 同步包含该测试并通过。

下一步：独立进入 production order repo / usecase 切片，完成聚合事务、DRAFT 编辑、expected_version CAS、CREATE 与非 CREATE 精确重放、同 key 改 intent 冲突和 PostgreSQL 并发赢家；本轮不接 API / RBAC / UI、生产事实联动或 seed。

阻塞/风险：当前只达到本地 schema / migration，不能写成生产订单可用、已部署、已签收或已关联生产事实。目标 133、客户环境和共享数据库均未操作；共享工作区仍有大量其他会话改动，任何提交必须重新核对并精确暂存。

## 2026-07-12 全局下拉长文本展示合同

完成：将 Ant Design Select 长文本规则收口到 ERP 共享控件层。单选收起态继续保持单行稳定高度和省略号，依赖 AntD 选中项 `title` 提供完整值；展开后的所有 Select 浮层选项改为自然换行，长连续字符可断行，不再用单行省略隐藏业务名称。每个 option 统一使用 8px 上下 / 10px 左右内边距、8px 圆角和浅色 / 暗色轻量 inset 分隔，配合 active / selected 背景让多行选项仍能一眼识别为独立 item。规则同时覆盖根应用与挂载在 `body` 的 Modal / portal 下拉浮层，不逐页增加特殊 class、Tooltip 或 `!important`。

完成：能力台账真实长选项“架构 / Architecture · 工作流 / Workflow”加入独立浏览器回归，锁住展开态 `white-space: normal`、`overflow-wrap: anywhere`、无横向溢出、选项盒覆盖、统一 padding / radius 和非末项 inset 分隔；选择后锁住单行省略、完整 `title`，并用键盘 Home + Enter 验证恢复默认值。既有暗色能力台账场景后续仍被“交付状态”标签对比度 2.82 的并发现场问题拦截，本轮没有借下拉任务扩大修改该问题。

验证：T0/T5 下，CSS stylelint、场景 ESLint、全量前端 ESLint、自动发现测试 842/842、`dev-capability-select-long-text-desktop` 浏览器级 L1 和 `git diff --check` 通过；浮层定向截图 `dev-capability-select-long-text-options.png` 清晰覆盖单行项、多行项、相邻项分隔和 selected 状态，保存在 ignored `web/output/playwright/style-l1/`。运行全量 lint / test 时当前交互 shell 为 Node `26.5.0`，仓库要求 `24.14.x`，命令虽通过但保留 engine warning；定向 L1 使用 Node `24.14.0` 完成真实 Chromium DOM / box metrics 验证。

下一步：无下拉代码补丁待办。后续若要处理能力台账既有暗色标签对比度，应作为独立视觉回归任务修正并重跑完整暗色场景，不与本共享控件合同混合。

阻塞/风险：本轮不修改 Select 业务值、搜索过滤、表单保存、API、RBAC、schema、Workflow / Fact、客户配置或原型状态。共享工作区及 `scenarios.mjs` 仍含大量其他会话改动，后续提交必须精确审查和暂存本轮路径。

## 2026-07-12 生产订单 Source Document 边界评审

完成：按长期 goal 在 Workflow CAS、附件、47 项验收和 Customer Config 单 active revision 收口后，重新核对路线图、能力台账、当前 schema 和生产事实主路径。确认现有 `production_facts` 是会写库存并通过 REVERSAL 取消的不可变事实，Workflow 只承接排程 / 异常协同，两者都不能兼任可编辑生产计划单。新增 `docs/architecture/生产订单源单边界评审.md`，将生产订单明确为 Product Core Source Document，首版聚合候选为 `production_orders + production_order_items`，并以 `production_order_events` 保存生命周期审计和命令 receipt。

完成：评审收口 `DRAFT / RELEASED / CLOSED / CANCELLED` 生命周期、行级销售来源 / BOM 版本 / 产品 SKU / 单位和发布快照、`expected_version` CAS、命令幂等、取消与生产事实并发赢家，以及 `PRODUCTION_ORDER + order/item id` 的事实追溯合同。实际领料、成品入库、返工和冲正继续只由现有 `OperationalFactUsecase` / `production_facts` 拥有；不保存重复的 IN_PROGRESS / COMPLETED 状态，不扩完整 MES、工艺路线、WIP、工时、成本、自动 MRP 或客户专属 schema。

完成：终审修正 CREATE receipt 不能依赖新订单 ID 的 P1。CREATE 唯一域明确为 actor + CREATE + idempotency key，成功后在同一事务关联结果订单 ID；其他命令才使用订单 + actor + command + key。事件表只保存全字段完整的成功 receipt，订单 FK 必填；CREATE 的 `from_status` 单独允许空，其余状态 / 版本 / envelope fail closed。下一阶段必须用真实 PostgreSQL 证明并发 duplicate CREATE 只留一个聚合、未知结果重放返回同一订单、同 key 改 intent 零新增；禁止用 `order_no` 冒充幂等。

验证：本轮是 docs-only review，只更新架构评审、架构 README、文档清单、当前真源索引、路线图、能力台账 / 证据和 progress；未修改 runtime、schema、migration、repo、API、RBAC、UI、seed、共享数据库或部署。`node --test scripts/qa/docs-inventory.test.mjs` 3/3 通过，覆盖 297 个 Markdown 登记与 active local link；旧 `production order review / 未接生产订单专表` 口径扫描无残留，Mermaid fence 和 `git diff --check` 通过。

下一步：按模块实施治理把下一轮严格拆为 production order schema / migration slice，只落订单、行、生命周期事件 / receipt、索引、检查约束、不可变保护和 fresh PostgreSQL migration 证据；不在该轮接 repo / API / UI。

阻塞/风险：本评审不是 runtime 能力，不能把路线图或文档写成生产订单已可用。目标 133、客户签收和真实客户数据均未触达；共享工作区仍包含大量其他任务改动，任何后续提交都必须重新核对范围并精确暂存。

## 2026-07-12 `/__dev` 中文主体与英文锚点治理

完成：根据能力台账截图复核出“所属层 / 业务域”两个下拉只显示相同的“全部”、没有可见字段名，展开后又直接暴露纯英文分类。能力台账现为所属层、业务域、成熟度、交付状态、差异分类和产品内核判断显示可见中文字段名，并保留英文锚点；英文原值继续作为 Markdown 真源和筛选值，不修改过滤语义或深链。

完成：新增共享 `devVisibleLabels.mjs`，把当前能力所属层、业务域和客户差异分类统一投影为中文主体 / English anchor，并同步消费到下拉选项、列表、详情和分布图。原型页 HTML / PNG 改为“网页原型 / HTML”“图片方案 / PNG”；共享开发导航和各页 `DEV ONLY` 改为“开发工作台 / Dev Workspace”“仅开发环境 / DEV ONLY”。守卫已覆盖当前 37 项能力和 27 项客户差异的全部分类，曾自动抓出并补齐 `Outsourcing Source Document` 漏译。

完成：完成 7 个 `/__dev` 页面的纯英文静态标签复扫，客户配置页剩余的 `Revision / Release Batch / Evidence` 已改为“配置版本 / 发布批次 / 证据目录”并保留英文锚点；七页及共享导航新增无说明纯英文 `Text / Tag` 守卫。路径、命令、代码标识和 Markdown 正文仍按技术真源原样展示。

完成：`web/README.md` 已记录 `/__dev` 可见英文治理规则；没有新增、重命名或重分类正式 Markdown，故不改 `docs/文档清单.md`。路径、命令、配置 key、API/RPC 名和代码标识仍保留原文，避免为了中文化破坏开发定位与复制执行。

验证：T0/T1/T5 下，`/__dev` 定向合同 96/96、前端全量测试 841/841、全仓前端 ESLint、CSS、production build（3236 modules）和 `git diff --check` 通过。Playwright CLI 在真实 `127.0.0.1:5175` 验证默认态、`analysis=1` 恢复态和所属层展开态，9 个所属层选项全部包含中文说明，页面截图与可访问树确认字段名、列表、详情和分布图口径一致。另完成 7 页 × 浅/深主题 × 桌面/390px 移动端共 28/28 真实浏览器矩阵，逐页确认 H1、共享导航、当前页高亮、主题、页面宽度、横向溢出和控制台 / 运行时错误，截图与 JSON 报告保存在 ignored `output/playwright/dev-global-audit/`。

下一步：本轮 `/__dev` 全局质量 goal 已完成审计并收口。后续页面新增从 Markdown / config 派生的英文枚举时，必须先进入共享展示映射或提供同屏中文说明，不能直接把 raw value 塞进控件。

阻塞/风险：既有 `style:l1` 自启服务清理会结束父 shell，外部非 5175 Vite 服务又因项目固定 HMR 端口产生 WebSocket 控制台噪声，因此本轮以定向单测和真实 5175 Playwright CLI 作为明确浏览器证据；不把无最终汇总的 L1 runner 退出冒充通过。未触达 schema、migration、RBAC、Workflow / Fact、后端或正式 ERP 菜单。

## 2026-07-12 权限页面甲方视角与重复信息治理

完成：权限管理页按甲方日常操作主路径收敛为“先设置岗位角色，再给账号分配角色”。角色详情正常状态不再随每个角色重复展示“角色名称可调整、职责权限保持统一”的大块提示，只在停用角色或存在未保存调整时保留必要警告；权限技术 key 不再进入复选项 DOM，搜索、统计、空态、加载态、英文眉题和高风险说明统一改为业务人员可理解的功能、岗位和账号语言。

完成：同步清理权限 key 的专用样式和暗色覆盖；可见字段守卫新增权限中心长期合同，禁止恢复技术 key、权限码搜索提示和重复稳定态说明。浏览器回归合同从“权限名称下方必须显示权限码”改为“功能名称完整且不溢出，同时技术权限码不可见”。未修改后端 RBAC、权限码真源、角色写入、菜单、schema、migration、Workflow / Fact 或客户专属配置；前端隐藏技术 key 不作为安全边界。

验证：T0/T5 下，`affected.sh --plan` 选择前端页面验证；可见技术字段测试 53/53、前端全量测试 840/840、CSS、相关文件格式与 diff check 通过。使用 Node `24.14.0` / pnpm `10.13.1` 运行 `permission-center-loading-state`、`permission-center-desktop` 浏览器回归 2/2 通过，覆盖加载态、默认角色态、未保存交互、切换角色确认、管理员 tab、搜索、创建/重置弹窗、暗色主题、DOM 技术 key 缺席和横向溢出。全仓前端 lint 被并发现场 `web/src/erp/config/devVisibleLabels.test.mjs` 文件末尾多余空行阻断，本轮未越界修改；本轮相关 JSX/场景已由 style:l1 实际加载执行。

下一步：无需新增权限码或后端能力。后续权限页新增功能时继续只展示业务名称，将内部 key 保留在表单值和 API 合同中；稳定规则说明保持页面级一次表达，不回到每个 tab 或每个角色重复展示。

阻塞/风险：无本轮功能阻塞。未执行服务端、数据库、真实写入、发布或目标环境验证，因为本轮只改变正式前端的信息层级、文案、样式和浏览器合同；共享工作区仍有大量其他任务改动，提交时必须精确审查范围。

## 2026-07-12 客户配置单 active revision 并发不变量

完成：同一 `customer_key` 的 activate / rollback 事务会按 ID 顺序锁定该客户全部既有 revision，再把旧 active 设为 superseded 并激活目标 revision；不同客户不共享锁。Ent schema 新增 `status='active'` 的 `customer_key` partial unique index，Atlas 生成 `20260712055412` migration，数据库最终保证同一客户最多一条 active。存量库若已存在双 active，migration 会 fail closed，不静默选择赢家或改写历史配置。

完成：新增真实 PostgreSQL shape / concurrency 测试。第二条 active 直接写入必须返回 `23505`；两个已发布 revision 并发激活时两次正式 repo 调用都成功、写两条脱敏审计，最终仍恰好一个 active。critical PostgreSQL gate 已纳入 `TestCustomerConfigPostgres*`，不让普通 Go 测试 skip 冒充并发验证。

验证：T0 / T2 / T3 下，`go test ./internal/data ./internal/biz ./internal/service -count=1` 通过；`make data` 再跑为零漂移；fresh PostgreSQL 16 从空库应用 56 条 migration；Customer Config PG 测试通过，并发测试连续 20 轮通过；`make critical_transactions_pg_test` 与 critical gate 合同测试通过。共享树新增生产排程、生产异常两页后，手工验收目录、readiness 与正式清单统一为 47 项，验收脚本单测 108/108；基于当前树重新执行 `scripts/qa/full.sh`、`scripts/qa/strict.sh` 均完整通过。

下一步：本轮不发布、不激活客户配置、不连接 133，也不推进 UI / 导入 / SaaS。47 项真实浏览器验收已在稳定服务上重新生成独立报告；继续长期 goal 时仍按剩余开放项优先级逐项闭环，不把本地试用证据写成目标环境发布或客户签收。

阻塞/风险：目标环境应用 migration 前必须只读确认每个 `customer_key` 当前 active 数量不超过 1；若发现存量双 active，应先作为数据修复专项保留证据并明确赢家，不能绕过唯一索引或伪造 Atlas revision。当前工作区仍有多个并发任务的未提交改动，本项未暂存、未提交、未推送、未部署；本地门禁通过不等于 133 已应用 migration、客户配置已激活或客户已签收。

## 2026-07-12 能力台账成熟度说明补齐

完成：修正 `/__dev/capability-ledger?view=capabilities&analysis=1` 只显示成熟度分布、没有解释等级含义的问题。产品能力分析区现在同屏展示完整 L0–L8 梯度、英文名称、中文含义和客户承诺边界，并明确说明只有 L8 可对客户承诺；同时区分能力成熟度、前端 `style:l1` 和 T0–T8 验证层级，避免同名术语增加开发者心智负担。

完成：等级定义不在前端复制常量，直接解析 `docs/product/产品能力进度台账.md` 的正式定义表；缺少 L0–L8 任一级或表头漂移会进入真源诊断。`web/README.md` 已同步页面口径；没有新增、重命名或重分类 Markdown，因此无需修改 `docs/文档清单.md`。`AGENTS.md` 只读遵循，未修改。

验证：T0/T1/T5 下，能力台账定向 Node 测试 13/13、前端全量测试 837/837、全仓前端 ESLint、CSS、production build（3236 modules）和 `git diff --check` 通过；`dev-capability-ledger-dark-desktop` 真实浏览器回归通过，验证 9 个等级按 L0→L8 展示、`analysis=1` 恢复、术语区分、暗色主题和页面无横向溢出。

下一步：无需改 schema、migration、RBAC、后端或正式 ERP 菜单；后续成熟度口径变更只修改正式台账定义表，页面自动跟随。

阻塞/风险：无本轮功能阻塞。本轮没有执行服务端、真实写入、migration、发布或目标环境验证，因为改动仅涉及开发态只读页面与文档解析；共享工作区仍有其他任务的大量未提交改动，提交时必须精确审查范围。

## 2026-07-12 甲方全页面模拟数据与真实浏览器验收完成

完成：本地 yoyoosun 手工验收数据保持同一模拟批次 `LOCAL-UAT-20260711 / R5`，覆盖 45 个正式目标、10 个正式岗位账号、9 个移动岗位和 3 个异常账号场景。当前页面数量证据为 32/32：任务看板按当前账号至少 20 条、九岗位合计 180 条，产品页按 20 份以上产品档案且合计至少 60 个规格，采购订单、权限中心和其他列表均从当前页面可见汇总或列表读取，不使用历史 readiness 覆盖当前 DOM。

完成：真实浏览器打印验收只从当前模拟批次的采购订单、委外订单和 BOM 业务页面进入，不再访问或放宽 `draft=fresh`。修正采购合同、加工合同独立打印页未读取 URL `customer_key` 的主路径缺陷；后端客户模块门禁继续保留。五个模板均验证“业务记录带值”、HTTP 200、`application/pdf`、request_id，以及用户实际预览 blob 的非空 `%PDF` 文件。

验证：`manual-acceptance-browser` 最终报告生成于 `2026-07-12T05:39:21.149Z`，正式账号 10/10、移动岗位 9/9、异常账号 3/3、页面 45/45、列表最低数量 32/32、打印 5/5，`acceptancePassed=true`。五个 PDF 字节数分别为 132202、439843、284271、171487、246912。定向 Node 测试 33/33、相关前端 ESLint、Go `./internal/data ./cmd/seed-role-demo-admins` 和 `git diff --check` 通过；本机试用账号密码已受控重置并保存到 macOS 钥匙串 `plush-toy-erp-manual-acceptance-local`，仓库和报告均未保存密码、token 或 Authorization header。

下一步：由共享收口任务在其他并发切片稳定后运行最终 `style:l1`、`full.sh`、`strict.sh`；本轮不 stage、不提交、不推送，也不把本地模拟验收写成生产发布或真实客户数据导入证据。

阻塞/风险：甲方本地手工验收数据与真实浏览器 P1 已关闭；生产部署、真实客户导入、客户正式签收、备份恢复和回滚演练仍不在本轮证明范围。工作区包含多个并发目标的未提交改动，后续提交必须精确审查范围。

## 2026-07-12 空目录与 Product Core 占位治理

完成：清理 34 个无内容目录，包含 3 个无引用旧页面目录、17 个 Playwright / 浏览器诊断空输出目录、根输出与依赖缓存空目录，以及 13 个只含 `.gitkeep` 的 `server/internal/core` 业务域占位目录。所有目录均移动到系统废纸篓，没有永久删除；空输出目录仍可由对应工具按需重建。

完成：Product Core 继续以当前真实实现 `calc / errors / status / value` 为准。删除 `audit / bom / finance / inventory / masterdata / order / outsourcing / production / purchase / quality / rbac / shipment / workflow` 空壳不会删除业务能力；这些能力当前仍由正式 `biz / data / service` 主路径承载，只有稳定、纯输入输出且被实际消费的规则才按 `server/internal/core/README.md` 进入 core。不预建未来目录，避免目录存在被误读成领域内核已经实现。

下一步：后续某个领域确有纯规则进入 Product Core 时，随真实 Go 文件、表驱动测试和 core boundary 验证一起创建目录，不再用 `.gitkeep` 提前占位。

阻塞/风险：无业务运行时阻塞。本轮不改 schema、migration、repo、usecase、JSON-RPC、RBAC、前端路由或正式能力状态；共享工作区仍包含其他任务的大量未提交改动，提交时必须精确审查本轮 13 个 `.gitkeep` 删除和本条进度记录。

## 2026-07-12 `/__dev` 开发者任务导航与信息架构收口

完成：修正前一轮只关注功能闭环、未充分治理查找成本的问题。六个 `/__dev` 子页现在共享开发工作台全局菜单，直接提供治理、文档、测试、原型、能力和客户配置 6 个稳定入口及当前页高亮；“开发工作台”是唯一返回总览的入口，复制深链和来源文档保持为次级动作。桌面完整展示任务说明，移动端菜单在自身容器内横向滚动，不再造成页面级横向溢出。

完成：新增共享 `DevTaskNav`，用“任务名称 + 这一步解决什么”替代只有名词的 Segmented。客户配置一级任务收口为总览、配置预检、差异、界面配置和执行发布；配置预检再按包结构、运行投影、流程策略、验证证据分组，执行发布按生成试跑证据、应用测试配置、检查正式发布分组。页面每次只渲染当前任务对应模块，子任务导航在长页面滚动时保持可见；`section` / `action` 写入 URL，默认值省略，非法或跨视图残留参数自动清理。客户配置默认预检可访问节点由原先一千多个降至约三百多个，安全边界、配置对象和动作没有被删除或伪造。

完成：能力台账的产品能力、客户交付、客户差异改为带目的说明的任务导航；成熟度 / 所属层 / 客户等分布分析默认收起，日常主路径只保留概览、筛选、列表和详情，显式展开时通过 `analysis=1` 恢复。其余文档、测试、原型和治理页保留已经合理的 sidebar / reader 或筛选结构，不机械叠加第二套局部菜单。

完成：`web/README.md` 已同步全局菜单、客户配置两级任务 query 和能力分析渐进展开口径；没有新增、重命名或重分类 Markdown，因此不修改 `docs/文档清单.md`。`AGENTS.md` 与正式真源只读核对，未修改；原型状态未变化，不把 To Implement 资产晋级 Current。

验证：Node `24.14.0` / pnpm `10.13.1` 下，`/__dev` 定向 Node 测试 94/94、前端自动发现测试 834/834、浏览器 L1 13/13、全仓 ESLint、CSS、production build 和 `git diff --check` 通过。真实 `5175` 页面完成桌面与 390×844 移动端截图和 DOM / overflow 核对；移动端 `documentElement.scrollWidth=clientWidth=390`，客户配置任务导航自身保持受控横向滚动。审查未发现 Workflow / Fact、RBAC、schema、migration、生产菜单或客户业务数据写入扩张。

下一步：本轮没有提交、推送或部署。后续若新增 `/__dev` 页面或给现有页面增加第四个以上并列主任务，应先扩展共享工作台菜单或任务导航，不再通过继续堆 section 延长单页。

阻塞/风险：本轮没有执行 Dry Run、测试配置应用、正式 readiness、发布、激活或真实导入；这些写入 / 发布合同保持上一轮实现和自动化覆盖。当前共享工作区仍包含其他任务改动，后续提交必须按路径和 hunk 精确审查，不能把并发服务端、Workflow、打印或附件改动冒充本轮成果。

## 2026-07-12 Workflow、附件与手工验收收口复核（真实验收仍开放）

完成：普通 Workflow CAS、receipt、网络未知结果重放、前后端严格合同与相关自动化门禁已完成定向实现。附件列表只查询元数据列且 5MB 多条正文不会进入返回对象；下载改为元数据读取、owner / module / Workflow 行级授权、绑定 owner tuple 的正文读取，无权限请求正文 repo 调用为 0。Workflow 附件上传要求正安全整数 `expected_version`，并在插入同一事务内 `FOR UPDATE` 锁任务、复核版本、非终态、指定处理人或当前 owner role；SQLite 行为测试和真实 PostgreSQL 完成 / 改派交错测试均证明旧授权请求零插入。

完成：浏览器验收已删除 fresh 打印工作台任意 HTTP 400 白名单；完整 `acceptancePassed` 和退出码必须同时满足页面 / 账号运行态、每个列表当前页最低数量和真实业务带值打印。历史 readiness 不得覆盖当前 DOM，九个移动页合计也不得覆盖桌面任务看板；任务看板按本页卡片 / 本页计数，权限中心在本页只读切换管理员账号页签，产品和采购按本页可见汇总证明。打印从当前模拟批次的采购、委外和 BOM 业务记录进入，强制 PDF 2xx、`application/pdf`、`%PDF`、非空正文和 `request_id`。

完成：`generatedAt=2026-07-12T05:39:21.149Z` 的真实浏览器报告已按 fail-closed 主路径通过：10/10 正式桌面账号、9/9 岗位任务端、3/3 异常账号场景、45/45 页面目标和 32/32 列表最低数量全部达标。任务看板使用本页“全部任务”计数，不读取历史 readiness 或跨页求和。五个打印验收从精确业务编号 `PO-001 / OS-001 / BOM-001-1` 的可见单元格点击进入页面正式选择状态，先断言业务行已进入 `ant-table-row-selected`，再匹配精确打印按钮；采购合同、加工合同、物料明细、色卡和作业指导书均返回 HTTP 200、`application/pdf`、132202 至 439843 bytes、非空 `%PDF`，并各自带独立 `request_id`。未恢复按钮别名宽松匹配、fresh 400 白名单、伪造 PDF 或后处理 fallback。

验证：浏览器验收合同 15/15、任务看板与两类打印工作台 L1 3/3、前端 ESLint 和 diff check 通过。首次 `full.sh` 在隔离 PostgreSQL `127.0.0.1:55432` 未启动时真实失败；启动只绑定 loopback 的临时 PostgreSQL 16 测试容器后，从头重跑 `full.sh` 与 `strict.sh` 均全部通过，覆盖前端 836/836、production build 3236 modules、fresh 55 migrations、真实 PostgreSQL 关键事务与并发、Go 全包 / build、shellcheck、shfmt 和 govulncheck。测试容器已停止并由 `--rm` 删除。

下一步：本轮 P1 的任务看板、真实业务带值打印和附件资源 / 授权阻断已关闭；保持未暂存、未提交、未推送、未部署。继续长期 goal 时按既定优先级重新核对剩余开放项，不以本地验收通过冒充目标环境发布或客户最终签收。

阻塞/风险：当前无本轮本地验收阻断，但共享工作区仍有 301 个 modified / untracked 状态项，包含多个并发任务成果；任何提交都必须重新核对最终 diff 并按确认范围精确暂存。05:39 报告和本轮 full / strict 只证明当前本地树，不证明 133 已应用新增 migration、当前代码已部署或客户已完成最终签收。

## 2026-07-11 普通 Workflow CAS 阶段性实现记录

完成：普通 `complete / block / reject / urge` 已按新项目正式合同全层 fail closed：公开调用必须提供正整数 `task_id / expected_version`、正式 command 和非空幂等键；后端不保留缺字段 fallback、`id / action` 别名、旧 RPC 双轨或旧客户端兼容。CAS、receipt V1、同 key 精确重放、changed-intent 冲突、HTTP 408 / 网络未知结果同 key 重试、post-success refresh 独立错误通道、同 scope 新 intent 删除竞态、移动端和桌面同步防双击均已闭环；Go 与 JS 共用 intent golden vectors。

完成：本项目已执行的 `20260711063237 / 20260711075355` 保持不可变，`20260711104729` 提供 portable receipt bundle CHECK，`20260711204000` 把曾错误进入业务状态列的 `shipment_release_pending` 归一化为 `shipment_pending`。Ent / Atlas 零漂移、fresh PostgreSQL 迁移与并发测试通过；共享开发库只读状态为已执行 54、待执行 1，未静默 apply、重建或伪造 revision。

完成：移动岗位任务端、任务看板、业务看板、采购 / 委外入口和两套 L1 mock 均以 backend action projection、精确动作权限和 owner-role scope 为准；`reject` 固定使用 `workflow.task.reject`。公开 create-task mock 不再补造必填字段，正式 L1 fixture 显式声明 `workflow.task.create / read`。甲方手工验收 `manual-acceptance-*.test.mjs` 聚合已接入 fast / strict，当前 94 项全部通过。

完成：阶段性门禁发现并修复打印中心模板选择的 URL / 本地 state 双真源竞态；纸面预览继续使用当前模板默认样例和同一正式模板目录，没有修改客户模板源、PDF 或业务事实。`/__dev/docs` 回归改为正确验证“URL 优先、无 query 时才读取本地偏好”；客户配置控制台不再把 HTTP `payload.message` 透传为可见错误，保留 `httpStatus` 诊断并走统一中文提示。附件、打印和 Workflow mock lint 已清零。

验证：Node `24.14.0` / pnpm `10.13.1` 下，Workflow 定向 91/91、manual acceptance 脚本单测 94/94、打印 / 错误治理 / mock 定向回归通过；当时 `style:l1` 全量 94/94、前端自动发现单测 832/832、production build 3235 modules、Go 全包 / build、真实隔离 PostgreSQL关键事务、Workflow PostgreSQL、migration、docs、secrets、shellcheck、shfmt、govulncheck 及 `scripts/qa/full.sh`、`scripts/qa/strict.sh` 通过。上述结果早于本节 5 项 P1 修复，且包含错误验收规则，不构成最终稳定树证据。

下一步：保持当前切片未暂存、未提交、未推送、未部署；先按 2026-07-12 开放阻断逐项闭环，不扩 `create_task` 幂等、customer config、production 或 finance。

阻塞/风险：`20260711204000` 尚未应用到共享开发库或 133，当前代码也尚无目标环境 authenticated replay / migration / rollback 新证据；客户最终签收和真实客户数据导入未执行。共享工作区包含多个已完成任务的大量改动，后续若获提交授权必须按最终确认范围精确审查和暂存，不能把旧 full / strict 或旧 release evidence 冒充当前 commit 的发布证据。

## 2026-07-11 `/__dev` 开发工作台全局质量收口

完成：严格复核并收口开发导航、项目治理地图、开发文档、测试入口、产品原型、能力台账、客户配置包预检与发布 7 个 `/__dev` 页面。所有子页统一提供返回开发导航、复制当前完整深链和查看来源文档；页面 H1、浏览器标题、筛选空态、当前选中语义、URL query / history / refresh 恢复、键盘焦点、移动端和明暗主题已统一。开发入口继续只存在于 DEV，不进入正式菜单、RBAC 或生产构建导航；按既有治理不恢复“最近访问”。

完成：能力台账按 4 份当前 Markdown 真源的精确表头和标题连接，读出 37 项产品能力、25 项客户交付矩阵和 27 项客户差异，不用模糊匹配或静默空结果掩盖文档漂移。测试入口只索引 9 份当前维护文档，解析 132 个可复制命令块，保留合法续行并拒绝悬空反斜线；`reference / archive` 继续不作为执行入口。开发文档查看器支持仓库内相对 Markdown 深链、路径与 hash 恢复，并纳入客户配置来源文档。

完成：20 个原型资产逐项核对登记状态、README、资源路径、桌面 / 移动预览和可交互目标；沙箱预览改用内存 storage，不扩大 same-origin 权限。全屏预览补齐初始焦点、背景 inert、焦点循环、Escape 关闭和返回焦点；业务表单样板改为真实单一模态对话框，覆盖长值、校验、计算字段和键盘闭环。原型成熟度仍以现有真源为准，没有把 Draft / Comparison / History 资产误升为 Current。

完成：客户配置控制台的发布批次只接受已登记的直接日期目录并按新到旧展示；readiness 精确绑定一个批次和对应 manifest。浏览器不再提供正式发布 / 激活动作，只给只读 readiness 与执行器输入模板；测试应用成功后还必须读回完全一致的 effective revision 才算完成。没有点击 Dry Run、测试应用、正式发布、激活或真实导入，也没有修改生产、RBAC、schema、migration、Workflow 或 Fact 边界。

验证：Node `24.14.0` / pnpm `10.13.1` 下，`/__dev` 定向单测 93/93、前端自动发现单测 831/831、文档清单与治理锚点 4/4、浏览器 L1 13/13、20 个原型桌面 / 移动矩阵、7 个路由桌面 / 移动 / 明暗主题矩阵、production build、CSS、受影响 ESLint 和 `git diff --check` 通过；两轮独立代码审查最终为 P0/P1/P2 均 0。全仓 ESLint 仍被并发任务中的 `BusinessAttachmentPanel.jsx` 2 个缩进错误和 `workflowTaskMockAuthorization.mjs` 3 个参数顺序错误阻断，本轮没有越界修改。

下一步：本轮没有提交、推送或部署。若后续需要验证写路径，应先恢复本地后端 `127.0.0.1:8300`，再由用户明确接受测试数据写入边界后单独执行 Dry Run / 测试应用；正式发布和真实导入仍必须走既有执行器、审批与发布证据流程。

阻塞/风险：当前收口覆盖开发人员可见页面、文案、交互、文档、原型和只读发布预检，但没有用真实账号执行任何客户配置写操作；后端在最终浏览器回归阶段不可用，因此客户配置运行态写后读回由单测和 mock 浏览器合同覆盖。并发工作区仍有大量非本轮改动，后续提交必须按允许路径精确审查和暂存。

## 2026-07-11 正式前端客户视角文案收口

完成：桌面后台、岗位任务端、统一登录、权限中心、协同任务、主数据、销售 / 采购 / 委外 / 库存 / 质检 / 出货 / 财务、审计和打印相关正式界面已统一站在当前账号与业务人员视角，不再把系统使用者称为“当前客户”，也不再向正式用户展示 `Workflow / Fact / usecase / 后端 / 前端 / DOM / 路由 / 控制面 / 真源 / 源单 / 快照` 等实现口吻。交易主体“客户”、合同主体“甲方 / 委托方 / 订货方”、权限管理中的“管理员账号”按真实业务语义保留；Product Core 无客户控制面、`/__dev/**`、内部日志和技术文档仍保留必要工程术语。

完成：本地 `pnpm start` / `start:yoyoosun`、`preview:yoyoosun` 与生产构建继续复用同一套正式组件和文案，没有新增 DEV / PROD 文案分支。当前账号加载态统一为“正在进入工作台 / 正在准备您的工作内容”，岗位端失败态统一为“暂时无法进入岗位任务端”，登录字段统一为“账号”；客户运行态 fail-closed、RBAC、菜单投影、Workflow / Fact、JSON-RPC 参数和业务状态逻辑均未因文案修改而改变。

验证：Node `24.14.0` / pnpm `10.13.1` 下，正式客户视角静态守卫 3/3、业务可见文案守卫 53/53、前端 `lint`、CSS 检查和自动发现单测 775/775 通过；冻结树上的 `style:l1` 全量 93/93 通过，覆盖桌面 / 移动加载失败、无可见菜单、登录、权限、审计、协同、业务页、打印与长值边界。本机只读端口审计确认 `5177` 为 yoyoosun 开发入口且客户配置 / 资产均命中；Playwright 直接打开 `http://127.0.0.1:5177/admin-login`，页面实际显示“账号 / 请输入账号”，截图保存在 ignored 输出目录。`git diff --check` 通过。

下一步：本轮没有提交、推送或部署。若要让已发布线上环境同步，需要在完整共享工作区稳定后按现有发布流程提交、构建和部署；本地 `5177` 开发服务已通过 HMR 使用新文案。

阻塞/风险：本轮未用 `full / strict`、后端测试或 migration 结果为文案任务背书，也未修改、暂存或提交并发 Workflow / server / schema / migration 文件。没有真实账号凭据，因此本机 `5177` 只实测了登录页；客户运行态加载失败、权限态和业务页面由 mock 浏览器回归覆盖。线上既有构建在重新发布前仍会显示旧文案。

## 2026-07-11 普通 Workflow CAS 与网络重放一致性收口

完成：普通 `workflow_tasks` 以从 1 开始的 `version` 为乐观锁真源；正式完成、阻塞、退回和催办从 service、biz 到 repo 都强制要求正整数 `expected_version`、正式命令 key 和顶层 `idempotency_key`，不接受缺字段 fallback、`id / action` 别名、客户端业务状态或旧 RPC 双轨。数据层在同一事务内按任务 ID、旧状态和版本 CAS，成功后只增加一次版本，并把状态事件、催办计数、业务投影、派生任务和成功 break-glass 审计收口到单一赢家。五个正式 Workflow 写入口都在模块查询前按精确合同拒绝 `customer_key` 和未知字段，模块门禁只使用服务端部署上下文。公开 `create_task` 只接受正式创建字段，拒绝流程锚点、receipt / CAS 和未知字段，但不增加 create 幂等 / replay；本项目没有旧项目、旧客户端或旧 API 兼容分支。

完成：`workflow_task_events` 使用稳定 `workflow.task-mutation-result/v1` receipt，明确保存 `task_version / idempotency_key / intent_hash / command_key / mutation_result`。writer 在落库前校验 DTO，reader 要求 stored key / command / status canonical，并校验任务状态与非空业务状态字典；双方一致但非法、带空格或损坏的快照同样 fail closed。相同 task、key、actor、命令和业务 intent 的精确重放会在终态 / 当前版本校验前返回首次快照，不重复副作用；同 key 改 intent 返回 `40920`，新 key 不能绕过终态。linked ProcessRuntime 后置对账失败返回结果未知，重试继续使用同一 receipt。receipt bundle 由 portable CHECK 保证全空或全完整，JSON envelope / task shape 由严格 repo parser fail closed。

完成：`20260711063237` 与 `20260711075355` 保留为本项目已执行的不可变 revision，`20260711104729` 追加 receipt bundle CHECK；未合并、改写或伪造 Atlas revision。迁移前由本项目创建但无法证明准确版本的事件继续保留 `task_version=NULL`，不按事件行号或当前任务版本伪造 backfill。fresh 隔离 PostgreSQL 已从干净库应用 54 个 revision、pending 0；共享开发库只读核对为已执行 52、pending 2，尚未应用 receipt 与 CHECK；133 仍是 51 个 revision 的既有运行态。

完成：Dashboard、Workflow V1、岗位任务端、采购订单和委外订单五类正式动作入口均在任何 await 前取得 task 级同步 in-flight lease，完成 / 阻塞 / 退回 / 催办跨动作双击不会发出第二个请求。一次用户 intent 会冻结参数和安全 UUID key；HTTP 408、网络中断、5xx、post-commit 对账失败或结构不合法的 success response 都保留同一 attempt、原因、证据和 key。mutation 成功后的列表刷新使用独立错误通道，不再误报“结果未知”；attempt 清理按对象 identity 执行，不会删除同 scope 的新 intent。action access request identity 已包含 task version，正式 RPC 仍只发送 `task_id`；两套 mock 与后端同样拒绝非合同字段、空白 / alias action 和客户端派生状态。style-L1 explain mock 也已按正式合同拒绝终态四动作，并把退回权限固定为 `workflow.task.reject`，不再用假允许结果遮蔽按钮 / 权限回归。

完成：Go 与 JS 共同消费 `scripts/qa/workflow-task-mutation-intent-v1.vectors.json`。全字符串 evidence 才 trim / 去重 / 排序；只要包含非字符串就保留类型和顺序；raw whitespace key 不会被当成 canonical ignored key。共享 vectors 同时锁住 transport-only equality、mobile 精确重复 key、number/string 差异和 changed-intent，避免前端误复用旧 attempt 而服务端计算出不同 intent。

验证：Node `24.14.0` / pnpm `10.13.1` 下 Workflow API、action access、submit guard、两套 mock、岗位任务端和采购 / 委外 caller 联合 62/62 通过；Vite production build 通过 3234 modules，受影响 ESLint、Prettier 和 diff check 通过。Ent / Atlas migration diff 为零；Go 全包测试通过；真实 PostgreSQL `make workflow_pg_test` 通过，覆盖 CAS / replay 并发、migration shape、partial receipt、空白 / 超长 key、hash 长度、非正 task version / actor 和空目标状态的 `23514`，以及坏 JSON receipt 的 repo parser fail-closed。

下一步：等待手工验收造数切片修复 standalone 外部写入守卫并重新冻结后，重跑受影响 L1、`scripts/qa/full.sh` 与 `scripts/qa/strict.sh`，再把本轮 Workflow 切片作为可提交候选交给用户确认。随后按优先级处理 customer config 每客户单 active 不变量；不扩 `create_task`、production 或 finance。

阻塞/风险：当前 Workflow 代码、三条 migration、文档和测试仍未暂存、提交、推送或部署。Workflow 静态 QA 目前 31/33，剩余两项是冻结中的采购入库事实文案和销售源单取消文案；另一个造数切片的 standalone external-write P1 尚未确认解除，因此当前 shared tree 的旧 full / strict / L1 结果全部不能作为最终证据。133 尚未应用本轮 3 条 migration，也没有当前 commit 的 authenticated replay / migration / rollback release evidence。

## 2026-07-11 旧审查复核与新发布候选收口

完成：前序完整工作区已在 `main` 提交并推送为 `711441829c84379dc7e1d0aa65a8eaedc27350ac`，6 条新增 migration 的 exact bytes 已记录；固定 revision 的 `make data` 为零漂移。133 已按该 revision 完成备份隔离恢复、migration `20260710150001`（pending 0）、active customer config、10 个桌面账号 / 9 个岗位任务端 / 1 个拒绝态、真实短信 provider、API / DB 生命周期和浏览器回归。133 运行时 image ID 为 server `sha256:1924726f1aa7ae6013f5112338fb3d7e9ad6cd756eb067efe0bdf2c468659dcc`、web `sha256:8659526ffaf4a4b2ee9e6f839a2d582e81f4fa7ac64788028b2a30c43910a71b`，传输 bundle SHA-256 为 `92fcd72d73cda5c618d40305889ad32b55c271d363aa5dae9091f74be4a527b9`。本机 IPv6 HTTP / HTTPS LaunchDaemon 已增加 `ipv6only=1` 并重载，HTTPS 转发不再自环耗尽临时端口；未切换 Clash 节点。

完成：按当前代码、正式文档和测试逐项复核旧 ChatGPT 审查。库存预留锁、SKU 端到端、ProcessRuntime 领域命令原子边界、出货来源完整性 / 并发超发 / 预留消费、客户原始资料发布隔离、active revision fail-closed 和 super admin break-glass 均已由当前主路径覆盖，不重复实现；BOM SKU、历史空 SKU 重分类、导入自动建 SKU、自动下游回滚和新增 Product Core 页面仍按正式边界不扩张。仍合理的缺口已收敛为 PostgreSQL 关键门禁遗漏、ProcessRuntime 创建回滚缺测、Workflow 多角色资格组合、shipment 拆分写入口和目标 Chromium/PDF 运行时回归。

完成：`full / strict` 的真实 PostgreSQL 门禁现已显式启用同一个隔离库的 purchase / inventory 两组 guard，并覆盖 Inventory、OperationalFact、ProcessRuntime、Finance / Sales process command；新增采购入库创建在 durable result 冲突时，单头、明细、批次和质检全部回滚且原结果不变的 PostgreSQL 测试。Workflow owner role 现在必须由 active revision 中同一 role 的启用 profile、当前 customer scope entitlement、动作 capability 和 revoke 共同决定；固定客户缺 revision 或读取失败时 fail closed，指定 assignee、PMC / boss 催办和受审计 super admin break-glass 保持原边界。

完成：公开 `create_shipment / add_shipment_item` 头行拆分写入口已退役并固定返回 `UnknownMethod 40020`；前后端、模拟数据和 L1 统一使用严格幂等的 `create_shipment_with_items` 聚合创建，既有明细只读。133 只读盘点确认 7 张 DRAFT 均恰有 1 条明细，零明细 DRAFT 为 0，无待补数据。Debian Chromium `150.0.7871.46` 在 133 真实触发 SIGTRAP，已收敛为上游版本回归；Dockerfile 精确固定 `chromium / chromium-common 150.0.7871.100-1~deb12u1`，生产要求 `ERP_PDF_WARMUP=async`，preflight 校验运行时包版本，authenticated smoke 真实校验 HTTP 200、`application/pdf`、`%PDF` 和非空响应并只保存脱敏 hash / size。linux/amd64 本地镜像及容器内 PDF 已通过。

完成：`20c96d3819429361a35d2551b63b211f055de37e` 已在 133 替换旧 `7114418` 运行态；server / web 使用 immutable linux/amd64 镜像，migration `20260710150001` pending 0，`ERP_PDF_WARMUP=async`，Chromium / `chromium-common` 精确版本为 `150.0.7871.100-1~deb12u1`。`deployments/yoyoosun/evidence/releases/2026-07-11/` 已绑定本次 git commit、镜像 digest、备份隔离恢复、目标 smoke、客户配置 effective session、真实 PDF、回滚 / forward-fix 和技术试用签收；重新用当前 runtime preflight 生成脱敏报告后，release status 为 `ready=true`、7/7 gate-verified。该结论是 133 技术试用 GO，不等于客户最终验收或真实客户数据导入完成。

完成：复核 ChatGPT《代码审查与需求分析》及“理解进销存 / 说明财务 / 梳理各种流 / 查找生产流程”四个任务。Product Core / yoyoosun 需要复制两套后端、读接口缺门禁等于跨客户泄漏、super admin 绕过、当前 QA / 文档大量失败、ProcessRuntime 缺 CAS 等结论已按当前真源判定为过期或边界错误；普通 Workflow 非终态并发、催办丢计数、customer config 双 active、debug 全量清空、前端测试漏发现、PDF HTTP customer key 绑定和后续生产 / 财务 / 进销存业务主链缺口仍纳入当前 goal。

完成：debug 写能力改为 fail-closed。seed、按 debugRunId cleanup 和全量业务清空默认分别关闭；全量清空改用独立 `ERP_DEBUG_BUSINESS_CLEAR_ENABLED`，只允许 local / dev，默认 dry-run 只统计，实际删除必须同时提供 `dryRun=false` 与精确确认短语。生产启动、Compose、yoyoosun 部署包、preflight、capabilities、JSON-RPC、repo、测试与正式配置文档已同步；按 debugRunId 清理的既有真源和安全标记保持不变。

完成：`web/package.json` 不再手工枚举测试文件，`pnpm test` 改用 Node test runner 自动发现全部 `web/**/*.test.mjs`，前端实际从 676 项扩大到 746 项且全部通过；`web/README.md` 已登记禁止恢复手工测试清单。

验证：指定 Node `24.14.0` / pnpm `10.13.1` 下，定向 Go 测试、发布与配置脚本 206 项、前端 746 项均通过；`scripts/qa/full.sh` 与 `scripts/qa/strict.sh` 全部通过，覆盖 production build、全包 Go test / build、真实隔离 PostgreSQL 关键事务、docs inventory 295 个 Markdown、secrets、migration、客户包和 release evidence。`govulncheck` 实际执行并确认当前代码调用路径受影响漏洞 0；`gofmt`、shell syntax 和 `git diff --check` 通过。

下一步：先为普通 `workflow_tasks` 增加 version / expected status CAS、可执行迁移合同和 blocked / done / urge 并发 PostgreSQL 测试，再收口催办幂等与 customer config 每客户单 active 不变量；完成数据一致性后，再按进销存、生产订单 V1、应付 / 结算主链推进业务闭环。

阻塞/风险：本轮 release evidence / 门禁、debug 安全、测试自动发现和文档改动尚未提交推送，133 当前运行态仍是已验证的 `20c96d38`，不包含这些后续代码改动。Workflow 非终态 CAS、催办并发和 customer config 双 active 仍是当前最高优先级未完成项；真实客户数据导入和客户最终签收仍未执行。

## 2026-07-11 手工回归数据与发布收口

完成：等待其它 Codex 任务全部结束后接管完整工作区。开发库已应用到 migration `20260710150001`，并通过正式 `customer_config` JSON-RPC 发布、激活 `yoyoosun-customer-package-v7.runtime-manifest-v1`，生产模块恢复为 enabled。四类模拟入口统一携带稳定 `customer_key=yoyoosun`；采购 / 质检矩阵使用中文“【手工测试】”名称，业务事实矩阵新增客户真源参数，并保留生产、委外、出货、财务的草稿 / 已过账 / 已取消 / 已结清以及库存预留 ACTIVE / RELEASED 状态。本地已生成三批采购质检、三批岗位任务和三批完整业务事实矩阵；API 读回确认销售 32、采购订单 46、采购入库 15、质检 16、生产 16、委外事实 16、库存预留 18、出货 16、财务 24、Workflow 模拟任务 118 条，主要生命周期状态均有覆盖。

完成：真实页面核对发现客户配置 role matrix 已更新而浏览器 smoke 仍使用旧硬编码菜单，已改为直接读取 `yoyoosunRoleFlowMatrix`；系统权限页不再被客户业务页面投影误过滤，客户配置仍不能放宽其 RBAC；权限清单按稳定模块 key 渲染，消除多个“未登记权限模块”的 React 重复 key。真实浏览器回归最终通过 10 个桌面账号、9 个岗位任务端和 1 个无权限拒绝态；采购页面实际显示三批中文测试订单及草稿、已提交、已审核、已关闭、已取消五种状态。

完成：使用 Node `24.14.0` / pnpm `10.13.1` 通过 `scripts/qa/full.sh`、`scripts/qa/strict.sh`、真实账号浏览器 smoke，以及 5 个受影响 L1 场景；前端全量单测 / 构建、后端全包、隔离 PostgreSQL 关键事务、Atlas / 文档 / secrets / shell / 漏洞门禁均通过。

下一步：提交并推送完整工作区；随后按 `server/deploy/compose/prod` 的低配服务器流程在本地构建镜像、上传并部署 192.168.0.133，应用 migration 和 v7 客户配置，重置测试角色账号，向 133 写入同等中文场景矩阵，并完成页面 / API / 数据库与短信 provider 配置回归。

阻塞/风险：本地数据已完成，但 133 尚未执行本轮部署和补数；目标环境发布前仍需备份、migration preflight、保留 `.env` 中短信 provider 配置并验证真实健康状态。模拟数据只用于测试人员和甲方员工手动回归，不代表真实客户导入或客户业务事实。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 2026-07-12 `/__dev` 全局一致性扫描与打印原型补齐

完成：全局核对 `/__dev` 的 6 个子入口、共享导航、独立页面标题、DEV-only 路由门禁、文档白名单、测试命令索引、能力台账、客户配置控制台和 20 个原型资产登记；未发现缺失路由、未登记原型资产或生产菜单 / RBAC 越界。模板打印中心原型此前 README 已登记 5 个正式模板但 HTML 只展示采购合同、加工合同，本轮补齐物料分析明细表、色卡、作业指导书的导航卡、精简中性预览和切换数据，并同步静态原型索引与 `/__dev/prototypes` 搜索元数据。

完成：新增原型与正式 `printTemplateCatalog` 的五模板集合守卫，并锁住五个模板名称都能检索到模板打印中心资产。真实浏览器在 `http://127.0.0.1:5175/__dev` 核对 6 个入口无控制台错误；在 `/__dev/prototypes?asset=print-template-center` 核对 5 张模板卡、色卡 / 作业指导书切换、选中态和纸面标题同步，纸面 `scrollWidth=clientWidth=758` 无横向溢出；搜索“色卡”只保留模板打印中心资产。`/__dev` 定向守卫 88/88、前端 lint 和自动发现测试 836/836 通过，`git diff --check` 通过。

下一步：本轮没有提交、推送或部署。若后续要把模板打印中心原型晋级为 `Current`，仍需用户明确确认，并单独对照真实 `/erp/print-center` 做状态晋级评审；当前继续保持 `To Implement`。

阻塞/风险：本轮只补开发原型和一致性守卫，不修改正式打印模板、业务页带值、服务端 PDF、RBAC、schema、migration、Workflow / Fact 或客户配置激活。共享工作区仍有大量其他会话改动，后续提交必须精确审查和暂存本轮相关路径。

## 2026-07-12 `/__dev` 后台式开发工作台布局

完成：把 `/__dev` 首页和治理、文档、测试、原型、能力、客户配置 6 个子页面统一接入独立 Dev Workspace 壳。桌面端使用 232px sticky 左侧栏，包含总览和 6 个开发入口、当前项、复制深链、来源文档及 DEV-only 边界；右侧继续承载各页面原有标题、筛选、二级侧栏和内容区。移动端在 980px 以下退回顶部横向滚动导航，不复制正式 `ERPLayout`，也不接正式菜单、seedData、RBAC、客户 effective session 或生产构建。

完成：修正 `/__dev/` 尾斜杠下总览项未高亮的问题；7 个页面统一添加 `erp-dev-workspace-page`，新增共享布局静态守卫，并把 `dev-all-pages-mobile`、`dev-ui-semantics-desktop` L1 从旧顶部返回按钮合同更新为新工作台合同。桌面真实浏览器 1440×1000 验证左栏宽 232px、内容从 x=284 开始、无覆盖和横向溢出；移动端 390×844 验证页面退回 block、导航横向滚动、页面无横向溢出，原型页标题和内容均未被 sticky 导航遮挡。

验证：`node --test` 定向 36/36、CSS stylelint、ESLint、前端自动发现测试 840/840、`dev-all-pages-mobile` 与 `dev-ui-semantics-desktop` 两个浏览器级 L1 场景、`git diff --check` 全部通过。真实浏览器桌面和移动端截图、DOM / box metrics 与控制台检查均通过，无 warning / error。

下一步：本轮没有提交、推送或部署。后续若继续优化，只应围绕各开发页自身的二级信息架构，不把 Dev Workspace 升格为正式后台菜单或客户业务入口。

阻塞/风险：本轮未修改 schema、migration、API、RBAC、Workflow / Fact、客户配置写入或正式业务后台布局；完整全站 `style:l1` 未运行，本轮按共享开发布局影响面运行了覆盖全部 7 个开发页的移动端场景和桌面语义场景。共享工作区仍有大量并发改动，提交时必须精确审查本轮路径。

## 2026-07-12 全页面验收数据厚度与生产页面补齐

完成：确认生产排程、生产异常虽然已有正式路由，但 yoyoosun 菜单仍隐藏且桌面页错误地同时按页面 `source_type` 和任务分组过滤，无法读取统一验收批次中的岗位任务。两页现已进入正式客户菜单和 47 项手工验收目录；桌面页以唯一 `task_group` 作为归属真源，PMC 的 20 条任务使用生产排程分组，生产岗位的 20 条任务使用生产异常分组，状态覆盖待处理、可执行、处理中、阻塞、退回、完成及逾期 / 临期。

完成：新增数据厚度门禁，锁定销售、采购、委外和产品结构均具备 1、8、25 条明细，客户 / 供应商具备 0、1、2 个联系人，附件合同覆盖 7 类业务对象、每条 3 至 5 份 PDF / 图片 / 表格及接近上限文件。另将手工验收、容量回归、压力测试明确分档；手工验收数据不得冒充压测，容量和压力档只能在一次性隔离数据库执行，并输出吞吐、成功率、p50 / p95 / p99、锁等待、幂等和前后数据一致性证据。

验证：本机独立 super admin 密码已通过 local-only 显式确认入口安全重置，服务端以 `ERP_DEBUG_ENV=local`、`ERP_CUSTOMER_KEY=yoyoosun` 启动。新任务批次 180 条全部经正式 Workflow API 写入并应用 59 个状态动作，7 类业务对象的 27 份附件经对应正式岗位账号上传或幂等复用，并逐份下载内容读回。定向语法、页面合同、任务造数和数据厚度测试 44/44 通过。`generatedAt=2026-07-12T06:31:22.221Z` 的稳定重跑证明旧加载壳干扰消失，但生产两页仍为 0/20、五个打印仍失败；修正桌面页任务查询后，通过 macOS 钥匙串安全注入本地试用凭据重新执行完整验收，最新 `generatedAt=2026-07-12T06:42:00.870Z` 报告为 47/47 页面、34/34 列表最低数量、10/10 正式账号、9/9 岗位任务端、3/3 异常账号和 5/5 真实业务 PDF。生产排程、生产异常均从各自桌面 DOM 读到 `observedTotal=20`；五份 PDF 均为 HTTP 200、`application/pdf`、非空 `%PDF` 并带独立 `request_id`，没有 readiness 覆盖、跨页求和、按钮别名或失败后处理。随后基于最新稳定树重新执行 `scripts/qa/full.sh`、`scripts/qa/strict.sh`，均完整通过。

完成：在一次性 `plush_erp_capacity_0712` PostgreSQL 中真实准备并由报告读回 5,000 条 Workflow、2,000 条生产事实、2,000 条财务事实和 1,000 份附件；隔离服务保持 `local + yoyoosun active revision`。20 并发 / 1,000 请求和 100 并发 / 5,000 请求均为 100% 成功，最终一轮吞吐分别为 122.99 和 112.47 RPS，p95 分别为 491.17ms 和 1.82s，p99 分别为 759.53ms 和 2.27s。20 路同一幂等键并发催办 20/20 成功且只返回版本 2；压测前后四类可见数量一致。54 个数据库采样点记录最大 94 个后端连接、67 个活跃查询，锁等待、死锁、冲突和采样错误均为 0。压测结束后已恢复共享开发服务、健康检查 200，并销毁一次性容量库，数据库不存在计数为 0。

验证：手工验收脚本定向测试 111/111、测试数据隔离边界 16 项、`git diff --check`、`scripts/qa/full.sh` 和 `scripts/qa/strict.sh` 最终均通过；全量 / 严格门禁实际覆盖前端自动发现测试与 production build、Go 全包测试与构建、Atlas 56 个 migration / 385 条 SQL、隔离 PostgreSQL 关键事务、shell / secrets / 文档 / 客户包门禁及 `govulncheck`。测试 PostgreSQL 仅在 `127.0.0.1:55432` 临时启动，门禁结束后已移除。

下一步：本轮 Goal 已可按本地验收数据与证据范围收口，不再追加模拟数据或把本地压测结果外推为生产容量结论。后续如需部署 133、执行目标环境 migration、客户签收或正式容量规划，应进入独立发布 / 验收任务。

阻塞/风险：本轮不修改 Workflow core、schema 或 migration，也没有使用 super admin 绕过业务附件权限。47 项与压力报告只证明当前本地和一次性隔离环境；133 部署、目标环境 migration 应用和客户最终签收不属于本轮造数 Goal 的完成证据，仍需独立发布流程处理。

## 2026-07-12 阶段编号命名全仓治理

完成：全仓扫描活跃代码、脚本、测试和正式文档，将仍作为实施阶段真源的 P 子阶段代号改为 `material supply chain / finished goods delivery chain / 成品交付流程` 等功能与业务域命名。P0/P1/P2 风险等级、p50/p95/p99 百分位、产品编码、端口参数和迁移执行步骤属于明确技术语义，不作为阶段实现残留处理；归档、外部原始资料、发布证据和生成产物保留历史原貌。

完成：`phase-label-boundaries.mjs` 从有限目录扩为全仓活跃路径扫描，新增 P 子阶段编号与 P 编号发布目标识别，并显式跳过归档、reference、客户原始资料、release evidence、依赖、构建目录和生成二进制。新增独立测试锁住完整 Phase 编号、P 子阶段编号和 P 编号发布目标会失败，同时证明优先级、百分位、产品编码及部署技术步骤不会误报；fast / strict 已接入该测试。

验证：阶段编号命名测试 3/3、客户配置 runtime manifest 定向测试 25/25、全仓活跃路径扫描、fast / strict shell syntax 和本轮相关文件 `git diff --check` 全部通过。

下一步：后续实现继续按业务能力、模块、系统分层、测试形态和证据环境命名；若新增阶段编号标签，fast / full / strict 会在本地门禁中阻断。

阻塞/风险：本轮不重写 `docs/archive/**`、`docs/reference/**`、历史 release evidence、`progress.md` 既有流水或生成产物中的旧词，因为这些内容是历史/外部证据，不是当前实现真源。共享工作区仍包含大量其他会话改动，提交时必须精确审查范围。

## 2026-07-12 生产订单成品入库事实联动

完成：生产订单继续作为 Source Document，复用现有 `production_facts + inventory_txns` 事实真源，没有新增重复事实表或让 Workflow 写事实。当前只接 `FINISHED_GOODS_RECEIPT`：创建和过账会在事实事务内锁定来源生产订单，复核 RELEASED 状态、订单行、产品、SKU、单位和允许的事实类型；同一订单行累计有效 POSTED 成品入库量不得超过计划量，已取消事实按现有 REVERSAL / CANCELLED 真源退出有效量。

完成：RELEASED 生产订单取消已收口到订单 CAS 与事实检查的同一事务 / 锁域。取消与生产事实过账都先锁同一 `production_orders` 行；无有效 POSTED 事实时允许取消，有有效事实时拒绝。并发竞争只能由事实过账或订单取消其中一个成功，失败方零库存副作用、零错误 receipt。DRAFT 取消、关闭、CREATE / 非 CREATE receipt、expected_version 与 intent hash 主路径保持不变。

验证：错行、错产品、错 SKU、错单位、错事实类型、越量、冲正后数量复用、取消后拒绝过账和精确重放的定向测试通过；真实 PostgreSQL fresh 57 条 migration 后关键事务门禁通过。新增 PostgreSQL 证据覆盖同 key 并发创建只保留一条事实、两张 6/10 成品入库并发过账只有一个赢家、越量失败保持 DRAFT 且不写库存，以及订单取消与事实过账八轮竞争只有一个合法赢家。对应 race、`scripts/qa/full.sh`、`scripts/qa/strict.sh` 与 `git diff --check` 均通过。

下一步：只进入 production order JSON-RPC / API 与 RBAC 独立评审；先定义精确请求 / 返回合同、错误映射、模块门禁与权限矩阵，再决定是否注册正式 provider。`MATERIAL_ISSUE / REWORK` 的 BOM / 材料来源合同仍需单独评审，不能沿用成品入库规则猜测实现。

阻塞/风险：本轮未接 JSON-RPC/API、RBAC、UI、seed、正式 provider、部署或目标环境，也未修改 Workflow。所有证据仅证明当前本地代码和隔离 PostgreSQL；不代表 133 已应用、客户可用、客户签收或完整生产 / MES 闭环。共享工作区仍有大量其他会话改动，本轮未暂存、提交或推送。

## 2026-07-12 AI 阶段命名防漂移闭环

完成：新增 `server/internal/biz/implementation_naming.go` 作为自动生成数据的 implementation naming 单一校验源，识别完整 Phase 编号、紧凑 phase 编号、P 子阶段编号和 P 编号发布目标，并允许 P0/P1/P2 风险等级、p50/p95/p99 百分位、普通产品编码和部署技术步骤。Workflow 创建 / 状态更新 / 嵌套 payload、核心演示 seed 和试用 MasterData seed 在写入前复用该规则；普通 MasterData 与客户业务数据不受开发命名规则限制。

完成：全仓静态命名守卫及其单测保留在 fast / strict，AGENTS 收口为“AI 按能力、领域模块、系统分层、测试形态和证据环境组织实现”。复审后删除常驻数据库全表审计工具、发布 / 配置激活强制扫描和对应门禁，历史残值改为按需只读 SQL 专项盘点，避免把低频数据清理扩成 Product Core 业务规则。

验证：静态命名守卫、服务端 implementation naming / Workflow / core demo seed 定向测试、seed 命令包编译和全仓活跃路径扫描通过；未执行数据库写入、schema 或 migration。

下一步：后续 AI 和自动造数继续按功能、模块、分层与测试形态命名。若再次发现历史数据库残值，按目标表和引用关系做一次性只读盘点与专项清理，不新增常驻扫描框架。

阻塞/风险：共享工作区包含其它会话的大量未提交改动，提交时必须精确审查范围。

## 2026-07-12 生产订单 API/RBAC 合同评审

完成：只读核对现有 sales / purchase / outsourcing Source Document JSON-RPC、统一错误码 catalog、`CurrentEffectiveAdminPermissions`、客户模块 gate、`pmc.plan.*` 权限和内置角色矩阵后，完成 production order API/RBAC docs-only 评审。正式合同使用独立 `production_order` JSON-RPC 域和七个 canonical snake_case 方法，不提供 camelCase、`id` 别名或旧 API 兼容；create/save/release/close/cancel 强制稳定 idempotency key，非 CREATE 强制 expected_version，actor 和 customer scope 只取服务端认证 / 部署上下文。

完成：权限复用 `pmc.plan.read / create / update`，模块写门禁复用 `production`，不新增重复 `production.order.*` 权限体系或平行 module key。PMC 可读 / 创建 / 更新，生产岗位可读 / 更新但不能创建，老板只读；未登录、非管理员、disabled、无权限、固定客户缺 active revision、read_only / disabled module 与 super_admin 收窄边界已写入实现合同。列表 / 详情、聚合返回、strict allowlist、decimal string、Unix 秒、分页排序、receipt 隐藏、actor 审计和 provider / Wire 接入范围均已明确。

完成：确认现有 `InvalidParam / AuthRequired / AdminRequired / AdminDisabled / PermissionDenied / IdempotencyConflict / Internal` 可复用；版本 CAS 冲突没有同义码，后续实现必须在统一 catalog 新增 `ResourceVersionConflict` 并通过前端生成码表同步，不能复用 changed-intent 的 `40920` 或写魔法数字。

下一步：API runtime 前先关闭一个 P1 领域阻断：当前 Close 对任意 RELEASED 订单允许无 reason 关闭。必须在 production_orders 同一锁 / 事务内按每行有效 POSTED `FINISHED_GOODS_RECEIPT` 计算完成量；全部完成允许正常关闭，未完成必须有短关闭原因，并补 close 与事实过账 / 冲正并发、CAS、精确重放和失败零 receipt PostgreSQL 证据。阻断关闭后，再按评审合同实现 provider、read repo/usecase、JSON-RPC、RBAC 和错误码同步。

验证：本轮属于 T0/T1 docs-only 评审；只读代码证据覆盖 dispatcher、认证、effective permission、module catalog、角色矩阵、错误码、provider 和既有 Source Document handler 模式。正式文档已同步当前真源、路线图、能力台账和证据详情；未运行 API、PostgreSQL、浏览器或部署测试，因为 runtime 未改且 close 阻断尚未实现。

阻塞/风险：没有注册 provider、没有接 JSON-RPC runtime、没有新增权限码 / 错误码代码、没有修改 UI、菜单、seed、Workflow、`MATERIAL_ISSUE / REWORK`、部署或目标环境。本轮完成仅表示合同评审层，不表示 API Ready、客户可用或目标环境已发布。

## 2026-07-12 生产订单 UI / 菜单边界评审

完成：按 docs-only 独立切片核对现有 Source Document 页面、生产排程 Workflow 页、生产进度 Fact 页、业务模块 registry、内置菜单、客户角色投影、岗位任务端、原型样板、style:l1 和真实浏览器验收目录。结论为新增独立 `production-orders` Source Document 页面，建议路由 `/erp/production/orders`；不能复用或改名现有生产排程 / 生产进度页面，也不能把订单、协同和事实合并为万能工作台。

完成：在生产订单正式评审中收口页面主职责、列表头字段、聚合 Modal、可读来源选择、字段残值 / 缺值、DRAFT / RELEASED / CLOSED / CANCELLED 动作、短关闭原因、隐藏 CAS / 幂等、错误 / 空 / 无权限 / 长文本 / 焦点恢复、角色投影和下一实现允许路径。PMC 可全动作，生产可更新但不能新建，老板只读；岗位任务端保持 Workflow 入口。L6 不变，尚无 UI runtime、菜单注册、客户投影、seed 或部署。

验证：本轮选择 T0/T1 静态与文档边界验证；未修改前端、菜单、客户配置、后端 runtime 或数据库，因此没有用 lint / style:l1 / 浏览器 / PostgreSQL / full / strict 冒充已实现证据。下一切片门禁已明确为 API wrapper / mapper unit、独立 L1、真实后端 L2、PMC / 生产 / 老板 / 无权限 / super_admin 角色 smoke，以及前端全量和 full / strict。

下一步：只进入 production order UI / 通用菜单注册独立实现；实现前先证明销售订单行和 BOM API 能提供可读业务选项。不得显示 raw ID，不顺带修改 yoyoosun 客户配置、seed、Workflow、production facts、部署或 `MATERIAL_ISSUE / REWORK`。

阻塞/风险：现有 list API 只返回订单头，首版列表不能展示产品 / 数量 / 完成量摘要；如确需这些字段，应先评审后端受控 read model，禁止 N+1 或前端拼接。共享工作区仍有大量其他会话未暂存改动，本轮未 stage、commit 或 push。

## 2026-07-12 生产订单可读选项真源评审

完成：只读核对产品、SKU、单位、销售订单行和 Active BOM 的 API、repo、分页、RBAC、模块与返回字段。产品/SKU/单位/BOM 底层查询可复用，但现有公开接口组合不能安全承接生产订单表单；销售行缺跨订单搜索、销售单号、父单状态联查，PMC/生产也没有所需的完整销售行/BOM页面权限。

完成：评审确定先新增 production_order 域分页只读 option API，复用 `pmc.plan.read` 与 production readable gate，只返回生产计划所需可读投影，不扩大完整销售/BOM权限。同步收口产品→SKU/单位、销售行自动带值、Active BOM 产品归属、来源切换清值、历史批量回显和无 N+1 合同；发现保存/发布还须同事务补 active 销售订单 + open 行复核。

验证：T0/T1 文档与静态代码证据；未改 runtime、UI、菜单、seed、客户配置或数据库，未运行浏览器/PostgreSQL/full/strict。下一步先完成 option API 与销售来源 eligibility 后端切片，通过后才进入 UI。

阻塞/风险：当前不能用全量拉取、本地 join、mock fallback 或 raw ID 控件绕过缺口；共享工作区仍有其他会话改动，本轮未 stage、commit 或 push。

## 2026-07-12 AGENTS 体积自动门禁

完成：先将上一轮 Skills/AGENTS 治理记录归档到 `docs/archive/progress-2026-07-12-before-agents-size-gate.md`，再为全局和项目 AGENTS 增加 16 KiB 预警、超过 24 KiB 阻断和固定治理优先级；新增 `scripts/qa/agents-size.sh` 并接入 fast QA，检查只报告/阻断，不自动改写。

下一步：新增长期规则前先判断属于 AGENTS、正式 docs、Skill 还是自动化门禁；达到预警线先治理再扩写。

阻塞/风险：本轮不改 runtime、schema、业务事实、部署配置或客户数据；大小门禁不能替代语义审查，共享工作区其他改动未纳入本轮。

## 归档索引

## 2026-07-12 权限中心岗位能力可读化

完成：权限中心角色模板接入后端现有 `menu_options` 投影，在不新增菜单权限真源的前提下，按当前勾选即时展示“可以进入 / 暂不可进入”的桌面菜单，并把功能勾选区改为甲方可理解的岗位能力说明。页面同时明确字段显示属于当前客户页面配置，不把尚不存在的字段级角色授权伪装成可配置能力。未保存状态不再常驻展示大块警告，只保留轻量状态；切换角色、切换 Tab、侧栏离开页面、刷新当前页和浏览器刷新时才确认，取消继续编辑，确认后丢弃草稿再执行动作。

验证：权限中心可见技术字段守卫 53/53、定向 ESLint、定向 Stylelint、`permission-center-desktop` 与暗色 loading/恢复态 style:l1、相关文件 `git diff --check` 均通过；浏览器证据覆盖角色能力视图、长菜单列表、账号 tab、窄区不横向溢出和暗色可读性。

下一步：后续若要让甲方逐字段查看或调整，必须基于 customer config 已接通的字段 surface 单独建设“页面字段配置”控制面；不能塞进角色 RBAC，也不能把当前仅三个列表 / CSV surface 的 `visible` 扩大表述为全页面字段权限。

阻塞/风险：本轮未修改 RBAC、schema、migration、后端菜单映射、客户字段策略、Workflow / Fact 或部署。共享工作区仍包含大量其他会话改动，提交时必须精确审查本轮文件。

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
- `docs/archive/progress-2026-07-12-before-agents-size-gate.md`：自定义 Skills 与项目 AGENTS 首轮治理过程记录。
