# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-14 远端 CI Chromium 沙箱收口

完成：主仓产品单重提交 `6b0ac4e4` 推送后，GitHub Actions run `29318178284` 只在真实 Chromium PDF 安全集成启动阶段失败；Ubuntu 24.04 拒绝 Playwright 下载版 Chromium 使用 user namespace sandbox，测试体尚未执行。CI 改为从同一 Playwright Chromium 发行包安装独立 `chrome_sandbox` helper 到 `/usr/local/sbin/chrome-devel-sandbox`，强制 `root:root` 与 `4755` 后通过 `CHROME_DEVEL_SANDBOX` 绑定。产品代码和 Chromium 参数未加入 `--no-sandbox` 或 `--disable-setuid-sandbox`，不会为适配 CI 降低 PDF 渲染安全边界。

完成：CI 修复提交 `93d094e3` 对应 run `29319071534` 已证明 SUID helper 安装、Ent / Atlas 零漂移和真实 PDF 安全集成有效，server 全量为 1785 / 1785；随后严格漏洞扫描按最新数据库检出 `GO-2026-5856`，指出仓库锁定的 `crypto/tls@go1.26.4` 可达且修复版本为 `go1.26.5`。仓库已原子升级 `server/go.mod`、容器 Go builder、Makefile、CI 合同与版本文档到 Go 1.26.5，不使用 ignore 或 skip 绕过漏洞门禁。

验证：`go version` 与 `go env GOVERSION` 均为 `go1.26.5`；CI / 文档合同测试通过。升级后 `bash scripts/qa/strict.sh` 完整通过且未使用 skip：Node、客户配置、Web contracts、server quick、Web 全量 1017 / 1017、critical PostgreSQL、server 全量 1785 / 1785、Vite build、当前工作树自启 Chromium 3 个场景、真实 PDF 安全集成、shellcheck、shfmt、yamllint 与两轮 govulncheck 均完成，当前代码无可达漏洞。

下一步：提交并推送 Go 1.26.5 工具链升级，在 GitHub Ubuntu runner 上取得新的 strict 绿色运行证据；随后把最终 Product Core 提交号重新锁入客户私有仓，完成 formal validate、推送和远端 fresh clone 回读。

阻塞/风险：SUID helper 已有真实 Ubuntu 正向证据，Go 1.26.5 的远端 strict 仍需本次 push 复核；GitHub branch protection / required check 是否启用仍需远端设置证据。目标机 `192.168.0.133` 未部署，migration、health / smoke、rollback evidence 与客户签收仍是独立发布动作。

## 2026-07-14 产品单重与最终全仓门禁

完成：产品主数据新增可空的 `unit_net_weight_kg`，以 kg 存储每默认单位净重，数据库使用 `numeric(20,6)` 并约束非空值必须大于零。Biz、JSON-RPC、Ent repo、产品表单、列表、CSV、浏览器 mock 与正式文档使用同一精度和缺值语义；切换默认单位会清空旧单重，避免单位变化后残值继续参与展示。前端以当前默认单位显示“kg / 单位”，不把该字段扩成 SKU 覆盖、单位换算、出货快照、合计或打印事实。同步修复浏览器场景的来源对象名断言与 Ant Design 废弃 `addonAfter` 用法。

完成：执行正式 Ent / Atlas 生成，新增第 67 个 versioned migration `20260714081153_migrate.sql`；连续第二次 `make data` 的全树 hash 均为 `f3488da1e26577c7f9f293015357f0ac4423591d5873c877fbfdb472789dd8f9`，没有生成额外 migration。fresh PostgreSQL 完整应用 67 个 migration，并验证产品单重字段类型、可空、精确小数和正数 CHECK。

验证：产品单重 Biz / data / service 与前端定向测试通过，`business-core-pages-desktop` 当前工作树自启 Chromium 场景通过。最终 `bash scripts/qa/strict.sh` 完整通过且未使用 skip：Node 自动发现 854 / 854、customer index 2 / 2、Web contracts 188 / 188、server quick 1760 / 1760、Web 全量 1017 / 1017、critical PostgreSQL 131 / 131、server 全量 1785 / 1785；Vite build、当前工作树自启 Chromium 3 个场景、shellcheck、shfmt、yamllint 和两轮 govulncheck 均通过，当前代码无可达漏洞。

下一步：本条记录与产品单重实现一起提交并推送主仓；主仓远端同步后，将最终 40 位 commit 锁入 `plush-toy-erp-customer-yoyoosun-private`，完成 formal validate、提交推送和远端 fresh clone 回读。目标机 `192.168.0.133` 的 migration、health / smoke、rollback evidence 与客户签收仍是独立发布动作，本次不部署。

阻塞/风险：本轮不回填历史产品单重，不实现 SKU 级重量、单位换算、出货重量快照 / 合计 / 打印。Product Core 当前树中的客户原件已清理，但既有 Git 历史未改写；如需历史清理，必须另行取得维护窗口和 force-push 授权。

## 2026-07-14 十一项并行任务全仓收口

