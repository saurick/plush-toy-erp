# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 本地附件迁入统一 SeaweedFS（2026-09-11，test 待发布）

- 当前切片：统一存储在 133 的 Dockge / RAID5；本地与 test 使用独立 bucket 和仅限本 bucket 的 S3 凭据。Compose 新增 managed / external 配置，预检校验存储模式、连接和运行凭据；外部模式不启动第二套存储。图片只对已识别的 PNG / JPEG / GIF / WebP 写入可预览类型。
- 本地运行：共享开发库 78 个附件、91,302,529 字节全部导出并读回 SHA-256。按正式 `make migrate_prepare / migrate_execute` 完成备份、隔离恢复、三条 migration、schema 读回和后端重启；当前 revision `20260911062537`、pending=0，`content` 已移除，`object_key` 完整，health / ready 通过。`pnpm start` 的恢复页可达，迁移后可重新进入完整工作台；SeaweedFS 中实际图片预览成功。
- 恢复修复：临时恢复库不能复用原库的附件导出摘要；备份演练现在为旧二进制附件启动一次性 SeaweedFS，导出、校验、生成该恢复库的证明，再执行 Atlas 并复验对象。真实 78 文件恢复升级已通过；演练容器及凭据已清理。当前私有备份保留迁移前 PG dump、迁移后 PG dump、文件目录及 manifest；日常 PG 定时备份仍不代表完整文件备份。
- 验证：存储 / 迁移 Go 包通过；部署预检 107 项、迁移 / 初始化 / 发布演练 91 项、备份恢复脚本 11 项通过。两环境 S3 读写成功，跨 bucket 读写均为 403；公网管理入口仍为只读。以上不是 test 发布或客户验收证据。
- 待完成与 Git 交接：test 运行库当前 0 个附件，旧服务尚未切换，独立 bucket 与私有接入配置已准备；demo 不在本切片。提交分组为附件外部接入、图片类型、备份恢复演练和相应验证 / 文档，中文意图“接入统一附件存储并完善迁移恢复演练”。用户已授权提交全部当前代码；本次仅执行本地提交，推送仍待授权，也尚无候选 CI / Release。此前 HEAD 的其他业务和表单改动不属于本轮成果。

### R640 GitLab 安全补丁升级（2026-09-11）

- 运行：133 的 `plush-gitlab` 从 CE `19.3.0` 升至 `19.3.2`，镜像固定为 `sha256:05453dd1d9aba27c2c487613141596868409b4d03247647f7d66cb0b36f321b8`；Compose、端口、挂载、资源限制与 Omnibus 配置已读回，只有镜像版本变化。GitLab 服务健康、完整 readiness、数据库迁移检查、自检、公网登录页和内网 Git 读取均通过，Runner 已恢复 204 作业轮询。
- 数据与恢复：项目 1、用户 11、Release 25、Package 文件 386、artifact 3955，升级前后数量相同，HEAD 为 `e3a7a3b1969e5af95bb3f597d23badaa28099c40`；抽样 Package SHA-256 与 artifact 可读性通过。升级前完整备份 `1789098799_2026_09_11_19.3.0_gitlab_backup.tar`、配置归档和 `backup-20260911T040800Z.sha256` 已校验，旧镜像、原 Compose 与运维回执保留在目标机；未做恢复演练或新 CI 流水线验证。
- 任务外发现：原有定时备份服务因 `ProtectHome` 隔离与全局存储检查冲突而失败；宿主机同一检查及备份脚本预检通过，本次直接执行既有备份与校验入口完成升级备份，未修改定时器或放宽存储检查。Prometheus 的 Kubernetes discovery CA 缺失错误在升级前日志已存在，未扩域调整。
- Git 交接：本轮仅修改 `server/deploy/gitlab/compose.yml`、同目录 `README.md` 和本记录，意图为“升级 R640 GitLab 至 19.3.2 安全补丁”；3 项 GitLab 存储保护测试与 scoped diff 检查通过。仅获 GitLab 升级授权，未 stage / commit / push；保留其他任务的业务页面、样式与文档改动。

### 材料库存类别与仓库用途区分（2026-09-09，本地实现与验证完成）

- 业务与字段：材料档案保留细分分类，新增主料、辅料、包材、其他材料及待分类库存类别，并可指定匹配的默认入库仓。工程从材料档案或 BOM 内建料时维护一次，后续引用复用。仓库用途包含对应材料仓、原辅料综合仓和成品仓；成品仍使用产品 / SKU 真源，与材料分账。
- 操作与边界：库存台账提供仓库新增、编辑、启停及材料类别筛选；采购入库草稿按每行材料带出默认仓并限制候选，仍须经过质检与入库确认才增加库存。已有正库存或材料默认仓关联时，禁止不匹配的类别变更及停用。新入库、调拨入仓和增加库存统一验证用途、启用状态及权限范围；原流水的合法冲正和相同请求重放保留。仓库修改与入库校验在事务内锁定引用，避免并发改变用途后入错仓。
- 权限与升级：新增 `warehouse.manage`，默认老板及仓库岗位可在自身仓库范围维护，新增仓库要求全部仓库范围；工程只读取材料仓主数据选项，不由此获得库存读取权限。Atlas migration `20260909031310_migrate.sql` 只按明确分类回填，未知资料保留待分类；不搬移库存、不修改历史数量。已运行 `make data` 并读回零漂移，纳入 Ent、migration、`atlas.sum` 和数据字典；本次新迁移尚未应用到共享开发库或目标环境。
- 验证：Go 业务 / 数据 / 服务测试、隔离 PostgreSQL 233 项事务与并发回归全部通过；全新建库与带数据升级通过，升级读回 `pending=0 / out_of_order=0`，分类、原库存数量和岗位权限均符合预期。Web 2572 项测试、99 项模拟数据 / 数据字典检查、13 项分类 / 迁移 / 数据字典定向检查、15 项表单合同、文档检查、ESLint、Stylelint、生产构建及 `db-guard` 通过。
- 页面证据：8 个相关浏览器场景通过，包括材料档案编辑 / 清空、工程建料及类别切换后清空默认仓、BOM 跨部位复用、仓库维护及分类筛选、采购分行选仓并保存草稿（桌面 / 窄屏）、库存三类视图与窄屏显示、盘点弹窗。页面使用隔离模拟接口，持久化与权限由后端及 PostgreSQL 回归证明；截图位于 `output/playwright/warehouse-classification-20260909/`，不作为客户 UAT。采购入库弹窗复用公共业务表单，明细表独占整行。
- Git handoff record：本切片基于 `58b1921cc2c8aa71f313dcb4122cfc971fb2278b` 上已有的接单 / 工程 / BOM 未提交改动继续完成，保持单 Local writer。建议与前述业务改动合并为一个提交意图“接单后工程建档、用料审批与主辅料分类仓储”；精确路径、文件摘要和验证命令另见本轮交接记录。未获 stage / commit / push / 发布授权，未操作现有 Git 索引锁。隔离 PostgreSQL 测试容器及本轮连接凭据已清理，共享运行环境未改动。

### 数据库迁移准备阻塞修正（2026-09-09）

- 根因与修正：本机 Bash 在备份说明的 heredoc 写入阶段阻塞，原超时只结束父进程并留下子进程。备份脚本的六处文本生成改用 `printf`；迁移命令使用独立进程组并在超时后清理子进程，准备操作按实际步骤更新事件和时间，失败后可重新准备。已按 PID 和输出文件身份清理本次旧孤儿进程，未修改全局 Bash 配置。
- 验证：备份脚本、迁移 runtime / service / store、终端入口、恢复页与启动回归共 95 项通过；Shell 语法、ShellCheck 和精确 diff 检查通过。未设置 `BASH_COMPAT` 的正式 `make migrate_prepare` 用时约 22 秒，真实备份、隔离恢复、回滚预演、升级与权限 / schema 读回通过；恢复容器及执行锁已清理，浏览器显示等待确认。
- 共享开发库执行：随后按本轮明确授权，使用同一次 ready 操作 `1a7b5b76-1b10-4ab8-b513-6f7f85014353` 执行 `make migrate_execute`，2026-09-09 10:29:11 完成。执行前重新证明 source / target 未变且备份 SHA-256 一致；3 条 migration 只 apply 一次，从 `20260908123839` 升级至 `20260908172207`，读回 `132/132`、`pending=0`、同目标 schema 零差异及后端 health / ready 均为 200。操作为 `passed`，执行锁已释放，已验证的备份 `br-yoyoosun-20260909T100908+0800` 保留。
- 页面 / 接口：迁移页显示已完成，普通 ERP 页面已退出恢复模式，前端 `/rpc/system` 的 `ping` 返回 `code=0 / pong=pong`，页面无控制台错误。当前演示会话显示功能预览，本次未将它作为订单、BOM 等完整业务验收证据。
- 边界：本次运行只涉及登记的共享开发库与本地后端，未发布演示或正式环境，未运行全量发布门禁或客户 UAT。用户随后授权提交本轮修复并移走遗留 Git index 锁；已确认没有锁占用或 Git 进程，将锁原样另存于 `.git/`，保留其他任务的业务改动，未获推送授权。
- Git handoff record：本轮独立提交意图为 `fix: 修正迁移准备阻塞与超时清理`。精确文件为 `deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh`、`web/dev-server/devDatabaseMigrationRuntime.mjs`、`web/dev-server/devDatabaseMigrationPlugin.mjs`、`scripts/qa/dev-database-migration-operation-store.mjs`、上述 runtime / plugin 同名测试、`scripts/deploy/backup-restore-rehearsal-script.test.mjs`、`scripts/README.md` 的迁移准备说明及本节新增内容；`progress.md` 其余已有改动不属于本轮。主要验证入口为 `node --test` 的备份脚本、operation-store、runtime、plugin、recovery-plugin、local-migration、local-migration-workflow、migration-makefile-contract、startWebDev 九份测试及 `make migrate_prepare`；当前 `pnpm start` 已重新启动并证明 pending migration 时恢复页可达。Git commit 已获授权，仅按上述文件和本节精确暂存；push 未获授权。

