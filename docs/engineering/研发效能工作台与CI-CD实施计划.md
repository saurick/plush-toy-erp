# 研发效能工作台与 CI/CD 实施计划 / Engineering Workbench And CI/CD Implementation Plan

> 状态：Active implementation plan / 当前实施计划。
>
> 快照：2026-07-29。
>
> 本文不是当前发布、客户 UAT 或签收事实。易漂移状态必须在执行前重新读回。

## 目标与完成定义

目标是把现有 QA、制品、部署和 DEV 工作台收敛为：

> 同一 SHA 一次有效 strict、一次不可变构建、任意次数 promotion；失败不会自行启动 fresh lifecycle。

全部完成需要同时满足：

- 普通反馈不机械跑完整 strict。
- full、strict 没有递归整套重复。
- exact-SHA 结果按 fingerprint 幂等复用。
- Server/Web 镜像和 manifest 一次构建、digest 部署。
- 133 不构建源码，部署和回滚都有目标读回。
- 工作台不持有秘密、不暴露任意命令，刷新可恢复 operation。
- production build 和 artifact scan 不包含工作台、Bridge 或本机路径。
- 本地、CI、制品、133、UAT 和签收证据独立。

## 当前基线

2026-07-29 已读回：

| 项目 | 当前事实 |
| --- | --- |
| 旧 Codex 任务 `019fa48a-0088-7142-a8a5-3c079cffe6f1` | 未加载，不在运行 |
| 重型 QA 进程 | 未发现活动的 fast/full/strict/prepare-push/lifecycle |
| Local writer | 已等待并确认其他写任务结束；本计划任务为当前唯一顶层 writer |
| Git | `HEAD=9376a585…`，本地 main 比 origin/main 多 3 个提交，且有大量跨任务未提交现场 |
| GitHub | 公开仓库；现有 CI 只跑 strict，无 Release、Environment、self-hosted runner、远端部署 |
| 本机 `output/` | 约 6.7GB；清理前必须生成保留预览 |
| 133 | 4 vCPU、30GiB RAM、根盘 98GiB / 约 14GiB 可用、Docker 约 29GB |
| 133 磁盘扩展 | 虚拟盘约 512GB、root LV 约 100GB；精确 VG/LV 扩容需 sudo 与 VM 快照 |

当前仓库公开，因此计划不在 133 安装 GitHub self-hosted runner。远端验证与构建使用 GitHub 托管 Runner；promotion 首版由本地 loopback Bridge 经固定 SSH 目标执行。

## 执行纪律

1. 一次只实施一个可验证切片。
2. 每个切片先跑定向测试，不从头跑 full/strict。
3. 只有最终 clean candidate SHA 才运行一次 full 和一次 exact-SHA strict。
4. strict 失败只记录 blocker，不自动改门禁后重跑。
5. 不修改、清理、提交或宣称其他任务的现场。
6. 未获得提交、推送授权前不 stage、commit、push。
7. 未满足磁盘、备份、目标身份和 rollback point 前不部署 133。

## 阶段 0：现场与基础设施

### 已完成

- [x] 核对旧反复构建任务状态。
- [x] 核对重型 QA / 构建进程。
- [x] 等待其他 Local writer 结束。
- [x] 读回 GitHub 仓库、workflow、Environment、runner、secret 和分支保护现状。
- [x] 只读检查 133 CPU、内存、磁盘、LVM 形状、Docker 占用和运行容器。
- [x] 将公开仓库 self-hosted runner 方案改为 GitHub-hosted build + local Bridge。

### 待完成

- [x] 对 `output/` 生成保留/删除预览；默认保留最近成功、最近失败、候选及当前/回滚版本引用证据。脚本只有 preview 模式，不提供删除入口。
- [ ] 用户在 133 做 VM 快照并提供 sudo 后，核对 `vgs/lvs/findmnt`，将 root LV 先扩到约 250GB。
- [ ] 扩容后读回文件系统、Docker 根目录和容器状态。
- [ ] 在所有实现收口后形成唯一 clean candidate SHA。

### 阻塞

- root LV 扩容需要 133 sudo 和 VM 快照。
- clean candidate 需要先完成当前共享工作树的 Git 收口。

