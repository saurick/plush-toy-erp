# plush-toy-erp progress archive — before Workflow source task producers

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。
## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 2026-07-17 写入重试与防重放边界定案

完成：正式定案为不新增写入口语义 hook、不补全量 receipt；`trace_id / request_id` 只负责链路关联，不作为业务防重放凭据。高影响 Source Document、Fact、Workflow 继续由现有领域幂等测试和 affected / full / strict 门禁保护。

完成：登记三个后续观察项：管理员密码重置、角色和手机号变更的结果未知语义；普通业务附件上传去重；公开 `workflow.create_task` 进入正式 UI 或其他正式生产者后的 replay 合同。

验证：本轮按 docs-only 范围核对治理真源、现有高影响幂等要求和门禁接线；没有修改 schema、API、hook 或运行行为，也不以静态关键词扫描冒充语义验证。

下一步：仅在出现自动重试、外部接口或多个正式生产者、真实重复 / 结果未知事故、或多人协作持续漏检时，重新评审对应入口的局部策略或显式 mutation registry。

阻塞/风险：当前无交付阻塞；内部系统降低了暴露面，但不等于天然具备重放安全。上述三项是有触发条件的延期事项，不是“已经保证安全”。未 stage、commit、push 或 deploy。

## 2026-07-17 甲方生产流程与 IQC 边界复核

完成：按甲方再次确认的流程，将 `布料加工 → 裁片检验 → 车缝 → 皮套检验 → 手工 → 成品检验 → 包装入库 → 放行发货` 收口为 yoyoosun 客户业务基线。车缝和手工明确为前后工序，不是二选一；两道工序分别由生产经理决定本厂或外发。客户配置仍保持 `preview_only`，工序档案排序只表示列表展示，不冒充生产路线、WIP、工序拆量或分段质检 runtime。试用数据已调整为同一销售订单的车缝回货、质检合格、再下手工单，并用可比较日期锁定顺序。

完成：采购链统一为收货草稿及行级 IQC 先建立，全部合格 / 让步接收后才能 `POSTED` 并影响库存。首次到货 IQC 不合格只阻止本单入库，现有采购退货只适用于已入库后追加检验不合格。质检页不再依赖有分页上限的收货列表判定退货资格，而是按选中质检的来源收货 ID 精确读取最新状态；无法确认时 fail closed。已补“来源不在首批列表”、已入库追加判退和首次 IQC 禁止退货的真实浏览器回归。

验证：客户配置 / 闭环 / 文档 / 隔离定向 Node 组合 71 / 71，最终 yoyoosun 闭环与文档子集 27 / 27，Web 工序 / 质检定向合同与工具测试 13 / 13，Go 核心演示数据和工序弹性标记用例通过。真实 Chromium 分别通过工序边界表单与采购判退窄屏场景，两者均完成溢出检查。

下一步：若要把客户确认流程升级为可执行能力，需另行评审生产路线、WIP 转移、同批拆量 / 改派、逐工序数量守恒、分段质检以及首次 IQC 不合格的退厂处置单；不从本次流程图直接推导新 schema 或客户专属 usecase。

阻塞/风险：共享工作树当前 371 个变更文件被 `affected --plan` 保守判为 T8，本轮没有冻结整树执行 `full / strict`。全页组合浏览器场景在到达工序页前被任务外 `SKU 单重（克）` 排序守卫阻断，本轮改用独立工序场景取得页面证据。未改 schema / migration / RBAC / 菜单，未发布 customer config，也未 stage、commit、push、deploy 或客户签收。

## 2026-07-17 按来源单据记录粗略不良率

完成：在既有 `quality_inspections` 事实中增加成对可空的 `defect_rate_operator / defect_rate_percent`，以 `APPROX` 表达约等于、以 `GT` 保留“大于”语义；提交新判定时必须成对提供并满足范围约束，历史记录保持空值且不猜测回填。`finished_goods_quality.decide` 在计算幂等指纹前先规范化比例，重放比较也纳入这两个字段，避免同一 receipt 在不同输入语义下被误判为相同请求。质检来源仍保持采购入库行 / 库存批次或对应已过账 Fact 的原有 grain，没有新增逐件不良数量，也不由比例推导 PASS / CONCESSION / REJECT、退货数量或库存变化。

完成：质量检验判定表单提供 `0% / 5% / 10% / 20% / 30% / 50% / >50% / 100% / 自定义`，自定义值支持最多两位小数；切换快捷档位会清除残留自定义值。列表、详情和 CSV 同时回显粗略不良率与可理解的来源单号，历史空值显示“未记录”。yoyoosun 投影矩阵、客户差异 / 交付文档、正式能力台账、人工验收数据和采购品质模拟脚本已同步；模拟数据仍明确是试用数据，没有写入真实客户事实。

验证：`make data` 确认 Ent 与 Atlas migration 零漂移，`db-guard`、`go build ./...` 和 `internal/core/... / biz / data / service / server` Go 测试通过；专用采购入库测试库按状态检查后 apply 三个待执行 migration，再读回为 79 files / 0 pending，PostgreSQL 关键事务 154 / 154、粗略不良率结构与约束定向用例 1 / 1 通过。前端粗略比例合同 23 / 23、相关人工验收 / 模拟调用合同 57 / 57、客户配置与文档合同 77 / 77、完整 ESLint 和生产构建通过；390px 暗色真实 Chromium 场景 1 / 1 通过，覆盖自定义 `37.5%`、切回 `>50%`、RPC 参数、列表回显、来源单号、溢出和控制台错误。

下一步：只在归属明确的开发库或目标环境按发布流程执行 `migrate_status -> migrate_apply -> migrate_status / 结构读回`，再由品质岗位用真实来源单据验收档位、自定义比例、历史空值、列表 / 详情 / 导出和判定结果；首次 IQC 到货拒收处置、分段质检和缺陷字典仍需独立评审。

阻塞/风险：共享开发库和目标环境均未 apply 本轮 migration，未 stage、commit、push、deploy 或完成客户岗位验收。完整 Web 测试为 1359 / 1362，3 个失败分别来自任务外的开发能力台账计数、未登记的加工合同 / 供应商字段联动场景和委外页面“对象类型”可见文案；本轮定向合同、lint、build 和浏览器场景均绿色，未修改这些并行现场，也不把定向绿色外推为整树门禁、发布或客户签收。

## 2026-07-16 加工汇总与加工厂资料逐字段闭环

完成：逐列复核客户私有来源“加工 成慧怡.xlsx”的 20 列委外加工汇总和 13 列加工厂商资料。委外行新增独立 `processing_item`，不再把“加工项目”混入工序；供应商新增经营 / 加工地址和可加工工序多选关系；产品 / 材料行都保留来源产品订单编号。JSON-RPC、biz、repo、Ent、页面表单 / 详情 / 导出、加工合同和外发作业指导书已同步，供应商能力更新按缺省保持、空数组清空、非空数组替换处理。

完成：受控提取器将加工项目、正式工序候选、供应商能力、外部联系人和公司对接人分流；厂商序号不再当供应商编码，非日期回货说明不写日期，手机与座机分栏，银行卡只输出存在 / 已脱敏标志。真实 manifest 校验 17 个来源、5 个结构化来源通过，最新 review-only 提取共 6133 条候选；目标工作簿得到 1216 条委外行、105 条厂商资料行、97 个唯一供应商—工序能力候选，95 条银行卡来源均未输出原号。完整 33 列状态和不落库原因已写入客户字段映射评审；空白用料列不制造单值字段，回货量 / 差异继续以已过账 Fact 和动态计算为真源，空白开票字段与银行卡仍留在 finance / 私密评审边界。

验证：`make data` 最终零漂移，`db-guard` 通过；本轮字段链显式 biz / data / service 用例分别 3 / 3 / 5 通过，扩大到 `Supplier|Outsourcing|MasterData` 的 data / service 定向范围也通过。Node 24 相关合集 176 / 176、提取器 9 / 9、完整 Web lint 和生产构建通过；加工合同打印纸面场景与表单场景通过，供应商新建 / 编辑、地址、可加工工序和溢出检查的真实浏览器段通过。`git diff --check` 通过。

下一步：仅在归属明确的开发数据库按 `migrate_status -> migrate_apply -> migrate_status / 结构读回` 应用 `20260716153928_migrate.sql`，再用实际岗位完成供应商维护、加工合同保存 / 打印和回货记录人工验收；发布与客户签收仍需绑定 commit / image 单独取证。

阻塞/风险：migration 已生成但未 apply；没有自动导入真实客户行，也未 stage、commit、push、deploy 或客户签收。共享工作树 300 余个变更文件被 `affected --plan` 保守判为 T8，本轮没有冻结整树并执行最终 `full / strict`，因此定向绿色不能外推为整树门禁、目标环境或客户验收完成。

## 2026-07-16 看板中心与任务处理流程重设计

完成：工作台、任务看板、异常处理和业务看板统一为“列表 / 队列 + 当前记录详情 + 单一主动作”的主从工作区。任务看板把指标、组合筛选、两列泳道和当前任务详情收进稳定网格，修复宽屏泳道与筛选区覆盖右侧操作的问题；业务看板只把阻塞与到期计入“需要关注”，真实 0 与统计不可用继续分开；异常处理移除装饰性流程阶段，退回终态只在已结束与追溯中保留，不再冒充活动风险。看板进入 Workflow 专页时会用 `link_keyword` 预填来源筛选，避免跳到相关业务后仍找不到原任务。

完成：任务抽屉改成可直接点击的“核对任务 → 选择处理 → 确认与提交”三步流程，催办只是处理方式之一，不再承担进入第二步的导航职责。步骤和处理方式支持方向键、Home / End 与 roving focus；确认步骤受动作、原因和权限校验约束；只读 / 权限确认中原因在第一步可见。提交从取得同任务 mutation lease 起立即锁定关闭、步骤、表单和入口，并对任务、版本、动作、权限与原因取同一快照，异步返回只关闭原任务抽屉，未知结果保留重试现场。