### 接单、工程材料明细与用料审批调整（2026-09-09，本地实现与验证完成）

- 业务入口：销售订单先记录需求名称、客户款号、新单 / 返单、订购数量、船头样数量与工艺要求，产品 / SKU 可由工程后补。工程独立维护产品、图样、BOM 与打样确认；同客户、同资料的已确认返单可复用。生产数量按订购数量加船头样计算，销售金额只计订购数量，实际出货和未出货数量来自出货事实。
- 工程材料明细：厂商与料号 / 色号共同区分材料，规格与默认单位维护在材料档案；BOM 按物料分组、按部位连续录入，支持同料增行、复制和 Excel 多行粘贴。原表损耗按百分比录入，总用量按单位用量、损耗与生产数量计算，片数不重复乘入。工程填写技术加工要求，生产负责人决定本厂或委外执行；旧 BOM 工序归属字段已从目标 schema / API / UI / 模拟数据删除。
- 用料审批：工程提交当前订单的材料汇总，老板审核后由另一位财务核定实购数量、单价和到货日期；财务能展开查看每个部位的详细用量。实购数量调整须有原因，批准时按厂商生成已批准采购订单，状态、审批人、来源快照与采购生成在同一事务内保存，重复请求不重复生成。资料变更、权限不足和过期版本均阻断写入；驳回后可重新提交。
- 加工衔接：关联销售订单的量产发布须有对应样品确认、当前工程资料与已批准用料。生产负责人选择加工厂及外发材料后，可从在制批次生成委外合同草稿，财务核价确认后沿用现有发料、收回、质检、入库和后续工序办理；草稿生成不替代这些实际业务动作。
- 当前采用的付款口径：接单记录约定预付款 / 结算条件，实际收款由财务事实登记；未将“预付款约定”视为到账，也未新增“必须到账才能打样”的强制规则。审批顺序采用工程提交 → 老板审核 → 财务核价批准 → 自动生成采购。
- 来源 / 隐私：只读核对 Private 仓内材料明细、汇总和流程 PDF，以及本轮订单表；18 项原件完整性验证通过。真实原件与未脱敏提取结果未进入产品仓，未执行真实数据导入。
- 数据库：本轮未发布的中间 DDL 已由 Atlas 按最终 schema 重新生成为 `20260908172207_migrate.sql`，保留两份独立权限 DML `20260908143821`、`20260908163241`，未改写已有历史 SQL。`make data` 生成后内容零漂移、`db-guard`、76 表数据字典检查、隔离 PostgreSQL 全新迁移与带数据升级均通过；旧库升级读回 `pending=0 / out_of_order=0`。
- 验证：Go 的业务、数据、服务与服务端测试通过；真实隔离 PostgreSQL 关键事务 / 并发 231 项通过且无跳过。Web 单元 / 合同 2566 项、相关打印 / 数据字典定向回归、ESLint、Stylelint、生产构建与阶段命名检查通过。浏览器已验证需求先下单、工程打样保存、材料汇总审批、按物料分组录入与粘贴（桌面 / 窄屏）、新建物料后跨部位复用、委外草稿生成、相邻生产工序办理及 DEV 状态页；使用模拟接口，持久化 / 权限 / 并发由后端测试证明，不代表客户 UAT。
- Git / 交付：从 `02dc069a7ea5786ceb7a4bfc9224f5b12344d091` 的干净 Local 开始，当前全部业务改动按一个提交意图“接单后工程建档、分组材料明细与审批采购加工衔接”收口，范围为本轮订单 / BOM / 物料 / 生产用例、API、页面、权限、Ent / migration、测试及对应正式文档。未获 stage / commit / push / 部署授权，未应用共享开发库或目标环境；交付与客户验收状态保持未发布。发现现有 `index.lock`，未删除或操作 Git 索引；提交前须核对锁归属及实时 diff。

### 款号真源与任务信息贯通（2026-09-08）

- 甲方确认业务称谓为“款号”。材料档案以 `materials.supplier_item_no` 保存完整文本，保留商家名、字母、数字及符号；系统物料编号继续独立存在，缺值不代填。任务、搜索、复制、导出、BOM 导入核对和默认打印同步该口径，原工作簿“厂商料号”列仍可识别；已有打印草稿和业务事实不回写。
- Schema / 运行：完成 `make data`、Ent、Atlas migration `20260908123839`、`atlas.sum` 与数据库文档同步；通过正式本地迁移操作 `63355caf-aa9b-4e19-bbac-f81a11ba94ee` 应用到登记的 shared-dev，读回 `pending=0`、schema 验证通过，本地后端重启及 health / ready 均通过。恢复点 `br-yoyoosun-20260908T205439+0800` 已独立恢复验证。
- 验证：Go 业务 / 数据 / 服务定向测试、Node 字段与打印合同 `180 / 180`、桌面任务 / 移动任务 / 材料编辑与清空 / 三类打印页面共六个浏览器场景、触达 ESLint、Web production build、db-guard 与数据库文档检查通过；浏览器使用隔离模拟数据，持久化和权限边界由后端定向测试覆盖。
- 环境处理：首次迁移准备在本机 Bash 大 heredoc 写入阶段停滞，未执行数据库变更；核实后停止本轮子进程，以进程级 `BASH_COMPAT=50` 重走正式准备和执行流程成功，没有修改仓库迁移合同或本机 Bash 配置。
- 交接 / 边界：精确基线、增量文件和验证记录位于 `output/qa/task-supplier-item-no/`。保留开始前的看板、图片、复制与按钮布局改动；未导入客户真实资料、未批量回填款号、未做客户 UAT、未部署、stage、commit 或 push。

### 打印修复版本测试环境部署（2026-09-08）

- 固定版本：`2026.09.08-1 / 576098bb48c61e0799f8781ecb8918c2f4934bdc` 已通过 GitLab CI `156` 的 `28 / 28` 项检查；Release 流水线 `158 / publish_release 2041` 成功，包含五类业务 PDF、镜像安全与体积门禁和隔离发布演练。此前 `157` 的外部镜像认证 / 漏洞库下载直连超时，后续流水线显式使用 Runner 已有代理后通过；该设置只作用于本次流水线，未改代理节点或全局配置。
- 目标发布：正式 promotion `231fe453-7eb8-4011-a59f-b7fb0dcf5490` 于 `2026-09-08T04:03:36Z` 通过。`customer-test-133` 的后端、前端和公共入口均读回上述 SHA；migration 保持 `20260904030457`，active revision 保持 `yoyoosun-customer-package-v7.runtime-manifest-v1`。本轮只升级既有测试实例，没有重建数据库或部署本地其他未提交改动。
- 恢复点：升级前备份 SHA-256 为 `733e044403362680b16f4af97c3a8a46c40af8b3900cf8e0e3c63d2acc816d58`、`476865 bytes`，独立恢复检查通过；旧版 `01fc1476a11ab6ab2bdfe77934fa391c542e8919` 的正式制品及目标缓存已校验并保留。目标未实际回切旧版，不把恢复点校验描述为目标回滚演练。
- 运行验证：正式目标 smoke `11 / 11` 通过，覆盖 runtime identity、health / ready、管理员登录、客户配置 effective session 和 PDF；现有非管理员账号身份摘要与管理员授权版本读回不变。独立浏览器覆盖五个模板、`256` 个字段、四种缩放的 `2048` 个空值显示状态，另通过 `1024` 次空值 Delete、`256` 次重新输入及打印提示隐藏检查。五模板已保存草稿的刷新前后读回一致，提示无裁切；作业指导书恢复五个自动序号，物料表头空值的独立问题见下条。专项浏览器会话已关闭。
- 追加发现：物料分析明细表清空一个表头后，再编辑另一表头，先前表头会恢复默认名称。已在部署版本实际复现；`EngineeringPrintWorkspacePage.jsx` 的 `updateMaterialColumnLabel` 使用 `current.columnLabels?.[index] || column.label`，把合法空字符串当作缺省值。此问题发生在编辑期间，不能把即时空值显示检查或刷新保持当前草稿冒充连续清空表头验证；本次固定版本部署未修改此代码，需单独修复版本。
- 证据与边界：正式 operation store 位于 `output/dev-workbench/delivery-operations/`；本轮 redacted 运行记录位于 `output/qa/plush-cd-157/`，浏览器记录位于 `output/playwright/plush-cd-157/`（目录名保留首次流水线编号）。未执行客户 UAT 或签收。过程页接近 `80 KiB` 前已显式归档较早完成记录，原文和目录索引保留；部署记录、客户矩阵与归档索引作为同一文档提交组。

- 2026-09-06：CI/CD 存储治理已应用：备份与 Package 迁至 RAID5，SSD 重复副本及已核实旧制品清理，根盘约 611→335 GiB；独立恢复、Git 对象与 383 份包校验通过。15 份候选退役，16 份缺恢复证据保留；Runner 回收链读回和 37 项定向测试通过。

### 可维护性重构（2026-09-06）

- 完成：清理闲置流程构建器，收口源单动作、字段映射、DEV 请求校验与 BOM/RBAC 映射；页面按查询、编辑、岗位/账号和事实动作归属拆分，Style L1 runner/打印链按职责拆分，客户配置分发与 Fact 必需依赖显式化。修正打印窗口草稿作用域、任务回执步骤及验证码组合控件描边/行高。
- 验证：766 项定向 Node 测试、Go biz/data/service 定向测试、20 个浏览器场景、Web 构建、ESLint、Stylelint、依赖图和文档检查通过；高成本全量 QA 未运行。保留原有未提交改动，未 stage、commit、push、部署或变更数据库。

