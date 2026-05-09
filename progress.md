## 2026-05-09 11:57
- 完成：按 trade-erp 同口径把桌面业务表单里的条目卡片滚动边界上移到整组明细。当前明细真源仍为表单 / 业务记录 `items` 数组，本轮只改前端布局和 L1 断言，不改保存、带值、打印、导出、后端或数据库。`BusinessModulePage.jsx` 现在复用一次 `itemRowMinWidth`，用 `.erp-business-record-form__items-scroll` 统一承接横向 / 纵向滚动，单个 `.erp-item-card` 不再各自接管横向滚动；`app.css` 删除逐条滚动样式，改为整组滚动容器；`styleL1.mjs` 同步验证整组滚动容器和联系人明细 focus 恢复态。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint`、`pnpm css`、`pnpm test`，全量 node test `270` 条通过；已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1`，真实浏览器 `45` 个场景通过，覆盖业务模块新建弹窗、BOM 明细弹窗、客户/供应商联系人明细 focus、默认态 / 交互态 / 恢复态和相邻页面。
- 下一步：如甲方还希望条目区高度更小或横向滚动条固定可见，可再按真实使用反馈调整 `.erp-business-record-form__items-scroll` 的 `max-height` 或补粘性横向滚动条；当前实现先保持整组滚动，不重排条目字段。
- 阻塞/风险：未更新 `docs/current-source-of-truth.md`、产品化文档或帮助中心正式口径，因为本轮是局部表单布局调整，不改变业务能力、架构边界、菜单入口、字段真源、数据模型或交付状态。当前工作区仍有本轮外改动（如部署、顶部摘要、表头排序相关文件），本轮未回退这些现场。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 11:54
- 完成：按 trade-erp 同口径给桌面业务列表补表头排序。`BusinessModulePage.jsx` 现在维护表头排序状态，点击任一可见列名可升序 / 降序排列，顶部“最新 / 最早”切换会清空表头排序并回到创建时间排序；导出当前结果沿用当前筛选、列顺序和页面排序。`moduleRecordSort.mjs` 收口为统一排序工具：默认仍按 `created_at`，表头排序支持普通字段、`payload.*` 路径、数字、文本和明细数组长度，空值固定排最后。本轮只改变前端展示和导出顺序，不改变 `business_records` 真源、保存、流转、后端或数据库。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm exec node --test src/erp/utils/moduleRecordSort.test.mjs`、`pnpm lint`、`pnpm css`、`pnpm test`；全量前端 node test `273` 条通过。未执行 `pnpm style:l1`，因为本轮排序改动不触达样式布局，且当前工作区已有条目滚动相关样式 / L1 脚本现场。
- 下一步：如需更强浏览器级验收，可在现有条目滚动现场收口后，补一个业务页点击客户名称、金额和明细列的浏览器回归场景。
- 阻塞/风险：当前工作区已有本轮外改动 `/Users/simon/projects/plush-toy-erp/web/Dockerfile`、`/Users/simon/projects/plush-toy-erp/web/scripts/serveStaticApp.mjs`、`/Users/simon/projects/plush-toy-erp/web/scripts/styleL1.mjs`、`/Users/simon/projects/plush-toy-erp/web/src/erp/styles/app.css`，且 `BusinessModulePage.jsx` 中已有顶部摘要和条目滚动改动；本轮未回退这些现场。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 11:49
- 完成：按 trade-erp 同口径收口桌面业务页顶部摘要。当前展示层在 `/Users/simon/projects/plush-toy-erp/web/src/erp/pages/BusinessModulePage.jsx` 统一隐藏客户、供应商 / 加工厂、主责角色等分类 chip，并且工具栏摘要只在 `summaryMetric` 为金额类时显示 `金额合计`；数量类业务页不再显示 `数量合计` 摘要 chip。顶部 `总记录 / 当前结果 / 已选记录` 仍保留为筛选与选中态反馈。本轮不改保存、导入、打印、导出、后端、数据库或业务字段真源。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint`、`pnpm css`、`pnpm test`，其中 node test `270` 条通过；已执行 `STYLE_L1_SCENARIOS=business-processing-contracts-desktop,business-reconciliation-desktop pnpm style:l1`，`2` 个业务页浏览器场景通过，覆盖默认业务页与金额业务页相邻布局。完整 `pnpm style:l1` 仍失败在既有 / 并行的 `business-partners-contact-focus` 联系人条目卡片横向滚动容器断言，失败点是条目卡片滚动样式，不是本轮顶部摘要路径。
- 下一步：如需恢复完整 L1 绿灯，先收口当前工作区里条目卡片统一滚动相关改动对客户/供应商联系人明细的影响；本轮摘要改动无需回退。
- 阻塞/风险：当前工作区已有本轮外改动 `/Users/simon/projects/plush-toy-erp/web/Dockerfile`、`/Users/simon/projects/plush-toy-erp/web/scripts/serveStaticApp.mjs`，且执行期间同一工作区出现 `/Users/simon/projects/plush-toy-erp/web/src/erp/styles/app.css` 与 `BusinessModulePage.jsx` 的条目滚动相关改动，本轮未回退这些现场。未更新 `docs/current-source-of-truth.md`、系统层进度或产品化文档，因为本轮只是业务页摘要展示口径，不改变业务保存真源、架构边界、菜单入口、部署方式或产品化状态。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 00:21
- 完成：按“本地构建、服务器只加载运行”的部署主路径，将 `plush-toy-erp` 发布到 `8.218.4.199`。本地构建 linux/amd64 的服务端与 Web 镜像并通过 `docker save | ssh docker load` 上传；服务器侧只执行 `docker load`、`docker compose up`、`migrate_online.sh --apply` 和健康检查。补齐 Compose 运行时必需的 `APP_JWT_SECRET / APP_ADMIN_USERNAME / APP_ADMIN_PASSWORD` 环境变量映射，修复 Web 静态服务 `/healthz` 未定义 `appId` 导致健康检查 500 的问题，并将 Dockerfile 的 pnpm 版本固定到 `10.13.1`、移除服务端 Dockerfile 对远端 BuildKit cache mount 的强依赖。因云侧高位 Web 端口未稳定公网命中，服务器新增只匹配 `Host: 8.218.4.199` 的 Nginx HTTP 入口，将 `http://8.218.4.199/` 反代到桌面端 `127.0.0.1:5175`，不影响既有 `openai.saurick.space` 配置。
- 验证：本地已执行 `docker buildx build --platform linux/amd64 --load -f server/Dockerfile -t plush-toy-erp-server:dev .`、`docker buildx build --platform linux/amd64 --load -f web/Dockerfile -t plush-toy-erp-web:dev .`，并用临时 Web 容器确认 `/healthz` 返回 `200`。服务器已执行 migration，`sh migrate_online.sh --status-only` 显示 `Migration Status: OK`、当前版本 `20260426142444`、pending `0`；Compose 中 PostgreSQL 与 9 个 Web 容器均为 healthy，后端 `/healthz`、`/readyz` 通过；公网 `http://8.218.4.199/`、`/healthz`、`8300/readyz` 通过，静态资源和管理员登录 JSON-RPC 已通过最小请求校验。同步执行 `docker compose -f server/deploy/compose/prod/compose.yml config --quiet`、`bash scripts/project-scan.sh --strict`、`git diff --check`。
- 下一步：如果需要移动端公网直连，优先在云安全组开放 `5186-5193` 或为每个移动端分配独立域名 / 网关 Host；不要在未调整构建 base path 的情况下直接挂路径前缀。初始管理员密码只保存在服务器 `.env`，不要在聊天或文档中明文传播。
- 阻塞/风险：本轮未执行完整浏览器登录后的业务页面回归，也未调整阿里云安全组；移动端固定端口当前已在服务器本机健康，但从本机公网链路访问高位端口未命中服务器，公网入口目前以 Nginx 的桌面端 HTTP 入口为准。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-09 00:40
- 完成：把 trade-erp 的服务端镜像构建缓存与 PDF/Chrome 运行时口径同步到本项目。`server/Dockerfile` 改为 Go 1.26.2 builder、Debian bookworm runtime，内置 `chromium` 与 `fonts-noto-cjk`，将动态版本参数放到 Chromium / 字体安装层之后，并恢复 Go module / build cache mount；`.dockerignore` 补充本地构建产物和 QA 输出排除；`server/Makefile` 同步默认构建镜像。PDF 引擎继续以 `server/internal/server/template_pdf.go` 的共享 Chromium manager 为运行时缓存真源，本轮补齐 Playwright Chromium 本地兜底探测和 manager 复用 / 重启 / 清理单测。Compose / `.env.example` / 部署文档 / 后端运行配置文档同步 `ERP_PDF_CHROME_PATH=/usr/bin/chromium`、`ERP_PDF_RENDER_CONCURRENCY=2` 与 app 容器内存预算。
- 验证：已执行 `cd /Users/simon/projects/plush-toy-erp/server && go test ./internal/server -run 'TestResolveTemplatePDF|TestTemplatePDFChromeManager|TestAdminRequestVerifier'`、`cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod && docker compose -f compose.yml config`、`cd /Users/simon/projects/plush-toy-erp && git diff --check`。已执行 `DOCKER_BUILDKIT=1 docker build -f server/Dockerfile -t plush-toy-erp-server:pdf-cache-check .`，构建通过；已用临时镜像确认 `/usr/bin/chromium --version` 返回 Debian Chromium，镜像环境包含 `ERP_PDF_CHROME_PATH=/usr/bin/chromium`；临时校验镜像已删除。
- 下一步：后续发布时继续按本地/CI 构建、服务器只 `docker load` / `docker compose up` 的主路径执行；如果同机内存紧张，优先降低 `ERP_PDF_RENDER_CONCURRENCY`，再评估是否调整 `APP_MEM_LIMIT`。
- 阻塞/风险：本轮不改 PDF HTML 快照、打印模板字段、业务数据、schema 或线上服务；观测性仍沿用 `/templates/render-pdf` 既有 handler、span 与结构化日志，本轮未新增 HTTP 入口。当前工作区还存在本轮前的 `web/Dockerfile`、`web/scripts/serveStaticApp.mjs` 等未提交现场，本轮未回退也未纳入 PDF/Chrome 迁移验收。更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-08 23:59
- 完成：按低配服务器发布口径补充部署构建边界，更新 `AGENTS.md`、`docs/deployment-conventions.md`、`server/deploy/README.md` 和 `server/deploy/compose/prod/README.md`，明确服务器只负责加载已构建镜像、启动 Compose、执行 migration 与部署后检查；服务端/前端镜像必须先在本地或 CI 构建并上传。
- 下一步：后续如补发布脚本，可继续把该规则做成脚本级 preflight，检测到远端执行构建命令时直接阻断。
- 阻塞/风险：本轮只更新正式部署口径和协作规则，未触达运行时代码、schema、Compose 配置或线上服务；更新前已检查 `progress.md` 规模，未达到归档阈值。

