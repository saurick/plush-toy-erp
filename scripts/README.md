# 仓库脚本入口 / Repository Scripts

本页负责环境初始化、仓库级脚本和子目录导航。运行前先按目标选择入口，命令默认在仓库根目录执行；具体参数、写入范围、回执和失败恢复只在对应专题维护。

## 子目录入口

| 任务 | 操作真源 |
| --- | --- |
| 选择验证、fast / full / strict、CI 与推送门禁 | [QA 脚本](qa/README.md) |
| 模拟账号、长期场景与隔离完整验收 | [QA 数据准备](qa/README.md#全页面试用验收数据)、[岗位登录核验](qa/README.md#角色演示账号与登录核验) |
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
| `local-runtime-console.mjs` | 将 Kratos JSON 转为可读终端日志，默认显示 INFO 及以上，`--debug` 显式包含 DEBUG；回放启动记录并跟随重启，原始文件保留；运行边界见 [服务端入口](../server/README.md#快速开始) |
| `terminal-log.mjs` | 前后端启动入口共用的终端高亮；按输出流判断颜色支持，重定向与显式关闭颜色时保留纯文本 |
| `local-database-roles.mjs`、`local-runtime-rehearsal.mjs` | 复用部署角色策略，使用独立只读账号审计，并在临时恢复库验证固定候选版本 |
| `local-migration-workflow.mjs`、`local-migration.mjs` | 迁移高层编排与低层受控实现，通过 Make / 迁移页使用 |
| `seed-role-demo-admins.sh`、`seed-core-demo-data.sh`、`seed-trial-sim-masterdata.sh` | 显式准备模拟账号或主数据；目标、命名、读回与清理见 QA 数据合同 |
| `build/apply-customer-web-config.mjs` | 将已审查客户配置与 public-assets 注入构建产物，不复制客户原件 |

## 推荐顺序

1. 新机器先检查版本并安装依赖：

   ```bash
   corepack enable
   bash scripts/doctor.sh
   bash scripts/bootstrap.sh
   ```

2. 修改配置、命名或默认值后运行 `bash scripts/project-scan.sh --strict`。
3. 开发验证先用 `bash scripts/qa/affected.sh --plan` 查看影响面，再运行所需验证；定向检查优先，完整门禁按任务需要执行。
4. 需要迁移时进入 `server/`，交互使用 `make migrate`；非交互严格使用同一次 `make migrate_prepare` 输出执行 `make migrate_execute`。准备保持日常固定版本运行，先只读审计，再固定当前前后端、配置及迁移，完成成套备份与临时恢复库升级、登录和业务读取验证。确认后才进入短维护窗口、生成新的成套恢复点、执行一次迁移并切换固定版本。单位精度或单据引用冲突必须处理后重新准备，不能直接取整或删除已过账记录。准备成功不表示已升级，结果未知先只读核对。
5. 已获提交 / 推送授权并形成 clean HEAD 后，运行 `bash scripts/qa/prepare-push.sh`。默认单一 `origin/main` 只签发短门禁回执，高成本验证由 GitLab exact-SHA CI 完成；其他目标和显式 `--full` 按 [QA 回执合同](qa/README.md#推送准备与回执) 执行。
6. 发布、部署和恢复分别使用 [部署脚本](deploy/README.md)，固定 SHA / digest 并读回目标结果；GitLab push 不自动部署。

## Git 只读检查 / Read-only Git checks

```bash
GIT_OPTIONAL_LOCKS=0 git status --short
GIT_OPTIONAL_LOCKS=0 git -c diff.autoRefreshIndex=false diff --stat
```

构建和验证子进程同样设置 `GIT_OPTIONAL_LOCKS=0`。文件名差异须核对内容，不能把时间戳变化当成修改；保留其他任务的未提交内容。

## Hook 对应关系

| Hook | 脚本与职责 |
| --- | --- |
| pre-commit | `git-hooks/pre-commit.sh`，只读 staged 快照并执行 db-guard，不生成、不 apply、不重新暂存 |
| commit-msg | `git-hooks/commit-msg.sh`，校验项目提交格式 |
| pre-push | `git-hooks/pre-push.sh`，核对真实 push 范围、签名回执、TTL 与最新 secrets；不现场回退到 full |

回执不替代远端 protected main 与同 SHA 的 `CI Gate`。数据库可编程对象、schema / migration 和目标读回规则统一见 [模型与迁移](../server/docs/ent.md)。

## 版本锁定

`doctor.sh` 同时核对当前 Bash 与 PATH 子进程 Bash（major ≥ 4），根目录三个 Node 版本文件、`web/package.json#packageManager` 和 `server/go.mod`。以这些文件作为版本真源，切换工具链后重新运行 doctor，不在各 README 另记一套版本。

## npm registry token 边界

公共依赖镜像与行为配置由 `web/.npmrc` 维护；私有 token 只放 ignored 的本机配置或进程环境。依赖审计使用 npm 官方接口，重试规则见 QA。secrets 守卫同时覆盖 Git 候选与无 Git 源码包；历史例外只允许精确指纹，新增命中仍阻断，不能扩大路径 / 规则 allowlist。

## `-h/--help`

参数以对应脚本帮助为准，例如 `bash scripts/qa/strict.sh --help`。帮助、dry-run、准备、真实执行和目标验收是不同结果，不能相互替代。