### 本地启动与手动迁移恢复加固（2026-09-05）

- 修正：本地数据库预检失败或超过 15 秒时保留迁移恢复页；恢复业务前重新通过完整检查。补齐逐项工具检测、旧计划重新准备、会话失效处理、未知写入结果停止、后端失败后的单独重启，以及数据库断连提示。
- 实测：`pnpm start` 在正常配置与故意断连配置下均启动成功；断连时业务入口转入恢复页、RPC 返回 503，正常环境的迁移页重启后端成功，health / ready 均为 200，工作台与 ERP 登录入口可达。共享开发库为 `128/128`、`pending=0`。
- 恢复证据：通过页面所用 runtime 执行只读源备份并恢复到临时 PostgreSQL 18.1，权限、约束、schema 与 migration 读回通过；容器已清理。备份标识 `br-yoyoosun-20260905T140753+0800`；验证截图与测试记录位于 `output/migration-recovery-verification-20260905/`。
- 验证 / 边界：启动与迁移定向测试、迁移页单场景 Style L1、精确 ESLint、文档链接与 AGENTS 大小检查通过。未新增 migration，未 apply 共享库，未运行 full / strict，未部署、stage、commit 或 push。原有外部 `progress.md` 15 行改动保留，不能随本轮整体提交。

### 本地 migration 恢复启动与门禁（2026-09-04）

- 根因：CI 和本地预检先前只证明 pending migration 必须阻断普通业务运行，但 `pnpm start` 会同时退出 Vite，导致唯一受控迁移页也无法访问。现在只将已明确分类的本地 pending migration 或本地后端 health / ready 未就绪转为受限恢复模式；db-guard、数据库配置、Atlas 输出、可编程对象和外部 API 错误仍直接失败关闭。
- 恢复边界：受限 Vite 只放行 `/__dev/database-migration` 与固定迁移 API，普通 ERP 导航回到恢复页，其它 DEV API、`/rpc` 和 `/templates` 返回明确阻断。只有同目标 `pending=0` 且本地后端 health / ready 读回通过才解除限制；页面可达不代表数据库已迁移，仍不自动 apply 或重试。
- 工具能力：迁移准备在停止后端之前检查兼容 `docker` CLI/socket 的容器运行环境、固定 Atlas v1.2.0、PostgreSQL 18 客户端和备份恢复基础命令。实现不绑定 macOS 或 OrbStack，Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack 及配置兼容入口的 Podman 按同一能力合同判断。
- 验证 / 边界：定向合同 `60 / 60`、正式 `fast` 门禁、Web ESLint / Stylelint、Vite production build 和生产 `/__dev` 边界浏览器 smoke 通过；最终代码的真实 `pnpm start` 读回恢复页 `200`、ERP 页 `302`、RPC `503`。共享开发库仍为 `127 / 128`、`pending=1`、`writes=0`，当前只有容器运行环境未就绪；未执行 migration、推送、部署或客户 UAT，本地提交状态以 Git 实时读回为准。

### Runner VM 内存实测收敛（2026-09-03）

- 根因与修正：Runner 创建脚本和容量 evidence 曾把 `16 GiB` 当作脱离工作负载的固定下限，导致空载约 `1.5–2.0 GiB`、完整 CI 峰值未知时仍不能按实测缩容。`60a5f1d41ef5fa36be2259b22de4077037a84fc2` 已移除两个固定下限，只保留参数形状、磁盘、slot、swap、服务身份和 exact helper 等失败关闭门禁；内存容量改由完整负载窗口决定。
- 失败下界：VM 在保留 `24 GiB` 最大可恢复上限和 `18 GiB` 持久恢复值时，先热缩到 `8 GiB` 运行 protected main 自然 push pipeline `119`，质量并发后内核 OOM-kill `MainThread` 与 `govulncheck`。随后 pipeline `121` 从头固定使用 `12 GiB`，19 槽质量并发的秒级采样达到峰值工作集 `11224 MiB`、最低 `MemAvailable 503 MiB`、最大匿名页 `10023 MiB` 与最大 `Committed_AS 16737 MiB`，memory PSI full 增量约 `4.19s`，再次 OOM-kill `govulncheck`。因此 `8 GiB` 和 `12 GiB` 都已被真实完整负载否决。
- 当前候选：pipeline `121` 触发 OOM 后，运行态在线回升到 `16 GiB`，其余分片继续完成；失败的 `quality_security` 在 `16 GiB` 下正式重试并通过，随后 `quality_aggregate` 与 `CI Gate` 全绿，pipeline 最终为 success。VM live `currentMemory` 当前为 `16 GiB`，持久值在候选验证期间恢复为上一档 `18 GiB`，最大内存仍保留 `24 GiB`；只有完整自然 push 全绿且 OOM、swap、memory PSI 与最低余量读回健康后，才把持久值收敛到 `16 GiB`。
- 证据边界：pipeline `119` 与 `121` 都在失败后扩容，能证明两个下界不可用以及 `16 GiB` 可完成被杀重任务和末端门禁，但不能冒充“整条 pipeline 从起点都运行在 `16 GiB`”。本修正记录提交后的 protected main 自然 push 必须在 `16 GiB` 下重新覆盖 plan、prepare、全部质量分片、aggregate 与 `CI Gate`；最终状态和资源峰值只从 GitLab、Runner guest 与 R640 宿主实时读回，本过程记录不作为当前运行真源。

### R640 GitLab 性能与不可变交付闭环（2026-08-29）

- 已提交 / 推送：`cddd39ff87e3e2ae9cd8c0282431309bb7cb043f` 已把普通 main CI 拆为 plan、prepare、七个固定质量分片、aggregate 与 `CI Gate`，并把普通 exact-SHA terminal 接到 release 复用；同 SHA 候选只构建一次。新 publication 固定 `plush.release-manifest/v2` 七资产并绑定同一 `release-rehearsal.json`；legacy v1 六资产只读、展示、校验及既有回滚，不能补传、重封装或 promotion。通用 / GitLab / GitHub delivery provider、catalog / publisher、promotion、target cache / remote load、回滚读取和研发效能工作台已同步该边界。
- 首次 R640 证据：自然 push pipeline `7` 的 `plan` 约 `115s` 通过，`prepare` 约 `3900s` 后失败，后续分片未运行。唯一有界 trace 证明 pnpm 765 包约 `65s` 完成，Playwright Chromium 公网下载随后停滞约 `58m51s` 并导致 `job_token_expired`；宿主 72 logical CPU / 61.5 GiB、Runner VM 合同 12 vCPU / 24 GiB 的观测未见 CPU throttling、swap、内存或 block IO 饱和，guest 内部指标因缺少可验证 host key 保持盲区。pipeline `7` 只作失败基线，不重跑、不冒充优化后 CI。
- 当前修复：Playwright 运行包固定为 `1.58.2 / Chromium 145.0.7632.6 / revision 1208 / FFmpeg 1011`，三个上游 ZIP 已分别取得精确长度与 SHA-256。源码正在收口 package-absence-only 的 protected-main 一次自举、GitLab Generic Package 读回、内层 ZIP 校验、原始 ZIP cache、job 独立 materialize / cleanup，并只让 Web、Server/PostgreSQL、browser 三个消费者拉缓存；普通 job 不再 live install 或缓存已解压浏览器。
- 后续 / 边界：该修复尚未形成新 commit 或 R640 绿色证据。必须先完成聚焦静态合同、精确提交与普通非强制 push，再自然观察新 SHA 的冷 / 热 CI、关键路径和资源峰值；只有普通 CI 全绿后才由正式规则与 catalog 唯一推出版本，创建 v2 七资产不可变 Release、完成同一回执演练。`test-133` 当前只读 preflight 身份不匹配，禁止 seed / reset / promotion 且不是生产；真实 production target 仍须从正式真源唯一识别并绑定 config / DB / migration / backup / rollback / health / ready / smoke，客户 UAT 不由自动化代称。

### 员工姓名与账号身份贯通（2026-08-22）

- 真源 / 边界：管理员账号新增可空 `display_name` 姓名字段；账号 `username` 继续负责登录、唯一性与不可变审计身份。新建员工和资料维护要求姓名非空且最多 64 个字符，存量缺失姓名只在展示时回退账号，不做伪造回填。
- 当前实现：员工账号新建、资料维护、账号列表、岗位与审批责任选择、当前登录人、审计日志、任务处理记录及附件 / 业务动作留痕已统一贯通姓名；面向人员的选择显示“姓名（账号）”，任务处理记录显示“姓名（岗位）”，系统事件继续显示“系统”。超级管理员仅可维护自己的姓名和手机号，其他保护边界不变。
- 生成 / 验证：隔离 `make data` 首次生成并再次读回零漂移，只新增 `admin_users.display_name` 的 Atlas migration；`db-guard`、Go 的 biz / service / data 与两个账号命令包定向测试、Node 身份链 `92 / 92`、人工验收账号 `39 / 39`、RPC mock `33 / 33`、布局 / profile 同步 `41 / 41`、触达 ESLint / Prettier 和 `git diff --check` 均通过。Playwright 在 1440px 与 720px 实际渲染确认顶部、员工列表、新建和本人资料弹窗的姓名 / 账号口径，页面级横向溢出为 0，控制台 `0 error / 0 warning`；浏览器 RPC 全部由本地 mock 截获，未触碰后端或数据库。
- 未做 / 边界：未连接或 apply 共享 / 目标数据库，未部署、未做客户 UAT，也未 stage、commit 或 push。

### 销售、采购与委外来源单据明细顺序（2026-08-22）