完成：十一项 ChatGPT 引用任务的实现与独立复核已合并到同一工作树，覆盖 Product Core / Customer Config、Workflow / ProcessRuntime、RBAC / 管理员会话、业务事实、打印 PDF、客户资料私有仓边界、前端页面与自动化门禁。Customer Config revision 与五类投影改为数据库级 append-only / immutable，角色类型与目标状态合同完成一次性迁移；Workflow task 只保留 `ready / blocked / done / rejected`，resume 明确为 `blocked -> ready` 且业务投影继续保持 blocked。四个本地 PostgreSQL helper 统一为同一测试实例凭据、不同数据库，避免 full 复用统一 DSN 掩盖独立入口不可用；pre-commit 索引快照会先把 Git 提供的相对 `GIT_INDEX_FILE` 固定为绝对路径，真实 `git commit` 不再把完整暂存集误判为 required 文件缺失。Go 网络依赖升级到已修复版本，当前代码无可达漏洞。

验证：Ent / Atlas 正式生成共 66 个 versioned migration，重复 `make data` 无新增 migration，Atlas 校验、fresh、upgrade 及旧状态 fail-closed 路径通过。最终 `bash scripts/qa/strict.sh` 完整通过且未使用 skip：Node 自动发现 853 / 853，Web 1013 / 1013，critical PostgreSQL 130 / 130，Server 1783 / 1783，Vite build、当前工作树自启 Chromium smoke、shellcheck、shfmt、yamllint 和两轮 govulncheck 均通过；追加索引快照回归后 `fast.sh` 为 Node 854 / 854、server quick 1758 / 1758。Inventory / BOM 独立 helper 也分别完成建库、应用全部 66 个 migration 和真实 PostgreSQL 测试；Purchase Return 从旧 16 migration 数据库升级到当前版本后 5 / 5 通过。

下一步：本条记录随同 Product Core 全仓提交推送；主仓远端确认后，把最终 40 位 commit 锁入 `plush-toy-erp-customer-yoyoosun-private`，执行 formal validate、提交推送并用远端 fresh clone 回读 17 项来源 manifest / hash / size。目标机 `192.168.0.133` 的 preflight、备份、migration apply、health / smoke、rollback evidence 与客户签收仍是独立发布动作，本次不部署。

阻塞/风险：仓库内 CI workflow 会随本次提交进入远端，但 GitHub branch protection / required check 是否启用仍需远端设置证据；普通提交已清理 Product Core 当前树中的客户原件，不代表既有 Git 历史已清理，历史改写需要单独维护窗口和 force-push 授权。客户私有仓是原件正式真源，本轮不把未配置的 MinIO 当成交付前置。

## 2026-07-14 打印图片资源边界调整

完成：PDF 模板安全校验取消独立图片张数和单图大小限制，继续拒绝脚本、外部资源和非受控图片格式；整份打印内容使用 64 MiB 解码图片总预算，承载 Base64 快照的 HTML / 请求体上限提高到 96 / 128 MiB。代码默认并发从 2 调到 4，通用 Compose 默认使用 2 GiB 内存 / 768 MiB reservation / 并发 4；永绅高配部署样例使用 4 GiB / 1 GiB reservation / 并发 8。前端既有打印窗口继续把手机照片和电脑截图栅格化为纸面 JPEG 快照，不新增第二套压缩路径。

验证：服务端 `internal/server` 包全量测试通过，覆盖 128 / 96 / 64 MiB 资源合同、默认并发 4、显式并发 8、超过旧阈值的大单图与 128 张内嵌图片，以及整份图片超过预算后拒绝；前端 `printPdf` 22 项快照与请求测试通过。通用 Compose 解析为并发 4、2 GiB limit、768 MiB reservation，永绅部署样例解析为并发 8、4 GiB limit、1 GiB reservation。本机 Google Chrome 安全集成 smoke 通过，静态 HTML 成功生成 PDF，外部网络探针请求数保持为 0；`git diff --check` 通过。本轮未使用真实手机照片做页面级上传与下载回归。

下一步：如需交付目标环境，仍需用实际手机照片和长截图完成打印窗口上传、在线预览与下载 PDF 的浏览器验收，并核对目标机并发渲染内存。

阻塞/风险：共享工作树包含大量其他会话 WIP，本轮只触达打印 PDF 资源边界、对应测试和正式说明；未提交、未推送、未部署。

## 2026-07-14 写入一致性与结果未知恢复

完成：采购订单生成收货草稿和向收货草稿追加明细统一使用服务端规范化的 SHA-256 intent hash 与稳定幂等键；replay 先于当前引用有效性校验，写入错误或 commit 结果未知时回查，收货行、HOLD lot、来料质检及结果边界不完整时 fail closed。ProcessRuntime 的重复启动可补建 human / approval linked task、补齐 completed end 的流程结算、继续 durable domain result 结算，同时不会自动重复 active domain command 或 wait event；节点与流程实例阻塞已合并为同一事务。销售订单、采购订单、加工合同草稿新增正整数版本，聚合更新先以 `id + DRAFT + version` CAS 递增单头，成功后才替换明细；三页遇到网络中断、超时、5xx 或结构不完整响应时保留弹窗和编辑值，确认成功前不上传附件、不刷新列表、不关闭表单。

完成：同步服务端运行合同和自动化测试策略，移除 `StartProcessInstance` 仅支持 active / waiting、阻塞分两步写入以及固定 migration 总数等过期口径。前端页面证据来自仓库 Playwright CLI，不是 App Browser：销售订单编辑 `version=1` 草稿后把保存请求模拟为 `ERR_TIMED_OUT`，实测 `saveCalls=1 / expectedVersion=1 / attachmentWrites=0 / listRefreshesAfterUnknown=0 / dialogVisible=true`，编辑备注仍为“用户未提交的稳定性备注”，控制台只记录该超时资源错误且 `pageErrors=[]`。采购与加工合同的同类恢复态由共享静态集成合同覆盖；本轮没有把它们写成第二、第三条真实页面证据。

