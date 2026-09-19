# Ent + Atlas 数据模型与迁移

Ent schema 负责数据结构，Atlas 负责版本化 migration；生成代码位于 `server/internal/data/model/ent`，迁移位于 `server/internal/data/model/migrate`。以下生成与迁移命令在仓库的 `server/` 目录执行。
**严禁** 绕过 Atlas 直接创建或改写结构迁移，也严禁手动执行
`ALTER TABLE` / `CREATE TABLE`。Ent 无法表达的一次性数据回填或历史对象
退出必须走下文的受控 Atlas custom migration，不得混入普通结构迁移或直接写
目标数据库。本项目不接受自定义 PostgreSQL Function、Procedure 或非内部
Trigger；业务规则必须收口到 Go repository/usecase 与声明式
CHECK/UNIQUE/FK 约束。

## 数据结构变更

1.  **修改 Ent Schema (Go 代码)**:
    修改位于 `server/internal/data/model/schema/*.go` 的 Go 文件。
    例如：在 `Fields()` 方法中添加 `field.String("new_col")`。

2.  **生成迁移文件**:
    在 `server/` 目录下运行以下命令：
    ```bash
    make data
    ```
    *解释：此命令会自动运行 `atlas migrate diff` (根据你的 schema 变更生成 `.sql` 文件) 和 `ent generate` (更新 Go 客户端代码)。*

    生成后必须审查新增 SQL。命中 `DROP TABLE` / `DROP COLUMN`、类型变更、
    `SET NOT NULL`、带默认值的非空列、存量表已验证 CHECK/FK、高增长表索引、
    DDL 与 DML 混合等风险时，在 migration 顶部填写以下元数据；普通低风险
    migration 不需要机械添加：

    ```sql
    -- migration-risk: maintenance
    -- affected-table: inventory_txns
    -- expected-lock: ACCESS EXCLUSIVE
    -- preflight: scripts/qa/database-constraint-preflight.sql
    -- recovery: restore-backup-or-forward-fix
    -- maintenance-required: true
    ```

    `preflight` 必须指向仓库中现存的只读 `scripts/qa/**` 文件；它只能盘点并
    fail closed，不能静默修数据。默认迁移合同固定为 `tx-mode=all`，所以
    `CREATE/DROP INDEX CONCURRENTLY`、`VACUUM`、`ALTER SYSTEM`、
    `CREATE/DROP DATABASE` 不得进入普通 migration。确有需要时先建立独立的
    非事务执行合同、状态读回和中断恢复方案，不能靠元数据绕过门禁。

3.  **检查、预演、应用迁移**:
    登记共享开发库在人机终端只运行一个主入口：
    ```bash
    make migrate
    ```
    它会只读核对 status，需要准备升级时，先对当前工作区执行迁移链路 QA
    （包括尚未提交的文件），通过后再停后端、Atlas validate / dry-run、全部 pending SQL
    的同事务真实预演并 `ROLLBACK`、真实备份与隔离恢复验证、migration 与目标
    身份复核，然后要求输入一次可读的完整确认串。确认通过后才整批以
    `tx-mode=all` apply，并在同一目标读回 Atlas status、Ent / PostgreSQL schema、
    可编程对象和 health / ready。

    开发过程中可单独运行 `make migrate_check`，无需先提交代码。它验证当前
    工作流与流程节点的 schema 合法状态与存量预检规则、实际备份脚本的参数，以及准备 / 执行 / 恢复
    合同；不连接目标库，不停止后端，不生成或执行 migration。页面与 CLI 的
    准备升级计划都会自动执行同一检查，失败、零测试、缺少结果或跳过测试均阻断准备。
    CLI 检查到目标已是最新版本时，只读返回 `up_to_date`；单独检查代码使用 `make migrate_check`。
    修改 schema 状态时仍须补相应的隔离 PostgreSQL 升级回归；这项快速检查不
    替代真实数据预演和备份恢复。操作记录保留失败阶段，以及已核对到的目标
    版本和迁移文件指纹；原始诊断仅留本地终端，公开记录不返回敏感日志。

    CI / Codex 等非交互环境必须显式分成两个阶段：
    ```bash
    make migrate_prepare
    # 原样执行 ready 输出的下一条命令，例如：
    MIGRATE_OPERATION_ID='<同一次 ready 输出>' \
    MIGRATE_OPERATION_CONFIRM='<同一次 ready 输出>' \
    make migrate_execute
    ```
    `migrate_prepare` 成功只表示 `writes=0 / ready`，不能冒充迁移完成；裸
    `make migrate` 在非交互环境以 `ACTION_REQUIRED` / exit 2 停止，且不会先做
    plan、备份或写库。`migrate_status` 保留为只读诊断。为兼容旧操作习惯，裸
    `make migrate_plan` 进入同一高层 prepare；裸 TTY `make migrate_apply`
    恢复唯一 ready operation，找不到时重新准备并等待完整确认。只有携带完整
    内部确认的调用才进入底层 plan / apply 守卫，旧目标不会再因缺 token 必然失败。

    终态字段、确认值和未知结果处理见下文“共享开发库终端回执”。