- 目标 / 范围：草稿销售订单、采购订单和委外订单增加显式明细顺序面板；用户在当前表单应用顺序并保存后，列表、详情、打印、导出和后续来源选择按该顺序读取。产品主数据、BOM、生产订单、Workflow 和已经形成的库存 / 出货 / 财务事实不在本次范围。
- 真源 / 身份：三个来源单据行新增可空正整数 `display_order`，历史空值按 `line_no` 读取；既有行重排只更新 `display_order`，不改 `id / line_no`。新行号从该单据全部历史行的最大 `line_no + 1` 分配，已取消行号不复用。
- 当前状态：schema、repository、共享前端顺序面板、三类表单接线、下游来源读取、正式字段文档、Ent 生成物、Atlas migration 与 `atlas.sum` 已在同一切片完成；隔离再生成明确报告 migration 已与目标状态同步，生成前后 diff hash 不变。`db-guard`、完整 `internal/data` Go 测试、顺序 helper / 三表单接线 Node 测试、触达 ESLint / Prettier / stylelint、Vite production build 和精确 `git diff --check` 均通过。
- 浏览器 / 边界：独立 Playwright 会话验证默认态、上移、置顶、取消恢复、应用和键盘 Enter；720px 下页面、弹窗、列表与每行横向溢出均为 0，应用读回 ID 顺序为 `103,101,102`，干净会话控制台 `0 error / 0 warning`。未连接或 apply 共享 / 目标数据库，未运行需要独立数据库目标的 T7、全仓 full / strict、部署或客户 UAT，也未 stage、commit 或 push。

### V6 测试数据、研发工作台与双环境交付（2026-08-21 新候选检查点）

- 数据与目标检查点：Core Demo 与 Scenario V6 继续使用稳定业务编码，当前 canonical `dataVersion=2026.08.15-v6`、`runId=20260815-V6`、`semanticDigest=97c7dfca12092f91a2e6b254b05f938acaa51e27ec9a4fcf14d7adfa5b24c632`。`d5d16d3e2732e1da321da37ff39d22783cb108da` 曾完成本地门禁并部署到登记的 `customer-trial-133`，但本地长期 Scenario 续跑暴露新的历史 ProcessRuntime 幂等问题，后续源码修改已使该 SHA 的测试、制品和目标报告失去最终候选资格，只保留为可回滚历史证据。
- 根因与修复：长期销售单 `YS6-XD-001` 已存在由旧客户配置 revision 创建的 `sales_order_acceptance` 实例；runner 在当前 revision 下用同一 request id 再次启动时，被服务端正确判定为“同一幂等键内容变化”。现在新增受 `sales_order.read`、客户键、来源单据和业务引用共同约束的只读查询，页面与 Scenario runner 先读取并严格校验既有 ProcessRuntime，只在不存在时启动；旧 revision 的流程按自身快照继续办理，不放宽幂等冲突、不直接改库，也不把 Workflow 完成冒充 Fact 写入。续跑还暴露任务组件虽已从持久批次恢复 schedule anchor，随后的旧样例退休却重新使用当前计划时间；现在退休入口自身先完成同一批次 preflight 和 anchor 回绑，再校验保留批次，避免把合法历史到期时间误报为漂移。备份恢复脚本、正式帮助和发布证据建议命令同时显式携带 `--environment`，避免目标恢复回执被默认标成 `local-dev`。
- 当前验证：新候选的 Go 业务 / 服务、Scenario runner、Web API / lineage、备份恢复与 release evidence 定向合同均通过；随后由受管 PostgreSQL wrapper 完整执行 dirty-tree `full`，共 `6012 / 6012`、0 fail / 0 skip，覆盖 Web `2432`、Server `3578`、真实 PostgreSQL `2`、浏览器 `2`、安全 `2`，实际 Chromium Style L1 八场景和 `govulncheck` 同轮通过，临时数据库、容器与卷清理为零。该回执绑定未提交工作树，不能替代 clean exact SHA 的最终发布门禁。
- Core 收敛与新候选：`f869c556fb1a8738de318b74737ece90b3838bdc` 已把正式 Core Demo 固定为 10 个账号、11 个单位和 4 个仓库；材料、产品、工序和 BOM 继续由 Scenario 管理。Core 与 Scenario 各连续运行两次均无新增、数量和 semantic digest 漂移；active“件”只剩当前稳定编码一条，旧编码因存在历史引用保持停用。该 clean SHA 的 `prepare-push.sh --full` 已通过，但随后独立 Full Acceptance `20260821_f869c556` 在销售审批自动激活处失败并完成隔离库零残留清理，因此 `f869` 不能作为最终候选。
- Full Acceptance 根因与修复：终态审批请求与后台 reconciliation 可并发推进同一自动领域命令；相同 fingerprint 的两个执行者会同时进入 handler。胜者已在同一事务提交销售单 `SUBMITTED → ACTIVE` 与 durable result，败者随后读取到已激活源单并返回 `bad param`，导致前端误报“关联流程暂未完成”。ProcessRuntime 现在在 handler 返回错误后先重读同 fingerprint 的权威 result；只有完整匹配的 durable result 才复用并继续结算、路由，result 缺失时仍返回原错误，绝不以源单终态反推命令成功。
- 并发验证：新增领域级回归覆盖“handler 报旧状态错误时竞争者已提交 result”，新增真实 PostgreSQL 双执行者回归覆盖销售单只激活一次、自动节点唯一终态、PMC 复核节点激活和唯一待办。受影响 Go `internal/biz / internal/data / internal/service` 全部通过，真实 PostgreSQL 同一竞争场景连续 10 次通过，Race 定向测试通过；affected 的 T0 / T3 已通过，T7 默认入口因没有生成专用 loopback 数据库 URL 按门禁失败，不能把此前单例真实 PostgreSQL 回归冒充完整 critical-postgres。
- 第二次候选与新增竞态：`089e03506f3a9803759385734d4294ba376659be` 的 clean `prepare-push.sh --full` 已通过，覆盖 Server `3580 / 3580`、Web `2432 / 2432`、共享 Node `1831 / 1831`、资源敏感发布合同 `38 / 38`、真实 PostgreSQL、Chromium、构建与 `govulncheck`，均为 0 fail / 0 skip，托管数据库清理完成。随后独立 Full Acceptance `20260821_089e0350` 再次在 facts 阶段失败并完成两个隔离库零残留清理；这次领域命令和流程终态已成功，失败点是请求线程与后台 reconciler 同时读取终态 Workflow task 和 active 人工节点，一方完成节点后，另一方旧 version CAS 冲突被错误上翻为 50000。
- 人工节点并发收敛：`CompleteLinkedWorkflowTask` 现在只在权威读回满足同 node / process / type、version 精确 `+1`、状态 `completed` 且 outcome 完全一致时，把败方 CAS 视为同一终态任务的精确 replay，并复用已有幂等路由恢复；任何身份、版本、状态或 outcome 差异仍返回原冲突。新增 unit 覆盖竞争者已完成节点后的读回路由，新增真实 PostgreSQL barrier 测试强制两个执行者同时进入节点提交，证明上游只完成 / 路由一次、下游只激活一次、唯一 PMC ready 任务。定向 unit 连续 100 次与 Race 连续 10 次通过；完整 disposable critical PostgreSQL 与 corrected affected T0 / T3 / T7 均通过，critical PG `229 / 229`、0 skip，隔离库和容器清理完成。
- 第三次候选与 Core 解锁缺口：`dab1d98ee1449c4335dee3231dbb3c30b0d0ab83` 已在 clean tree 通过 `prepare-push.sh --full`、独立 Full Acceptance `20260821_dab1d98e`、全量 Style L1 `229 / 229` 和 release-grade strict；Full Acceptance 的 26 个生命周期阶段、10 个桌面账号、9 个移动账号、51 个登记页、5 个真实 PDF 与 3 条异常写入流全部通过，两座隔离库残留为零。随后长期库 Scenario 连续两次读回完全一致的 `Source=135 / ProcessRuntime=9 / Fact=1641 / semanticDigest=97c7df…`，但 Core 被已由更晚 Scenario 权威读回解决的旧 `not_proven` 回执继续阻断。根因是摘要层会识别该回执已解决，执行互斥层却仍把它当全局 blocker；现在执行层复用同一严格判定，只有同 target、同 V6 dataVersion / runId 且时间更晚的 passed readback 才解除阻断，历史回执继续保留。新增正例和 dataVersion、runId、target、时间四类漂移负例，定向测试 `25 / 25` 通过。
- 后续与边界：本次 Core 解锁修复会形成新的 exact SHA；此前 `dab1d98e` 的 full / Full Acceptance / Style L1 / strict 只保留为故障发现证据。新候选必须重新完成失效的 clean 门禁和长期库 Core / Scenario 两次幂等读回，才可普通 push、核对远端 SHA、生成不可变制品并重新执行 133 的备份恢复、promotion、V8 配置、Scenario V6 首次 / resume、浏览器 / PDF 和运行读回。生产、真实客户数据导入和客户人工 UAT 均不在自动化完成声明内；最终发布事实只以绑定 exact SHA、数据库、配置和当前运行态的最新回执为准。

### ProcessRuntime 状态机与来源单据强动作收口（2026-08-11）

- 完成：ProcessRuntime 已收口实例 / 节点结论、阻塞 / 恢复、路由回执与有界 reconciliation；销售、采购和委外来源单据的关闭 / 取消统一使用版本与幂等门禁，存在履约或过账事实时继续失败关闭。
- 正确性与复杂度：保留实例 / 节点双层真相、CAS、事务、幂等回执、独立恢复游标和失败关闭恢复；移除可选 runner、重复默认值及静默兼容，不引入第二套工作流、BPMN、消息队列或通用配置引擎。
- 提交 / 边界：已本地提交 `fdbbf8013054018481a8d5487ec7f4cd5dc7ea09`；隔离索引树格式、Node 契约、聚焦 Go 与 pre-commit 门禁通过。未推送、部署、连接或 apply 共享数据库，未做目标岗位 smoke 或客户 UAT。