完成：独立 review 后把三类 Source Document 页面进一步收口为显式保存阶段与保存后 effect 阶段。`commitSourceDocumentSaveResult` 只捕获聚合保存请求 / 响应校验错误，完整结果会在任何附件、明细读取或列表 / Workflow 刷新前绑定真实 `id / version`；`settleSourceDocumentPostSaveEffect` 将后置失败限制在附件或刷新提示内。新建采购订单保存成功后即使明细和列表读取失败，下一次 attempt 也会使用已保存 ID，不再以 `id=0` 重复创建；保存请求本身超时仍保持原表单并跳过所有后置 effect。

完成：第二轮独立 review 后新增三类 Source Document 共用的 open-edit 明细加载门禁。销售订单、采购订单和加工合同只有在明细响应是完整数组后才绑定编辑身份、写入表单和打开弹窗；HTTP 5xx、网络错误或畸形响应均停留列表页，不生成可保存空白行，也不会调用聚合保存。成功读取空集合仍与读取失败严格区分，并继续按各页既有合同处理真实空明细。采购和加工合同明细读取 helper 不再吞错返回 `[]`；保存成功后的明细读取、列表和 Workflow 刷新以及采购生命周期动作后的刷新仍由后置 effect 单独结算，不会回退为 mutation unknown。

完成：第三轮独立 review 后把 open-edit 门禁扩展为共享 latest-request 控制器。三页使用独立 `source-document-open-edit` 请求序列；后续编辑、新建、关闭和组件卸载都会使旧请求失效，只有当前请求可以绑定编辑身份、写表单、改变 loading 或提示读取错误。旧请求即使在新建表单打开后才成功返回，也只结算为 stale，不覆盖新建内容；较早请求的 `finally` 不会提前清除后续请求的 loading。加工合同编辑和提交参数只保留标准化 `OPEN` 的既有明细，新行仍可提交；`canceled` 行不会回填或重新提交，过滤后为空是合法完整读取并按既有合同生成一条空白输入行。

完成：三类 Source Document 明细全量读取改为可证明完整后才成功。共享分页固定校验响应 offset、首个可信 total、跨页 total 不漂移、正整数且不重复的明细 ID，并且只在累计数量严格等于 total 时返回；短页或空页未达 total、累计超过 total、offset 停滞和重复行一律作为结构不完整响应 fail closed。`total=0 + []` 保持合法，不再用实际数组长度修正服务端 total。

验证：任务隔离 API / migration / web 工作树在 Node 24.14.x 下 `bash scripts/qa/full.sh` 全部通过，包含 fast、secrets、lint、CSS、890 项前端测试、Vite build、本地 PostgreSQL `critical_transactions_pg_test`、Go 全量测试/build 和 govulncheck。真实 PostgreSQL fresh / upgrade 均到 `20260713205637`、共执行 63 个 migration、pending 0；升级数据的三个订单版本均为 1，采购收货旧空幂等 bundle 合法且 partial bundle 为 0。采购重试与三类草稿 CAS 的 PostgreSQL 并发 `-race` 通过；ProcessRuntime 的 biz/data `-race`、领域命令并发与节点/实例原子阻塞回滚 PostgreSQL 测试通过。相关 24 项前端定向测试、6 个采购 style:l1 场景、docs inventory、Atlas checksum/status 和目标 diff check 通过。

验证：P1 追加修复在 Node 24.14.0 / pnpm 10.13.1 下通过 17 项 Source Document 行为、页面接线和 API 合同测试，覆盖新建成功后详情 / 列表失败的 ID 重绑、加工合同刷新失败只落后置提示、销售附件 / 刷新失败不覆盖保存版本，以及保存请求超时保持表单且附件 / 刷新计数为 0；三页与共享 helper 的定向 ESLint、Prettier、Vite build、3 项 docs inventory / active link、16 项能力台账解析 / 可见标签测试和目标 `git diff --check` 通过。全量前端 lint 仍被任务外 `devPrototypes.test.mjs`、`MobileRoleTasksPage.jsx`、`PermissionCenterPage.jsx` 的 3 个既有 / 并行 WIP error 阻断，本轮三页和 helper 无 lint error；本次没有新增保存后失败的 style:l1 / Playwright 页面证据。

验证：第二轮 P1 修复在 Node 24.14.0 下通过 25 项 Source Document 行为、页面接线、API 和订单 RPC mock 定向测试；三页、共享 helper / 测试及 style:l1 场景的 ESLint、Prettier 和 Vite build 通过。当前仓库 Playwright（不是 App Browser）场景 `source-document-edit-items-read-failure-fail-closed` 实测销售明细读取失败后 `visibleEditModalCount=0 / visibleLineRowCount=0 / itemReadCalls=1 / saveCalls=0 / consoleErrors=[] / pageErrors=[]`，页面保留订单列表并显示“销售订单明细暂时无法加载，未进入编辑”；证据截图为 `web/output/playwright/style-l1/source-document-edit-items-read-failure-fail-closed-visible.png` 和 `source-document-edit-items-read-failure-fail-closed-message.png`，未复用旧截图。采购保存成功后置读取失败的可执行行为测试继续通过；可选页面场景因当前 effective session 投影下找不到可见“编辑”按钮而停止，未把该失败尝试写成页面证据，也未继续扩张夹具。