4. **Ent 无法表达的一次性 data / cleanup migration**:
   先完成结构 schema 与 `make data`，再由单一 migration owner 创建空的
   Atlas migration：
   ```bash
   atlas migrate new <name> --dir file://internal/data/model/migrate
   ```
   该 migration 只允许承载已评审的一次性 `UPDATE` / `DELETE` 数据转换，
   或精确退出冻结历史对象的 `DROP`；不得在这里手写 `CREATE TABLE` /
   `ALTER TABLE` 来替代 Ent，也不得新增 Function、Procedure、Trigger 或
   `EXECUTE FUNCTION/PROCEDURE`。冻结历史 migration
   `20260714055825_customer_config_append_only_and_role_backfill.sql`
   不能改写；其对象由后续 forward migration 精确退出，不能复制为新做法。
   完成后必须运行：
   ```bash
   make migrate_hash
   make data
   GIT_OPTIONAL_LOCKS=0 git -c diff.autoRefreshIndex=false diff -- internal/data/model/ent internal/data/model/migrate
   ```
   再次 `make data` 后比较本轮生成物，确认没有继续变化，并运行 `bash ../scripts/qa/db-guard.sh`。补 fresh、upgrade、失败数据 fail-closed 与数据库负向测试。Atlas OSS
   schema inspect 不覆盖 Function / Trigger，因此零结构漂移之外还必须通过
   `db-guard` 静态门禁和目标库目录读回：
   `non-system-schema function=0 / procedure=0 / non-internal-trigger=0`。PostgreSQL 为
   外键生成的 `tgisinternal=true` 内部 Trigger 属于约束内部实现，不在删除
   范围。

