# 🤖 AI 助手数据库变更操作手册 (必读)

**STOP! 在修改数据库或创建 `.sql` 文件之前，请务必阅读本指南。**

本项目使用 **Ent** 和 **Atlas** 进行版本化的数据库迁移。
**严禁** 绕过 Atlas 直接创建或改写结构迁移，也严禁手动执行
`ALTER TABLE` / `CREATE TABLE`。Ent 无法表达的一次性数据回填或历史对象
退出必须走下文的受控 Atlas custom migration，不得混入普通结构迁移或直接写
目标数据库。本项目不接受自定义 PostgreSQL Function、Procedure 或非内部
Trigger；业务规则必须收口到 Go repository/usecase 与声明式
CHECK/UNIQUE/FK 约束。

## 🟢 正确的工作流 (HOW TO DO IT)

1.  **修改 Ent Schema (Go 代码)**:
    修改位于 `server/internal/data/model/schema/*.go` 的 Go 文件。
    例如：在 `Fields()` 方法中添加 `field.String("new_col")`。

2.  **生成迁移文件**:
    在 `server/` 目录下运行以下命令：
    ```bash
    make data
    ```
    *解释：此命令会自动运行 `atlas migrate diff` (根据你的 schema 变更生成 `.sql` 文件) 和 `ent generate` (更新 Go 客户端代码)。*

3.  **检查、预演、应用迁移**:
    登记共享开发库在人机终端只运行一个主入口：
    ```bash
    make migrate
    ```
    它会依次完成只读 status、停后端、Atlas validate / dry-run、全部 pending SQL
    的同事务真实预演并 `ROLLBACK`、真实备份与隔离恢复验证、migration 与目标
    身份复核，然后要求输入一次可读的完整确认串。确认通过后才整批以
    `tx-mode=all` apply，并在同一目标读回 Atlas status、Ent / PostgreSQL schema、
    可编程对象和 health / ready。

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

    共享开发库六个入口无论成功或报错，末尾都必须存在一组
    `[migration-summary]`。AI 应优先读取其中的 `target`、`current`、`latest`、
    `applied`、`pending`、`phase`、`result`、`writes`、`apply`、`operation`、
    `error_code` 和 `next_action`，而不是从中文进度或 `make` 最外层 exit code 猜测结果。
    `target=unavailable`、状态 `unknown` 也属于明确失败证据，不能拿上一次输出补齐。
    通用回执不会打印确认值；显式 prepare 的受控 continuation 以及低层 status /
    plan 为服务端 parser 保留的内部确认行只会出现在回执前，只用于同一次受控操作，
    不得写进聊天、工单或长期日志。

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
   git diff --exit-code -- internal/data/model/ent internal/data/model/migrate
   ```
   并补 fresh、upgrade、失败数据 fail-closed 与数据库负向测试。Atlas OSS
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
    - 开发 plan/apply 只接受 loopback 的 `plush_erp*` 隔离库，以及 application config 精确命中的 `192.168.0.106:5432/plush_erp` / `plush_erp_*_dev`。环境变量覆盖同一共享地址也不会被当成登记目标。
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

## 🔴 严格禁止的操作 (WHAT NOT TO DO)

*   ❌ **绝对不要** 用编辑器自行命名并创建 migration；普通结构迁移使用
    `make data`，上述 data / trigger 例外使用 `atlas migrate new` 并重新计算
    checksum。
*   ❌ **绝对不要** 试图通过 `INSERT INTO` 或 `ALTER TABLE` 直接“修复”数据库结构而不走迁移流程。Atlas 会检测到结构漂移 (drift) 并报错。
*   ❌ **绝对不要** 新增数据库 Function、Procedure、Trigger 或以
    `EXECUTE FUNCTION/PROCEDURE` 把业务逻辑藏进数据库；测试故障注入也不得
    创建这些对象。
*   ❌ **绝对不要** 随意删除迁移文件，除非你完全理解后果（这会破坏迁移历史图谱）。

## 🛠 常见问题处理

*   **Checksum Mismatch (校验和不匹配)**: 如果遇到此错误，请运行 `make migrate_hash`。
*   **开发库只是落后于仓库已有 migration**: 登记共享开发库执行 `make migrate`，非交互环境执行同一次 operation 的 `migrate_prepare → migrate_execute`；不要因为“缺字段”就重新 `make data`，也不要跳版本。
*   **Drift Detected / Duplicate Column (字段已存在)**: 这通常表示数据库曾被手动改过，或当前库状态已经偏离迁移历史；不要把它和“开发库单纯还没 apply 最新 migration”混为一谈。先做结构和 revision 对账；`migrate_set` 只能用于已经证明 SQL 效果完整存在、且有专项备份与修复证据的 revision 修复，不能用于跳过失败的数据门禁。

---
**请严格遵守此流程以保证数据库完整性。**