验证：第三轮 P1 在 Node 24.14.0 / pnpm 10.13.1 下通过 42 项 Source Document controller、fail-closed、保存阶段、API 接线和分页 mock 行为测试，覆盖 A / B 逆序、新建 / 关闭 / 卸载失效、迟到失败静默、旧 finally 不清新 loading、加工 OPEN / canceled 过滤，以及正常多页、零行、短页、空页、超量、total 漂移、offset 停滞和重复 ID。目标 ESLint 为 0 error / 0 warning，Prettier 和 Vite build（3250 modules）通过。仓库 Playwright（不是 App Browser）串行通过原读取失败场景和新增 `source-document-open-edit-race-new-document-wins`：旧明细响应在新建后真实完成，页面仍为新建身份，备注保持“竞态期间填写的新订单备注”，保留 1 条自有空白行，且 `itemReadCalls=1 / saveCalls=0 / staleFailureNotices=0 / consoleErrors=[] / pageErrors=[]`；当前截图为 `web/output/playwright/style-l1/source-document-open-edit-race-new-document-wins-visible.png`。

完成：第四轮独立 review 后，委外保存的最终 RPC 明细映射会为既有 `OPEN` 行保留正整数 `id`，新行不生成 `id`，`canceled` 行不进入参数。三类编辑入口把更新权限和草稿生命周期校验放到按钮与双击共用的 handler gate 内，权限不足或非草稿不会读取明细或打开表单；销售和采购编辑动作同时展示明细 loading 并阻止按钮重复点击，latest-request 仍负责竞态正确性。共享分页先以原始 number 类型校验 `total / limit / offset`，拒绝 null、空串、数字字符串和 boolean；三类全量明细读取还会在分页前后读取父单据，并要求 `id / version` 始终等于调用方版本，父版本漂移时不会接受混合明细。当前公开 JSON-RPC 的三类明细写主路径均为同事务聚合保存并递增父版本，旧销售 / 采购单行写方法未由 dispatcher 暴露，因此本轮不需要服务端、schema 或 migration 改动。

验证：第四轮修复在 Node 24.14.0 / pnpm 10.13.1 下通过 50 项 Source Document controller、入口 gate、最终委外 payload、保存阶段、API 接线、严格分页和 version fence 可执行测试；覆盖既有 / 新建 / canceled 明细、无权限 / 非草稿零读取零弹窗、稳定多页、分页期间父版本变化以及调用方版本预先漂移。三页、采购操作条、共享 helper / API / 场景的目标 ESLint 与 Prettier 通过，Vite build 通过并转换 3250 modules；docs inventory（304 个 Markdown、3 项）和 `git diff --check` 通过。`orderRpcMocks.mjs` 仍保留 HEAD 已存在的两处任务外 `curly` error，本轮只把三类明细 mock 的 `limit / offset` 对齐请求合同。仓库 Playwright（不是 App Browser）在明确 Node 24.14.0 下串行通过读取失败与竞态场景：前者保持 `visibleEditModalCount=0 / visibleLineRowCount=0 / itemReadCalls=1 / saveCalls=0`，后者新增可执行断言要求 `lateRouteOutcome=fulfilled-after-new`，同时保留新建身份、备注和 1 条自有空白行，且两场景 `consoleErrors=[] / pageErrors=[]`。

完成：第五轮独立 review 后，严格分页在累积明细前拒绝 `page.length > response limit`，既有明细 `id` 只接受原始 number 类型的正安全整数；字符串、null、boolean、NaN、Infinity、零、负数和小数均作为结构错误 fail closed，三类 wrapper 不会把畸形 ID 带入销售、采购或委外保存参数。同一合法父单据的读前已漂移或读后发生 version 变化改为 `ResourceVersionConflict(40922)`，不再标记 `isInvalidResponse`；非法 expected document、缺失 / 畸形 snapshot 和错误父 ID 仍保持响应结构错误。三页编辑失败与采购 / 委外打印继续统一经 `getActionErrorMessage` 展示“记录已被其他操作更新，请刷新后重试”，没有新增页面错误分支。

完成：共享 open-edit access gate 在 missing document、无更新权限或非可编辑生命周期被阻断时也会统一 invalidate pending 请求并清除其 loading；合法后续编辑仍由同一 latest-request controller 取代旧请求。按钮、采购“相关单据 / 订单明细”入口和 row double-click 均继续汇入各页唯一编辑 handler。A 明细慢加载期间再尝试 blocked B 后，A 即使迟到成功也只返回 stale，不会打开弹窗、绑定 A 或覆盖当前选择。

验证：第五轮最终在 Node 24.14.0 / pnpm 10.13.1 下通过 66 项定向可执行测试（10 项统一错误消费、56 项 Source Document helper / controller / API / 页面与打印接线），覆盖 oversized page、三类 wrapper 的非法原始 ID、稳定与漂移 version fence、畸形 / 错 ID snapshot、blocked B 使慢 A stale、最终保存 ID 映射及保存结果未知恢复。目标 ESLint 为 0 error / 0 warning，Prettier 通过，Vite build 转换 3250 modules；本轮不重跑仓库 Playwright，因为新增行为位于纯分页 / version 分类与共享 controller gate，已有仓库 Playwright（不是 App Browser）仍只证明“明细读取失败不进入编辑”和“旧响应在新建后真实 fulfilled 仍不覆盖”，新增边界由上述行为测试证明。未运行共享 dirty worktree 的 full / strict，未应用 migration，未提交、未推送、未部署或发布。