5.  **只补齐当前开发库已有迁移时的做法**:
    如果问题已经明确定位为“代码和迁移文件都已存在，但当前开发库还没 apply 到最新版本”，不要重新生成 migration，也不要手动改库；直接在 `server/` 目录按上一节运行 `make migrate`，或在非交互环境运行同一次 operation 的 `migrate_prepare → migrate_execute`。成功结果必须同时证明：
    - 准备阶段的真实事务预演明确 `ROLLBACK`，备份与隔离恢复通过
    - execute 返回 `applied_verified`，且执行前重新核对了备份文件身份
    - Atlas status 为 `pending=0`
    - Ent / PostgreSQL schema 同目标读回零差异，health / ready 通过
    - 终态回执为 `result=passed` 或已经最新时的 `result=up_to_date`；真实 apply
      必须同时为 `writes=committed / apply=executed_once`，no-op 必须为
      `writes=0 / apply=skipped`

    **注意：**
    - 开发 plan/apply 只接受 loopback 的 `plush_erp*` 隔离库，以及 application config 精确命中的 `192.168.0.133:5432/plush_erp` / `plush_erp_*_dev`。环境变量覆盖同一共享地址也不会被当成登记目标。
    - 如果当前 shell 里还带着旧的 `DB_URL`、`POSTGRES_DSN`、`USE_ENV_DB_URL=1` 或其他连接环境变量，必须先确认 `make migrate_status` 的脱敏目标。
    - 如果目标库可能是生产库、共享测试库，或当前无法明确判断数据库归属，必须先说明将命中的库和风险，再等待确认。
    - `result=not_proven`、`writes=unknown` 或
      `next_action=run_status_no_auto_retry` 表示提交结果无法证明；只允许重新执行
      `make migrate_status` 并核对 operation，不得自动重试 apply 或使用
      `migrate_set`。
    - `20260726173924` 之后的 operational fact lifecycle 审计不会猜测
      `posted_by / settled_by / cancelled_by`。只读审计失败时，只能从权威审计
      来源精确治理，或在确认数据可丢弃并备份后重建个人开发库；不得填固定
      管理员、放宽约束或用 `migrate_set` 跳过。

## 迁移历史与禁止旁路

- 不得用编辑器自行命名并创建 migration；普通结构迁移使用
    `make data`，上述一次性 data / cleanup migration 使用 `atlas migrate new` 并重新计算
    checksum。
- 不得试图通过 `INSERT INTO` 或 `ALTER TABLE` 直接“修复”数据库结构而不走迁移流程。Atlas 会检测到结构漂移 (drift) 并报错。
- 不得新增数据库 Function、Procedure、Trigger 或以
    `EXECUTE FUNCTION/PROCEDURE` 把业务逻辑藏进数据库；测试故障注入也不得
    创建这些对象。
- 已执行 migration 不改写或删除，纠正使用新的正式 migration。

## 异常处置

*   **Checksum Mismatch (校验和不匹配)**: 先用 Git 恢复被改写的已有 migration SQL；禁止重新 hash 掩盖历史漂移。`make migrate_hash` 只允许在新增、尚未跟踪的 custom migration 后更新 `atlas.sum`，并会拒绝任何已跟踪 SQL diff。
*   **Atlas 版本不一致**: 本地、CI 和发布统一使用 `v1.2.0`。`make data` / `make migrate_hash` 只检查版本，不再联网自动安装或静默替换 Atlas。
*   **开发库只是落后于仓库已有 migration**: 登记共享开发库执行 `make migrate`，非交互环境执行同一次 operation 的 `migrate_prepare → migrate_execute`；不要因为“缺字段”就重新 `make data`，也不要跳版本。
*   **Drift Detected / Duplicate Column (字段已存在)**: 这通常表示数据库曾被手动改过，或当前库状态已经偏离迁移历史；不要把它和“开发库单纯还没 apply 最新 migration”混为一谈。先做结构和 revision 对账。通用 `make migrate_set` 已封闭；极少数“SQL 已完整执行但 revision 回执缺失”的异常只能另建一次性专项修复，绑定备份、schema 指纹、checksum、停写确认和修复后读回，不能用于跳过失败的数据门禁。

## 数据库表数据字典

[数据库字典](database/README.md) 由当前 Ent generated migration descriptor 与 `table-catalog.json` 生成；不连接目标数据库。在 `server/` 执行：

```bash
go run ./cmd/schema-doc --write
go run ./cmd/schema-doc --check
```

第一条更新生成物，第二条要求无漂移。只改业务语义 catalog 或文档引用时使用该生成器；改 Ent schema 仍必须走 `make data` 与正式迁移合同。不要手改生成的 Markdown。

## 生成入口