### 生产完工报告与仓库成品入库分权（2026-08-11）

- 完成：继续复用 `production_facts`，生产岗位只登记或作废 `FINISHED_GOODS_RECEIPT / DRAFT` 完工报告，仓库岗位核对仓库、批次和数量后过账；库存只在仓库过账时增加，已入库撤销也只由仓库办理。没有新增表、第二套工作流、扫码或订单阶段。
- 权限与页面：复用 `warehouse.inbound.confirm` 作为仓库成品入库权限，并向默认仓库角色增量授予生产记录与在制进度读取权限；自定义角色保持不动。生产与仓库页面动作、帮助说明、客户角色矩阵和正式边界文档已同步为同一口径。
- 验证：原批 Go 领域、数据和 JSON-RPC 定向测试及锁定 Node `24.14.0` 的前端、客户配置、文档合同测试 `165 / 165` 通过，桌面生产 / 仓库分权和移动暗色帮助共三个 Style L1 场景通过；复杂度收敛后又通过 Go biz / service 的 11 个定向用例及其缺权限子用例、客户配置与前端合同 `90 / 90`。新增 migration 的一次性 PostgreSQL 18 populated upgrade 读回 `pending=0`；固定 Atlas `v0.38.0` 的 `atlas_check / migrate validate`、`db-guard` 和精确静态检查均通过。
- 边界 / 风险：未连接或升级共享开发库、test-133 或生产，未部署，也未代做真实岗位 UAT。本次复杂度收敛不改变用户可见行为，因此没有重复占用浏览器；既有三个 Style L1 场景仍只作为本地浏览器证据。尚未 stage、commit 或 push。

### CI/CD 效能优化与最新代码部署到 test-133（2026-08-08）

- 基线：GitHub 最近四次 CI 总耗时中位数为 `538.5s`，最近一次 `539s`，最长 quality job `501s`、主门禁 step `399s`；最近四次 Immutable Release 中位数为 `896.5s`，最近一次 `927s`，其中 strict job `542s`、publish job `362s`、镜像与制品阶段约 `264s`。当前公开 Release `2026.08.08-5 / 0e1dba7f8442e57ad59c11a3ce5541811e6c8f5d` 的 Server / Web tar 分别为 `1,029,740,032 / 235,604,992 bytes`。历史同正式 promotion 的 `1,328,210,048 bytes` 操作窗口约 `66.5s`，只作为旧口径传输下限参考；新实现改为计量实际 rsync 调用。
- 当前实现：保持 Exact-SHA、strict provenance、六项 Release 与 promotion 门禁不变；CI / strict 增加 checksum 后可复用的 gitleaks、固定 Go 工具、pnpm store 和 Playwright Chromium cache；Release 以一次 Buildx Bake 共享图并行调度 Server / Web、按 target 使用 GHA cache，并把 pnpm / APT / 固定 Chromium 置于稳定 Docker 层。Release artifact、GitHub Provider、promotion operation 与 DEV-only 版本中心贯通构建命中、归档大小、digest、实际传输耗时 / 速率、观测关键路径、版本和失败原因。
- 数据库边界：本轮基线 inventory 只发现长期 `plush_erp`；先前 disposable `plush_erp_ci_populated_6974_17055` 已按 archive / restore / drop 流程清理并读回零残留。后续 cold / hot 与本地 release rehearsal 继续复用统一隔离 lifecycle，临时库必须绑定 run ID 并在成功或失败后精确清理，不触碰长期库、133 逻辑库、当前版本或回滚数据代。
- 当前状态：代码和合同测试正在当前任务范围内收口，尚未 stage、commit、push、生成新 immutable Release 或修改 133。当前 133 只读预检仍通过，但运行 Server / Web SHA 均为旧远端 `0e1dba7f8442e57ad59c11a3ce5541811e6c8f5d`；只有完成本地 cold + 三次 hot + 同 SHA 幂等演练、独立取得 Git 授权、正式 CI / Release、promotion、真实浏览器、新旧版本回滚 / 前滚和临时库零残留后才能改写为完成。

### 夜间发布门禁与 test-133

- 完成：`acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 已普通推送并完成 exact-SHA `prepare-push 5387 / 5387`、GitHub CI run `30602758373` 和 Immutable Release run `30603201549`；release `2026.07.31-2` / tag `artifact-acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 的 Server / Web 不可变制品已按正式 promotion 流程部署到 `customer-trial-133`。operation `f6de0aa4-c9b4-441c-a6d0-45d418546ab8` 在 fresh backup、restore rehearsal、串行 Atlas 锁和已授权 trigger / function 移除后通过，目标读回 current migration `20260730161955`、pending `0`、runtime SHA 与 OCI image ID 精确匹配；基础 Web / health / ready、`11 / 11` 登录矩阵、SMS、active config 和 PDF 技术 smoke 共 `9 / 9` 通过。
- 当前阻断与根因：目标专用 `customer-trial-133` V7 manifest 已完成离线变换和服务端 validate，但 publish 确定性返回 `40010 所选岗位当前未开启审批功能`，未进入 activate，V5 继续保持 active。目标 `rbac_options` 权威读回显示固定审批池主办岗位 `sales`、`purchase`、`finance` 仍缺少持久化 `workflow.task.approve`；当前代码的 builtin role 定义已向业务岗位附加该权限，但启动 seed 按治理约定保留旧库已选择的业务权限，且既有 migration 只前向补过 `workflow.task.reject`，因此老数据库不会自动收敛。
- 修复与当前门禁：additive / idempotent migration 已提交、以一次性 PostgreSQL 升级夹具验证精确三岗位、已有绑定不升版、无关岗位不受影响、重复执行幂等，并由 `9e77aed7189c0d79c74a1576392487920d1841ea` 的完整本地门禁 `5388 / 5388`、GitHub CI run `30605780213` 全绿。Immutable Release run `30606218045` 的 Ent / Atlas 零漂移已通过，但 strict Web `2070` 项唯一失败：隐私单测在 Node 文件并发执行时读取共享真实 checkout，仓库 identity 在两次快照间变化而按生产合同 fail closed。该用例的目标只是证明 `runContext` 不含本机路径、用户名、remote 或 token，现改用同文件已有 canonical synthetic repository 输入；生产 `readRepositoryIdentity`、identity 漂移阻断和各自专门测试均不变，不通过 rerun、删除测试或放宽门禁掩盖失败。
- 下一步 / 风险：release run `30606218045` 未进入镜像构建，没有生成新 tag、GitHub Release 或 assets。本测试隔离修复只有在用户明确授权后，才能基于当时实时 HEAD、index 和 worktree 按精确范围提交；随后必须绑定新 clean SHA 从头重跑完整本地门禁、普通非强制 push、同 SHA CI / 新 release，并只用新的不可变制品再次 promotion 到 `customer-trial-133`；fresh backup、migration plan / apply / status、V7 publish / activate / 权威读回和规定 smoke 必须全部重新取证。任何目标漂移、备份 / restore rehearsal 失败、migration 非预期、远端并发或 digest 不匹配均 fail closed。生产保持 `NOT_RUN`，客户 UAT 保持 `NOT_CLAIMED`，`4 / 4 / 3` 场景业务造数保持 `NOT_RUN`。

### 库存预留与采购入库权威投影

- 完成：库存预留列表在同一服务端读快照中统一计数、分页、筛选和当前可读引用，按既有权限分别投影来源销售订单 / 行与产品 / SKU、仓库、单位、批次；出库管理页只展示业务可读字段，继续保留不可变“预留数量”，不增加独立消费动作。采购订单行新增无持久化余额的入库进度权威投影，按采购承诺、已过账入库 / 调整和 DRAFT 草稿占用返回剩余可收、剩余可生成及失败关闭原因；页面只消费服务端六位小数字符串，保存时仍由写事务重验。
- 验证：Go 的 biz / data / service 定向测试通过；前端 API、页面配置、lineage、mock 和可见技术字段合同分别 `93 / 93`、`77 / 77` 通过；文档清单、Workflow / Fact 与页面动作守卫 `32 / 32` 通过。采购入库弹窗正式 Style L1 场景通过；出库管理定向 Chromium 读回库存预留业务字段、无技术 ID、无控制台错误，1440px 下 `scrollWidth = clientWidth = 1440`。Go 格式、Node 语法、触达 ESLint、tracked 与四个新增文件的 whitespace check 均通过。
- 下一步：如取得明确归属的隔离 PostgreSQL 测试库，补跑库存预留 / 释放 / 出货竞争专项；目标环境仍须另行执行对应版本的 migration 状态 / 结构读回、当前客户 revision 发布激活与 effective-session 读回、真实岗位账号和移动端 smoke，再由客户完成 UAT / 签收。
- 阻塞 / 风险：本批没有 schema / migration 变更，也未连接 PostgreSQL、部署或代做 UAT。BOM item 显式 SKU、采购需求来源与 grain、已采购 / 在途 / 剩余采购量扣减合同仍无法从正式真源唯一确定；库存预留的原始 / 已消费 / 剩余三数量、单条部分消费、消费 Shipment 链接、取消 / 恢复、单行可用量和仓库数据范围同样未冻结，继续 `blocked / deferred`，不擅自建立第二套事实或余额。

### 收付款场景数据补齐

- 当前状态：代码与正式文档已完成写入，目标为 30 个桌面页 / 51 个验收目标，以及 4 条收付款和 3 条红冲固定矩阵；完整实现与原验证计划见本轮完整 progress 归档。
- 下一步：执行静态与定向合同后，才可对登记的本地 8300 场景库运行带计划摘要的幂等补数并权威读回 `4 / 3` 矩阵和 51 个页面目标。任何正式接口、状态或关联不满足时 fail closed，不用 fixture 或页面 mock 冒充运行态。
- 阻塞 / 风险：本地场景数据和自动化即使绿色，也不等于已部署、真实岗位 smoke 或客户 UAT。