## 阶段 1：QA 与 CI 去重

### 实施

- [x] 完成 `node-test-groups` / profile WIP，并让完整性扫描同时看到 tracked 与未跟踪测试。
- [x] 明确 `database-programmability` 的归属并纳入对应组。
- [x] 修正 `fast.sh --help` 与真实语义。
- [x] 将便宜 preflight 放在 Web、Go、数据库、浏览器、制品之前。
- [x] 保证 full 不完整重复 fast，strict 不完整重复 full。
- [x] 新增 affected 入口；未知路径 fail closed 到 full。
- [x] CI 普通 PR/push 运行 affected/full，不默认 strict。
- [x] 新增 exact-SHA strict 入口与 gate fingerprint。
- [x] 有效 strict 终态和同 fingerprint pre-push receipt 可复用。
- [x] verification 可取消同 ref 旧运行；promotion/rollback 不自动取消。

### 定向验收

```bash
PATH=/usr/local/bin:$PATH node --test \
  scripts/qa/run-node-tests.test.mjs \
  scripts/qa/gate-profiles.test.mjs \
  scripts/qa/gate-orchestration.test.mjs \
  scripts/qa/affected.test.mjs \
  scripts/qa/pre-push-receipt.test.mjs \
  scripts/qa/run-gate-with-receipt.test.mjs \
  scripts/qa/ci-workflow.test.mjs
```

通过信号：

- 每个测试组在同一 profile 最多一次。
- 同 fingerprint 复用已有终态。
- 未知影响面进入 full。
- strict 失败不启动下一轮 lifecycle。

## 阶段 2：不可变制品与版本目录

### 复用真源

- `scripts/deploy/release-artifact-bundle.mjs`
- `scripts/deploy/release-artifact-verify.mjs`
- `scripts/deploy/local-release-rehearsal.mjs`

### 实施

- [x] 新增 provider-neutral release catalog。
- [x] 新增独立 GitHub/GHCR publisher adapter，不改写 bundle 生成职责。
- [x] 新增 `.github/workflows/release.yml`。
- [x] workflow 只接受默认分支可达的 40 位 SHA。
- [x] exact-SHA strict 通过后构建一次 linux/amd64 Server/Web 镜像。
- [x] 使用最小 `packages: write` 权限推送 GHCR。
- [x] 创建 GitHub Release，附 manifest、SBOM、checksums 和证据链接。
- [x] 同 SHA/同 digest 幂等成功；同版本异 SHA/digest 阻断。
- [x] 保留本地 tar bundle 和 verify 恢复路径。

### 验收

- 一个 SHA 只有一组 Server/Web digest。
- 临时 Actions artifact 过期后仍可从 Release + GHCR 恢复。
- manifest、平台、镜像内置 SHA、SBOM 和 checksum 可独立校验。
- rehearsal 与将要 promotion 的制品身份相同。

## 阶段 3：133 promotion 与回滚

### 实施

- [x] 新增固定目标 registry，首版只允许 `test-133`。
- [x] 新增 provider-neutral promotion manifest 与执行器。
- [x] 新增受控 rollback 执行器和资格检查。
- [x] 本地 Bridge 通过固定 SSH 目标串行执行，不接受目标、路径或命令参数。
- [x] 实现磁盘、容器、端口、数据库身份、当前版本和 rollback point preflight。
- [x] 实现备份验证、digest 加载/读回、migration lock/status/plan/apply/readback。
- [x] 实现 Compose 切换、health、ready、Web health 和 release identity 基础 smoke。
- [ ] 接入带凭据的岗位矩阵与 PDF smoke；当前远端回执明确列为 `notProven`，不得把基础 smoke 冒充完整验收。
- [x] 原子写入脱敏部署回执。
- [x] rollback 禁止自动 down migration；schema 不兼容时标记 forward-fix。

### 首次真实执行前置

- [ ] 133 VM 快照完成。
- [ ] root LV 扩容完成并读回。
- [x] 用户已授权精确提交并非强制推送本计划范围。
- [ ] exact-SHA CI 和不可变制品发布完成。
- [ ] 133 当前版本、备份和 rollback point 精确读回。

