# 仓库脚本入口 / Repository Scripts

本页负责环境初始化、仓库级脚本和子目录导航。运行前先按目标选择入口，命令默认在仓库根目录执行；具体参数、写入范围、回执和失败恢复只在对应专题维护。

## 子目录入口

| 任务 | 操作真源 |
| --- | --- |
| 业务手册同步、三册离线 HTML / PDF 导出 | [手册脚本](docs/README.md) |
| 选择验证、fast / full / strict、CI 与推送门禁 | [QA 脚本](qa/README.md) |
| 模拟账号、长期场景与隔离完整验收 | [QA 数据准备](qa/README.md#全页面试用验收数据)、[岗位登录核验](qa/README.md#角色演示账号与登录核验) |
| 核心业务隔离压力测试、容量与恢复 | [压力测试](qa/README.md#pressure-testing) |
| 发布、目标 preflight、客户配置、回滚与 evidence | [部署脚本](deploy/README.md) |
| 来源 manifest、提取、freeze 与 dry-run | [导入准备](import/README.md) |
| 共享开发库迁移与终态回执 | [Ent + Atlas](../server/docs/ent.md) |
| 前端启动、客户包预览与浏览器 smoke | [前端脚本](../web/scripts/README.md) |
| 固定镜像、S3 附件备份与恢复 | [prod Compose](../server/deploy/compose/prod/README.md) |

## 总览

| 脚本 | 用途与边界 |
| --- | --- |
| `bootstrap.sh` | 检查版本、安装 web / server 依赖、启用 hooks 并执行 fast |
| `doctor.sh` | 检查当前工具链、版本锁、hooks 与可执行入口 |
| `project-scan.sh` | 扫描命名、默认配置、密钥占位和不需要的部署残留；`--strict` 用于收口 |
| `dev-ports.mjs`、`dev-listener-stop.sh` | 校验固定端口组，只停止已证明属于本仓库的后端进程 |
| `dev-process-inspection.mjs` | 前后端共用的有超时进程检查；macOS 从系统端口表定位 PID，再逐个核对工作目录，失败时不停止服务 |
| `local-runtime-bundle.mjs`、`local-runtime-build-inputs.mjs`、`local-runtime-start.mjs`、`local-runtime-control.mjs`、`local-runtime-preflight.mjs` | 日常后端按需构建、运行 / 停止互斥与只读状态；迁移完整候选和恢复边界见 [服务端入口](../server/README.md#快速开始) |
| `local-runtime-console.mjs` | 将 Kratos JSON 转为紧凑终端日志，按级别和关键词筛选，回放启动记录并跟随重启；人工终端常驻，macOS 非交互启动打开日志终端，参数与运行边界见 [服务端入口](../server/README.md#快速开始) |
| `local-runtime-process.mjs`、`local-runtime-launcher.swift` | macOS 后端使用独立应用身份与当前用户 launchd 按需运行，避免继承编辑器退出后的失效网络身份；不登录自启、不自动重试，启停仍经过原有锁与验证 |
| `terminal-log.mjs` | 前后端启动与日志共用的终端高亮、无颜色输出和 PostgreSQL 凭据脱敏 |
| `lib/postgres-url.mjs` | 本地数据库创建与备份源连接解析，凭据通过环境传入；一次性 PostgreSQL 测试目标由 `qa/postgres-target-contract.mjs` 限制 |
| `local-database-roles.mjs`、`local-runtime-rehearsal.mjs` | 复用部署角色策略，使用独立只读账号审计，并在临时恢复库验证固定候选版本 |
| `local-orb.mjs` | 查看、启动 Orb 备用中间件及显式切换开发连接；拒绝覆盖运行中的开发任务，见 [Orb 备用环境](../server/deploy/compose/dev-orb/README.md) |
| `local-migration-workflow.mjs`、`local-migration.mjs` | 迁移高层编排与低层受控实现，通过 Make / 迁移页使用 |
| `seed-role-demo-admins.sh`、`seed-core-demo-data.sh`、`seed-trial-sim-masterdata.sh` | 显式准备模拟账号或主数据；目标、命名、读回与清理见 QA 数据合同 |
| `build/apply-customer-web-config.mjs` | 将已审查客户配置与 public-assets 注入构建产物，不复制客户原件 |

## 推荐顺序

1. 新机器先按[版本锁定](#版本锁定)安装 `n` 与 pnpm，再检查版本并安装依赖：

   ```bash
   sudo n auto
   bash scripts/doctor.sh
   bash scripts/bootstrap.sh
   ```

2. 修改配置、命名或默认值后运行 `bash scripts/project-scan.sh --strict`。
3. 开发验证先用 `bash scripts/qa/affected.sh --plan` 查看影响面，再运行所需验证；定向检查优先，完整门禁按任务需要执行。
4. 需要迁移时进入 `server/`，交互使用 `make migrate`；非交互严格使用同一次 `make migrate_prepare` 输出执行 `make migrate_execute`。准备保持日常固定版本运行，先只读审计，再固定当前前后端、配置及迁移，完成成套备份与临时恢复库升级、登录和业务读取验证。确认后才进入短维护窗口、生成新的成套恢复点、执行一次迁移并切换固定版本。

   单位精度或单据引用冲突必须处理后重新准备，不能直接取整或删除已过账记录。准备成功不表示已升级，结果未知先只读核对。
5. 已获提交 / 推送授权并形成 clean HEAD 后，运行 `bash scripts/qa/prepare-push.sh`。默认单一 `origin/main` 只签发短门禁回执，高成本验证由 GitLab exact-SHA CI 完成；其他目标和显式 `--full` 按 [QA 回执合同](qa/README.md#推送准备与回执) 执行。
6. 发布、部署和恢复分别使用 [部署脚本](deploy/README.md)，固定 SHA / digest 并读回目标结果；GitLab push 不自动部署。

## Git 只读检查 / Read-only Git checks

```bash
GIT_OPTIONAL_LOCKS=0 git status --short
GIT_OPTIONAL_LOCKS=0 git -c diff.autoRefreshIndex=false diff --stat
```

构建和验证子进程同样设置 `GIT_OPTIONAL_LOCKS=0`。文件名差异须核对内容，不能把时间戳变化当成修改；保留其他任务的未提交内容。

<a id="git-commit-entry"></a>

## 本地提交入口 / Local commit entry

多个聊天共用同一工作目录时，也共用暂存区和 HEAD。已获用户提交授权后，统一使用 `git-hooks/commit-scope.py`（Python 3，macOS / Linux），将候选核对、精确暂存、原有 hooks 和提交放在同一次进程互斥中。仅新增聊天、验证通过或生成补丁均不产生提交授权。

1. 读取当前完整 HEAD SHA，核对归属和必要验证。整文件都属于本次提交时，使用精确文件路径；同文件混有其他任务改动时，准备相对该 SHA 的已审查 Git 补丁。保留 binary diff 和新增 / 删除路径，不在共享 index 中提前暂存。
2. 在仓库根目录执行以下一种方式，将占位内容换成实际审核结果：

   ```bash
   python3 scripts/git-hooks/commit-scope.py --base <已审查的完整HEAD> \
     --message 'fix(scope): 中文摘要' -- path/to/owned-file

   python3 scripts/git-hooks/commit-scope.py --base <已审查的完整HEAD> \
     --message 'fix(scope): 中文摘要' --patch /absolute/path/reviewed.patch
   ```

3. 回读提交 SHA、提交文件 / hunk 和剩余差异。脚本不推送，不省略项目 hooks；推送继续使用独立授权和原有门禁。

| 情况 | 入口行为与后续 |
| --- | --- |
| 另一提交正在运行 | 使用同一 OS 文件锁等待一次，默认 45 秒，`--wait-seconds` 允许 0–60 秒；超时退出，不暂存、不重试。进程退出自动释放锁，无后台队列 |
| 等待期间 HEAD 前进 | 仅当前 HEAD 是基线后继、且本次涉及文件的已提交内容未变时接续，重新运行 hooks；同文件变化须重新核对补丁 |
| 原有暂存完全等于已审查候选 | 可以复用，支持裸提交被门禁拒绝后的恢复；任何额外或不一致的暂存都保留并停止 |
| hooks 失败 | 完整 index 和 HEAD 未漂移时只撤销本次新加的暂存，保留工作文件；原有暂存或外来漂移保留供核对 |
| Git `index.lock` 存在 | 保留原锁，按全局 `git-closeout-coordination` 核验；入口不自动恢复或删除 Git 锁 |

pre-commit 与 commit-msg 检查持锁身份、分支、HEAD、完整候选和范围内工作文件；普通裸提交会提示改用此入口。`index.codex-commit-once.lock` 是持久的 OS 锁载体，文件存在不表示被占用，不删除它。该入口协调遵守约定的提交进程，不能阻止编辑器同时改同一文件或绕过 hooks 的外部 Git 命令；出现这类漂移须核对现场，不强行合并或反复重试。

## Hook 对应关系

| Hook | 脚本与职责 |
| --- | --- |
| pre-commit | 先后核对提交互斥与候选；`git-hooks/pre-commit.sh` 只读 staged 快照并执行 db-guard，不生成、不 apply、不重新暂存 |
| commit-msg | 先后核对提交互斥与候选；`git-hooks/commit-msg.sh` 校验项目提交格式 |
| pre-push | `git-hooks/pre-push.sh`，核对真实 push 范围、签名回执、TTL 与最新 secrets；不现场回退到 full |

回执不替代远端 protected main 与同 SHA 的 `CI Gate`。数据库可编程对象、schema / migration 和目标读回规则统一见 [模型与迁移](../server/docs/ent.md)。

## 版本锁定

Node 统一由 `n` 管理，`.n-node-version` 是唯一精确版本真源；当前为 `24.22.1`，`web/package.json#engines.node` 声明同一 `24.22.x` 系列。安装、切换和升级都在仓库根目录使用 `n auto`；升级 Node 版本时同步该文件、构建镜像与 Runner 的固定版本及校验值。

macOS 首次安装：

```bash
brew install n
cd "$(git rev-parse --show-toplevel)"
sudo n auto
sudo npm install --global "$(node -p 'require("./web/package.json").packageManager')"
bash scripts/doctor.sh
```

`n` 默认将 Node 安装到 `/usr/local/bin`，该目录需排在 PATH 的其他 Node 路径之前；使用可写的自定义 `N_PREFIX` 时，可去掉 `sudo` 并把 `$N_PREFIX/bin` 加入 PATH。切换后新开终端，核对 `command -v node` 和 `node --version`。

Linux / WSL 同样使用 [n 官方安装方式](https://github.com/tj/n#installation)；原生 Windows 开发入口使用 WSL。

`doctor.sh` 核对 `n`、当前 Node、唯一版本锁与 `engines.node`，并阻断重复版本文件；同时检查 Bash（major ≥ 4）、`web/package.json#packageManager` 和 `server/go.mod`。开发工作台与覆盖率采集器校验当前进程版本，版本不符时先用 `n auto` 切换并重启前端。CI 继续校验精确版本，Docker 构建和运行镜像固定相同补丁版本。

## npm registry token 边界

公共依赖镜像与行为配置由 `web/.npmrc` 维护；私有 token 只放 ignored 的本机配置或进程环境。依赖审计使用 npm 官方接口，重试规则见 QA。secrets 守卫同时覆盖 Git 候选与无 Git 源码包；历史例外只允许精确指纹，新增命中仍阻断，不能扩大路径 / 规则 allowlist。

## `-h/--help`

参数以对应脚本帮助为准，例如 `bash scripts/qa/strict.sh --help`。帮助、dry-run、准备、真实执行和目标验收是不同结果，不能相互替代。

## 公共契约生成 / Public Contracts

`node scripts/gen-public-contracts.mjs` 从后端正式声明生成 Web 权限、业务及流程状态、附件约束、RPC 标识、数值、密码和打印限制，并同步任务目录的 Web 模块与交互稿片段；同一入口从实际分发、参数解析和返回映射补齐 `server/docs/api.md` 的全部逐方法字段合同、请求与响应示例，校验模拟样例的覆盖、类型、必填条件、可空值和测试来源，并生成仅供 DEV 工作台追溯的方法源码索引。

`--check` 只读检查全部生成物漂移，不改文档或样例。`node scripts/qa/public-contract-consumers.mjs` 检查 Web 引用和发布脚本的静态 RPC；契约源变化由 affected 自动选择同步及消费者检查。

维护步骤与边界见[跨层公共契约与生成规范](../docs/engineering/跨层公共契约与生成规范.md)，错误码继续使用 `gen-error-codes.mjs`。