## 2026-05-06 22:52
- 完成：将本项目后端默认端口从 `8200 / 9200` 收口到 `8300 / 9300`，同步更新 dev/prod 配置、Compose 默认反代与映射、Docker 暴露端口、`server` dev 清理端口、前端 Vite 代理、真实登录回归默认后端地址，以及 README、后端运行/配置文档和前端帮助文档口径；本轮未涉及 schema、migration 或业务字段真源。
- 下一步：后续启动本项目后端前，先确认 `8300 / 9300` 未被其他本机服务占用；若已有外部 `.env` 或线上网关配置，需按同一端口口径同步调整。
- 阻塞/风险：当前仓库内历史进度记录仍保留旧端口作为历史流水，不作为当前部署真源；本轮尚未启动后端或执行完整前后端测试。

## 2026-05-03 21:33
- 完成：提交毛绒 ERP 当前系统层与业务表单推进现场。前端补齐客户/供应商/产品主档选择与快照字段、业务模块表单布局、帮助中心文档入口、系统层进度与产品化交付文档；服务端同步推进 RBAC、工作流与调试种子相关边界。主档字段当前真源为基础资料模块，业务单据保存快照用于回显和后续流转，表单选择器负责带值与清值。
- 下一步：继续围绕主档选择器、业务单据快照和移动端任务权限做字段链路回归；若后续触达保存或打印链路，需要继续覆盖“选择新主档覆盖旧快照 / 清空主档清值 / 快照缺失不伪造值”。
- 阻塞/风险：本轮属于毛绒 ERP 初始化推进，仍有部分产品化文档和系统层功能处于演进中；当前提交不代表业务模型已经最终冻结。