### 已阻塞任务附件写权限

- 当前状态：代码、T3 / T4 / T5 定向合同和独立 Chromium 已覆盖 `ready / blocked` 合法责任人补附件、终态和越权拒绝，以及上传账号 / 时间审计投影；完整测试数量、截图和边界见本轮完整 progress 归档。
- 下一步：取得提交授权并完成本地提交后，按项目流程预检、重建并重启当前 8300 后端，再以 demo boss 对已阻塞任务补附件做本地运行态读写验证。
- 阻塞 / 风险：当前 8300 后端仍是修复前制品；尚未执行真实附件写入、PostgreSQL 并发门禁、目标发布或客户 UAT。

### 成品返工补制闭环

- 当前状态：完工已绑定确切包装 WIP 批次；REWORK 过账原子创建来源根批次、事件和异常任务；CLOSED 仅允许该来源链办理和补完工。Go 核心包、Node 121 项、文档 17 项、db-guard、build 与 4 个生产 Style L1 场景已有本地绿色记录。登记共享开发库已应用 `20260730161955_migrate.sql`，新增 WIP 关联列、两个 CHECK、两个 FK 和三个索引均完成结构与存量数据读回。
- 下一步：目标发布前仍须对对应不可变版本重做 migration / 配置 / 运行态门禁，再由真实岗位完成 smoke 与 UAT；共享开发库绿色不替代 133 或生产证据。
- 阻塞 / 风险：本轮没有部署、生产变更或客户 UAT；真实高并发业务竞争仍按 T8 专项另行验证。

## 最近完成

133旧环境停用与Atlas修复见[部署约定](docs/部署约定.md)。

| 事项                         | 当前结论                                                                                                                                         | 详细证据               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 共享开发库迁移终态回执       | 本地共享开发库六个入口在成功、no-op、ready、需人工动作、阻断、失败和结果未知时统一输出完整脱敏摘要；真实只读 status 为 `107 / 107`、pending `0`  | 下方独立小节           |
| 共享开发库迁移主路径可操作性 | 裸旧命令已安全兼容到高层编排；登记共享库已由 `105 / 107` 一次升级到 `107 / 107`、pending `0`，备份恢复、schema / 数据 / 权限和后端运行读回均通过 | 下方独立小节           |
| 开发测试固定动作             | 固定入口与证据 staging 已收口；本次发布候选的确定性门禁漂移已最小修正，完整门禁仍待最新 clean SHA 重跑                                           | 下方独立小节           |
| 全局业务记录动作可发现性     | 14 类业务页面与九岗位动作入口已按“可做但未选时置灰、无权或终态隐藏”收口；保持 `hold`                                                             | 本轮完整 progress 归档 |
| V1 主链验收计划口径修正      | 文档、脚本、报告、DEV 预设和清单已统一为 V1 计划边界；保持 `hold`                                                                                | 本轮完整 progress 归档 |
| 开发工作台主题切换           | 共享主题三态、刷新保持、窄屏入口与暗色 / 浅色浏览器回归已完成                                                                                    | 本轮完整 progress 归档 |
| 页面与移动岗位近期收口       | 页面刷新、任务看板、移动任务文案 / 计数 / 标签、角色进度等各批次的精确结论与盲区已归档                                                           | 本轮完整 progress 归档 |

### 共享开发库迁移主路径可操作性

- 根因与修复：截图中的 Makefile 报错行由 `158` 漂移到 `181`，证明同一 Local checkout 在用户两次命令间被活动 writer 改写，而非 shell 缓存；旧 Makefile 又把公开的裸 `migrate_plan / migrate_apply` 直接接到必须携带内部 HMAC / 维护确认的低层 recipe，因此旧操作习惯必然走进缺 token 的死路。`.env` 在 include 前已捕获命令环境，本轮 shell 也没有 `MIGRATE_* / DB_URL / POSTGRES_DSN` 残值，不是缺确认根因。现在裸 `make migrate_plan` 安全进入高层 prepare，裸 TTY `make migrate_apply` 恢复唯一 ready operation；找不到可恢复 operation 时重新准备并等待确认，只有完整内部确认才进入低层 plan / apply。
- 安全边界：CLI 与 `/__dev/database-migration` 继续复用同一 operation service、登记目标身份、0600 原子状态、幂等键、串行锁、其它 client / writer 拒绝、源码与 revision 指纹、真实备份和隔离恢复。非交互裸 apply 在构造 service 前固定以 `ACTION_REQUIRED` / exit 2 停止，明确引导同一次 `migrate_prepare / migrate_execute`，不会静默写库；备份缺失或身份变化、源码漂移、外部客户端、目标变化和结果未知仍 fail closed。133、测试、生产、任意 DSN / SQL / shell 和归属不明数据库均未放开。
- 真实执行：源码冻结为 commit `72a60f8783fb290c983338316d65ab28b1e3abae`、fingerprint `cb704a3ace8d1f13f3a6563a88bc54ec2380c1cae14d1064e60788846c84d7b8`；裸非交互 `make migrate_plan` 完成零写 plan、事务回滚预演、PG18 备份 `br-yoyoosun-20260801T212920+0800` 和临时 PostgreSQL 18 恢复升级验证。随后裸 TTY `make migrate_apply` 只执行 operation `3b0a4b00-bb5e-43e2-bd35-b5fdcf7fe368` 一次，登记共享库 `192.168.0.106:5432/plush_erp` 由 `20260729043852`、`105 / 107`、pending `2` 升到 `20260731124000`、`107 / 107`、pending `0`；operation 最终 `passed` 且 health / ready 均为 HTTP 200。
- 数据读回：`20260730161955` 与 `20260731124000` 的 Atlas revision 分别完整执行 `7 / 7`、`1 / 1` 且 error 为空；两个新增 bigint 列、两个 CHECK、两个已验证 FK 和三个索引全部存在。WIP source CHECK、rework bundle CHECK、两个 FK orphan 和局部唯一重复共五类存量违规均为 `0`。`workflow.task.approve` 在 `sales / purchase / finance` 三个 `business_default` 角色上恰好 `3 / 3`、重复 `0`；非系统 schema 的 function / procedure / 非内部 trigger 为 `0 / 0 / 0`。最终后端 `server/bin/server-dev` 从本仓库 cwd 监听 `8300 / 9300`，运行配置脱敏读回仍为同一共享目标，`/healthz=ok`、`/readyz=ready`。
- 验证：迁移 workflow、低层守卫、启动预检和 Makefile 合同定向 Node `37 / 37`，审批权限 migration Go 定向测试通过；`db-guard`、Atlas validate、Node 语法、AGENTS `15925 bytes`、文档清单 `5 / 5` 和 `git diff --check` 通过。真实 smoke 同时覆盖非交互裸 plan 成功停在 ready、TTY 裸 apply 成功到 pending `0`，以及非交互裸 apply exit `2` 且 no-apply 后 status 仍为 `107 / 107`。
- 未做 / 风险：本轮未部署、未修改 133 / 生产、未代做客户岗位 UAT，也未 stage、commit 或 push。备份和 operation 回执保留在本机 `output/dev-workbench`；后续目标发布仍须绑定对应不可变版本重新执行目标门禁，不能复用共享开发库证据冒充发布完成。

### 共享开发库迁移终态回执

- 完成：`make migrate / migrate_prepare / migrate_execute / migrate_status` 以及裸兼容 `migrate_plan / migrate_apply` 的高低层终态统一追加七行 `[migration-summary]`。回执固定包含 command / mode / phase、安全 target、current / latest、applied / pending、result、writes、apply、auto_retry、operation、runtime、error_code 和 next_action；状态尚不可读时明确使用 `unavailable / unknown`，不沉默也不复用旧输出。
- 安全边界：回执只接受结构化安全目标和稳定枚举，不接收原始错误、DSN、路径或确认值；stderr 继续统一脱敏数据库 URL、环境变量密码和高低层确认值。旧 `[migration]` parser 行、显式 prepare continuation、HMAC、目标 identity、真实备份与隔离恢复、停写、source fingerprint、单次 apply 和同目标读回均保留。`not_proven / writes=unknown` 固定 `auto_retry=false` 且下一步只允许 status，不把错误包装成成功。
- 真实只读 smoke：登记目标 `192.168.0.106:5432/plush_erp` 当前为 `20260731124000 / 20260731124000`、`107 / 107`、pending `0`；`make migrate_status` 回执为 `result=passed / writes=0 / apply=not_requested`。非交互 `make migrate` 与裸 `make migrate_apply` 均在 service 构造前以 exit 2 / `ACTION_REQUIRED` 停止，并分别输出 `target=unavailable / result=action_required / writes=0 / apply=not_started`；没有 plan、备份、停后端或写库。
- 验证：低层 formatter / redactor、高层 workflow、operation store、runtime parser、DEV plugin、启动 preflight、Makefile 和文档合同共 `65 / 65` 通过；Node 语法、`db-guard`、文档清单 `5 / 5` 和触达路径 `git diff --check` 通过。额外 Prettier check 仅报告 `local-migration.mjs` 中本批之前保留的 rollback rehearsal 单行换行差异，本批新增 hunk 已符合 formatter 输出且未越权改写旧 hunk。
- 边界 / 下一步：本批只覆盖登记共享开发库六个入口，不改变隔离业务库脚本或生产 `migrate_online.sh` 的专用合同；没有执行真实 apply、修改 schema / migration SQL、部署、stage、commit 或 push。后续本地开发仍以交互 `make migrate` 为主，非交互使用同一次 `migrate_prepare → migrate_execute`；提交与 push 需用户另行授权。

### 业务列表列顺序与全筛选导出