完成：重新评审开发态原型总览并登记 26 项资产（16 个 HTML、10 个 PNG）。本轮重做后台工作台、任务中心、业务管理中心、Workflow 任务处理、指标卡语义和岗位任务端 v2 原型，补四张方向图；旧岗位任务端 v1 只作为 `Current` 参考，其余新方案继续标为 `To Implement` / `Draft`，没有因局部运行时代码已吸收就虚报整套原型已实现。

验证：仓库锁定 Node 24.14.0 下，任务 / 看板 / 原型 / 文档清单定向 Node 合同 39 / 39、完整 Web ESLint、完整 CSS stylelint、目标 Prettier 和生产构建通过。基于当前构建产物的静态快照，9 个真实 Chromium 场景全部通过，覆盖工作台、任务看板桌面 / 移动 / 暗色宽屏、异常处理桌面 / 移动、业务看板桌面 / 移动 / 暗色；另外开发态原型查看器读回 26 项资产、状态、来源说明和 Workflow 流程样板。共享工作区曾有并行 HMR 重载打断自托管场景，改用同一构建快照复跑后 9 / 9，未把热更新中断记为产品失败或绿色证据。

下一步：由甲方按仓库、业务、财务等真实岗位做页面语言、信息密度和任务处理手感验收；确认后再决定是否继续吸收仍为 `To Implement` 的移动端 v2 与指标卡全站标准。若要提交推送或发布，须另行取得授权并冻结当前共享工作树，再绑定 commit / image 执行完整门禁、目标环境 smoke 与回滚验证。

阻塞/风险：本轮未修改 schema、migration、RBAC、Workflow / Fact 写入、菜单或客户配置，没有 stage、commit、push、deploy、写入 133 或客户签收；本地构建和浏览器绿色只证明当前工作树的前端实现与原型合同，不等于已经发布或交付。

## 2026-07-16 业务页任务入口收敛

完成：移除客户、供应商、产品、工序、单位五类基础资料页以及销售订单、BOM 上没有真实任务来源的空协同栏；生产排单、生产异常、出货放行三类 Workflow 专页继续由主任务表和动作区办理，不再重复挂载第二套任务栏。业务页局部协同入口只保留在采购订单和加工合同，并且只读取当前选中记录、尚未结束的 Workflow 任务；未选中、无读取权限、加载中、加载失败、真实零条或全部终态时不渲染固定栏，不再显示虚假的 `待办 0 / 阻塞异常 0`。

完成：采购与加工合同按精确 `source_type + source_id` 查询，并复用最新请求协调器处理显式加载状态、无权限短路、切换记录取消旧请求、迟到响应失效和统一错误提示；任务刷新为终态或已不在当前结果时会关闭旧处理抽屉，仍为活动态时同步最新版本。跨记录、跨模块任务统一进入任务中心；库存、出货、财务等 Fact 动作仍在对应业务页办理，Workflow task done 不冒充事实完成。展开态协同栏回到正常文档流，避免遮挡表格分页；移动端收敛为当前记录标题、待办数、展开和任务中心入口。对应 `To Implement` 原型、开发态原型索引和页面自动化合同已同步。

验证：锁定 Node 24 下定向 Node 合同 76 / 76 通过，其中可执行行为覆盖无读取权限零 RPC、请求失败清除旧任务、A / B 快速切换迟到响应失效及抽屉终态关闭；目标 ESLint、CSS stylelint、场景语法和 `git diff --check` 通过。6 个真实 Chromium 场景覆盖无入口页面、采购 / 加工合同当前记录、移动端、暗色主题及 Workflow 只读 / 无权限态；请求协调器接入后另复跑采购 / 加工合同桌面与移动端 2 / 2。原型另验证桌面三种记录状态和 720px 窄屏，无横向溢出。共享全页组合场景仍被任务外 `SKU 单重（克）` 排序守卫阻断；全量 Workflow 边界组合另有任务外 Dashboard 动作合同 2 项和采购收货状态守卫 1 项失败，这些不计入本切片绿色证据。

下一步：若进入提交与发布收口，先冻结并分离当前共享工作树，再执行最终整树 `full.sh / strict.sh`、目标环境部署与岗位验收。

阻塞/风险：`affected --plan` 基于共享工作树 217 个变更文件保守判为 T8；本切片未修改 schema、migration、RBAC、菜单或 Fact 写入，也未 stage、commit、push、deploy 或客户验收。共享场景文件仍有任务外 ESLint / Prettier 差异，已保留现场，未用全文件格式化覆盖并行改动。

## 2026-07-16 产品图片与工程打印自动带图

完成：产品基础信息页新增 `产品图 1（主图）/ 产品图 2（辅图）` 两个固定媒体槽，可维护 0–2 张 PNG / JPEG / WEBP；选择、替换和清空先留在当前表单会话，产品保存成功后才按 `product + product_image + primary|secondary` 写入，保存期间禁止取消、关闭或 ESC 退出。服务端复用业务附件存储，但以产品媒体而非不可删除证据解释同槽替换 / 清空；写入要求 `product.update`，事务锁定产品行，partial unique index 约束每产品每槽最多一行。图片在 5MB 上限内还会执行完整格式解码，限制单边不超过 8192px、总像素不超过 2000 万，并给出可行动的格式、内容和尺寸提示。

完成：BOM 页面生成物料明细或作业指导书时，会读取当前产品主图 / 辅图并冻结到本次打印草稿右上角；只有辅图时归一到第一图片位，无图保持合法空白，已登记图片读取失败则阻止打开残缺草稿。委外订单只有全部有效产品明细都归属同一产品时才自动带图，多产品或产品关联不完整时不猜首行并提示人工核对；打印窗口的临时替换 / 清空不反写产品主档，已打开草稿也不随主档后续变化。

验证：`go test -count=1 ./internal/biz ./internal/data ./internal/service ./internal/server`、`go mod verify`、`bash scripts/qa/db-guard.sh` 均通过；产品图片 / 打印定向 Node 32 / 32、相关 ESLint / stylelint、Vite production build 通过；`product-image-slots-desktop`、`product-image-slots-mobile`、`engineering-print-workspace-row-buttons` 三个真实 Chromium 场景通过，覆盖 0–2 张、取消不写、保存期不可关闭、主图上传 / 辅图清空、双图右上角布局与无横向溢出。

下一步：在归属明确的开发数据库按 `migrate_status -> migrate_apply -> migrate_status / 结构读回` 应用 `20260716145704_migrate.sql`，再用真实 RPC 上传两张实际产品图，分别从 BOM / 委外入口打开草稿并导出 PDF 核对；发布、目标环境 smoke 和客户岗位验收继续作为独立证据。

阻塞/风险：当前 migration 已生成并通过静态门禁，但共享开发库只确认存在 pending，未获授权 apply；未提交、推送、部署或客户验收。共享工作树的全量 Web Node 当前为 1306 / 1307，唯一失败来自任务外 `DashboardPage.jsx` 新增“风险任务队列”触发可见文案门禁；全量 CSS 被任务外 `dev-task-actions.css / task-center.css` 的 selector 门禁阻断，文档清单也被任务外新增的两个 prototype README 尚未登记阻断，因此本切片不能宣称 `full / strict` 全绿。

## 2026-07-16 Ent migration 会话收口与暂存门禁

完成：项目 `AGENTS.md` 将 Ent schema 变更收口固定为 `make data` 生成与审查 Ent 产物、versioned migration 和 `atlas.sum`，再执行 `db-guard`；缺 migration 或生成零漂移证据只能报告 `incomplete`。`migrate_apply` 与生成门禁分离：只对已确认归属的本地/隔离开发库按 `status -> apply -> status / 结构读回` 执行，共享、测试、生产或归属不明库仍需先确认。

完成：`pre-commit` 在已有 staged index 快照内强制执行 `QA_BASE_RANGE=HEAD...HEAD` 的 `db-guard`，只检查本次暂存 transition；守卫不可通过环境中的 `SKIP_DB_GUARD=1` 被静默跳过，且保持 check-only，不运行 `make data`、`migrate_apply`或 `git add`。集成回归用真实 `db-guard` 先证明只暂存结构 schema 时 hook 失败，再证明补齐对应 migration 与 `atlas.sum` 后同一 staged 变更通过。

验证：`node --test scripts/qa/db-guard.test.mjs scripts/git-hooks/pre-commit.test.mjs` 29 / 29 通过，0 fail / 0 skip；`bash -n`、定向 shfmt / shellcheck、Node 语法、`git diff --check` 和 AGENTS 体积门禁通过，当前项目 `AGENTS.md` 为 12,554 bytes。`affected` 将仓库级 hook 变更保守归为 T8；定向绿色不替代推送前最终冻结树的 `full.sh`。

下一步：后续任务只要修改 Ent schema，就必须在本轮内完成生成、migration 审查、静态守卫和 apply 状态报告；提交推送前仍按最终整树执行 `full.sh`。

阻塞/风险：本轮没有修改 Ent schema 或 migration，没有 apply 任何本地、共享、133 或生产数据库；共享工作树中已有的净重 schema / migration 与手工验收改动均原样保留，不属于本轮成果。本轮未 stage、commit、push、deploy 或客户验收。

## 2026-07-16 全页面验收数据同源生成与密码范围收口

完成：新增唯一 `manual-acceptance-dataset-runner-v1`，local 与 `customer-trial-133` 共用同一串行阶段 registry、target-free 业务输入和严格组件回执；目标 adapter 只提供 endpoint、数据库身份、凭据、确认串、attestation 与报告目录。顺序固定为 `core → role → source → task → facts → purchase-quality → attachments → readiness`：先通过 admin 只读 RPC 回读 `debug.capabilities.databaseName`，并精确核对 `SIM-PLUSH-CORE-PCS` 和四个稳定仓库码，再允许任何账号或业务写入。local apply 必须显式提供非 8300 的专用后端、`plush_erp_acceptance_*` 数据库名及数据库绑定确认串；运行态数据库名不一致时 fail closed。默认 runner 不再执行不绑定后端的 core / role seed shell；十个正式岗位账号缺失即阻断，三类异常账号统一由 account-scenarios 正式 API 调和。采购收货与质检只从同批 facts 报告派生，不再保留独立造数分支；任务远端门禁改为 migration floor + 当前运行态 / 读回，不再把历史 review commit 当作唯一允许 release。