下一步：共享工作树仍包含数百个跨任务文件，`affected.sh --plan` 因此正确判为 T8；核心 full / PostgreSQL 证据来自 `/private/tmp/plush-toy-erp-stability-*` 隔离工作树，后续 review 修复只在本共享 dirty worktree 运行各轮记录的目标定向命令，没有把其他 WIP 的绿色或失败归到本任务。后续由监控任务独立 review 并决定是否进入精确提交；如需目标环境交付，仍须另做 production preflight、migration apply、health/smoke、rollback evidence 和客户验收。

阻塞/风险：App Browser / Chrome / Computer 控制工具在本任务不可用，仓库 Playwright 证据不等同于现有 Chrome 登录态或桌面应用证据；本目标不依赖这两类状态，因此没有功能阻断。未运行共享混合工作树的 `full/strict`，未应用生产 migration，未提交、未推送、未部署。主工作树中的 BOM、客户配置、任务看板、管理员生命周期等并行 WIP 和未跟踪 `20260714043000_migrate.sql` 均保留且不计入本轮成果。

## 2026-07-14 全仓提交前门禁收口

完成：按 full-worktree 范围核对并同步 Ent / Atlas 与 Wire 生成物。管理员状态审计约束补齐完整外层表达式，保持 PostgreSQL migration 语义不变并恢复 SQLite 测试建表；模板 PDF 管理员校验只接受已经服务端 session 验证后注入的 claims，不再从原始 Bearer token 绕过会话注销和认证版本检查。对应生命周期测试改为写入完整状态原因、时间和操作者审计字段。

验证：`make data` 零 migration 漂移；隔离 PostgreSQL fresh database 完整应用 61 个 migration，`make critical_transactions_pg_test` 通过；`go test ./...`、server build 和 govulncheck 通过。前置 `full.sh` 的 fast、secrets、web 全量 test / build 已通过；最终完整 pre-push 仍由本次 `git push` hook 重跑并以远端同步结果为准。

下一步：完成当前 full-worktree commit / push 后，以 `origin/main...HEAD = 0 0` 和 clean worktree 作为 Git 收口证据；部署到 `192.168.0.133`、目标 migration / health / smoke / rollback evidence 与客户签收仍是独立动作。

阻塞/风险：本轮只修复提交门禁暴露的生成与认证一致性问题，没有执行目标环境部署，也不把本地自动化绿色写成客户验收。为全量门禁启动了仅绑定 `127.0.0.1:55432` 的本地测试 PostgreSQL 容器 `plush-qa-postgres-55432`。

## 2026-07-14 任务看板全量计数与互斥泳道

完成：任务看板不再从 `list_tasks(limit=200)` 的局部结果推导顶部统计，而由只读 `workflow.get_task_board` 在同一查询快照内返回可见范围的全量 `total`、四个互斥运营泳道计数和有界任务切片。`rejected` 保持生命周期终态，但只读投影到“阻塞 / 退回”承接交接；未知状态 fail closed。来源候选由数据库 `DISTINCT` 生成，只受可见性和显式 owner role 范围约束，不随当前内容筛选塌缩。

完成：总览每栏最多 5 条，聚焦页固定每页 8 条并把 `lane / page` 写入 URL；筛选、分页、选择与旧响应隔离使用同一服务端合同。完成态及其他非异常任务不会再显示或被历史 `blocked_reason / rejected_reason` 搜索命中，后续状态写入会清除字段残值，事件中的处理原因仍保留审计。工作台既有每页 8 条、队列切换选择联动、焦点选择、`aria-selected` 和桌面 sticky 合同保持不变。

验证：Node 24.14.0 / pnpm 10.13.1 下任务看板及共享生命周期定向 80 项测试、全量 ESLint、全量 CSS 检查、Vite build（3245 modules）通过；`erp-task-board-desktop / mobile / dark-wide-desktop` 与 `erp-yoyo-global-dashboard-desktop` 四个浏览器场景通过，后者在 1440×600 下实际滚过 sticky 阈值并按 2px 误差上限核对位置。`go test ./... -count=1` 和隔离 PostgreSQL `make workflow_pg_test` 通过；PG 用例覆盖 478 条任务的全量计数、数据库来源去重、固定查询上界、终态历史原因搜索隔离和事件原因保留。`git diff --check` 通过。

下一步：共享长期任务可在冻结快照上只读重跑 final PostgreSQL、`full.sh` 与 `strict.sh`；目标环境部署和客户验收仍是独立步骤。若后续继续做无障碍增强，可单独把泳道卡外层从依赖内部按钮 focus capture 收口为自身完整键盘语义，不与本轮计数真源混改。

阻塞/风险：本轮未改 schema / migration，也未对历史数据库残值做物理回填；旧值由服务端读取投影和搜索条件隔离，受控清理需另行评审。共享工作区仍包含其他会话的大量 WIP，本轮未暂存、提交、推送、部署或形成目标环境发布证据。

