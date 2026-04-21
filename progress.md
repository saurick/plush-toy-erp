## 2026-04-20 23:58
- 完成：参考 `trade-erp` 的信息架构，为 `/Users/simon/projects/plush-toy-erp` 新增毛绒 ERP 初始化壳层，落地 `web/src/erp/` 的主路由、初始化看板、流程总览、帮助中心、文档页、资料准备页和角色移动端工作台；管理员登录后的默认入口已切到 `/erp/dashboard`，旧的通用 `AdminMenu / AdminGuide / AdminHierarchy` 页面已从路由移除并删除，避免继续被误认成真源。
- 完成：新增正式文档与接力材料，包括 `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`、`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`、`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`，并同步更新根 `README.md`、`web/README.md`、`docs/README.md`、`docs/project-status.md`、`docs/current-source-of-truth.md`，把当前边界明确为“先初始化流程、帮助中心、文档、移动端；拍照扫码和正式 Excel / 合同打印后置”。
- 完成：统一端口口径，`server` 默认 HTTP / gRPC 端口收口到 `8200 / 9200`，PostgreSQL 宿主机映射默认改为 `5435`，并同步更新 `server/configs/*`、`server/deploy/compose/prod/*`、`server/docs/*`、`server/Dockerfile`、`server/cmd/dbcheck/main.go` 与 `server/Makefile` 示例。
- 完成：执行验证 `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test && pnpm build && pnpm style:l1`、`cd /Users/simon/projects/plush-toy-erp/server && go test ./...`、`bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict` 全部通过，其中 `style:l1` 已覆盖公共首页、管理员登录、ERP 看板、帮助中心、移动端工作台和资料准备页共 `8` 个场景。
- 下一步：等更多合同 / Excel / 移动端样本到位后，优先把字段真源、导入链路和打印模板挂到当前 `docs/changes/plush-erp-bootstrap-init.md` 的主路径里继续做，不要回退到 `trade-erp` 的外贸业务模型上补丁。
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
- 阻塞/风险：本轮只更新协作文档，没有触达运行时代码、部署脚本或测试；`trade-erp` 与 `webapp-template` 未同步改动，因为它们已有更强的真源/主路径约束，重复添加只会增加噪音。