完成：新增 48 个正式页面的数据归属合同，每页只能消费共享 `role / source / task / facts / catalog` 阶段及其 readback probe；漏页、重复页、孤立 probe、页面自有 builder / 脚本或阶段入口分叉全部 fail closed。双环境 dry-run 得到同一 semantic digest `2836b37bf723a43fae94a49cf1cdc04610cec0f46441c458c9a1fffcf5ecb9b4`，数据库 ID 仍各自独立。管理员与演示账号的创建、初始化、重置和生产 preflight 密码范围统一为 8～20 个 Unicode 字符且 UTF-8 编码后不超过 72 字节；登录既有账号不因该创建策略被前端提前拦截。

验证：Node 24 手工验收与 production preflight 定向测试 252 / 252、相关 Go 7 个包通过。`bash scripts/qa/affected.sh --run` 判定 41 文件 / T8 并完整通过 full；最终 `bash scripts/qa/strict.sh` 也从头通过：scripts Node 1021 / 1021、Web 合同 195 / 195、Web 全量 1258 / 1258、关键 PostgreSQL 154 / 154、server-all 2097 / 2097、真实 Chromium、Web / Go build、shellcheck、shfmt、yamllint 与两次 govulncheck 均通过，0 fail / 0 skip。较早一次漏洞库刷新曾遇到瞬时 `EOF`，随后单独复检和两轮完整门禁均确认 0 个可调用漏洞，未跳过检查。

下一步：取得提交推送与发布授权后，先冻结 commit / image / migration；再让专用本地验收后端绑定独立验收库执行 v3 并读回，随后部署同一不可变版本到 133、重放同一 semantic digest，补 readiness / browser / PDF 证据。确认 v3 完整后，133 旧 v1 批次只按生命周期退出，不物理删除。

阻塞/风险：当前 `8300` 指向共享开发库，不能作为专用验收写入目标；133 当前仍是 v3 配置配合 v1 数据，缺同批 v3 facts / attachments / readiness 证据。本轮未写本地或 133 业务数据，未提交、推送或部署，不能把代码和本地门禁绿色写成目标数据已同步或客户验收完成。

## 2026-07-15 本地开发端口与并行启动治理

完成：本仓新增受版本控制的 `config/dev-ports.env`，固定主前端 `5175`、HTTP `8300`、gRPC `9300`、Style L1 `6175`，并独占 `15200-15299` 作为短生命周期 AUX 段。Make、Vite、开发态 Go override、yoyoosun 入口、预览与浏览器脚本统一消费该真源；具体 dev 配置文件和 Kratos 支持的 dev 目录参数均能识别，主服务端口冲突直接失败，不再静默顺延。`dev_stop` 只停止 cwd 属于当前仓库的 listener，拒绝误杀其他项目。`full.sh` 只在 AUX 段探测空闲端口，并用原子 PID 锁串行化同一 worktree 的浏览器证据；活动锁和 stale lock 均 fail closed，只有实际 owner 的 EXIT 清理能移除本轮锁。

完成：同级 7 个带 `make dev` 的仓库均已登记互不重叠的固定 bundle；`webapp-template` 提供创建时顺序分配与兄弟仓只读审计，新模板派生项目在初始化时取得下一组固定端口、同步 dev YAML fallback，并由 parity 门禁阻止正式文档复制端口数字，日常运行不自动漂移。短期 preview、测试和 dashboard 只能使用各自 AUX 段，OAuth callback、主前端和后端继续保持稳定 origin / callback。

验证：兄弟仓审计检查 7 个 manifest 通过；本仓端口、CLI、门禁编排与锁行为定向测试 17 / 17，ShellCheck 与 Bash 语法检查通过。真实 Chromium 在 `15200` 自启当前 worktree，完成 `root-redirect-desktop` 1 / 1，并验证进程归属与 EXIT 后锁清理。最终 `bash scripts/qa/full.sh` 完整通过，包含脚本自动发现 1010 / 1010、Web 合同 195 / 195、Web 全量 1258 / 1258、server-all 2085 / 2085、关键 PostgreSQL、存量升级、production build、真实浏览器、Go build 与 govulncheck，全部 0 fail / 0 skip。首轮 full 曾因并行净重字段尚未生成 Ent 代码阻断；生成现场补齐后复跑全绿，未把首轮中间状态冒充最终结果。

下一步：各项目现有开发进程在下次重启后消费固定端口；部署与客户验收仍是独立交付步骤。

阻塞/风险：Git 收口范围仅限端口治理相关路径，共享工作树中的净重字段、migration、业务代码和页面改动保持未暂存；未部署或修改生产配置。固定端口解决跨项目抢占与误杀，不等于当前所有服务都已启动；AUX 端口只保证项目级隔离，单仓内并行消费者仍须通过分配器或门锁协调。

## 2026-07-15 密码登录精确提示部署收口

完成：commit `56ecf873` 已推送并以本地构建的 amd64 server/web 镜像加载到 `192.168.0.133`。目标应用数据库已显式核对为 `plush_erp_uat_20260715`，Atlas 为 75 / 75、pending 0；UAT 备份、镜像 digest、旧 release `929ec0b3` 回滚点均已保留。客户试用配置通过标准 validate / publish / activate / effective-session readback 升级到 v3，未直接写配置内容。`admin` 已设置新的生产强密码、撤销既有活动会话，密码只存 macOS Keychain；应用 JWT 签名密钥已轮换并同步当前与回滚 release。

验证：新镜像冷启动、生产预检、health / ready、客户配置读取均通过，最终复核 server/web restart count 为 0、web healthy，公网 health 返回 `ok`。公网 API 已分别确认不存在账号返回 10001 / `账号不存在`、旧开发默认密码返回 10002 / `密码错误`、新密码返回业务码 0 且签发 token；真实 Chromium 页面确认前两类提示与 API 一致。完整操作证据见 `deployments/yoyoosun/evidence/releases/2026-07-15/deployment-operation-evidence.md`。

下一步：由甲方使用实际岗位账号完成业务人工验收；账号所有者在阿里云控制台轮换短信 AccessKey 后，再更新目标环境密钥并复核短信登录。

阻塞/风险：代码、制品、migration、客户试用配置、管理员密码登录和公网提示已闭环；正式客户签收尚未发生。阿里云 AccessKey 属于外部账号资源，本轮无法代替账号所有者完成控制台轮换，不得将其写成已处置。

## 2026-07-15 密码登录错误精确化

完成：线上只读复现确认 `admin.yoyoosun.net` 服务健康，`admin` 使用本地开发默认密码登录失败的内部原因为 `password_invalid`；生产账号不继承本地开发默认密码，且启动不会覆盖已有账号密码。密码登录现按账号不存在、密码错误、账号停用、账号注销和核验期间账号信息变化返回独立错误码与岗位语言提示；短信登录继续保留防手机号枚举合同。未重置或读取线上真实密码，未改目标数据库、配置、账号或会话。

验证：当前 13 文件影响面按 T0-T5 执行 `bash scripts/qa/affected.sh --run` 全部通过：docs inventory 3 / 3，server domain、server-all、server API / JSON-RPC 三组均通过，Web 全量 1255 / 1255、lint、场景语法和 `git diff --check` 通过；错误码生成 / 同步门禁通过。`admin-login-password-errors-desktop` 真实 Chromium 场景 1 / 1 通过，依次核对账号不存在、密码错误、账号停用、账号注销和账号信息变化五种提示，并确认最长提示无截断或布局溢出；`admin-login-mobile` 默认态也已生成本轮基线截图。

下一步：如需上线，先收敛当前工作树并绑定 commit / image 执行正式发布，再在目标环境验证五类密码登录拒绝态；如需恢复 `admin` 登录，应通过受控密码重置设置新的生产强密码，不能使用 `adminadmin`。