## 2026-07-13 工作台长队列分页与上下文跟随

完成：工作台优先处理队列从整表无限撑高收口为每页 8 项的受控分页，显示当前范围和当前已加载总数；翻页、切换待我处理 / 阻塞逾期 / 等待交接队列时，右侧上下文同步到当前页首条，刷新或处理导致末页缩减时自动回到最后有效页。桌面右侧上下文保持跟随，窄屏恢复普通文档流；当前页任务行支持焦点选择和 `aria-selected`，原“优先级”列按真实展示语义改为“状态 / 风险”。

验证：Node 24.14 / pnpm 10.13.1 下前端全量 861 项测试、全量 lint、全量 CSS 检查通过；`erp-yoyo-global-dashboard-desktop` 定向 `style:l1` 以 18 条待办和 9 条逾期样本覆盖 8 项分页、翻页、切队列重置、当前行 / 右侧上下文一致、桌面 sticky、390px 窄屏和暗色对比度，浏览器场景通过。相关文件 Prettier、脚本语法和 `git diff --check` 通过。

下一步：如果工作台需要准确承载超过 200 条任务，应单独扩展后端队列查询，提供 `queue_key`、固定业务优先排序、服务端分页和三队列准确总数；不通过前端循环拉取冒充可扩展方案。

阻塞/风险：本轮只修复当前接口已加载范围内的长列表交互；`list_tasks` 单次上限仍为 200，当前三个队列数量不是超过该上限后的全量事实。未改 schema、migration、RBAC、Workflow / Fact、客户配置、seed 或部署，未执行发布门禁和目标环境验收。

## 2026-07-13 财务取消审计与生产订单本地闭环

完成：财务事实取消不再覆盖原始过账时间；正式取消在同一事务记录认证操作人、取消时间和 1..255 字业务原因，三字段按版本约束成组。迁移前本项目已有的取消记录保留显式历史版本，页面只显示“历史记录，取消审计信息缺失”，不从其他时间或账号猜值。ProcessRuntime 补偿、JSON-RPC/RBAC、列表详情和财务页面均使用同一审计真源。

完成：生产订单 Product Core 独立页面和通用菜单已接入现有后端，覆盖可读引用选择、草稿新建/编辑、发布、关闭、取消、版本冲突草稿保留和刷新恢复；表单只在 Modal 挂载后初始化，普通业务页不展示系统创建/更新时间。财务与生产订单两条浏览器脚本的 CLI 主入口均按绝对路径判断，已重新执行真实后端 E2E，旧“仅加载未执行”的 finance browser 证据作废。

验证：Ent/Atlas 生成物零漂移；fresh PostgreSQL 迁移、坏行、事务、并发和 critical gate 通过；production/finance 定向 race 通过；财务取消真实后端浏览器输出 `finance cancellation real-backend browser e2e passed`，生产订单真实后端浏览器输出 `production order real-backend browser e2e passed`；`business-core-pages-desktop` L1、`scripts/qa/full.sh` 与 `scripts/qa/strict.sh` 均通过。

下一步：永绅客户菜单投影、试用 seed、部署和客户签收仍是独立切片；未获授权前不把 Product Core 本地闭环直接写入客户配置或目标环境，也不扩成完整 MES、总账、税控或核销系统。

阻塞/风险：本轮证据只证明当前共享工作树的本地实现和隔离环境验证，不代表 `192.168.0.133` 已部署或客户已签收。工作区仍有数百项其他会话改动，当前 staged 为 0；后续提交必须重新精确审查范围并取得用户授权。

## 2026-07-13 管理员生命周期与权限地图

完成：管理员账号补齐 `active / suspended / revoked` 三态语义，`disabled` 只表达临时停用，`revoked_at` 表达正式注销；状态原因、时间和操作者进入 schema。临时禁用要求填写原因，正式注销保留历史身份且不能普通恢复。注销事务同时退回该账号尚未完成的个人待办到原岗位池、递增任务版本、写 `unassigned` 任务事件和控制面审计，避免账号状态与审计或待办处置部分成功。

完成：新增 `system.user.revoke` 高风险权限和管理员账号“离职注销”交互；权限中心“生效页面预览”升级为只读“权限地图”，每项已选功能展示影响页面、控件类型和最终限制，仍不建立独立页面授权真源。功能勾选项直接展示影响摘要，甲方无需理解权限 key。

验证：Ent/Atlas 已生成账号生命周期 migration 与代码；账号 usecase、事务 repo、权限影响 JSON-RPC 定向 Go 测试通过；Node 24.14 下前端 lint、css、权限中心搜索/菜单投影/错误码定向测试通过；`permission-center-desktop` 浏览器回归覆盖权限地图、账号列表和注销确认交互。全量 data/service 测试受到共享工作区中财务取消审计并行改动失败影响，未将其冒充为本轮通过。

下一步：普通业务资源数据范围仍等待甲方给出本人/岗位/仓库等真实隔离要求和对应负责人真源；敏感字段仍需先确定领域字段组，并让查询、修改、导出和打印在后端共同执行。两者在合同闭环前不开放前端伪开关。

阻塞/风险：账号 schema migration 尚未在目标数据库 apply，也未形成发布证据。共享工作区含其他会话的大量未提交改动，尤其同期生成的财务 migration 和代码；提交时必须精确审查本轮路径和迁移顺序。