## 2026-05-03 18:41
- 完成：收紧 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 中的 `progress.md` 归档规则，明确每次更新前先检查规模；达到或超过 `600` 行或 `80KB` 时，必须先显式归档旧记录再追加本轮记录，并禁止通过 pre-commit、pre-push 或后台脚本静默自动改写。本轮只更新协作规则和本进度记录，不改变毛绒 ERP 正式口径、数据模型草案、部署配置、运行时代码或既有变更文档。
- 下一步：后续更新 `progress.md` 时按 `600` 行 / `80KB` 双阈值执行；阶段完成或历史内容影响查找时，可提前人工归档。
- 阻塞/风险：当前工作区仍有其他业务改动未纳入本轮规则提交；本轮未回退、整理或验证这些业务改动。

## 2026-05-03 18:05
- 完成：将 `progress.md` 人工归档规则写入 `/Users/simon/projects/plush-toy-erp/AGENTS.md`，明确进度文件只作为过程流水和交接线索，不作为当前正式需求、数据模型或部署真源；禁止定时自动清空，改为在文件明显过大、阶段完成或历史内容影响查找时人工归档。本轮未执行实际归档，也未创建 `docs/archive/`，原因是当前 `progress.md` 只有少量近期记录，且 `docs/changes/plush-erp-bootstrap-init.md` 仍是 `in_progress` 活跃变更。
- 下一步：等阶段完成或 `progress.md` 明显变大后，再按规则把旧流水移动到 `docs/archive/progress-YYYY-MM.md`，并同步更新 `docs/README.md` 的归档入口。
- 阻塞/风险：本轮只更新协作规则与进度记录，不改变毛绒 ERP 正式口径、数据模型草案、部署配置、运行时代码或测试样本；当前工作区已有大量业务改动，本轮未回退或整理。

