# CD 收口前迁移历史记录归档 / Progress Archive Before CD Closeout

2026-09-17 从 `progress.md` 原样移出两段已完成的共享开发库迁移记录。下文只保留历史过程，当前数据库和发布状态以正式工具读回为准。

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