## 2026-07-13 状态顶层设计与全局字典核对

完成：将 `docs/architecture/状态字典与生命周期索引.md` 从当前文件导航升级为状态顶层设计与实现证据双层入口。中文 / English 两棵树保持对应，并以 `Current / Planned / Deferred` 区分当前 canonical 生命周期、已评审演进和长期边界；补齐订单行、生产 / 委外事实、库存预留和业务财务等当前状态族。顶层设计允许表达经正式评审的目标态，未实现内容不得混入 Current 证据或预占 canonical key。

完成：同步架构 README、文档清单、角色流程文档和 Workflow / Fact 边界入口；前后端 Workflow business status key 合同测试继续阻断显示映射漂移。全局活跃文档扫描未保留旧“为避免虚构而禁止目标态设计”口径。

验证：Node 24.14 下文档清单 / 活跃链接 3/3、Workflow 状态合同 4/4 通过；Go core status 与 Workflow business status 定向测试通过；`git diff --check` 通过。本轮未改 schema、migration、usecase、API、RBAC、页面 runtime、客户配置或部署。

下一步：后续新增状态先进入 owning layer 的正式评审并登记 `Planned`，代码 / Schema、流转、测试和必要显示映射就绪后再升级 `Current`；长期质检、MES 和完整财务边界保持 `Deferred`。

阻塞/风险：状态索引证明当前本地仓库设计和代码证据，不代表目标环境已发布；共享工作区仍有其他会话的大量未提交改动，提交时必须精确审查和暂存本轮路径。

## 2026-07-12 docs 与代码一致性审计

完成：按活跃正式文档、原型、归档和外部参考四类建立 `docs/` 全量清单，逐项核对当前真源、Ent schema / Atlas migration、biz/data/service、前端路由与配置、QA 脚本和现有工作区改动。修正生产订单 option API / provider / 事实联动状态、业务事实总评审、成品入库 Workflow / Fact 边界、客户交付矩阵、菜单评审、附件删除语义和中文真源路径等信息差。

验证：`docs-inventory.test.mjs` 通过，包含长期 Markdown 登记、失效路径和活跃文档本地链接检查；`phase-label-boundaries.mjs`、`agents-size.sh` 和 `git diff --check` 通过。归档前 `progress.md` 为 435 行 / 83,153 bytes，已超过 80 KiB 阈值，完整归档后仅保留当前活跃事项、最近记录和归档索引。

下一步：后续生产订单 UI / 菜单、客户配置、seed 或部署真正接入时，同步当前真源、能力台账、客户交付矩阵和生产订单边界评审；不用本地实现推断目标环境已发布。

阻塞/风险：`docs/reference/**` 是外部输入，`docs/archive/**` 是历史证据，本轮只核对分类、索引和链接，不用当前代码改写其历史内容。共享工作区仍有大量其他会话改动，本轮未暂存、提交或推送。

## 2026-07-12 生产订单可读引用选项与销售来源 eligibility

完成：新增 canonical `list_production_order_reference_options`，以 `pmc.plan.read` 和 production readable module gate 提供产品、SKU、单位、销售订单行、Active BOM 五类服务端分页投影。搜索与 `selected_ids` 历史回显严格互斥；历史模式不依赖级联字段，失效或缺失引用只返回不可选择的业务说明。销售订单行支持先搜索来源，再一次带回产品、SKU、单位；无前端全量 join、N+1 或 fallback。

完成：create/save/release 在同一事务锁定销售父单和来源行，并复核父单 active、行 open、产品/SKU/单位一致；精确 receipt 重放仍先于当前 eligibility。失败保持零订单部分写入、零状态推进和零 receipt。

验证：biz/data/service 定向测试、Go 全仓、build、`-race`、canonical API 与 critical PostgreSQL gate 静态守卫通过。新增真实 PostgreSQL 锁序测试已纳入 critical gate，但当前受控执行环境禁止连接本机 `127.0.0.1:55432`，因此本轮没有把该测试、full 或 strict 冒充为通过。

下一步：在允许访问隔离 PostgreSQL 的环境完成 critical/full/strict 后，再进入 production order UI / 通用菜单独立切片。

阻塞/风险：尚无 UI、菜单、seed、客户配置、部署或客户签收；共享工作区改动未暂存、未提交、未推送。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 归档索引

## 2026-07-12 权限中心岗位能力可读化

完成：权限中心角色模板接入后端现有 `menu_options` 投影，在不新增菜单权限真源的前提下，按当前勾选即时展示“可以进入 / 暂不可进入”的桌面菜单，并把功能勾选区改为甲方可理解的岗位能力说明。页面同时明确字段显示属于当前客户页面配置，不把尚不存在的字段级角色授权伪装成可配置能力。未保存状态不再常驻展示大块警告，只保留轻量状态；切换角色、切换 Tab、侧栏离开页面、刷新当前页和浏览器刷新时才确认，取消继续编辑，确认后丢弃草稿再执行动作。

完成：复核外部权限管理建议后撤回顶级“页面字段”Tab，避免把客户级列表 / CSV 显示配置误写成角色字段权限。角色详情收口为“功能权限 / 数据范围 / 敏感字段 / 生效页面预览”：功能权限继续走现有 RBAC 保存，页面只读投影继续由后端菜单映射推导；数据范围如实展示 Workflow 任务已有责任岗位 / 指定处理人边界和普通业务资源尚未隔离的现状；敏感字段明确要求后端查询、修改、导出和打印同源执行，当前不提供前端伪开关。