阻塞/风险：精确的账号不存在提示允许公开调用方枚举账号；当前只有服务级 BBR 限流，尚无按账号 fingerprint 与可信来源共享的密码登录限速。本轮未提交、推送、部署或执行线上密码重置，当前公网页面仍保持旧的合并提示。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
- `docs/archive/progress-2026-07-12-before-agents-size-gate.md`：自定义 Skills 与项目 AGENTS 首轮治理过程记录。
- `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：本地管理员默认凭据稳定化前的完整过程记录；归档前为 395 行 / 81,622 bytes。

## 2026-07-15 来源驱动业务闭环全工作树收口

完成：复核原 Codex 任务、其引用的 GPT 会话和最终全工作树差异后，按生产、委外、销售、采购、质量、出货与财务来源动作的既定边界完成收口。数据库守卫现已正确处理 PostgreSQL 63-byte 标识符截断；生产 / 委外 / 财务事实补齐只读来源编号；出货在真实发货事务内重新锁定并刷新销售来源金额快照；质检退供应商与质量门禁统一锁顺序；销售预留页面按订单剩余量、已生效预留和已出货量 fail closed。委外回货 transport 校验不再把缺失的 SKU 上下文误判为明确无 SKU，同时保留页面真实来源行与材料发料的严格 SKU 边界。

完成：Ent / Atlas migration 链为 75 个文件，`make data` 前后内容指纹一致；隔离 fresh 数据库从 0 应用到 75，upgrade 数据库从 74 升到 75，个人开发库也已升至 75 / 75、pending 0。yoyoosun preview 已纳入生产订单菜单及所需岗位动作，当前 manifest 为 17 个模块、9 个角色、197 个 entitlement；`pnpm start:yoyoosun` 已通过 database、backend health / ready、customer config / asset 预检并启动 Vite，验证后停止本轮测试 Vite，未执行 customer config publish / activate。

验证：来源驱动 Style L1 的 12 个页面场景覆盖 13 个业务方法并全部通过；关键 PostgreSQL 门禁 154 / 154、server-all 1917 / 1917、web-all 1211 / 1211、脚本自动发现 862 / 862，均为 0 fail / 0 skip。production build 完成 3281 个模块，lint、CSS、shellcheck、shfmt、yamllint、零 warning、Go build、govulncheck、docs inventory、`bash scripts/qa/full.sh` 和 `bash scripts/qa/strict.sh` 均通过。

下一步：提交后仍须以该 commit / image 为目标环境发布真源，串行执行发布 migration、health / ready、业务 smoke、回滚点记录、yoyoosun 配置发布 / 激活以及真实岗位人工验收。

阻塞/风险：本地代码、migration、运行预检和自动化门禁已闭环，但本轮没有部署目标环境、没有发布或激活 yoyoosun draft config，也没有取得客户签收。12 个来源驱动浏览器场景使用 current-worktree mock RPC，不能替代真实岗位账号对 13 个后端方法的持久写入 E2E。完整付款 / 核销、多单对账、总账、税控、完整 MRP / APS / MES、任意库存调整和 WMS 仍为明确非目标。

## 2026-07-15 委外 SKU 与本地客户工作台收口

完成：委外回货事实现在由后端按完整来源元组 `OUTSOURCING_ORDER + source_id + source_line_id + product_sku_id` 批量读取委外订单来源行的 `sku_code_snapshot`；来源类型非规范、缺少父单或行、跨单同 SKU、SKU 不一致及历史快照缺失均 fail closed，不回填当前主数据，也不串用其他来源行。列表、首次创建、幂等重放、并发重放、过账和取消响应统一复用该只读投影。回货记录、回货质检和应付来源弹窗统一消费冻结快照；SKU 参照与委外相关事实均改为严格的 200 条完整分页收集，第二页记录不会再因后端默认上限丢失。

完成：修复 `start:yoyoosun` 与桌面客户门禁的开发态合同错位。前端 DEV 构建在后端成功返回同 customer key 的 `builtin_rbac_fallback` 时只挂载带明确警示的本地桌面预览壳，避免把成功登录误报为“暂时无法进入工作台”；fallback 仍不属于 active customer runtime，工作台、任务看板和客户业务数据页只显示零 Workflow RPC 的 Product Core 能力审阅，移动岗位端和正式构建仍只接受 `active_customer_config_revision`。真实 5177 登录态复核中 `admin.me` 与 `get_effective_session` 均为 HTTP / 业务成功，`/erp/dashboard` 显示“工作台 能力审阅”、不显示任务队列，且没有客户运行态不可用页。委外开单的材料 / 产品条件选择器增加稳定组件身份，消除相同数值 ID 在条件切换时复用旧 label 的 Ant Select 控制台告警。

验证：本轮追加前 `progress.md` 为 321 行 / 65,188 bytes，未达到 600 行或 80 KiB 归档阈值。Node 24.14.0 下 `go test -count=1 ./internal/biz ./internal/data ./internal/service ./internal/server` 通过；Web 全量测试 1219 / 1219、lint 和 production build 3283 modules 通过；docs inventory 与 dev-entry boundary 9 / 9 通过。合并 Style L1 6 / 6 通过，覆盖本地 fallback 工作台、持续同步失败 fail closed、委外开单第二页 SKU、委外来源回货、回货质检和应付来源；fallback 场景另断言 Workflow 请求数为 0，委外开单场景控制台无 warning / error。`local-runtime-preflight` 通过 schema / migration guard、开发库 75 / 75 pending 0、backend health / ready。

下一步：yoyoosun 客户配置包仍是 draft / preview-only；正式或静态预览环境必须完成受控 manifest 评审、publish / activate、effective session 读回及岗位人工验收，不能依赖本地 builtin fallback。目标环境发布仍需绑定本次 commit / image、migration、health / ready、业务 smoke 和回滚点。

阻塞/风险：本轮没有新增或改写 schema / migration，没有发布或激活客户配置，没有目标环境部署或客户签收。SKU Style L1 使用 mock RPC；后端来源投影与写入响应一致性由 repo / service 测试证明，尚未用真实岗位账号写入新的委外回货记录做浏览器 E2E。另一任务的时区、存量升级和客户版本锁治理已迁到独立 detached worktree，不纳入本轮提交或成果口径。

## 2026-07-15 永绅本地客户运行态可重复应用

完成：本地后端的 `make run / make dev / make dev_restart` 默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，显式 `ERP_CUSTOMER_KEY=demo` 仍可覆盖；`pnpm start:yoyoosun` 保持只预检和启动，不自动写库。登录后的开发控制台现在可在匹配的客户开发上下文与 loopback API 下，显式生成并应用内容寻址、长度不超过 64 的 `local_test_apply` revision。后端默认拒绝该 manifest 及其 check / activate / rollback，只有本地 Make 入口显式开放；gate 开启时启动预检使用 pgx 的最终连接配置，只接受 `192.168.0.106:5432` 的 `plush_erp` / `plush_erp_*_dev` 开发库，不受 `ERP_ALLOW_TEST_DB_AS_DEV` 影响，133、query override、multi-host fallback、其他数据库和 loopback tunnel 均拒绝。production 配置携带此开关也会失败，正式 validator / executor 同样拒绝该 marker。biz normalization 同步锁住 customer key / revision / product version 的 64 / 64 / 128 schema 长度和 local-test purpose / product identity 配对。应用链复用后端 validate / publish / transition / activate 或 rollback / effective-session readback，支持相同内容幂等重放及 A-B-A 回切；生产订单模块同时收口到独立 `production_orders` catalog / runtime gate，避免永绅 manifest 因模块依赖闭包漂移被拒绝。首次进入工作台时，`admin.me` 与有效配置只读请求会对 network / 非 4xx invalid response / HTTP 5xx / internal 瞬时错误按 200ms、600ms 做两次短重试；权限、认证、未激活配置和用户取消仍立即 fail closed，实例 active guard 同时阻止真实卸载后的旧请求回写，并让 React StrictMode 重挂载复用同一个 single-flight。

运行态证据：共享开发 PostgreSQL 当前 `yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1` 为 active，先前过长的测试 revision 为 superseded；同一 revision 重复应用成功且没有新增版本。真实 5177 管理员登录态完成编译、校验、发布、切换、激活和有效配置读回；随后 `/erp/dashboard` 不再显示“暂时无法进入工作台”或本地 fallback，永绅品牌、27 个页面投影、生产订单等业务菜单及真实工作队列正常挂载。

验证：Node 定向合同 109 / 109、`adminProfileSync` 36 / 36、Go `internal/biz + internal/service + cmd/server` 客户配置、生产订单、字段长度和 production fail-closed 定向测试、目标 ESLint、production build（3283 modules）和 `git diff --check` 通过；Style L1 首次同步 2 / 2，证明前两次 `get_effective_session` internal 失败后第三次成功且不显示阻断页，同时持续失败仍保持 fail closed。重启后的真实后端再次完成相同 revision 幂等应用与 active readback，真实浏览器另验证首次应用、dashboard 恢复与整页刷新。`affected.sh --plan` 将当前改动最高归为 T8，并要求 push 前由 `full.sh` 兜底；本轮没有把定向绿色写成 full / strict、正式发布或目标环境验收。

下一步：提交推送前在冻结工作树执行项目 Git 收口门禁，并与 detached worktree 中等待集成的全量测试治理补丁协调顺序；随后如要进入正式交付，再绑定 commit / image 独立执行正式 customer config publish / activate、目标环境 migration、health / ready、业务 smoke、回滚点和岗位人工验收。

阻塞/风险：当前本地配置写入的是共享开发库，active 切换会被其他同库开发者看到；严格并行隔离仍需独立 PostgreSQL。正式 publish / activate、目标环境部署和客户签收均未执行。当前改动尚未 stage、commit 或 push。

## 2026-07-15 BOM 人员字段文案明确化

完成：BOM 新建 / 编辑表单的 `maker`、`auditor` 可见标签由“制表 / 审核”明确为“制表人 / 审核人”，让工程岗位直接理解这里填写人员姓名。后端字段、保存与回显链路、打印纸面签字栏及审批流程边界均未改变；打印模板仍按单据习惯保留“制表 / 审核”。现有 `business-core-pages-desktop` 浏览器场景新增两项字段文案断言。

验证：使用项目锁定的 Node 24.14.0 / pnpm 10.13.1 运行 `pnpm lint` 与 Web 全量测试，1224 / 1224 通过，0 fail / 0 skip；`STYLE_L1_SCENARIOS=bom-person-field-labels-desktop pnpm style:l1` 通过 1 / 1。浏览器默认态确认“制表人 / 审核人”标签完整显示；长姓名与审核人聚焦态确认两个值槽均保持在字段容器内、输入值不丢失，截图为 `bom-person-field-labels-default.png` 与 `bom-person-field-labels-boundary.png`。大场景 `business-core-pages-desktop` 在到达 BOM 前被既有 SKU 单重列不可排序断言阻断，本轮不把它计为 BOM 失败或通过。

下一步：如后续需要把自由文本升级为人员选择器，应另行评审人员真源、历史快照和权限边界。

阻塞/风险：本轮只调整表单可见文案，不表示系统新增 BOM 审批流，也不改变历史数据。共享工作树中的其他会话改动均保留，本轮不提交、不推送、不部署。

## 2026-07-15 永绅本地、133 试用与存量升级三方收口

完成：把永绅可重复本地配置应用、133 隔离试用数据和全量测试治理三个切片合并为单一闭包。local-test 与 customer-trial 使用独立显式 identity / runtime gate；trial 分类器只占用 `customer-trial-` / `customer_trial_` 命名空间，不再把通用 `datasetVersion` 或本地 `local_test_apply` 误判为远端试用。两类 purpose / product 必须原子配对，本地身份夹带远端 `datasetVersion / target`、未知 trial 命名空间、未开放环境或目标数据库漂移均 fail closed。133 active revision 启动守卫改为通过已登记试用边界参数化查询 customer key，不在 Product Core data SQL 中硬编码客户规则。工作台首次 profile 同步只对 network、非 4xx 非法响应、5xx 和 internal 做 200ms / 600ms 短重试；认证、权限、未激活配置和卸载继续立即停止，React StrictMode 复用 single-flight。

完成：存量升级治理新增 `20260714055504` populated-upgrade 与 `20260714055825` customer-config-cutover 两项只读 preflight；线上 migration 固定为 status → 两项审计 → dry-run → apply，同一私有锁内任一失败即停止且不自动 DML。恢复演练、release evidence gate、critical PostgreSQL profile 和 affected/full 共同锁住跨 migration 的审计状态、版本、脱敏 artifact、回滚证据及非空测试执行；fresh schema、静态 DDL 和空库迁移不再冒充 populated upgrade 证明。永绅 Private 仓版本锁、Product Core 配置和正式发布仍保持各自真源，不因本轮合并形成运行时私有仓依赖。

运行态证据：133 隔离试用曾在数据库 `plush_erp_uat_20260715` 激活 `yoyoosun-customer-trial-133-package-v1.runtime-manifest-v1`，以同一 `2026.07.15-v1 / 20260715-V1` 语义数据生成 60 客户、60 供应商、80 材料、60 SKU、30 工序、销售 / 采购 / 委外 / BOM 各 45，以及 180 条 Workflow（ready 121、blocked 27、done 24、rejected 8）；source 与 task 重放均 0 新建、全量复用，Fact 保持 plan-only。该证据绑定旧基线 `929ec0b3` 的隔离试用镜像，不是本次最终集成 commit/image 的发布读回，报告仍为 `releaseReady=false`，不能写成正式部署或客户签收。

验证：Node 24.14.0 下 acceptance 定向 108 / 108、governance 定向 129 / 129、dashboard / local-test 合同 82 / 82，Go 7 包定向全绿；工作台瞬时恢复与持续失败两项 Style L1 为 2 / 2。最终隔离树 `affected.sh --plan` 识别 111 个路径、最高 T8；`bash scripts/qa/full.sh` 完整通过，包含脚本自动发现 935 / 935、Web 合同 194 / 194、server-all 2036 / 2036、fresh / populated-upgrade、关键 PostgreSQL、浏览器、lint / CSS、Go build 和 govulncheck，0 fail / 0 skip。首次 full 发现并阻止 data SQL 硬编码客户 key，参数化修正并补测试后复跑全绿。

下一步：取得提交推送授权后精确提交当前 111 个路径；再以新 commit 构建固定 digest 镜像，在 133 隔离验收库重新执行 migration、customer-trial publish / activate、数据重放、health / ready、岗位浏览器读回和密码轮换校验，替换旧基线 attestation。正式交付仍需走正式 customer config / release evidence、备份恢复、回滚点和客户签收，不能复用 local-test 或 customer-trial 开关。

阻塞/风险：本地共享开发库的 active revision 会影响同库使用者；133 当前 trial active revision 与模拟数据只属于隔离验收环境。最终集成树尚未 stage、commit、push、构建新镜像或重新部署，现有 133 证据不绑定最终代码；Fact 数据未写入，完整付款 / 核销、总账、税控和完整 MRP / APS / MES 仍不在本轮范围。

## 2026-07-15 业务看板数量真源治理

完成：业务看板后端数量收口为 20 模块只读 projection，每项固定返回 `module_key / available / total`。客户、供应商、产品与 BOM 读取 MasterData，销售、采购、生产与委外读取 Source Document，入库、库存、质检、生产、出货和财务读取各自 Fact；财务对账、应付、应收、发票按精确 FactType 分开计数。出货放行、生产排程和生产异常按 Workflow task group 计数，并复用 `workflow.task.read`、active / stored revision、owner / assignee 可见性。成功零值与暂不可用明确区分，不再从有界列表、前端状态分组或 Workflow payload 反推业务总量；相关 server 与原型 README 已同步四类独立口径、20 模块入口和 `get_task_board` 全量计数边界。

验证：最终共享工作树执行 `go test -count=1 ./internal/biz ./internal/service`，两个 package 均通过；Node 24.14.0 下看板 API / 页面 / 统计 / 任务展示合同 21 / 21、ESLint、CSS、三个 Style L1 脚本语法和 `git diff --check` 均通过。独立端口自托管 mock 的真实 Chromium 6 / 6 通过并人工核图，覆盖默认态 `191 / 135 / 0 / 93`、暗色、移动端、七位大数字、业务统计首次失败后刷新恢复、协同统计首次失败后刷新恢复及客户入口下钻；恢复场景会等临时提示层退出后再留图，避免把截图合成过渡态当成页面故障。全面试用模拟数据已经 ready；共享开发库只读核对的 Workflow 四个互斥泳道为常规待办 `55`、阻塞 `27`、到期提醒 `66`、已结束 `32`。这些数字证明当前模拟数据批次与全库只读投影可用于页面复核，不是客户真实业务事实或发布证据。

下一步：保持当前工作树不提交、不推送、不部署。若后续另行授权发布，须先冻结提交范围并补当前整树 full / strict，再绑定新 commit / image 对目标环境执行 migration、health / ready、业务 smoke、回滚点和岗位验收；`192.168.0.133` 当前只作旧基线试用数据与数量交叉核对，不能复用为本次页面代码的发布证据。

阻塞/风险：本轮没有 schema / migration 变化，没有 stage、commit、push、部署或新的 133 发布证据。当前 Fact 为 0 是本轮模拟数据边界，不代表 Fact 页面不可用，也不代表真实客户没有业务事实；`dashboard_stats` 任一已接入查询失败会整次 fail closed，协同模块没有 `workflow.task.read` 时显示不可用，均不应被解释为真实 0。

## 2026-07-15 明细列条数统一

完成：销售订单、采购订单、加工合同、生产订单、BOM、采购入库、出货单统一在“明细”列显示“箭头 + N条”；精确 0 显示不可操作的“0条”，未知显示“查看”，无权限不显示数量。五个按需读取域由后端对当前页一次 GROUP BY 计数，销售条数受 `sales_order_item.read` 约束；入库与出货复用随列表返回的明细数组。原重复计数列退出表格但保留 CSV。未改 schema、migration、RBAC、Workflow / Fact、菜单或原型状态。

验证：`go test -count=1 ./internal/biz ./internal/data ./internal/service` 通过；Node 24.14.0 下 Web 全量 1246 / 1246、lint、CSS 通过。Style L1 5 / 5 覆盖正数、0、未知加载、无权限、长数字、完整明细弹窗、移动暗色和入库列表列宽；生产与 BOM 也已锁定每页固定 3 次 SELECT，防止 N+1。

下一步：如需发布，先在共享工作树收敛提交范围，再绑定 commit / image 执行目标环境检查。

阻塞/风险：本轮未 stage、commit、push、deploy 或客户验收；共享工作树其他改动均保留，当前证据只证明本地 T3-T5。

## 2026-07-15 全站用户文案治理

完成：正式页面、登录、客户品牌及错误提示改用岗位业务语言，并扩展防回归扫描；未改数据、权限或路由。
验证：Web 1254/1254、lint、CSS、build 及浏览器 20/20 通过。
下一步/风险：如需上线须另行授权发布；浏览器使用本地 mock，未提交、推送、部署或客户验收。

## 2026-07-15 本地管理员默认凭据稳定化

完成：确认反复登录失败不是页面问题，而是人工验收密码批量轮换把稳定超级管理员 `admin` 与 `demo_*` 同批改密。登记开发库现在只在管理员字段未显式配置时使用 `admin / adminadmin`，`config.local.yaml` 和环境变量显式值仍优先；公共 dev 配置及本机私有覆盖均不再重复写默认凭据。启动初始化继续保持 create-only，不覆盖已有账号。人工验收批量轮换默认只处理 `demo_*`；133 如确需改稳定管理员，必须额外启用独立开关和目标绑定确认。本地新增无生产逃逸的专用重置命令，生产 Go 启动门禁和 shell preflight 均拒绝已知本地默认密码。复发后进一步定位到旧临时验收副本与主后端共用 `plush_erp_simon_dev`，其旧轮换器再次覆盖 `admin`；并发任务已停止该写入边界。普通角色演示 seed 已删除稳定管理员改密开关，数据层同时在事务前拒绝把 `admin` 当作演示账号创建或改密。

运行态与验证：已在登记开发库 `plush_erp_simon_dev` 再次执行 `make reset_local_admin_password`，认证版本递增、旧会话撤销；`8300` 直连及用户页面实际代理 `5178 → 8300` 的 `/rpc/auth admin_login` 均返回 HTTP 200、业务 code 0 和非空认证数据，响应输出未保存 token。应用内真实浏览器从 `/erp/admin/login` 填写默认凭据后进入 `/erp/dashboard`，页面显示“超级管理员 admin”，控制台无 error / warn。角色演示 seed / 密码事务定向 Go 测试通过，新增用例证明误传 `admin` 时在数据库事务前失败；production preflight 23 / 23、docs inventory 3 / 3、`project-scan --strict`、YAML 解析、bash / shfmt、定向 `git diff --check` 均通过。归档前 `progress.md` 为 395 行 / 81,622 bytes，原文以 SHA-256 `79bd024995cc15d9df6ddd66d54008deeb897ba960e8f25fe3ce83d9b0c0e1d3` 完整保存到新归档。

下一步：若要提交推送，先按共享工作树实际归属精确收敛本轮文件并执行冻结树门禁；若要发布，再绑定 commit / image 独立完成目标 migration、health / ready、业务 smoke、回滚点和岗位验收。

阻塞/风险：固定凭据只适用于项目登记的受信开发库，不适用于 133 或生产。已有账号不会被服务重启静默改回默认值，显式改密后应继续使用显式值；复制到临时目录的旧代码不会自动继承主工作区修复，验收任务必须使用隔离库或只使用 `demo_*`，不得再轮换共享库稳定管理员。本轮未执行全工作树 `full.sh` / `strict.sh`，未 stage、commit、push、deploy 或客户验收。

## 2026-07-15 全量工作树提交前收口

完成：冻结全部并行写入后，以共享 `main` 为唯一收口树，精确合并本地客户运行态、永绅试用模拟数据、业务看板、订单 / Fact 闭环、全站用户文案、管理员稳定凭据和全量测试治理。验收数据统一为 `2026.07.15-v3 / 20260715-V3`，本地开发使用独立验收库，轮换器默认只处理 `demo_*`；稳定超级管理员 `admin` 不进入本地批量轮换，133 的稳定管理员变更仍要求显式开关和目标绑定二次确认。合并时保留生产 / 委外明细计数、当前“业务管理 / 电脑端业务管理 / 手机端待办”文案、skill 健康检查与生产默认密码门禁，没有整包覆盖旧 worktree。首轮门禁发现的审计、移动任务、Workflow / Fact 和客户菜单旧文案断言已同步到“撤销、库存数量、基础资料、财务管理”等岗位语言，同时继续禁止 raw reason / summary 和技术 key 进入用户界面。

验证：`server/make data` 确认 Atlas migration 与 Ent schema 同步且无生成 diff；验收与客户配置 Node 定向 283 / 283、Go 7 个相关 package、文案 / Workflow / 审计定向 42 / 42、客户配置定向 20 / 20 均通过。最终 `bash scripts/qa/strict.sh` 完整通过，包含 scripts Node 1000 / 1000、Web 关键合同 195 / 195、Web 全量测试与构建、lint / CSS、自托管无头 Chromium、fresh / populated-upgrade 与关键 PostgreSQL、server-all 2075 / 2075、Go build、shellcheck、shfmt、yamllint、零 warning 和 govulncheck；全部 0 fail / 0 skip，migration preflight 为 pending 0、out_of_order 0。

下一步：按用户授权一次性暂存全部工作树、运行提交钩子、提交并推送 `main`；push 前由仓库钩子再次执行 `full.sh`。若后续要更新 133，必须基于新 commit / image 在隔离验收库重跑 migration、试用配置 publish / activate、v3 数据回放、health / ready、岗位浏览器读回与回滚验证，不能复用旧基线证据。

阻塞/风险：本轮不部署、不写 133、不轮换共享开发库稳定管理员，也不把模拟数据描述为客户真实事实或签收结果。目标环境发布与客户验收仍是提交推送后的独立事项。

## 2026-07-16 产品与出货净重统一为克

完成：产品与 SKU 单重、出货行确认快照、整单人工 / 自动 / 最终总净重的 schema、Ent、biz、repo、JSON-RPC、前端表单 / 列表 / 明细 / CSV、浏览器 mock、测试和正式文档统一从 kg 改为 g。新增 Atlas migration 原位重命名四组重量字段，并把已有非空产品、SKU、出货快照、总净重和幂等请求快照乘 1000；迁移在转换前检查 numeric 上限，禁止 Atlas 的删列重建路径。默认单位变化后的单重清空、SKU 优先 / 产品回退、缺任一行不计算部分总重、已出货快照冻结与取消保留边界不变。

验证：`make data` 生成并同步 Ent / Atlas；Go `internal/biz + internal/data + internal/service` 通过，定向重量纯逻辑、repo、JSON-RPC 和迁移结构测试通过。一次性 PostgreSQL populated migration 演练从旧 revision 写入 `0.425 kg / 4.25 kg / 9.9 kg`，升级后读回 `425 g / 4250 g / 9900 g`，旧 kg 列不存在，临时数据库已删除；fresh PostgreSQL 的产品 / SKU / 出货约束和真实出货冻结 3 / 3 通过，0 skip。项目锁定 Node 24.14.0 下 Web 全量 1258 / 1258、lint、CSS 通过。组合 Style L1 被既有 SKU 单重列排序入口断言提前阻断，不计为本轮通过；已改用独立 `shipment-net-weight-desktop` 场景复核出货净重页面。

下一步：目标环境发布前必须绑定 commit / image，先备份并执行 migration dry-run / apply，再核对产品单重与历史出货快照抽样、health / ready、业务 smoke 和回滚点；迁移未 apply 的环境不能运行新 API / 前端合同。

阻塞/风险：本轮未修改材料采购等独立的千克计量单位，也未自动 apply 到共享开发库、133 或生产；未提交、推送、部署或客户签收。共享工作树中既有端口与浏览器门禁改动保持原样，不属于本轮成果。

## 2026-07-16 净重单位中文显示修正

完成：产品、SKU 与出货净重的用户可见单位由小写 `g` 统一显示为中文“克”，避免小写字形在当前字体和缩放下产生被裁切的误读；列表、表单、详情、预计 / 实际 / 最终总重及 CSV 标题同步更新。进一步移除净重值后重复拼接的默认计量单位：默认单位仍单独显示“件、千克”等业务数量单位，产品 / SKU / 确认出货单重只显示重量单位“克”，不再出现“克 / 千克”的维度矛盾。新建产品和 SKU 默认优先选择标准计件单位 `PCS / PC / EA` 或“件 / 个 / 只”，不再因为历史记录常用千克而自动选中千克；没有计件单位时才回退原有常用单位推断，材料不受影响，用户仍可手工选择千克。内部数据库、API 与计算字段仍使用标准 `*_g` 命名和按默认单位计算的现有合同，没有新增 schema、migration 或单位限制。

验证：项目锁定 Node 24.14.0 下 Web 全量 1258 / 1258、定向合同 131 / 131、ESLint、CSS、场景脚本语法和 `git diff --check` 均通过；产品单重与出货净重两个 Style L1 场景合计 2 / 2。产品浏览器场景用“历史产品默认单位为千克、单位字典同时有件和千克”的边界，确认新建产品先选中件；随后填入 425 克再手工切为千克，确认旧单重被清空、后缀仍只显示“克”且横纵向无裁切，截图为 `product-net-weight-unit-suffix.png`。`affected.sh --plan` 因共享工作树 108 个变更路径判定最高 T8，该结果只用于说明整树推送前仍需 full，不把其他会话改动算作本轮成果。

下一步：如需发布，先收敛共享工作树归属并绑定 commit / image，再执行目标环境检查。

阻塞/风险：应用内浏览器只能到登录页且没有可复用登录态，本轮没有输入或重置凭据；页面证据来自项目自托管 mock 浏览器场景。未 stage、commit、push、deploy 或客户验收。

## 2026-07-16 看板中心双击查看

完成：看板中心的工作台任务行、任务看板任务卡、业务看板单一目标来源项与可下钻待办项新增电脑端双击查看捷径；原“查看”按钮继续保留为键盘、触屏和明确操作入口。共享过滤器排除按钮、链接、输入、选择、分页等内部控件，避免双击冒泡重复打开；只读指标和包含多个目标的业务分类整行不增加虚假点击语义。业务来源项补齐浅色 / 暗色 hover 与 focus 反馈、尺寸稳定检查和“电脑端双击”提示，未修改 API、RBAC、路由、Workflow / Fact、schema、migration 或客户配置。

验证：项目锁定 Node 24.14.0 下定向合同 11 / 11、两页 JSX 定向 ESLint、两份 CSS 定向 stylelint、场景脚本语法和定向 `git diff --check` 通过。`erp-business-dashboard-desktop + erp-business-dashboard-mobile` 两个 L1 场景 2 / 2 通过，实测来源项 hover 的背景 / 边框发生变化且尺寸、溢出稳定，双击来源项与“查看客户”按钮进入同一路由，移动端仍显示按钮。工作台和任务看板 L1 分别在到达本轮双击步骤前被既有“等待交接”和“阻塞 / 退回”文案断言阻断，不能计为浏览器通过；源码合同已证明两处接线与内部控件过滤。

下一步：full-worktree closeout owner 在冻结树门禁前先决定现有 L1 文案断言与当前页面真源哪一侧需要修正，再重跑工作台和任务看板双击步骤；本切片不代替全量 Web、full / strict、目标环境或客户验收。

阻塞/风险：本轮按共享收口协调冻结后不再扩范围；未运行 PostgreSQL、full、strict 或全量浏览器门禁，未 stage、commit、push、deploy 或写入 133，当前没有在途测试或写入进程。

## 2026-07-16 作业指导书图片逐张管理

完成：作业指导书编号行继续支持多图，但移除容易误删整行图片的“清空当前行图片”入口；工具栏统一改为“管理当前行图片”。图片管理弹窗可按图片 1 / 2 / 3 逐张切换，当前图单独移除，取消时不修改打印草稿，保存时提交完整剩余图片对象数组，避免删除中间图片后把后续图片标注按旧索引串位。删除最后一张后保留当前行文字并回到无图状态；主表和续页继续复用行目标，不改打印纸面纯输出口径，纸面内不常驻上传或移除按钮。弹窗补齐方向键切图、移除按钮键盘触发、关闭后焦点返回、无改动时禁用保存和空态反馈。

验证：项目锁定 Node 24.14.0 下 Web 全量 1277 / 1277、相关图片 / 编辑规则 24 / 24、完整 `web lint`、CSS、Prettier、场景脚本语法和全工作树 `git diff --check` 通过。`engineering-print-workspace-row-buttons` 定向 Style L1 1 / 1 通过，真实 Chromium 覆盖四图选择第 2 张、键盘移除后取消恢复、再次移除并保存后仅保留原第 1 / 3 / 4 张、逐张移除到空态、行文字保留、焦点返回、管理工具栏无溢出，以及打印纸面仍无图片编辑按钮；多图态与空态截图已人工核对。

下一步：如甲方需要，可在现有工作台做一次人工验收，重点确认“管理当前行图片”的岗位语言和逐图移除手感；本轮不需要新增 schema、migration、RBAC、菜单、Workflow / Fact 或原型状态。

阻塞/风险：共享工作树仍包含其他会话的大量未提交改动，本轮没有 stage、commit、push、deploy、目标环境验证或客户签收；本地浏览器证据只证明当前工作树的前端交互，不代表已发布。

## 2026-07-16 五套打印模板统一末尾附图

完成：采购合同、加工合同、物料分析明细表、色卡和作业指导书统一使用顶层 `appendixImages[]` 维护模板末尾附图。左侧管理区支持一次多选、查看张数、前移、后移和逐张移除，不设置业务或应用层张数上限；右侧纸面、浏览器打印和 PDF 按同一草稿顺序固定每行左右各一张，奇数最后一张落在下一行左侧。加工合同旧 `attachment-1 / attachment-2` 与物料明细旧 `footer_left / footer_right` 只在新字段缺失时按原左右顺序迁移；显式 `appendixImages: []` 是清空真源，不会从旧槽位复活。物料明细和作业指导书既有右上产品图、作业指导书编号行图片及逐图管理保持独立，不被末尾附图替代。浏览器存储不足时会明确提示当前窗口图片尚在、刷新前不要关闭，不把静默持久化失败冒充已保存。

验证：项目锁定 Node 24.14.0 下 Web 全量 1300 / 1300、末尾附图 / 加工旧槽迁移 / 物料旧槽迁移相关定向测试、目标文件 ESLint、CSS、生产构建、场景脚本语法和全工作树 `git diff --check` 通过；服务端现有 PDF 合同测试确认 128 张图片不受独立张数门禁，同时继续受整份图片 64 MiB、HTML 96 MiB、请求体 128 MiB 安全预算约束。真实 Chromium 的 `print-workspace-all-template-appendix-images`、加工合同既有场景和工程图片既有场景共 3 / 3 通过：五套模板各验证 5 张形成 3 行、固定两列、`contain`、管理区不进入纸面；采购合同额外验证前移、后移、移除、9 张图片和刷新恢复。正式字段 / 交互清单与实现原理已同步五模板覆盖矩阵，文档清单测试 3 / 3 通过。

下一步：可按甲方岗位做一次手感验收，重点确认批量选择、长列表调序和奇数末行左对齐；如要提交推送或发布，必须另行取得授权并绑定 commit / image 执行目标环境 PDF smoke、浏览器打印抽样和回滚检查。

阻塞/风险：末尾附图“不限制张数”指不设置独立业务计数上限，不是无限内存、浏览器存储或 PDF 请求承诺；大量高分辨率图片仍可能命中浏览器配额或整份 PDF 安全预算。本轮没有 schema、migration、RBAC、Workflow / Fact 或业务附件写入，也没有 stage、commit、push、deploy、目标环境验证或客户签收。共享工作树完整 `web lint` 已返回 0，但任务外 `WorkflowTaskActionDrawer.jsx` 仍有 1 条 Hook 依赖 warning，因此不能写成零 warning 门禁；本轮目标文件 ESLint 已独立零 warning 通过，未改动该并行文件。

## 2026-07-16 跨页面采购退货权限投影补漏

完成：审计页面来源、目标动作和后端权限的一致性时，确认品质页“退供应商”调用 `purchase.create_purchase_return_from_quality_inspection`，并由后端按 `purchase.return.create` 校验，但权限使用台账此前只登记了从采购入库生成退货。现已把同一权限拆成采购入库与质量检验两个真实页面来源面，分别登记对应 RPC、按钮文案和作用说明；未修改权限码、角色授权、采购退货 usecase、状态机、schema 或 migration。

验证：`go test ./internal/biz -run 'Test(BuiltinPermissionUsage|EveryMenuRequirement|PurchaseReturnCreatePermissionUsage|QualityPermissionUsage|FinancePayablePermissionUsage)' -count=1` 通过；两份目标 Go 文件 `git diff --check` 通过。产品图、打印快照和业务页面来源关系表属于共享工作树其他在制切片，本轮只读审计并运行定向合同，不把它们计为本轮修改成果。

下一步：跨页面数据流正式治理应继续区分主数据带值、来源关联、后端领域生成和外部导入；先修正当前在制页面关系表把出货事实 owner 误标为 Source Document owner 的分类，再选择一个产品 / 明细导入页面试点追加、替换、去重和切换来源清值合同。

阻塞/风险：本轮只补权限中心的使用投影，不改变后端真实鉴权结果，也不证明产品图片 WIP 已迁移、发布或完成真实登录态 PDF 验收；共享工作树仍有大量其他会话改动，未 stage、commit、push、deploy 或客户验收。

## 2026-07-16 采购入库追加行来源门禁

完成：公开 JSON-RPC `add_purchase_receipt_item` 现在必须携带稳定的 `purchase_order_item_id`；仓储层在锁定入库单后校验来源采购单供应商与入库单稳定供应商一致，并要求同一入库单全部带来源行归属同一采购单。缺来源、入库单无稳定供应商、跨供应商或跨采购单追加均在创建入库行、待检批次和来料质检前拒绝。非公开 usecase / repo 的无来源追加只保留给内部批量与测试夹具构造，不作为页面入口。

验证：采购入库 service 定向用例通过；data 定向用例覆盖同采购单两行成功、同供应商跨采购单拒绝、跨供应商拒绝、无稳定供应商拒绝及失败零写入。`go test -count=1 ./internal/biz`、`./internal/data`、`./internal/service` 分别通过，目标文件 `git diff --check` 通过。`affected.sh --plan` 因共享工作树 283 个变更路径保守判定 T8，本切片未把整树 `full / strict` 记为已执行。

下一步：继续评审公开 `create_purchase_receipt_draft` 与 `create_purchase_receipt_with_items` 的产品边界；二者当前仍可创建无采购订单来源的入库单，不能据本次追加门禁宣称采购入库全链已只允许从采购订单生成。

阻塞/风险：本切片没有 schema / migration 变化，未运行浏览器、目标环境或客户岗位验收，未 stage、commit、push 或部署。共享工作树其他改动均保留且不计为本切片成果。

## 2026-07-16 模板末尾附图自适应混排

完成：采购合同、加工合同、物料分析明细表、色卡和作业指导书共用的末尾附图从固定双列升级为自适应混排。普通图片默认半宽、每行最多两张；同排顶部对齐，行高由较高图片决定，下一行从其下方开始。明显纵向长图或横向超宽图默认整行，每张可在 `自动 / 半宽 / 整行` 间切换。超长图在添加时按打印宽度连续分段，只保存分段而不重复保存完整长图；旧 `dataURL` 草稿继续按自动半宽兼容。附图保持原比例、不裁切、不放大低分辨率原图，宽图最多按 `1600px` 打印宽度生成 JPEG 0.9 快照；在线 PDF 对末尾附图跳过二次低清压缩。五套工作台、模板元数据、字段行为清单和实现原理中的旧“每行左右各一张”文案已同步退出。

验证：项目锁定 Node 24.14.0 下末尾附图与五模板草稿定向 73 / 73、末尾附图与 PDF 定向 30 / 30、补充模板合同 29 / 29 通过；目标 JSX ESLint、目标 CSS stylelint、Prettier、场景语法、文档清单 3 / 3、AGENTS 体积和服务端 PDF 资源预算合同通过。生产构建与全量 CSS 通过；完整 Web lint 退出 0，但任务外 `WorkflowTaskActionDrawer.jsx` 仍有 1 条 Hook 依赖 warning。真实 Chromium 的 `print-workspace-all-template-appendix-images` 1 / 1 通过：五套模板都覆盖不同高度半宽图片、长图自动整行和 4 段切片；采购合同额外覆盖半宽 / 整行 / 自动切换、手动整行刷新恢复、调序、删除、9 张图片和刷新恢复。独立 Chromium `page.pdf` 分页诊断同时确认整行与手动半宽的 4 段长图均连续输出、无丢段或裁切。

下一步：如需甲方验收，建议使用一张真实竖向聊天记录 / 表格截图和一组高矮不同的产品照片，分别核对自动判定、手动切换、在线 PDF 和实体打印清晰度。打印模板中心匹配原型仍为 `To Implement`，本轮没有借实现改写原型状态；客户原始资料、业务附件、schema、migration、RBAC、Workflow / Fact 均未触达。

阻塞/风险：共享工作树完整 Web 测试当前未通过，任务外在制改动中的 `DashboardPage` 旧结构断言和字段联动目录未登记新 case 仍分别有 1 条失败；这些失败不能计为本轮附图回归，也不能把整树写成绿色。本轮没有 stage、commit、push、deploy、目标环境 PDF smoke 或客户签收；“不限制张数”仍只表示无独立业务计数上限，不是无限浏览器存储、内存或 PDF 请求预算。

## 2026-07-16 正式业务页面上下游血缘审计

完成：为 23 个 `formal-v1` 页面建立可执行页面血缘与 typed flow 注册表，明确 Owner、来源生成单据、事实办理、只读台账和 Workflow inbox，并区分目录带值、来源关联、领域生成、事实过账、只读投影、来源导航与打印快照。采购入库退出页面无来源手工加行，公开追加接口要求采购订单行且同一入库单不得跨采购单或供应商；生产事实进入库存改用 `PRODUCTION_FACT + fact.id`，库存预留不再伪装成库存变动。出货页补齐销售订单、库存、应收和发票精确关联入口；Workflow 任务只对流程运行态验证过的业务引用使用 ID 精确导航，普通任务继续按业务编号筛选。质量页按类型调用来料、委外回货和成品质检各自查询合同，修复选择委外 / 成品类型即报参数错误；委外回货可从关联记录精确继续质检，成品质检因出货页尚无正式生成入口明确标为 partial。

验证：页面血缘、来源导航、Workflow、入库、出货、质量和委外的本轮直接相关 Node 合同按当前树复跑 67 / 67；服务端 `internal/biz`、`internal/data`、`internal/service` 按当前树分包测试通过。Web lint、CSS、Prettier 与全工作树 `git diff --check` 通过。真实 Chromium 的委外回货质检、出货生成应收 / 发票、库存文案和只读出货放行 4 个相关 L1 场景通过。完整 Web 1358 项中 1356 通过，2 项因共享工作树其他在制改动的能力台账标题数和字段联动目录漏登失败；随后并行新增的“加工对象类型”文案又使全站文案扫描新增外部失败。`business-core-pages-desktop` 被任务外 SKU 单重列缺排序入口提前阻断，两个既有质量判定场景被当前操作选择器漂移阻断，均未计作本轮通过。`affected.sh --plan` 因共享工作树 355 个变更路径判定 T8，本轮未运行整树 `full / strict`。

下一步：先为出货关联成品质检确认正式业务触发点、允许的出货状态、出货行 / 产品 / 仓库 / 批次选择和判定后放行关系，再接入出货页生成入口；另为 `production_scheduling`、`production_exception`、`shipment_release` 三类 inbox 分别确定真实业务生产者，不能用通用建任务替代。公开 `create_purchase_receipt_draft / create_purchase_receipt_with_items` 的无采购订单来源边界仍需单独退出或定义受控来源。

阻塞/风险：`OUTSOURCING_FACT`、`FINANCE_FACT`、`PURCHASE_RETURN`、`PRODUCTION_ORDER_MATERIAL_REQUIREMENT` 仍缺回到最初单据的来源投影，页面继续 fail closed，不猜内部 ID。共享工作树包含大量其他会话改动，本轮没有 stage、commit、push、deploy、数据库 apply、目标环境 smoke 或客户验收；本地代码与定向浏览器证据不能表述为已发布或完整交付。

## 2026-07-17 看板中心处理提示与任务动作导引收口

完成：工作台、任务看板和异常处理的当前任务详情统一增加只读“处理提示”。提示只按当前任务状态、后端返回的账号可用操作和已授权关联入口即时生成，覆盖权限确认中、确认失败、已结束、只可催办、阻塞、只读和多操作场景；关联路由只有在当前账号菜单权限允许时才显示“查看相关单据”，不再把可解析路径冒充可访问权限。没有新增人工填写的“下一步”、持久化字段、Workflow / Fact 双写或唯一业务结论。入口文案从“继续处理”收口为“处理任务”；处理抽屉继续以可点击且有前置条件的“核对任务 / 选择处理 / 确认与提交”导引，人工只填写阻塞、退回、催办等动作所需的原因、影响范围和协助对象。管理端、任务端和移动端原型同步改为“处理提示”，两张 Draft 方向图同步退出“下一步建议 / 继续处理 / 查看详情”旧口径，并明确原型静态示例不能成为运行时真源。

验证：项目锁定 Node 24.14.0 下处理提示、入口权限、步骤导航和菜单权限相关 Node 合同 35 / 35、原型登记合同 19 / 19、完整 Web 1390 / 1390、完整 Web lint、完整 CSS、场景脚本语法和目标范围 `git diff --check` 通过。真实 Chromium 的工作台、任务看板桌面 / 移动 / 暗色、异常处理桌面 / 移动共 6 个目标场景按最终权限接线复跑通过；实测提示无横向溢出或裁切，工作台右侧详情仍保持吸顶，任务列表与详情不重叠，已授权入口保留、未授权入口隐藏。运行态截图与两张 1536 × 1024 Draft 方向图均已人工核对。

下一步：请甲方按实际岗位复审“处理提示”是否足以帮助判断动作；若后续需要更具体的业务办理建议，应由对应业务单据和后端规则提供可验证依据，不能把人工猜测回填成 Workflow 的唯一下一步。本轮原型仍保持 `To Implement`，不以静态图替代运行态和客户验收。

阻塞/风险：共享工作树仍有大量其他会话改动，浏览器组合跑曾被并行修改 `roleFlowMatrix.mjs` 触发 Vite 重启，拆分并按最终代码复跑后目标场景均通过；本轮没有 schema、migration、RBAC 或后端行为变化，也没有运行仓库级 `full / strict`、stage、commit、push、deploy、目标环境 smoke 或客户签收。本地 Web 全绿和浏览器证据不能表述为已发布或客户已验收。

## 2026-07-17 出货生成出货前成品质检

完成：草稿出货单新增“发起出货前检验”正式入口，按“出货单 + 产品 / SKU + 仓库 + 成品批次”形成送检粒度；同一粒度的多条出货明细精确合并数量，页面只提交后端允许的来源锚点和备注。后端在事务内锁定出货单，校验草稿状态、产品 / SKU / 仓库 / 批次归属，并对同请求重放、同粒度并发冲突、取消后重建实行一致规则。生成成功后按返回质检单 ID 跳转并读回对应记录；未知结果保留弹窗、单号和选择，允许以同一意图安全重试。品质岗位仅增加客户、销售订单、销售订单行和出货单的只读来源可达性，没有取得出货创建、确认或取消权限。

业务边界：该入口直接生成 `FINISHED_GOODS` 质量事实草稿，不启动或推进 `finished_goods_delivery` ProcessRuntime，也不把 Workflow task done 当成质检事实完成。当前 Product Core 未配置出货前必检时仍可直接出货；一旦该出货单存在未取消的成品质检，草稿 / 已提交会阻止出货，不合格会拒绝出货，只有已通过且结论为合格或让步接收才放行。当前持久化粒度没有出货行锚点，因此不能宣称逐行质检追溯；若未来要求逐行审计或全局强制必检，需要先正式评审 schema、migration 和客户策略。

验证：当前树 `go test ./internal/biz ./internal/data ./internal/service -count=1` 三包通过；来源聚合、API、弹窗、出货页、页面血缘和客户运行时配置定向 Node 合同 64 / 64；Web 完整 ESLint、生产构建、目标文件 Prettier 和 `git diff --check` 通过。真实 Chromium 的 `shipment-finished-goods-quality-create-desktop` 1 / 1 通过，覆盖同批次两行合并、业务文案、备注可访问输入、只读检验单号、规范参数、生成后精确跳转与读回。全站可见文案扫描当前 123 项中 122 项通过，唯一失败来自共享工作树另一在制切片的“加工对象类型”文案，不计为本链路通过；`affected.sh --plan` 因整树 391 个变更路径判定最高 T8，本轮没有把整树 `full / strict` 写成绿色。

下一步：逐一为 `production_scheduling`、`production_exception`、`shipment_release` 三类 Workflow inbox 确定真实业务事件、责任角色、幂等锚点和任务关闭条件，再分别接生产者；不恢复通用“新建任务 / 新建事实”入口。公开采购入库草稿接口仍可无采购订单来源，继续作为独立来源边界治理项。

阻塞/风险：本切片没有新增 schema 或 migration，也没有对共享树其他 schema 变更运行 `make data`；现有数据库角色和目标客户配置的实际激活 / 读回、目标环境 migration / health / smoke、客户岗位验收仍未证明。未 stage、commit、push 或 deploy。

## 2026-07-17 BOM 产品图片与跨页面数据流治理收口

完成：确认物料清单以必填 `bom_headers.product_id` 关联产品，当前不引入 BOM-SKU 双粒度。产品档案新增主图 / 辅图两个受控附件槽，限制 PNG、JPEG、WebP、5 MiB 及图片尺寸；物料分析明细和作业指导书打开时从产品主档读取当前图片并冻结为当前打印草稿的数据快照，已打开草稿不受后续换图影响，重新打开历史 BOM 则重新读取当前产品图。BOM 头与全部明细改为单事务聚合保存，支持 `expected_version` 并发校验、旧明细删除和主数据锁；旧的公开拆分写接口退出。SKU 创建时可选择产品，编辑后所属产品不可更换。23 个正式页面建立 typed lineage 注册表，区分目录带值、来源关联、领域生成、外部导入、事实过账、只读投影、来源导航和打印快照；销售 SKU、采购物料批量带值复用追加 / 替换 / 重复策略合同，未审计的外部导入继续 fail closed，不用通用选择器伪造来源。同步修正采购退货跨页面权限投影、字段联动目录和外协“加工品类”岗位文案。

验证：`make data`、`db-guard`、文档清单、AGENTS 体积和全工作树 `git diff --check` 通过；独立 PostgreSQL 从空库应用 79 个 migration，读回产品图片槽位约束与唯一索引，pending 0。产品图片 / BOM 打印 / SKU 归属四个定向 Chromium 场景 4 / 4 通过并人工核对打印纸面。最终 `bash scripts/qa/full.sh` 与 `bash scripts/qa/strict.sh` 均完整通过：scripts Node 1031 / 1031、Web 合同 197 / 197、Web 全量 1390 / 1390、server quick 2057 / 2057、server all 2165 / 2165，Chromium、构建、lint / CSS、populated-upgrade、shellcheck、shfmt、yamllint、零 warning 均通过，全部 0 fail / 0 skip。WebP 解码依赖升级到 `golang.org/x/image v0.43.0` 后，严格 govulncheck 为 0 个可达漏洞。

下一步：代码提交 / 推送必须另行取得用户授权；共享开发库仍有 3 个待应用 migration，因数据库归属为共享环境，本轮只读核对而未自动 apply。部署时还需绑定 commit / image，执行目标环境 migration、health / ready、业务 smoke、打印抽样和回滚验证。

阻塞/风险：当前结论是本地共享工作树 exact-tree 绿色，不等于已提交、已发布或客户已验收。产品图片没有版本历史 / 内容哈希归档；历史 BOM 重新打开取产品当前图，这是本轮明确口径。未 stage、commit、push、deploy、写共享开发库或写 133。