### 验收

- 133 无 checkout、Node/Go build 或镜像构建。
- 运行 SHA/content ID/migration/config 与 manifest 一致。
- 失败发生在切换前时保持旧版本；切换后状态不明时标记 `not_proven` 并先读回。
- rollback rehearsal 不删除数据库、volume、客户配置、上传、证书或当前运行依赖。

## 阶段 4：工作台版本中心

### 服务端 Bridge

- [x] provider contract。
- [x] GitHub provider adapter。
- [x] operation store：随机 ID、幂等、`0600` 原子文件、重启恢复。
- [x] loopback、Host/Origin/Sec-Fetch/CSRF/content-type 守卫。
- [x] allowlist 动作和单目标串行锁。
- [x] 脱敏 operation 状态与正式 GitHub evidence link。

### 前端

- [x] 总览：HEAD/dirty、GitHub 不可变版本、133 当前版本、容量 blocker 和下一步边界。
- [x] 质量验证：既有质量区域展示 affected/full/strict 入口、当前/历史回执和失败层。
- [x] 版本中心：版本、SHA12、制品完整性、133 当前 SHA 和 rollback 资格。
- [x] 交付运行：选择版本、准备、显式确认、operation 跟踪和旧 manifest 回滚。
- [x] Drawer、确认 Modal、焦点恢复、Escape、移动端、暗色和最近事件按需读取。
- [x] 页面刷新按 operation ID 恢复，不重复目标写操作。
- [x] Vite resolved listener 与 HMR 客户端端口必须一致；只覆盖 CLI `--port` 时启动失败，不进入自动重载循环。

### 安全与生产隔离验收

- 浏览器 bundle 中不存在 GitHub/SSH secret。
- production build 不包含 `/__dev`、工作台 chunk、DEV middleware、本机绝对路径或 Bridge。
- 任意 repo/workflow/target/path/SSH/shell/SQL/Docker 输入均被拒绝。

## 阶段 5：维护与迁移

- [x] workflow 只编排正式脚本。
- [x] GitHub API 版本集中在 adapter。
- [x] 测试 GitHub 限流、401/403、超时、重复 dispatch 和状态乱序。
- [ ] `output/`、operation、Release 和 GHCR 建立数量 + 容量保留策略。当前已完成本地 managed output 的 5GiB 预算与数量预览；远端保留不能在首个真实版本前盲删。
- [x] 清理先 dry-run，按 operation 与显式 SHA 引用保护当前/回滚制品；当前实现故意没有 `--apply`。
- [x] 更新 `docs/当前真源与交接顺序.md`、部署约定、脚本 README 和进度记录。
- [ ] 实施完成后将本计划归档到 `docs/archive/engineering/`，长期规则留在设计和脚本。

## 反复构建硬规则

1. 同一 gate fingerprint 最多一份有效 strict 终态。
2. 同一 SHA 最多一组 Server/Web digest。
3. promotion、smoke、rollback 复用已有 digest。
4. 普通开发不默认运行 release rehearsal。
5. verification 可以取消旧运行；deployment 不自动取消。
6. strict 失败只返回 blocker，不自动修改并重启整套。
7. 已有有效 receipt 直接复用。
8. 身份不一致立即停止，不拼接历史证据判绿。
9. full 在任何 scripts、Web、浏览器或 Go 高成本 gate 前，先只读验证
   disposable PostgreSQL 基线的 URL、连通性和建库权限；前置不满足时数秒内
   fail closed，不把缺配置拖到构建之后。

## 当前停止条件

下列条件只阻止对应高风险动作，不阻止继续完成安全的本地实现：

| 条件 | 阻止 |
| --- | --- |
| 共享 dirty tree | final full、exact-SHA strict、制品发布、部署 |
| 未授权 commit/push | 远端 CI、Release、GHCR、133 promotion |
| 133 未扩盘 | 首次自动 promotion |
| 无 VM 快照 / 备份 / rollback point | migration 和 Compose 切换 |
| Provider/SSH/目标身份不明 | Bridge 写操作 |

失败时记录 `blocked` 或 `not_proven`，不启动新的 fresh lifecycle。