完成：内置菜单权限合同从单一 `RequiredPermissions + HasAny` 拆为显式 `RequiredAny / RequiredAll`，共享页面继续按任一相关读取权限进入，组合权限合同可独立表达并由 Go / 前端单测守住。JSON-RPC 菜单选项新增 `required_any / required_all`，暂保留合并后的 `required_permissions` 兼容旧消费者；权限中心生效页面预览优先消费新合同，旧 mock / 旧响应仍按 ANY 兼容。

验证：权限中心可见技术字段守卫 53/53、定向 ESLint、定向 Stylelint、`permission-center-desktop` 与暗色 loading/恢复态 style:l1、相关文件 `git diff --check` 均通过；浏览器证据覆盖角色能力视图、长菜单列表、账号 tab、窄区不横向溢出和暗色可读性。

下一步：后续若要让甲方逐字段查看或调整，必须基于 customer config 已接通的字段 surface 单独建设“页面字段配置”控制面；不能塞进角色 RBAC，也不能把当前仅三个列表 / CSV surface 的 `visible` 扩大表述为全页面字段权限。

阻塞/风险：本轮未修改 RBAC、schema、migration、后端菜单映射、客户字段策略、Workflow / Fact 或部署。共享工作区仍包含大量其他会话改动，提交时必须精确审查本轮文件。

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
- `docs/archive/progress-2026-07-12-before-agents-size-gate.md`：自定义 Skills 与项目 AGENTS 首轮治理过程记录。

## 2026-07-14 门禁审查最终收口

完成：pre-push 对新 remote ref 继续以单 SHA 扫描全部可达历史 secrets，但 full 聚合 diff 改为 `empty-tree..HEAD`，普通文件、schema 与事务 repo 不再因 `git diff HEAD` 空范围漏检。fast / full 的固定 Node 与 Go 测试统一增加 fail-closed 结果证明：必须有可解析 summary、实际执行数大于 0、失败与跳过均为 0；缺 summary、零执行、skip、cancelled 或 todo 均阻断。公开自签 coverage receipt 路径已删除，direct full 拒绝旧 coverage 环境变量并始终真实执行 secrets / govulncheck；pre-push 和 strict 只按真实子命令顺序聚合成功结果。

验证：Node 24.14.0 下门禁、hook、DB guard、CI 与 summary fixture 定向合同 66/66 通过、0 skip；真实 wrapper 定向执行前端 `pnpm test --test-reporter=tap` 13/13、Go JWT `go test -count=1 -json` 32/32，均为 0 skip。目标 `bash -n`、shellcheck、shfmt、yamllint、strict profile（26 gates / 102 required files）、Node 自动发现（83 files）及目标 diff-check 通过。这些仅证明本次纯 Node / 静态合同，不是冻结树 final full / strict 绿色。

下一步：consolidated migration owner 完成冻结树 Ent / Atlas regenerate、零漂移、fresh / upgrade 后，再按独占顺序运行 final `full.sh`、`strict.sh`、PostgreSQL 与产品页面 browser，并记录无 skip 环境、commit、工作树和完整结果；随后才能取得远端 CI / branch protection 证据。

阻塞/风险：当前 `internal/server` 仍因 Ent schema / generated drift 在 init panic，0 tests executed；客户资料边界仍有 4 fail；共享客户资料 WIP 删除了 `docs/customers/yoyoosun/raw-source-files/README.md` 而清单仍引用它，最新 docs inventory 为 2/3，本任务不越权修复；consolidated migration 尚未冻结、生成或验证；`.github/workflows/ci.yml` 仍未跟踪，远端 CI / required check / branch protection 无证据；冻结树 final full / strict / PostgreSQL / browser 均未运行。共享 dirty worktree 和其他 owner 改动继续保留，本轮未 stage、commit、push、deploy，也未把局部或移动快照写成最终门禁绿色。

## 2026-07-14 server/internal README 导航收敛

完成：将 `server/internal/biz/README.md` 从仅覆盖登录 / 账号的旧清单改为按身份控制面、Workflow / ProcessRuntime、MasterData / Source Document、库存质检 Fact、业务附件和受控开发验收组织的薄导航，并明确 `service -> biz -> core/data`、repository interface、Workflow task 与 Fact 写入边界。`server/README.md` 的目录职责表补充现有 `internal/devdbguard/`；未为小包、`core` 子包、Ent 生成目录或 `internal/server` 机械新增 README。

验证：改动前后 `node scripts/qa/docs-inventory.test.mjs` 均为 3/3 通过，改动后的 active Markdown 本地链接全部可解析；目标 `git diff --check` 通过。两份 README 的路径、标题、用途和分类未变化，因此不改 `docs/文档清单.md`。`progress.md` 更新前为 165 行 / 32,888 bytes，未达到 600 行 / 80 KiB 归档阈值。

下一步：只有当 `internal/server` 的中间件、健康检查、静态资源和 PDF 入口形成独立高频维护面时，再评审是否增加一份薄 README；当前继续由 `server/README.md` 统一导航。

阻塞/风险：本轮仅更新说明层，不改变 runtime、schema、migration、API、RBAC、部署或客户资料；共享工作树中既有并行改动继续保留，未 stage、commit、push 或部署。