## 2026-04-21 00:26
- 完成：把本地开发数据库真源从误配的 `127.0.0.1:5435/plush_toy_erp` 收口到共享 PG `192.168.0.106:5432/plush_erp`。已同步更新 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml`、`/Users/simon/projects/plush-toy-erp/server/configs/dev/config.local.example.yaml`、`/Users/simon/projects/plush-toy-erp/server/cmd/dbcheck/main.go`、`/Users/simon/projects/plush-toy-erp/server/Makefile`、`/Users/simon/projects/plush-toy-erp/server/docs/*` 和根 README，避免后续再把 Compose 宿主机映射 `5435` 误当成日常开发默认 DSN。
- 完成：补充正式数据模型草案 `/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`，明确当前 `server/internal/data/model/schema/*.go` 只有 `users / admin_users` 两张账号表，只能算登录基线，不应误判为毛绒 ERP 的正式业务表设计；同时给出首批更适合毛绒工厂的实体建议，并明确当前不应照搬旧外贸主表，也不应先上 `erp_module_records` 这种泛 JSON 真源。
- 验证：本轮还未直连 `192.168.0.106` 做库创建或授权校验，因为当前会话没有 `zos_test_user / test_user` 的密码；只确认了客户端报错是 `fe_sendauth: no password supplied`，因此“你在 PG 客户端看不到该库”的剩余分支只可能是 `1)` `plush_erp` 还没在 `192.168.0.106` 创建，或 `2)` 当前登录账号尚未被授予该库的 `CONNECT` / 建表权限。

## 2026-04-20 23:58
- 完成：参考旧外贸项目的信息架构经验，为 `/Users/simon/projects/plush-toy-erp` 新增毛绒 ERP 初始化壳层，落地 `web/src/erp/` 的主路由、初始化看板、流程总览、帮助中心、文档页、资料准备页和角色移动端工作台；管理员登录后的默认入口已切到 `/erp/dashboard`，旧的通用 `AdminMenu / AdminGuide / AdminHierarchy` 页面已从路由移除并删除，避免继续被误认成真源。
- 完成：新增正式文档与接力材料，包括 `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`、`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`、`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`，并同步更新根 `README.md`、`web/README.md`、`docs/README.md`、`docs/project-status.md`、`docs/current-source-of-truth.md`，把当前边界明确为“先初始化流程、帮助中心、文档、移动端；拍照扫码和正式 Excel / 合同打印后置”。
- 完成：统一端口口径，`server` 默认 HTTP / gRPC 端口收口到 `8200 / 9200`，PostgreSQL 宿主机映射默认改为 `5435`，并同步更新 `server/configs/*`、`server/deploy/compose/prod/*`、`server/docs/*`、`server/Dockerfile`、`server/cmd/dbcheck/main.go` 与 `server/Makefile` 示例。
- 完成：执行验证 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test && pnpm build && pnpm style:l1`、`cd /Users/simon/projects/plush-toy-erp/server && go test ./...`、`bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict` 全部通过，其中 `style:l1` 已覆盖公共首页、管理员登录、ERP 看板、帮助中心、移动端工作台和资料准备页共 `8` 个场景。
- 下一步：等更多合同 / Excel / 移动端样本到位后，优先把字段真源、导入链路和打印模板挂到当前 `docs/changes/plush-erp-bootstrap-init.md` 的主路径里继续做，不要回退到旧外贸业务模型上补丁。
- 阻塞/风险：本轮只初始化了前端信息架构、文档与配置口径，还没有接真实业务实体、Excel 导入、合同打印或扫码链路；相关入口目前都明确标成“待资料接入 / 本轮暂缓”，不应误判为已经交付。

## 2026-04-19 11:18
- 完成：继续收紧 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的工程原则，移除“先理解现状，再做最小必要改动”这句容易引发误读的表述，改为“先确认真源与主路径，再决定改动范围；改动应完整解决当前问题，最小化的是无关影响和额外复杂度，而不是靠局部补丁或 fallback 蒙混过关”。
- 下一步：后续若该仓库出现多来源字段、导入回填、打印映射或多主路径部署场景，可再按实际问题继续细化专项约束；当前工程原则层面已把“完整修主路径”讲清楚。
- 阻塞/风险：本轮仍然只更新协作文档，没有触达运行时代码和测试；剩余风险主要来自后续执行时是否严格按新口径落地，而不是文案本身。

## 2026-04-19 18:40
- 完成：更新 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的 Git 约定，明确“默认不要用 `git stash` 隐藏主工作区现场；若误用 stash，必须同轮盘点、恢复唯一内容并清理”。后续该仓库若需要隔离脏工作区，优先 `git worktree` 或按路径精确提交/检查，不再把 stash 当默认中转层。
- 下一步：若后续该仓库真的出现“主工作区很脏但只想提交一小部分”的现场，按这次新规则直接用 worktree 或精确 stage，不再临时造 stash。
- 阻塞/风险：本轮只更新协作文档，没有触达运行时代码、测试或部署脚本；剩余风险主要是执行层是否严格遵守，不是文案本身。

## 2026-04-19 11:15
- 完成：更新 `/Users/simon/projects/plush-toy-erp/AGENTS.md` 的工程原则，补充“定位或修复时先确认当前真源与主路径，并优先做完整且最简洁的主路径修复”的明确约束，避免把“最小必要改动”误读成局部最小补丁、临时兜底或 fallback 式修补。
- 下一步：后续若 `plush-toy-erp` 增加更复杂的交接、部署或多主路径约束，可再按实际场景扩展项目级 `AGENTS.md`；当前这条已足够覆盖本轮歧义。
- 阻塞/风险：本轮只更新协作文档，没有触达运行时代码、部署脚本或测试；旧外贸项目与 `webapp-template` 未同步改动，因为它们已有更强的真源/主路径约束，重复添加只会增加噪音。