`make data` 生成并审查 Ent 与 Atlas 变更；`make ent_generate`、`make ent_migrate` 是按需的生成子入口，`make migrate_hash` 只接受新增未跟踪的 custom migration，不重算已执行历史。当前系统不依赖 entimport 反推 schema；接手无 schema 的既有数据库需独立评审。


## 共享开发库终端回执（Migration terminal receipt）

上述六个共享开发库入口在成功、无需执行、等待确认、前置阻断、执行失败或结果无法证明时，都会在终端末尾输出恰好一组 `[migration-summary]`。旧的 `[migration]` / `[migration-workflow]` 进度与机器解析行暂时保留，新的稳定终态字段如下：

| 字段 | 口径 |
| --- | --- |
| `command / mode / phase` | 本次入口、运行模式和停止阶段。 |
| `target` | 仅输出 scope、host、port、database；目标尚未安全解析时明确为 `unavailable`。 |
| `current / latest / applied / pending` | 已安全读到的同目标 Atlas 状态；读不到时明确为 `unknown`，不拿旧状态补造。 |
| `result` | `passed / up_to_date / ready / action_required / blocked / failed / not_proven / already_applied`。 |
| `writes` | `0` 表示已证明本次未写库；`committed` 表示一次正式 apply 已提交并完成读回；`unknown` 表示提交结果无法证明。 |
| `apply` | `not_requested / not_started / skipped / attempted_once / executed_once / already_executed`，描述本次调用与正式 apply 的关系。 |
| `operation` | 高层 operation UUID；尚未创建时为 `none`。 |
| `runtime` | health / ready 状态；未检查或读不到时为 `unknown`。 |
| `error_code / next_action` | 稳定错误分类和下一动作 token；成功时 `error_code=none`。 |

`auto_retry=false` 是固定安全边界。尤其看到 `result=not_proven`、`writes=unknown` 或 `next_action=run_status_no_auto_retry` 时，只能重新运行只读 `make migrate_status` 并核对 operation，不得自动重试 apply 或执行 `migrate_set`。`make` 自身可能把子进程的 exit 1 / 2 都表现为 recipe 失败，自动化应同时读取 `result`，不能只看最外层 exit code。

回执不会包含用户名、密码、完整 DSN、原始错误或确认值；原始人类可读错误另行脱敏输出到 stderr。为了让显式 `migrate_prepare → migrate_execute` 仍可操作，prepare 的受控 continuation 会在回执前单独给出本次 operation 的确认变量；低层 `migrate_status / plan` 为现有服务端 parser 保留的旧机器行也可能在回执前给出内部确认。它们都不是通用回执字段，不应复制进日志、工单或聊天。终端回执也不替代备份、隔离恢复、停写、目标 identity、一次 apply 和同目标读回证据。

## 数据库连接与执行超时

存量升级预检按目标库已完整应用的状态机 migration 判断合法状态。流程节点和
工作流任务的 `withdrawn` 分别在 `20260811111811`、`20260811122746` 完成后
才被接受；旧升级检查点仍拒绝提前出现的状态，流程关联、版本和结束时间检查
继续执行。预检失败时迁移页保留具体阻断分类，正式 apply 不会开始。

高层 `make migrate` 停止本项目后端后，会按数据库会话的实际状态判断风险，不按
客户端名称判断。没有事务、没有快照或 advisory lock、状态为 `idle / ClientRead`
的普通连接（包括 DbGate）只输出脱敏的 `[migration-client]` 诊断并直接放行，不要求
关闭，也不会调用 `pg_terminate_backend`。活动查询、打开事务、持有快照 / advisory
lock 或状态不明的连接仍以 `database_clients_active` 阻断，并显示客户端 PID、应用名、
状态、来源和阻断原因。plan 预演后与正式 apply 前会再次复核；Atlas 正式 apply 使用
`tx-mode=all`，同时限制 advisory lock 等待为 10 秒、表锁等待为 5 秒、整批语句为
120 秒，冲突时停止且不自动重试。交互与非交互入口使用同一会话安全边界。