- 完成：生产订单补齐“导出筛选结果 / 列顺序”；主数据、销售订单、采购订单、采购入库、质量检验、库存台账、物料清单、出货单、委外订单和业务记录等既有入口统一改为按当前筛选读取全部严格分页结果后导出，不再把当前 20 条页面数据误称为筛选结果。导出沿用当前可见列顺序、业务可读状态 / 日期 / 引用值，并提供单飞、取消、空结果和失败反馈。
- 边界：收付款与核销原本已使用完整分页导出，保持不重复改造；生产异常处置继续只提供列顺序，不开放缺少独立业务数据边界的导出。看板、权限 / 配置、系统操作记录和纯 Workflow 任务页不机械套用该工具。
- 验证：锁定 Node `24.14.0` 下，本批 API、页面、可见字段、请求生命周期和 12 页全局合同定向执行 `250 / 250` 通过；Web 全量为 `2060 / 2064`，剩余 4 项仅来自并行中的字段联动 QA wrapper 与开发页导航 / 英文标签批次。Web 全量 ESLint、CSS stylelint 和 overall `git diff --check` 通过。
- 浏览器：复用当前外部 Style L1 服务执行生产订单刷新手机布局场景 `1 / 1`；另以真实 Chromium 打开生产订单列顺序弹窗并实际下载 CSV，读回生产订单业务内容，1440px 下页面 `scrollWidth = clientWidth = 1440`。
- 阻塞 / 风险：Vite build 当前被任务外 `devQaTestingPlugin.mjs` 静态导入带 shebang CLI 的配置打包问题阻断；责任范围已定位，本批未越权修改或等待。当前仍未部署、未做目标岗位 smoke / 客户 UAT，也未 stage、commit 或 push。
- 下一步：待 dev-testing 批次修复并释放热点后复跑 Vite build 与全量测试摘要；如用户授权，再读取当时实时 Git 现场并按本批精确路径或 hunk 处理本地提交，push 仍需单独授权。

### 开发测试固定动作

- 完成：在 `/__dev/testing` 的验证层级视图新增 P0「生成本轮验证计划」、P0「运行开发门禁」、P1「岗位权限与任务可见性巡检」和 P1「字段联动专项」，覆盖视图保留并改名为「采集本地覆盖基线」。计划只读冻结生成前后 repository identity；浏览器只提交固定 action 与幂等键，不能提供命令、参数、路径、环境变量、URL 或凭据。三项执行结果与覆盖报告各自展示，不合成“全系统已通过”。
- 完成：新增 testing operation store 和覆盖 / 固定动作共用的全局 QA 锁；Vite development-only Bridge 固定映射 `fast.sh` 带回执门禁、九岗位 JSON-RPC 权限巡检和字段联动 runner，并在执行前后复核仓库身份。岗位巡检缺少本地后端或演示账号凭据时明确为 `blocked`，预期业务写入为零，不等于完整角色协同闭环；生产 build 不注册这些接口。
- 完成：`run-gate-with-receipt.mjs` 增加 repository identity 前后复核；baseline 在 Web coverage 前先执行 error-code `--check`，再直接使用项目 Node native coverage，避免 package `pretest` 自行改写 tracked 生成物。字段联动 TAP 与报告改为 staging 生成并在测试、builder 和身份复核均通过后提升 canonical 报告，失败时保留上一份证据。
- 完成：新测试登记到 fast Node 分组和 `fast.sh` Web 固定清单，fast profile required files 同步覆盖 operation store、全局锁、runner、插件、client 和页面；`scripts/qa/README.md`、`web/README.md` 与自动化测试策略同步五项优先级、全局串行边界、11 个 coverage 阶段及证据不互相替代的口径。
- 修正：相关文件写入完成后的真实 Chromium 读回确认桌面、390px 移动端与暗色页面布局可读且无页面级横向溢出，同时暴露旧 Vite 进程未注册 testing API，以及 Vite / esbuild 配置打包会把带 shebang 的 `affected.mjs` 静态内联到非首位置。testing Bridge 已改为仅在 plan 请求时通过非字面量 file URL 动态导入，并新增 `loadConfigFromFile` development serve 回归；固定动作在 summary 尚未成功读回或读取失败时也改为 fail closed 禁用，避免告警与按钮状态相反。
- 验证：全局锁、testing store、门禁回执、collector、字段联动、fast profile、两个 operation client、两个 Vite Bridge、插件注册、清单完整性与页面合同最终定向执行 `96 / 96` 通过；fast profile 读回 `13` 个 gates / `186` 个 required files，文档清单 `5 / 5` 通过，触达 ESLint、Prettier、全量 Stylelint、Vite development config 加载和 overall `git diff --check` 通过。
- 验证边界：独立 `15201` 开发服务的真实 Chromium 已生成当时 `237` 个改动文件的验证计划，建议 T0 / T1 / T2 / T3 / T4 / T5 / T7 / T8；testing summary 成功读回前 P0 / P1 固定动作全部 fail closed 禁用。九岗位巡检在本地 `8300/healthz=200` 但演示凭据缺失时正确保持 `blocked`，字段联动动作通过并原子发布报告；1600px、390px 与暗色页面可读，390px 下 `scrollWidth = clientWidth = 390`，控制台 error 为 0。夜间发布初始 fast 为 `524 / 530`、Web full 为 `2066 / 2070`；已定位并最小修正全部确定性失败，当前只完成相关定向回归，尚未把它们描述为 full 全绿。
- 下一步：旧 coverage baseline 绑定旧 fingerprint，结果原本即为 `issues`，不能复用为本次 clean SHA 证据。用户明确授权并从实时 Git 现场产生新提交后重跑 fast、Web full 与 `prepare-push`；演示凭据可用后才执行九岗位真实登录，并按 T2 / T7 / T8 分别补 migration、业务集成 / 浏览器和发布证据。
- 阻塞 / 风险：本轮尚未连接 PostgreSQL、运行真实业务浏览器写链或目标环境部署 / smoke；后续任何代码变化都会使当前定向证据过期。本批尚未 stage、commit 或 push。

### 业务写入唯一入口治理

- 完成：在项目长期协作约定中明确，正式业务写入只能经过受控的 Go repository/usecase，禁止临时 SQL、页面脚本或其他服务旁路写业务表。
- 下一步：后续新增或修改业务写链时，继续由既有 usecase、事务、权限、幂等与数据库声明式约束共同守住一致性，不为同一规则增加数据库 function / trigger 双轨实现。
- 阻塞 / 风险：本批仅收口治理规则；没有恢复或新增数据库 function / trigger，没有修改业务代码、schema、migration、测试或运行环境。

### 夜间发布收口

- 当前：`539e9c041ff049afa690cc24710f00a84155c408` 已普通推送并完成同 SHA GitHub CI；Immutable Release run `30601143215` 的 exact-SHA strict terminal 已通过并持久化，但最终 Server 镜像构建在加载 `vite.shared.mjs` 时无法解析 `./dev-server/devWorkbenchPlugins.mjs`，因此 release 整体仍为失败。
- 修复：Server Dockerfile 的临时 Web builder 补齐 `web/dev-server` 构建依赖，最终运行镜像仍只复制生成后的静态 `build`；客户配置边界与 release artifact 合同同步阻断遗漏该嵌套依赖的构建上下文。
- 下一步 / 风险：本次失败没有生成 GitHub Release、tag 或 assets。修复提交后必须从新 clean SHA 重走完整本地门禁、普通 push、同 SHA CI 和 release，不能复用 `539e9c04` 的部分绿色或失败制品；133 migration、部署、岗位 smoke 与客户 UAT 均未运行。

## 下一步与停止条件

1. 本次一次性夜间任务已获最小门禁修复、本地提交、普通 push `main`、GitHub CI / release 和仅部署 test-133 的明确授权；生产、客户 UAT、force / 历史改写、CI 放宽及破坏性 migration / data change仍未授权。
2. 用户明确授权提交后，重新核对实时 worktree、index、lock 与精确路径 / hunk，再由当次唯一 Git index 操作者本地提交；只有提交后的 clean SHA 才运行 `bash scripts/qa/prepare-push.sh`。
3. push 前 fetch 并比对远端 OID；有远端并发漂移即 fail closed，禁止覆盖。CI / release 任一确定性失败只允许最小修复并从新 SHA 全链重走。
4. promotion 前必须再次确认 target 身份、fresh backup / rollback point、Atlas status / plan、migration 性质和锁；任何受禁 pending migration、身份不明、备份失败或 digest / runtime 漂移都停止，不进入生产。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署必须各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- 133 上较早固定 V5 的技术试用证据不能证明当前 Product Core HEAD。客户配置 V7、V5 → V7 激活边界、目标 migration 和岗位 smoke 都必须以本次 promotion 后的目标读回为准。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- Git index 同一时点只允许一个操作者；CI、Release、promotion 和部署分别按当前明确授权与正式流程串行执行，不保存跨任务 owner。

## 归档索引

- `docs/archive/progress-2026-09-08-before-test-print-release.md`：2026-08-06 至 2026-08-29 的已完成事项原文；当前活跃事项与最近发布记录继续保留在本页。

- `docs/archive/progress-2026-08-09-before-active-page-compaction.md`：2026-08-03 至 2026-08-05 的非当前页面、移动任务、附件与协作治理过程摘要；已退出的旧业务分支不作为历史兼容保留。

- `docs/archive/progress-2026-07-30-before-dev-testing-oneclick.md`：本活跃页收缩前的完整过程记录；原始快照为 348 行 / 81,671 bytes，SHA-256 `67b2f47e2af9a3eedcd5fb3ea6a1c737fe38667a14b41feb49f474d587c5ed2e`。
- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。

### 销售订单报价运费独立金额（2026-09-04）

