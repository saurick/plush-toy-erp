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
