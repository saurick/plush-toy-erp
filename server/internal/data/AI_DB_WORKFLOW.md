# 🤖 AI 助手数据库变更操作手册 (必读)

**STOP! 在修改数据库或创建 `.sql` 文件之前，请务必阅读本指南。**

本项目使用 **Ent** 和 **Atlas** 进行版本化的数据库迁移。
**严禁** 绕过 Atlas 直接创建或改写结构迁移，也严禁手动执行
`ALTER TABLE` / `CREATE TABLE`。Ent 无法表达的一次性数据回填或
PostgreSQL trigger 必须走下文的受控 Atlas custom migration，不得混入
普通结构迁移或直接写目标数据库。

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
    先读取目标和 revision：
    ```bash
    make migrate_status
    ```
    复制输出的 `MIGRATE_TARGET_CONFIRM`，运行只读 plan：
    ```bash
    MIGRATE_TARGET_CONFIRM='<migrate_status 输出>' make migrate_plan
    ```
    plan 会执行 Atlas validate / dry-run，并把全部 pending SQL 放进同一个
    PostgreSQL 事务真实预演，最后强制 `ROLLBACK`。只有 plan 通过后，才复制
    它输出的 `MIGRATE_CONFIRM`；登记的 106 共享开发库还必须完成备份、停止
    本仓库后端、DbGate 与其它 writer，并复制
    `MIGRATE_MAINTENANCE_CONFIRM`：
    ```bash
    MIGRATE_CONFIRM='<migrate_plan 输出>' \
    MIGRATE_MAINTENANCE_CONFIRM='<共享开发库 migrate_plan 输出>' \
    make migrate_apply
    ```
    apply 使用 plan 绑定的目标、pending revisions 与 migration hash，整批以
    `tx-mode=all` 执行，并在同一目标上读回 Atlas status 与 Ent /
    PostgreSQL schema 零差异。确认值只接受当前命令环境，`.env` 残值无效。

4. **Ent 无法表达的 data / trigger migration**:
   先完成结构 schema 与 `make data`，再由单一 migration owner 创建空的
   Atlas migration：
   ```bash
   atlas migrate new <name> --dir file://internal/data/model/migrate
   ```
   该 migration 只允许承载已评审的一次性 `UPDATE` / `DELETE` 数据转换或
   Ent / Atlas schema provider 无法表达的 function / trigger；不得在这里
   手写 `CREATE TABLE` / `ALTER TABLE` 来替代 Ent。完成后必须运行：
   ```bash
   make migrate_hash
   make data
   git diff --exit-code -- internal/data/model/ent internal/data/model/migrate
   ```
   并补 fresh、upgrade、失败数据 fail-closed 与数据库负向测试。Atlas OSS
   schema inspect 不会覆盖 function / trigger，因此零结构漂移不能替代这些
   PostgreSQL 行为测试。

5.  **只补齐当前开发库已有迁移时的做法**:
    如果问题已经明确定位为“代码和迁移文件都已存在，但当前开发库还没 apply 到最新版本”，不要重新生成 migration，也不要手动改库；直接在 `server/` 目录执行：
    ```bash
    make migrate_status
    MIGRATE_TARGET_CONFIRM='<status 输出>' make migrate_plan
    MIGRATE_CONFIRM='<plan 输出>' \
    MIGRATE_MAINTENANCE_CONFIRM='<共享开发库 plan 输出>' \
    make migrate_apply
    ```
    执行后再做只读确认，至少核对：
    - `migrate_plan` 的真实事务预演已明确 `ROLLBACK`
    - `migrate_apply` 返回 `applied_verified`，没有 checksum / drift 报错
    - Atlas status 为 `pending=0`
    - Ent / PostgreSQL schema 同目标读回零差异

    **注意：**
    - 开发 plan/apply 只接受 loopback 的 `plush_erp*` 隔离库，以及 application config 精确命中的 `192.168.0.106:5432/plush_erp` / `plush_erp_*_dev`。环境变量覆盖同一共享地址也不会被当成登记目标。
    - 如果当前 shell 里还带着旧的 `DB_URL`、`POSTGRES_DSN`、`USE_ENV_DB_URL=1` 或其他连接环境变量，必须先确认 `make migrate_status` 的脱敏目标。
    - 如果目标库可能是生产库、共享测试库，或当前无法明确判断数据库归属，必须先说明将命中的库和风险，再等待确认。
    - `20260726173924` 之后的 operational fact lifecycle 审计不会猜测
      `posted_by / settled_by / cancelled_by`。只读审计失败时，只能从权威审计
      来源精确治理，或在确认数据可丢弃并备份后重建个人开发库；不得填固定
      管理员、放宽约束或用 `migrate_set` 跳过。

## 🔴 严格禁止的操作 (WHAT NOT TO DO)

*   ❌ **绝对不要** 用编辑器自行命名并创建 migration；普通结构迁移使用
    `make data`，上述 data / trigger 例外使用 `atlas migrate new` 并重新计算
    checksum。
*   ❌ **绝对不要** 试图通过 `INSERT INTO` 或 `ALTER TABLE` 直接“修复”数据库结构而不走迁移流程。Atlas 会检测到结构漂移 (drift) 并报错。
*   ❌ **绝对不要** 随意删除迁移文件，除非你完全理解后果（这会破坏迁移历史图谱）。

## 🛠 常见问题处理

*   **Checksum Mismatch (校验和不匹配)**: 如果遇到此错误，请运行 `make migrate_hash`。
*   **开发库只是落后于仓库已有 migration**: 执行 `status → plan → apply → status/readback`，不要因为“缺字段”就重新 `make data`，也不要跳版本。
*   **Drift Detected / Duplicate Column (字段已存在)**: 这通常表示数据库曾被手动改过，或当前库状态已经偏离迁移历史；不要把它和“开发库单纯还没 apply 最新 migration”混为一谈。先做结构和 revision 对账；`migrate_set` 只能用于已经证明 SQL 效果完整存在、且有专项备份与修复证据的 revision 修复，不能用于跳过失败的数据门禁。

---
**请严格遵守此流程以保证数据库完整性。**