- 业务闭环：销售订单新增整单“报价运费”，沿用订单币种；“报价不含运费（另计）”时纳入同一计税基础和订单总额，允许草稿暂缺但提交 / 生效前必须明确填写，`0` 表示明确免收；“报价含运费”时自动清空该金额并禁止重复计入。出货单实际运费仍是独立物流事实，不复制、不回写，也不自动形成应付或付款。
- 真源 / 历史：后端 usecase 唯一计算货款、税额和总额，API、列表、详情、导出、帮助与试用模拟数据同步读取同一字段；数据库只新增可空 `quoted_freight_amount` 及非负、运费条件一致性约束。历史记录不猜测回填，既有已生效单仍可读取，后续需要商业条件完备的状态转换按新规则失败关闭。
- Schema / 迁移：完成 Ent 生成、Atlas migration、风险元数据、`atlas.sum` 和数据字典同步；`make data` 读回 migration 目录与目标 schema 一致，`scripts/qa/db-guard.sh` 通过。本批未连接或 apply 开发库、测试库或目标库，未发布或部署。
- 验证：Go `internal/biz`、`internal/service`、`internal/data` 全包通过；报价运费字段链、计算、页面、帮助、模拟数据、原型和 Schema 文档定向 Node `156 / 156` 通过；Vite production build（`3396` modules）、阶段编号边界与 `git diff --check` 通过。隔离浏览器的销售订单竞态场景通过；可见原型交互确认含运费会清空并禁用另计金额，不含运费填 `250.00` 后税额和总额分别更新为 `617.50`、`5367.50`。全业务页面场景在销售订单检查之后被无关的出货附件审计断言阻断，不能算本批绿色；客户 UAT、目标 migration smoke、full / strict、提交和推送均未执行。

### 不可变发布与双目标部署完成（2026-09-05）

- 发布：固定提交 `01fc1476a11ab6ab2bdfe77934fa391c542e8919`，实时确认与远端 `main` 一致。[完整 CI #139](https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/139) 成功，执行耗时 `211` 秒；[Release #140](https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/140) 复用其 exact-SHA 门禁，约 `229` 秒完成构建、隔离演练和 `2026.09.05-1` 发布。v2 七资产、独立 `source.tar` 与 manifest 绑定的演练回执均已读回校验；演练的 migration、health/ready、登录、PDF、备份恢复、稳态重启通过，临时容器零残留。
- 目标部署：正式 controller/executor 先完成 `demo-133`（operation `fe5f06b0-da91-460d-8976-c33007c67bca`，远端执行 `97.797` 秒），读回通过后再完成 `customer-test-133`（operation `51d1c917-d923-45cf-9c9a-d9f354b15c09`，`94.392` 秒）。两个 v5 回执均为 `passed`；最终 `target-preflight` 确认前端、后端与各自公网入口均运行同一 `01fc1476…` 制品，health/ready/Web health 通过、migration 为 `20260904030457`、客户配置保持 active、迁移锁空闲。普通升级保留两个环境的现有业务数据。
- 恢复与传输：旧版 `af4cc02808ebffc919201748561f7027b97679f3` 回滚制品在目标写入前已校验可取得；两个目标各自新建备份并完成隔离恢复校验，备份分别为 `866560` 与 `476846` bytes，完整 digest 绑定在对应 operation 回执。此次两个目标均为冷缓存，各自通过内网 TLS 取得并校验 `580313796` bytes，未经过 Mac 大文件中转；未据此宣称跨环境缓存命中或重复加载已消除。
- 专用凭据：经用户明确授权创建本项目 Deploy Token `plush-target-package-read`，GitLab 回读 `Expires=Never`，唯一 scope 为 `read_package_registry`；安全保存于本机 macOS Keychain 的 `plush-toy-erp.gitlab-target-fetch`，不记录令牌值。两个目标取件成功且回执均证明临时凭据文件已清理；长期令牌保留，不在部署后撤销。
- 验证边界：本轮没有重建或清空数据，没有改业务代码或 AGENTS。CI 与隔离发布演练不重复运行；目标带凭据岗位矩阵、目标 PDF smoke、客户 UAT / 签收和真实代码回滚演练仍未执行，不能由基础部署 smoke 或备份恢复校验代替。

### GitLab 永久凭据替换与旧凭据清理（2026-09-05）

- 已替换：经用户授权，创建 `plush-ci-read-permanent-20260905`（ID `21`，Reporter / `read_api`）与 `plush-release-permanent-20260905`（ID `22`，Developer / `api`），均回读 `expires_at=null`。前者替换钥匙串 `plush-toy-erp.gitlab-read-api`，并通过正式启动入口重启 `5175` 前端，确认新凭据已加载、旧进程已退出；后者替换 `GITLAB_RELEASE_TOKEN`，保留 `release` 环境范围及 Protected / Masked / Hidden / raw 属性。只移除这两枚新令牌的到期字段，未改变 GitLab 全站策略或扩大权限。
- 已撤销：切换并验证引用后，旧发布令牌 ID `5`、旧永久只读令牌 ID `17` 均回读 `revoked=true / active=false`；此前个人临时令牌 `codex-delivery-20260831`、项目临时令牌 ID `14` 及旧 Deploy Token 均已失效。当前本项目有效凭据只有项目令牌 `21 / 22` 与永久制品下载 Deploy Token `10`，个人 active token 为 `0`；失效审计记录保留，SSH 推送密钥不变。
- 验证：旧只读令牌认证返回 `401`；两个新令牌自身状态、固定 SHA 的 CI / Release 和主分支读取成功，撤销后 Pipeline `140` 仍返回 `200 / success`。现有 Deploy Token 从目标内网取得固定 release manifest，SHA-256 与发布证据一致。未重新运行 CI/CD 或部署；本机后端未就绪的原有恢复模式仍阻断工作台，未因此修改数据库或启动后端。
- 安全待办：此前读取 GitLab 个人令牌页时，RSS feed token 意外进入工具输出；未复述或写入仓库，需要用户通过正常入口重置，尚未完成。本轮不记录任何令牌值，不改业务代码、AGENTS 或密码；此记录未提交推送。

### 图片与附件外置到 RAID5 对象存储（2026-09-11，本地实现）

- 决策与实现：用户明确不用 NAS，采用 RAID5 本机目录上的 SeaweedFS 私有 S3 服务。`server/internal/attachmentstore/` 统一对象传输，`business_attachment_repo.go` 先写不可覆盖对象再提交引用；PG 仅保留元数据、key 与审计。原 owner / RBAC / Workflow、产品图槽位、5MiB 和 base64 API 保持既有合同。
- 迁移与恢复：`server/cmd/attachment-storage/` 和 `internal/attachmentmigration/` 支持盘点、导出、校验、文件备份和恢复。Atlas 新增 `20260911062305`、`20260911062436`、`20260911062537`，缺失或过期导出摘要阻断删除旧内容；Ent 与数据字典已同步。正式 `migrate_online.sh` 复用停写和串行锁窗口完成导出验证；RAID5 未挂载、对象服务故障或凭据不可用时阻断放行。
- 相关入口：生产 Compose / env / Dockerfile、生产 preflight、新目标初始化、本地发布演练、容量测试附件写入及 `database-constraint-preflight.sql` 已接入。操作合同位于 `server/deploy/compose/prod/README.md`，架构边界位于 `docs/architecture/业务附件证据边界评审.md`；旧图片和无引用对象暂不自动删除。
- 存储查看：同一 SeaweedFS 容器启用原生管理界面，`viewer` 与 `storage-admin` 使用独立随机密码；仍无宿主机端口发布。`scripts/deploy/attachment-console.mjs` 只核对固定目标并建立本机 SSH 转发，目标初始化、演练和生产预检同步凭据合同，不增加 ERP 页面。原版界面仍显示部分写入按钮，但 viewer 的请求由服务端拒绝。
- 已验证：`make data` 再运行零结构漂移，`db-guard`、schema-doc、ShellCheck、Compose config / example preflight 通过；后端 data / biz / service、存储包与三个命令构建通过。`attachment-storage-integration.sh` 使用本地一次性 PostgreSQL 18.1 与 SeaweedFS 4.46，存储 / 迁移 6 项、附件数据库回归 37 项均通过且零 skip，另完成 PG dump 与文件备份向新库 / 空 bucket 的完整恢复；测试容器和其匿名卷已清理。部署 / 初始化 / 演练 / QA 编排相关 Node 回归通过，数据字典索引期望已随新增唯一索引更新并单独复验。
- 界面验证：相关 Node 回归 115 项通过、零 skip；文档与查看入口检查 9 项通过。一次性真实 Compose 验证匿名拦截、错误密码、只读登录、文件列表和下载、上传与删除拒绝、退出登录；浏览器验证登录页、viewer 会话、文件预览、新建文件夹被 403 拒绝及退出后重新要求登录。ShellCheck、example preflight 和 diff 格式检查通过；截图为本地合成文件，目标 SSH 通道尚无部署后运行证据。
- 交付边界：未对共享开发、demo 或 customer-test 执行迁移、部署或真实文件导出。外置发布前还需准备各环境 RAID5 目录、独立凭据和固定镜像，并按正式制品 / 目标流程切换。现有定时 PostgreSQL 备份仍只覆盖数据库，完整恢复须配套文件备份；本地验证不代替目标运行、恢复或客户验收。
- Git handoff：本轮范围为附件存储 / 迁移 / 部署 / 相关测试和上述文档，建议中文提交意图 `feat(storage): 将业务附件外置到 RAID5 对象存储`。既有前端表单、原型、订单采购文档、GitLab 部署配置及本文件原有改动归其他任务，保留并排除；仅本追加段属于本轮。未获 stage / commit / push 授权，未执行 Git 写操作；收口发现现有空 index.lock，保留未处理，后续 Git 动作前须按既有门禁重新核对。
