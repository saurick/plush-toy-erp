# 研发效能工作台与 CI/CD 设计 / Engineering Workbench And CI/CD Design

## 结论

本项目采用一条主链：

**GitLab 代码真源与 CI/CD + 独立 KVM Runner VM + GitHub 单向 GPT Review 镜像 + GHCR digest 镜像 + GitLab Release 可移植制品 + 本地 loopback Bridge + 固定目标 operation。**

GitLab 独立承担 main CI。GitLab 负责 protected main、merge request、七分片 exact-SHA aggregate、`CI Gate`、Generic Package 与 Release；GitHub main 只接收 protected-main push mirror，供 GPT 审查和外部只读浏览，并保留明确应急 release，不运行仓库 CI。工作台读取 GitLab 证据，不复制一套 CI 状态机。

GitLab、KVM Runner、公网入口、protected main 和 mirror 已是实际主链，但仓库定义和历史绿灯都不能代替当前读回。每次结论仍分别绑定当前 pipeline/job、CI evidence Package、Release Package、Runner 配置、backup/restore、目标 operation 与 UAT。

## 拓扑与职责

```mermaid
flowchart LR
  L["开发机 / Codex"] -->|commit + explicit push| G["GitLab<br/>canonical repository"]
  L -.->|explicit review snapshot| H
  G -->|main / MR pipeline| R["KVM Runner VM<br/>isolated shell + VM Docker"]
  G -->|protected push mirror| H["GitHub<br/>GPT Review mirror"]
  R -->|image by digest| C["GHCR"]
  R -->|v2 seven immutable assets| P["GitLab Package + Release"]
  W["DEV-only version center"] -->|loopback fixed API| B["Delivery Bridge"]
  B -->|read/dispatch| G
  B -->|download exact assets| P
  B -->|confirmed operation| T["demo-133 / customer-test-133"]
  C --> T
```

| 层 | 唯一职责 | 明确禁区 |
| --- | --- | --- |
| GitLab repository | main、MR、保护规则、pipeline 与 Release 目录 | 不替代业务字段、schema、migration 或 UAT 真源 |
| Runner VM | 候选验证、一次性数据库、镜像构建与发布 | 不挂宿主 Docker socket，不保存长期业务数据 |
| GitHub mirror | GPT Review、外部只读浏览、显式应急 workflow | 不接受直接 main 写入，不自动重复主链 CI |
| GHCR | 保存按 digest 固定的 Server/Web 镜像 | tag 不能替代 manifest digest |
| Delivery Bridge | 固定 Provider、固定动作、operation 与目标执行器 | 浏览器不能传 repo、host、path、shell、SQL、Docker 或 secret |
| 研发效能工作台 | 展示证据、选择固定版本、显式确认 | 不成为 CI、部署、数据库或凭据真源 |
| demo / test 目标 | load/pull 制品、migration、运行与 readback | 不从源码构建，不共用持久数据，不把 smoke 冒充客户验收 |

## GitLab 宿主存储与进程隔离

GitLab 的 PostgreSQL、repositories、artifacts、config 与日志放 SSD `/srv/gitlab`。RAID5 `/srv/raid5/gitlab/backups` 只放应用备份、config archive 和 checksum；RAID 能容忍部分磁盘故障，但不能替代异机/离线备份。

Runner 使用独立 KVM VM 和独立 qcow2，不直接跑在 GitLab 容器或现有业务容器旁。VM 内可以使用自己的 Docker daemon 构建镜像和启动一次性 PostgreSQL；GitLab 宿主 `/var/run/docker.sock` 永不传入 job。Runner cache 可重建，不作为 release、测试结果或业务数据真源。

GitLab HTTP 只绑定 GitLab 宿主 `127.0.0.1:8929`，由 FRP 到阿里云 `18226`，再由 Nginx 为 `gitlab.saurick.me` 终止 TLS。Git over SSH 默认只开放 LAN `192.168.0.133:2224`。详细安装、备份和公网切换见 `server/deploy/gitlab/README.md`。

## CI 主链

### main 与 merge request

`.gitlab-ci.yml` 是唯一 canonical 编排：

1. `plan` 根据 MR base、push before SHA 或手工范围建立可信 diff，先做 diff/log 检查和可信基线 gitleaks，再生成带 digest 的 `ci-plan` / range / trust。
2. MR 保留 plan-driven affected/full 单 job。main push 先由唯一 `prepare` cache writer 预热 locked pnpm/Playwright/Go 依赖，再由 Runner 已登记容量调度 static、Node contracts、Web、Server/PostgreSQL、resource-sensitive、browser 和 security 七个固定外部分片。Server 内部把 schema 零漂移、存量升级、普通测试/构建和关键 PostgreSQL 合同拆为四条独立 lane；只有升级与关键合同持有受管 PostgreSQL，只有普通测试/构建消费 Chromium。browser 只等待同 SHA Web build，其他分片不建人工依赖。
3. `quality_aggregate` 要求七个回执、阶段并集、分类执行数、source archive、依赖审计、`make data`、Web build digest、PostgreSQL/Chromium/browser 清理全部同 SHA 且通过，再签发标准 v3 strict terminal。
4. `CI Gate` 只在对应 main aggregate 或 MR quality 成功时通过；main push 还会把 terminal、receipt 和 manifest 固化到 exact pipeline/job/SHA 的 `plush-ci-evidence` Package，作为 protected main 的稳定 required job 和后续 release 唯一可复用证据。

默认 `origin/main` 推送前，本地 `prepare-push` 只执行并签名 clean HEAD/tree、remote/ref/range、git-log、严格 secrets 与源码完整性短门禁，不重复 Runner 的 affected/full、数据库、浏览器、测试或构建。该回执只允许普通非强制 push，不表示 CI 已成功；Release、Package 显式版本提升（Explicit Promotion）和任何受保护部署必须读回同一 40 位 SHA 的不可变终态成功 `CI Gate`。生产目标只加载 CI 构建的不可变制品或镜像并执行正式 migration、health/ready 与 smoke，禁止现场重建。

缓存只缩短依赖和浏览器准备时间，不能跳过 checksum、locked/offline install、门禁、source archive 或 clean-tree 读回。分片只 pull cache，不并发回写同一 key。pipeline artifacts 是本次运行内证据；只有 `CI Gate` 上传且经 release 服务器端重新校验的 exact Package 才能跨 pipeline 复用，仍不等于不可变 Release。

性能结论必须把 GitLab 宿主与 Runner guest 分开，并同时报告冷/热缓存、各 job 时长、关键路径、CPU / 内存 / IO 峰值、p50、波动和近似 p95。执行 Job 以 90 秒为目标线、120 秒为红线：90–120 秒进入优化复核，超过 120 秒进入拆分候选；但单次慢不自动拆分，必须结合近 20 次有效样本的中位数、近似 P95、覆盖边界与重复成本判断。`plan` / `prepare`、领域 fan-in、`quality_aggregate` 和 `CI Gate` 不套执行 Job 的 90 / 120 秒拆分线；排队超过 30 秒先查 Runner 容量和资源争用，不用拆 Job 掩盖等待。7–9 分钟普通 CI 与 10–15 分钟热缓存提交到部署只是阶段目标；若 guest 和宿主仍有实测余量且没有排队、IO 争用、OOM、flaky 或波动扩大，就继续调整 Runner 并发、DAG shard 和各语言测试并行度，冲刺 6–8 分钟与 8–12 分钟，稳定更快也接受。停止条件是资源饱和或复杂度收益明显失衡，不是达到某个时间；完整覆盖、fail-closed、exact-SHA、数据库/浏览器/端口隔离和清理始终不降级。

### exact-SHA release

release 只能从受保护 main 的 web/API/trigger pipeline 发起，且满足：

- `RELEASE_SHA == CI_COMMIT_SHA`；
- customer 固定 `yoyoosun`；
- 版本号由 Bridge 服务端以 `Asia/Shanghai` 日历日和当前 Release catalog 唯一推导为 `YYYY.MM.DD-N`，浏览器只读且不得手工改写；
- 可回读同 SHA 的 protected-main push pipeline、全部分片、`quality_aggregate`、`CI Gate` 与 exact evidence Package；
- protected environment `release` 与 masked/protected secrets 可用。

`publish_release` 从 `plush-ci-evidence` 恢复普通 push CI 的 v3 terminal，其 provenance job 固定为 `quality_aggregate`，不重跑 strict。`plush-release-candidate/artifact-<sha>/candidate.tar` 不存在时才构建一次 Server/Web bundle；后续重试只恢复同一 archive。同一候选包完成 migration、health/ready、smoke、备份恢复、重启恢复和零残留演练，回执在 `plush-release-rehearsal/artifact-<sha>` 冻结。只有这三层 exact 身份通过后，registry publisher 才把候选包内的同一镜像推到 `ghcr.io/saurick/plush-toy-erp-{server,web}` 取得 digest，并生成带演练 digest 的 `plush.release-manifest/v2` 与固定七资产：

创建 pipeline 时 Bridge 同时传入带时区的版本参考时刻；GitLab 在首次候选构建前重新读取 catalog，只接受与 pipeline 创建时刻相差不超过 10 分钟的同一下一版本。已冻结候选的显式重试保持原版本，不再发号；无候选且 catalog 已前进时必须新建发布，不得占用旧序号。

1. `checksums.sha256`
2. `release-artifact.json`
3. `release-manifest.json`
4. `sbom.cdx.json`
5. `server-image.tar`
6. `web-image.tar`
7. `release-rehearsal.json`

Generic Package version 与 Release tag 固定为 `artifact-<40sha>`。重试时先逐项校验现有 v2 文件的名称、大小和 SHA-256，只续传完全一致子集所缺的资产，并在创建或复用 Release 前读回完整七资产；未知文件、重复文件、同名异内容、同版本异 SHA、同 SHA 异版本或演练不完整均失败关闭。Release、Package、GHCR digest、manifest、`release-rehearsal.json` 和目标显式版本提升（Explicit Promotion）必须指向同一 SHA、同一 artifact/rehearsal digest。旧 v1 六资产只允许精确读取、展示、校验和既有回滚点兼容，`promotionEligible=false`；不得补传、重新封装或作为新版本提升输入。

## 双 Provider 边界

`scripts/deploy/gitlab-delivery-provider.mjs` 是默认 Provider，固定 GitLab base URL、项目、Generic Package、release tag、pipeline API 和本地下载根。它从服务端环境读取 `PLUSH_GITLAB_TOKEN`，限制 JSON 大小、asset 名、文件大小、URL、SHA、版本和符号链接路径，返回值不含 token。

质量门禁与版本中心读取 GitLab pipeline / job、不可变版本目录、发布状态和控制制品时使用独立的 `PLUSH_GITLAB_READ_TOKEN`，不复用发布与部署写凭据。macOS 本地 `pnpm start` 可从固定钥匙串项自动加载该令牌；服务端只把它映射给不暴露发布方法的只读 GitLab Provider，浏览器、本机质量门禁进程和部署执行子进程均不得继承。创建新发布仍只使用短期 `PLUSH_GITLAB_TOKEN`；未加载时只停用该动作，不影响已有版本与流水线证据读取。实例强制的最大有效期届满前需要按同一最小权限重新登记，不能以扩大为写权限换取自动轮换。

`scripts/deploy/github-delivery-provider.mjs` 继续读取 GitHub 历史/应急 Release，并把 v1 六资产投影为只读、可回滚但不可用于显式版本提升（Explicit Promotion）。当前 GitHub emergency workflow 在 checkout、registry 登录、构建和上传前固定失败关闭；只有未来完整支持 canonical v2 七资产与同一演练回执后，才能另行恢复写入。浏览器不知道 token，也不能选择 Provider。

GitLab Jobs API 的 job `duration` 和 `queued_duration` 是运行与等待真源。工作台读取当前流水线与最近 20 次普通 push CI 的全部 job，同名重试保留最新 attempt 并单列重试次数；页面只派生中位数、近似 P95、失败与排队趋势，不另存一份 CI 历史库。GitLab 未提供 step timing 时继续返回空 steps，不推算或伪造 GitHub 式 step timing。显式选择 fallback Provider 时只展示 GitHub 应急 release 运行，不再把历史审查 CI 当作当前流水线证据。

## GitHub 单向镜像与 GPT Review

GitLab 项目使用 push mirror 将 protected main 同步到 `github.com/saurick/plush-toy-erp`。GitHub main 禁止人工直接更新；镜像凭据使用专用最小权限 deploy key/token。仓库不维护 GitHub 审查分支或审查 CI。需要 GPT 审查时，先让 GitLab `main` 的 exact SHA 通过正式 `CI Gate` 并镜像，再按该次推送前后的 base/head SHA 审查 GitHub `main` 提交差异。

GitHub 不保留仓库 CI workflow；历史 Actions 运行只作审计，不能证明当前候选。`.github/workflows/release.yml` 是手工应急 release；只有 GitLab 主链不可用、操作人明确切换 Provider 且确认没有并行发布时才可运行。

GPT Review 的 finding 是审查输入，不是仓库事实。修复仍回到 GitLab main 主链，经正式测试、commit/push 授权和 pipeline 证明。

## 工作台信息架构

`/__dev/version-center` 只在 development serve 存在，继续使用同一 Delivery Bridge 与 operation store：

- 顶部区分本地候选、GitLab 不可变版本、demo / test 各自当前版本和容量/阻塞；
- `版本与部署` 读取 GitLab Release 与 package 完整性；
- `流水线耗时` 展示 pipeline/job、完整发布与 exact-SHA 复用、BuildKit、制品大小和远端流水线关键路径；
- `操作记录` 展示发布制品、部署指定版本（内部 operation 为 `promote`）、回滚版本和独立数据清空重建的状态、幂等与脱敏事件，并以 URL 恢复结果、动作、目标和版本身份筛选；
- 手动操作指引明确 GitLab 主链、GitHub 只读镜像和固定操作顺序。

工作台不把本地绿色、GitLab pipeline、GitLab Release、目标 smoke、备份恢复、岗位矩阵或客户 UAT 合成一个“全部完成”。每层单独显示来源与时间；缺失或非法时间显示“未证明”。

`/__dev/quality-gates` 另外读取当前 committed SHA 的 GitLab 普通 push CI，动态展示 GitLab 实际返回的全部 Job，不在前端复制 Job 目录或 DAG。“本次流水线”用同一 exact SHA 的 GitLab CI Lint `needs` 生成有向图，再与实际 Pipeline Job 取交集；依赖不可读或两者不一致时只保留可靠耗时并让 DAG 失败关闭，不画推测连线。服务器门禁内部只保留“本次流水线、Job 性能、CI 历史”三个轻量切换视图，顶部同 SHA 证据摘要始终可见。Job 只按“编排、执行、汇总、终态”和领域分组投影；默认突出异常与最慢执行 Job，其余以可展开明细保留。

`scripts/qa/ci-job-guide.mjs` 只登记 Job 的岗位化名称、用途、包含检查和结果用途，不保存 `needs`、状态、耗时、等待或历史。服务端按当前 GitLab 实际 Job 名单投影这份说明；新增但未登记的 Job 继续展示，并明确标记“说明待登记”。页面通过一个全局“Job 说明”入口和 Job 卡片上的按需说明按钮复用同一抽屉，不增加第四个子视图，也不在主页面常驻长文。抽屉把阶段职责、Job 说明、本次运行等待和 GitLab 日志放在同一上下文中；依赖仍来自 exact-SHA CI Lint，运行数据与历史仍来自 GitLab。

同一 development-only API 同时返回最近 20 次普通 push CI 的 pipeline 与逐 Job 数据，便于页面和 Codex 直接读取后定位慢 Job、排队、重试和回归；GitLab 仍是唯一历史真源。该服务器证据不覆盖 Local dirty 状态或本地 full/strict 回执；只有当前干净 SHA 的 GitLab 普通 CI 完整通过，质量工程与版本中心才把 `releaseEligible` 提升为真。本地 strict 即使通过也只保留为 Local 回执，不能替代 protected main 证据；未登记只读 token、API 不可达或 SHA 无 push 记录时只显示不可读/缺失，不制造绿色证据。

### 本地数据库恢复启动

普通 `pnpm start` 的只读 runtime preflight 最多等待 15 秒，超时会取消检查。本地 pending、数据库连接或配置、db-guard、Atlas、安全检查和后端异常均保留受限 Vite，固定进入 `/__dev/database-migration`；恢复启动不依赖 GitLab 钥匙串读取。恢复页只显示脱敏原因，普通 ERP 页面、其它 DEV API、`/rpc` 与 `/templates` 继续阻断。修正环境后刷新状态，必须重新通过同一完整启动检查及同目标 health / ready，才能解除限制并重新载入完整工作台。外部 `API_ORIGIN`、非法代理地址、前端依赖缺失和端口冲突不属于本机数据库恢复范围。

迁移页在停止后端之前检查完整工具能力：兼容 `docker` CLI/socket 的可用容器运行环境、Atlas v1.2.0、PostgreSQL 18 `pg_dump` / `psql` 和备份恢复基础命令。实现不绑定 macOS 或某一桌面产品；Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack，以及提供兼容入口的 Podman 都按同一能力合同判断。工具不完整只返回脱敏阻断和下一步，不自动启动本机应用、不自动 apply，也不把前端恢复页可达当成数据库已迁移。

数据库已到 head 时，准备入口只读返回无需迁移，不要求备份容器或再次 apply。存在旧 ready 计划时可显式重新检查并准备，旧确认随之失效；服务重启导致会话失效时，下一次显式操作重新取会话，不自动重放写请求。apply 或写后读回中断且缺少零写入证明时记录 `not_proven`；已证明数据库升级而后端启动失败时保留迁移读回，只需单独重启后端。后端重启先停止原进程，再检查新进程的 health / ready，启动命令缺失或超时不会退出迁移工作台。

## 目标环境与真实数据

当前可执行 target 只有 `demo-133` 与 `customer-test-133`。显式版本提升（Explicit Promotion）只 load/pull 已发布 digest，随后执行固定 preflight、backup、migration、Compose、health/ready、公网 SHA 和资源读回；它必须由使用者明确发起，`main` push 不会自动部署。失败、blocked 或 `not_proven` 不自动重试。

| 环境 | 公网入口 | 数据与用途 | 重建边界 |
| --- | --- | --- | --- |
| demo / `demo-133` | `demo.yoyoosun.net` | 项目方造数、演练、培训和回归；允许 seed/fixture/模拟业务事实 | 只走受控重建，必须保留自己的备份与回滚点 |
| test / `customer-test-133` | `test.yoyoosun.net` | 甲方测试/验收；普通部署不 rebuild、不 seed 并保留数据；基础单位 / 仓库只走显式一次性 bootstrap | 清理与 promotion 分开；重建前必须有可恢复备份、恢复验证和精确回滚点 |
| erp | `erp.yoyoosun.net` | 未来正式生产 | 当前未登记、未启用，不能从工作台执行 |

demo 与 test 必须使用同一 release digest，但数据库、上传目录、Compose project、宿主端口、运行 env、备份、回滚点、target registry、preflight、operation 和 smoke 全部独立。demo 造数不得进入 test；test 普通 promotion 保留现有数据且不调用任何 seed，显式重建不得影响 demo。test 的一次性 core bootstrap 只写精确 allowlist 的 11 个单位和 4 个仓库，要求当前任务明确授权、fresh backup、实时 target 身份、exact release / migration 和写后读回，不构成真实客户导入。根域 `yoyoosun.net` 临时 `302` 跳转到 `erp.yoyoosun.net` 只是导航行为，不把未来生产域名加入 target registry。`admin.yoyoosun.net` 退役后绝不进入 CI/CD 环境矩阵、数据清理、健康检查、发布验证或回滚流程。真实资料进入客户 Private 仓或经确认的受控存储，不进入 Product Core、CI artifacts 或公开 GitHub 镜像。

## Secrets、权限与审计

- GitLab root、Runner registration token、project API token、GitHub Packages token、mirror key 和 SSH key 不入仓库、不进浏览器、不写 operation message。
- `GITHUB_PACKAGES_TOKEN` 只给 Packages read/write；`GITLAB_RELEASE_TOKEN` 只给当前项目 Release/Package 所需 API。
- main 禁止 force push；release environment、variables 和 Runner 都设 protected/locked。
- pipeline 日志不打印 token；curl 只通过 header/stdin 使用秘密。
- GitLab、Runner、mirror、Nginx/FRP 和 backup 的远端设置必须单独读回，仓库 YAML 不能替代运行证据。

## 备份、恢复和回滚

每日 GitLab backup 与 `/etc/gitlab` config archive 从 SSD 复制到 RAID5 并生成 checksum；保留策略只删除受管且超期的精确文件。在线 verify 只证明 archive 和当前应用检查；每季度仍需在一次性同版本 VM 完成 restore drill，并读回登录、clone、pipeline artifact、Generic Package 与 Release。

GitLab 升级固定镜像 digest，遵循官方逐版本路径。升级前固定当前 digest、最新验证备份和维护窗口。失败时恢复同版本容器与备份，不删除 `/srv/gitlab`、RAID5、业务数据库或现有容器。

业务发布回滚继续按 release manifest、migration 序列和客户配置源指纹判断；GitLab 回滚、代码 rollback、数据库恢复和客户配置 rollback 是四种不同动作，不能相互冒充。

## 证据分层

| 状态 | 能证明 | 不能证明 |
| --- | --- | --- |
| 仓库定义已实现 | YAML、Provider、脚本、文档和测试合同存在 | GitLab 已部署 |
| 本地定向测试通过 | 受影响代码合同当前可执行 | Runner、mirror、域名、备份运行正常 |
| GitLab pipeline 通过 | 固定 SHA 的远端 QA/strict 与 artifact | 目标环境已发布 |
| Release/Package 完整 | v2 七资产、GHCR digest、manifest 与同一演练回执身份；或明确标记不可用于显式版本提升（Explicit Promotion）的 legacy v1 六资产 | migration、health、UAT |
| target operation passed | 目标制品、migration、运行和公开入口读回 | 客户业务结果与签收 |
| 客户 UAT | 指定岗位与数据在固定版本的真实使用结果 | 下一版本或其他环境 |

## 明确不做

- 不让 GitLab 容器兼任 Runner。
- 不给 Runner VM 挂 GitLab 宿主 Docker socket。
- 不同时运行 GitLab release 与 GitHub emergency release。
- 不在 133 或客户 UAT 目标构建源码。
- 不把 GitLab 改造成业务多租户、license、计费或客户工单系统。
- 不因双环境复制 Product Core 或字段/流程真源。
- 不以 RAID、pipeline 绿色、Release 存在或基础 smoke 替代恢复演练与客户 UAT。


## 验收证据 Acceptance Evidence

实现与运行分别验收，不能根据实施勾选推定当前目标状态。GitLab CI/CD 搭建完成需要同时具备：

1. 当前提交的定向合同与 YAML / Shell 静态检查，以及获准的 commit / push。
2. GitLab、KVM Runner、DNS / FRP / Nginx、保护规则、最小权限变量和单向 mirror 的实际读回。
3. 同一 SHA 的 main `CI Gate` 与 release pipeline 成功证据。
4. GHCR digest、GitLab Package / Release 的 v2 七资产、同一演练回执与工作台读回一致。
5. 同批 application backup / config archive、checksum、在线 verify 与一次性同版本 VM restore drill；恢复后可登录、clone 和读取 artifact / Package / Release。
6. 现有业务容器、持久数据、端口和公网入口没有回归。

工作台验收还要覆盖只读令牌缺失、写令牌缺失、非法时间 / SHA、未知版本资产、Provider 显式选择和 production build 排除 DEV / Bridge。只读令牌缺失不能制造绿色证据；仅写令牌缺失时仍可浏览已有发布。发布操作要求 clean HEAD 与 GitLab main 精确匹配，只创建不可变版本，目标部署仍由独立 operation 执行。

demo / test 分别绑定同一候选 SHA / digest 验证运行和数据隔离；test 重建与未来生产发布各自核对范围和授权。安装顺序、前置证据、故障停止和恢复见 [GitLab 与隔离 Runner](../../server/deploy/gitlab/README.md)。


## 本地开发入口 Dev-only surfaces

下列页面只在开发构建中可访问，不进入侧栏、`seedData`、RBAC、产品内文档 registry、生产构建或 ERP 正式菜单。除本机 loopback Bridge 明确登记的客户配置、版本交付、测试数据和共享开发库迁移操作外，页面不直接写后端业务。

| 路径 | 职责 | 维护真源 |
| --- | --- | --- |
| `/__dev` | 按改动、验证、交付进入开发任务 | `web/src/dev-workbench/config/devHub.mjs` |
| `/__dev/product-engineering` | 按问题进入内核、权限、规则、业务链、文档和原型 | `web/src/dev-workbench/config/devHub.mjs` |
| `/__dev/product-core` | 当前 Product Core 能力、归属、范围和边界 | `docs/product/产品能力进度台账.md` |
| `/__dev/permission-relationships` | 当前账号、岗位、最终功能、页面、仓库范围和审批责任 | 现有后台只读接口与已启用客户配置 |
| `/__dev/governance` | 项目治理地图只读可视化 | `docs/项目治理地图.md` |
| `/__dev/status-flows` | 业务链、协同、运行、事实与状态规则只读观察 | 代码合同、三类 dev-only 配置目录与正式架构文档 |
| `/__dev/business-usability` | 页面任务、完成标准和页内解释覆盖只读检查 | `web/src/erp/config/businessUsabilityCatalog.mjs` |
| `/__dev/docs` | 当前工作区 Markdown 查看器 | 仓库 Markdown 文件本身 |
| `/__dev/testing` | 本轮验证、专项检查、Git 收口和证据覆盖 | `docs/product/自动化测试策略.md` |
| `/__dev/quality` | 稳定入口；规范化进入服务器门禁视图 | `/__dev/quality-gates?view=server` |
| `/__dev/quality-gates` | full / strict 运行、结果、耗时、治理与覆盖缺口 | 正式 QA runner、门禁回执、affected 与本地 operation |
| `/__dev/data-preparation` | 固定数据范围检查、计划确认、执行与回执 | 既有 Core seed、统一本地验收 lifecycle 与 operation store |
| `/__dev/database-migration` | 共享开发库迁移准备、执行、读回与重启 | 高层 CLI、迁移 operation service、备份恢复与 operation store |
| `/__dev/prototypes` | HTML / PNG / 截图原型资产预览 | `docs/product/prototypes/**` |
| `/__dev/customer-config` | 已登记客户配置包预检、测试应用与发布门禁 | `config/customers/<customer-key>/*` 及 customer config 脚本 |
| `/__dev/version-center` | exact-SHA 发布、固定 133 部署与回滚 | GitLab Release、固定目标预检与 operation 回执 |
| `/__dev/drill-recovery` | 演练优先级、周期、证据状态与安全接管入口 | 固定目标预检、不可变 Release 与部署 / 回滚 operation 回执 |

### 开发导航 `/__dev`

- 默认页不平铺十四张同权入口卡片，而是按“先弄清楚怎么改、验证改动没有越界、准备安全交付”展示三段连续任务路径；阶段内的具体入口默认折叠，已明确目标时可直接进入对应一级区域。
- 已置顶入口只作为轻量快捷方式显示。完整十四个入口、搜索、分类、来源和置顶操作统一放在默认收起的“查看全部入口”中；展开后仍在当前标签内进入子页，不改变各子页内部导航。
- 开发态边界放在页头按需查看。具体入口继续显示用途、维护来源和状态，但不与用户的下一步争夺首屏注意力。
- 置顶只写浏览器本地偏好，不是后端配置；路由、分组和入口登记仍以 `web/src/dev-workbench/config/devHub.mjs` 为真源。
- 开发导航使用 `/favicon-dev.svg`；测试入口使用 `/favicon-testing.svg`，每个开发页同时提供独立浏览器标题，只用于区分本地开发页面。
- 十五个子页统一提供开发工作台全局菜单、当前页高亮、复制当前深链和按需打开来源文档。一级菜单按稳定责任域命名为“总览、产品工程、质量验证、交付运行”；二级菜单按开发者要完成的任务或查看的对象命名，页面标题可在短名基础上补充完整职责，路由和内部 key 不随文案调整。

| 一级菜单 | 二级菜单 |
| --- | --- |
| 产品工程 | 产品内核、权限关系、改动指南、业务链观察、业务易用性、开发文档、产品原型 |
| 质量验证 | 改动验证、质量门禁、测试数据 |
| 交付运行 | 客户配置、数据库迁移、版本发布、演练与恢复 |

“质量验证”和“交付运行”一级页只负责选择下一项任务，不重复读取或展示通用最近回执。full / strict 运行结果、阶段和历史统一在“质量门禁”核对；当前 SHA 的 strict 发布资格统一在“版本发布”核对，入口页不维护第二份证据摘要。

移动端全局菜单允许横向滚动，并保持单一当前页语义。

#### 工作台入口变更门禁

- 新入口先归入“产品工程、质量验证、交付运行”之一，并在 `DEV_HUB_ITEMS.areaKey` 维护唯一归属；总览阶段直接由该字段派生，不维护第二份入口清单。
- 新能力默认进入对应阶段的折叠入口和“查看全部入口”。只有它会改变多数开发任务的下一步时，才调整首屏任务路径；不新增同权卡片或重复快捷方式。
- 新增或调整入口时，同步核对入口 key、路由、标题、用途、维护来源、状态与边界，并运行配置单测及受影响的 Style-L1 默认态、交互态、恢复态、移动端、深色和相邻页面检查。仅在外部行为变化时更新本节。

### 产品工程入口 `/__dev/product-engineering`

该页把内核、权限、治理、业务链、易用性、文档和原型入口组织为“按问题找入口 / 项目图视角”两个同级、互斥且 URL-backed 的 Tab。默认 `view=questions` 按“查看当前产品能力、核对权限结果、判断规则、查看业务链、检查员工能否看懂并独立完成、搜索文档、评审原型”七类用户问题组织连续任务列表；`view=relationships` 把业务对象、状态、岗位、依赖和证据看作节点，按业务与事实、状态与流程、权限与责任、产品结构与治理、质量与 CI、交付与证据六类图模型提供分类说明、证据边界和现有入口。两个视角复用当前页面、菜单和正式真源；未知、重复或无关参数统一恢复到规范化查看方式。

### 产品内核 `/__dev/product-core`

该页只读解析全局唯一的 `docs/product/产品能力进度台账.md`，完整展示全部能力的当前可用范围和当前边界。页面把台账状态翻译为“已进入内核（可试用）、部分进入（部分可用）、当前不纳入”，支持按归属筛选和搜索能力、范围或边界，筛选条件写入 URL。台账和页面都不登记实施动作、后续候选或默认优先级；边界不构成待办、实施授权或发布计划。页面不维护第二份能力状态，不根据文件存在、菜单出现或测试数量自行推断完成度；进入 Product Core 也不等于目标环境已发布、恢复可用或客户已验收。字段、状态、Workflow / Fact 和实现细节继续通过台账中的正式证据入口核对。

### 权限关系 `/__dev/permission-relationships`

该页动态读取当前后端返回的员工账号、岗位、最终功能解释、可进入页面、仓库数据范围和已启用审批责任，并复用正式前端菜单目录投影完整的“看板中心 / 常用工作 / 更多功能”实际侧栏；它不是截图里的静态样例，也不是实时订阅，进入页面或点击刷新时才重新读取。默认打开“实际菜单”Tab，“关系图”和“明细核对”各自提供功能模块筛选；顶部摘要始终按所选岗位或账号的全部模块计算，“岗位已选但受限”只统计岗位已选择、但被当前配置限制的功能，不混入产品权限全集中尚未授予的功能。“明细核对”可切换到“包含未授予”，逐项列出正式权限目录中该岗位没有选择的功能。岗位视角读取已保存的系统推荐或自定义布局，员工视角按账号岗位顺序合并；超级管理员缺少独立有效会话、任一岗位最终结果未完整读取或账号 / 岗位已停用时会明确失败关闭或标记当前不可使用，不从前端样例猜测菜单。`mode / target / tab / module / scope` 写入 URL，可刷新、分享并使用前进后退恢复；页面并列显示结果终局性、权限来源、客户配置版本、产品版本、岗位版本、审批设置版本和最近读取时间，审批受阻时使用业务原因而不是内部代码。页面只读取现有后台接口，不保存岗位、员工或客户配置，不创建新的权限真源；任务、单据、Workflow / ProcessRuntime 运行状态、Fact / Ledger，以及某张记录在当前状态是否可操作都不进入本页。正式配置仍在 `/erp/system/permissions` 办理，保存后返回本页刷新核对；该页及其路由、文案、样式和代码块必须随研发效能工作台一起排除在生产构建之外。

### 项目治理地图 `/__dev/governance`

该页只读解析 `docs/项目治理地图.md`，主标题使用“这次改动该怎么做？”。默认按八类常见改动进入，不要求先理解架构层级、测试内部键或中英文工程术语；选中后只展示“先看这些、同时检查、不要误判”三步。任务名称、稳定 `task` 键、内部范围、依据、同步检查和边界均由 Markdown 明确维护，页面不再根据共享文档路径或关键词猜测相关任务。内部范围、个人 ToB 五步交付循环、治理维度解释、完整 Mermaid 关系图和维护来源统一放进“完整工作方式和内部说明”，默认折叠。`task` 写入 URL，可刷新、前进后退和分享；旧 `axis` / `scope` 参数会被清理，非法值回到第一项。该页继续保持 dev-only、只读和单一 Markdown 真源，不新增后端、数据库、RBAC 或正式菜单能力。

### 业务链与运行观察台 `/__dev/status-flows`

- 页面保留稳定 `view` 值，主导航使用“看业务链、查责任与任务、看运行路径、看已生效结果、查状态规则”五个用户问题，不新增权限或基础资料等平行 Tab。顶部概念解释默认折叠：五个视图继续用“人、路、账、规则、链”帮助记忆，同时明确基础资料（如客户、供应商、产品、材料和仓库）提供标准，来源单据（如销售订单、采购订单、生产订单和加工合同）记录准备做什么或承诺做什么，但不代表库存、出货或财务结果已经发生；受控业务动作真正执行，计算结果从正式来源和事实派生，权限、客户配置与审计贯穿全部视图而不单独构成业务链。全局定义搜索默认折叠；当前视图、业务链和专项定义上下文始终可见，已选择任务只在 Workflow 主内容以及实际使用该任务定位的业务链或 ProcessRuntime 局部结果中展示，不进入 Fact / Ledger 或状态规则的全局上下文。业务链 Tab 默认进入 `view=chain&chain=all`：用 11 个链级节点按主链、供给支撑、异常返工和纠正冲正分区展示明确衔接，不展开各链内部节点，也不把总图登记成伪造的第 12 条业务链。点击或选择具体链后，一次只展示一条详细业务链，并以编号步骤回答“做什么、谁处理、怎样算完成、异常怎么办”；业务单据、基础资料、流程运行、岗位协同、已生效业务记录和计算结果使用业务名称，稳定 key、内部分类、查询来源、实例 ID 与代码证据按需查看。桌面同时直接展示分组卡片、编号步骤及对应 Mermaid 关系图，不提供图表展开或收起动作；移动端隐藏复杂图并保留纵向入口。
- `devFlowStateCatalog.mjs` 汇总状态机和流程 variant，`devBusinessChainCatalog.mjs` 是业务链目录，`devFactLedgerCatalog.mjs` 是 Fact / Ledger 定义目录。三者都是 dev-only 只读投影，不是新的业务真源；构建器校验唯一 key、引用、覆盖和图可达，未知引用或缺失覆盖 fail closed。生产异常决策属于来源单据，不进入 Fact / Ledger 定义；拒绝或取消、超领额度、报废或在制让步执行分别按正式流程合同展示。合同测试还会扫描 Ent schema 中持久化的状态所有者字段，并要求与状态目录的 canonical 引用及少量显式 schema 映射全等：业务侧或观察台任一侧先改，另一侧未同步时都会失败关闭；事件前后值和来源快照不算状态所有者。
- 观察台页面保留路由与视图编排；`src/dev-workbench/components/flow-state/` 按业务链、任务、运行路径、事实和状态规则拆分视图，共用目录与任务上下文，继续只读消费同一真源。
- 状态规则视图直接消费同一状态目录登记的转换与异常路径分类，把正常推进、暂停与恢复、不通过与终止、纠正与退回、返工与再处理分组说明；图内用同一分类的彩色线、线型和动作短标签辅助扫读，图例与清单再解释适用条件、转换结果、影响边界和内部证据，不只靠颜色判断。可按全部、异常与纠正或当前状态筛选，并跳转到目录已明确关联的业务链、任务、运行路径或事实定义；它不查询历史实例，不提供改状态动作，也不是跨对象的通用状态管理器。
- 全局定义搜索按业务链、Workflow、ProcessRuntime、状态机和 Fact / Ledger 分组，搜索文字不写入 URL。`view / chain / node / flow / state / process / fact / task_id` 保存在 URL；每个视图只接受自己的对象参数，切换视图会清理无关对象参数并在返回业务链时恢复最近链和步骤。未知、重复、过期、当前视图无关的参数，或 `chain=all` 携带单链 `node` 时停止加载并提供恢复到业务总图的入口。
- 业务总图和具体业务链均提供“导出甲方校对版”。该入口直接从同一份业务链目录及其已登记流程、状态和岗位责任来源生成独立浅色打印稿，并调用浏览器原生打印；可在系统打印预览中保存为 PDF。打印稿先用 Mermaid 关系图展示主路径、岗位办理点、异常或纠正分支和正式业务结果，再用紧凑表格补充编号步骤、进入条件、可证明的责任岗位、人员与系统分工、完成条件及下一步；完整合同仍留在开发观察台，对外异常校对点去重后只列一次。具体链只导出当前所选链，`chain=all` 使用横向一页展示十二条链及其分区和衔接，不展开各链内部步骤。缺失信息显示“当前正式合同未定义”；暗色页面发起导出时图和文字仍固定为浅色。打印稿不包含稳定 key、源码路径、实例 ID、RPC、测试命令或真实业务记录，固定声明“未绑定客户发布版本”，并明确流程或任务完成不等于库存、出货、生产或财务事实生效。它只用于业务需求校对，不证明已经实现、发布或经甲方验收；页面不保存导出历史，也不新增 PDF 服务、数据库、API、RBAC、审批或外部发送能力。
- 真实查询只使用当前已有的 `workflow.list_tasks`、`workflow.list_task_events` 和 task-scoped `workflow.get_task_process_context`。可按任务名称、任务编号、来源单号或既有 `task_id` 定位；同名候选必须显式选择，分页结果不完整时不自动选择。可见任务若两个 ProcessRuntime 锚点都为空，页面直接显示普通未关联或 `simulated_only` 模拟展示摘要，不调用 context RPC，也不补造流程节点；后端返回“当前任务未关联正式流程”时使用同一正常边界。运行实例把 Product Core 版本化流程定义中的节点责任池、`current_responsibilities` 返回的运行中责任岗位和当前 Workflow 任务岗位分开显示并核对；三者缺失或不一致时明确保留差异，不按任务名称推断岗位或具体处理人，也不据此推断 Source Document / Fact 已生效。
- 当前后端没有通用 ProcessRuntime 实例 ID 直查，也没有跨领域 Fact 凭证 ID 查询。运行实例只能从可见任务锚定；事实页只展示经代码核实的 21 个定义并标注“未提供运行凭证查询”，不放置伪造输入框或 mock 凭证。
- 页面不导入库存过账、付款、冲正、流程推进、通用 `set_status` 或数据库写入。Workflow task `done`、ProcessRuntime node `completed` 和 Fact `POSTED` 使用不同说明；真实实例在总图最多高亮所属的一条业务链，在单链最多高亮一个 ProcessRuntime 节点，始终提示尚未证明上下游完成或业务事实已落账。

### 业务易用性 `/__dev/business-usability`

- 页面只读消费正式业务页面目录、现有业务链目录、岗位帮助和 `businessUsabilityCatalog.mjs`，按页面检查“当前要做什么、做到什么算完成、完成后交给谁、办理顺序、名词、公式、字段来源和禁用原因”是否齐全；不复制权限、岗位责任或业务链矩阵。
- `已覆盖 / 部分覆盖 / 缺失` 只表示说明目录的完整程度，不表示页面已发布、客户已验收或员工已经会用。岗位标签只是岗位帮助中的常用入口推荐，实际页面与动作仍以后端权限和当前账号投影为准。
- 页面支持按覆盖状态、岗位帮助和通俗文字筛选，并可回到正式业务页、岗位使用帮助或业务链观察继续核对；它不调用业务写接口，不保存覆盖状态，也不建立 CMS、审批流或培训统计。

### 开发文档 `/__dev/docs`

- Vite 在开发服务启动时收集仓库入口、`docs/**/*.md`、`config/customers/**/*.md` 和 `AGENTS.md`；客户配置页的“查看来源文档”因此会命中真实客户配置包说明。页面不校验 Git tracked 状态，因此不得将“能查看”解读为“已纳入版本管理”。
- 文档按“当前 / 评审与参考 / 历史”分层，默认只展示当前长期入口。`docs/reference/**` 与原型子目录 README 进入评审与参考，`docs/archive/**` 进入历史；目录、搜索结果和置顶区始终只显示当前所选层级的文档。
- 当前与评审文档在开发服务启动时进入全文索引；历史文档先只索引标题和路径，选中后才按需加载正文，避免历史过程记录拖慢默认阅读路径。深链或 Markdown 链接指向其他层级时，查看器会自动切换。
- `?path=<markdown-path>#<section-anchor>` 可直达文档和章节；在页面选择文档或章节会同步 URL，浏览器前进后退和刷新可恢复。相对 Markdown 链接继续留在开发文档查看器，站外链接保持普通外链行为。
- 搜索默认匹配标题、路径和正文，可切换为“仅标题”减少正文命中噪声；标题无结果时可直接切回“全部”继续查找。搜索结果、目录树和置顶区都可快速置顶或取消置顶。新用户默认收起目录、置顶区和多行章节，先保留搜索与当前文档；已有本地偏好继续恢复。章节标签支持展开换行、收起横向滚动、跳转和回到顶部。
- Markdown fenced `mermaid` 代码块会只读渲染为图表，可在当前页面适配宽度或可见高度、按 10%-240% 缩放、重置和全屏查看。

### 产品原型 `/__dev/prototypes`

该页只浏览 `docs/product/prototypes` 下的 HTML、PNG 和截图证据，支持分类、分组折叠、当前资产和本地置顶恢复。新用户默认只展开当前资产所在目录，状态说明、资产统计和技术来源按需展开；已有目录偏好继续恢复。筛选无结果时预览同步为空；每个资产可打开对应 README、复制仓库路径，并通过隔离 sandbox 预览。全屏预览进入弹窗焦点、圈定 Tab、Escape 关闭并恢复触发按钮。卡片参照范围不是正式菜单、路由、权限或 `seedData` 映射表。

### 测试入口 `/__dev/testing`

- 该页只读解析自动化测试策略、`scripts/README.md`、`web/scripts/README.md`、前后端 README 和部署说明等 9 份当前白名单文档，主视图按任务命名为“本轮验证”“专项检查库”“Git 收口”和“证据与覆盖”，稳定 `view=tiers|commands|closeout|coverage`。Git 收口只读展示 `core.hooksPath`、固定 Hook 文件与可执行权限，解释 pre-commit、commit-msg、prepare-push 和 pre-push 的职责；页面只能复制固定核对/准备命令，不执行、不暂存、不提交或推送。默认只展开“生成验证计划—运行匹配检查”主路径；17 组复制预设与内部 T0–T8 验证范围按需展开，T0–T8 不是完成进度或逐级验收。full / strict 不再作为主复制预设，页面以“前往质量门禁”深链进入固定 profile，终端入口仍在策略与脚本文档详情中保留。完整 Markdown 继续由独立的 `/__dev/docs` 查看器负责，不在测试入口复制第二个文档阅读器。
- `docs/archive/**` 不进入可复制命令来源，避免把历史命令写成当前测试入口；其他项目或 GPT/ChatGPT 原文不保存在仓库。
- “执行命令”只按同一条文档职责轴筛选来源：策略与口径、工程说明、执行脚本、部署与发布；搜索是独立的命令块关键词条件，“全部来源”只负责复位职责筛选。主视图、职责和关键词分别写入 `view`、`role`、`q` query，刷新、前进后退和从来源文档返回时可恢复。每个命令块可打开对应来源文档，文档职责、前后端技术域、脚本类型和部署阶段不再混成同一级分类。
- 多行命令会保留完整续行参数；不完整且以反斜杠结尾的命令不会进入复制结果。命令区按内容高度展示，不再被网格压缩裁切；验证层级和覆盖证据视图不显示对当前内容无效的命令来源筛选。
- “本轮验证”按收益优先展示五项独立能力：只读生成本轮 affected 验证计划、运行带稳定仓库身份回执的 fast 开发门禁、九岗位权限与任务可见性巡检、字段联动专项，以及“证据与覆盖”中的本地覆盖基线。页面把 P0/P1、命令来源和证据边界降为追踪信息，先显示用户下一步；计划可随时重生，执行动作和覆盖基线共同使用全局 QA 锁，同一时间只允许一项运行。各项状态与终态独立展示，不合成为“全系统已通过”。
- 固定动作通过 development-only `/__dev/api/qa/testing` 的 summary / plan / action / operation 合同运行。浏览器只能提交 `fast / role-access / field-linkage + idempotencyKey`，不能传 shell、参数、路径、环境变量、URL 或凭据；服务端固定映射仓库脚本，前后核对 repository identity，页面刷新后从私有 ignored operation store 恢复。岗位巡检只有本地后端与九岗位演示账号凭据就绪时才真实登录，凭据只从 Vite 服务端进程环境继承且不会返回浏览器；其预期业务写入为零，也不等于完整角色协同闭环。
- 覆盖视图从 dev-only `GET /__dev/api/qa/coverage` 读取固定 `output/qa/coverage/latest.json`，按 Go、Web、业务域、验证范围（内部键 T0-T8）、PostgreSQL、浏览器、readiness、目标环境和 UAT 分栏；未采集、过期、失败、跳过、阻塞和零执行不会折算为通过，也不会合并成一个总百分比。
- 报告与操作接口仅在 development serve 且请求来源与 Host 都是 loopback 时可用，返回 `no-store` 脱敏摘要；生产 build 不包含 `output/qa/**`，也不再从 `public/qa` 携带本机路径或覆盖报告。
- 「采集本地覆盖基线」通过 dev-only session / action / operation API 发起异步固定 baseline。浏览器只提交 `collect + idempotencyKey`，不能传 shell、参数、路径、环境变量或 profile；服务端校验本机 Host、同源、CSRF、JSON 合同，解析项目锁定的 Node / pnpm，以持久化幂等索引和全局 QA 锁串行运行 `node scripts/qa/test-coverage-collect.mjs --profile baseline --write`。页面显示 11 个脱敏阶段，其中先以 error-code `--check` 证明生成物无漂移，再直接使用项目 Node 做 Web native coverage，不触发会改写 tracked 生成物的 package `pretest`。切换视图不取消后台任务，回到页面后可恢复读回；按钮在运行期间原位禁用，终态自动刷新报告。
- 运行期仓库变化、启动/服务中断或终态读回无法证明时 fail closed，上一份报告继续展示；字段联动 TAP 与报告也先写 staging，只有测试、builder 和仓库身份复核均通过才原子替换，失败时保留上一份。真实 baseline 测试完成但存在失败、缺失或零执行时会发布绑定当前身份的 issues 报告，防止旧绿色遮蔽。页面“重新读取”只读取报告，“复制备用命令”只在 DEV 操作接口不可用时供手工执行。覆盖基线适合代码基本稳定、其它写任务结束的检查点，不必每次编辑后运行；它不写 PostgreSQL、不运行真实业务浏览器、不部署或做客户 UAT，未实际采集的值显示为空而不是 `0%`。`docs/product/自动化测试策略.md` 仍是测试选择和覆盖门槛真源。

### 质量门禁 `/__dev/quality-gates`

- 一级“质量验证”入口 `/__dev/quality` 会使用 replace 导航规范化到 `/__dev/quality-gates?view=server`，直接展示正式服务器门禁轨道；不保留另一张只做分流的质量首页，也不复制第二套服务器证据。
- 页面首屏优先读取当前 committed SHA 的 GitLab 普通 push CI，始终按正式合同展示 `plan → prepare → 质量检查 → aggregate → CI Gate` 执行轨道；质量检查最终汇入七个固定分片，其中 Node 核心 / 发布测试先行汇合，浏览器分片等待 Web 构建。服务器门禁在轨道前使用一张七行对照表，集中展示本机 strict 步骤、检查名称与对应 CI Job；本机诊断不重复显示 CI 标签。阶段编号按当前 runner 顺序动态计算，映射由 CI shard 合同测试守住。取得当前流水线证据后，再把真实状态与耗时填入十一个主路径节点，并展示墙钟时间、排队耗时、最长主路径 job 和相对耗时条。耗时条以最长主路径 job 为基准，不把可重叠的并行 job 相加成墙钟时间。该服务器证据只覆盖对应提交，不覆盖 Local dirty。未登记只读 token 或 API 不可达时明确标记“GitLab 读取失败”；凭据与 API 已读通但当前 SHA 尚无普通 push CI 时，分别显示“GitLab 读取正常”和“当前提交未产生 CI 记录”；流水线已形成但对应 job 尚未启动时标记“等待运行”。三者均保留完整轨道，且不使用本机回执或静态结构补造绿色结果与耗时。当前证据之后只读列出同一次 GitLab 查询中最近取得的最多 8 条 `main` 普通 push CI，展示结果、short SHA、真实事件时间、墙钟耗时、失败环节和 GitLab 详情链接；历史行不写本地缓存、不触发或重跑 CI，也不升级为当前 SHA 的通过证据。
- 页面内部只保留 `server / run / governance / gaps` 四个 URL-backed 一级视图，对外分别命名为“服务器门禁 / 本机诊断 / 门禁治理 / 覆盖缺口”；默认进入服务器门禁，服务器证据和本机操作不再同时铺开，也不叠加第二组 Tab。四视图复用 `DevTaskNav` 的 roving tabIndex、方向键、Home / End、焦点与主题合同。每个视图只接受固定 query；未知、重复、过期或跨视图参数 fail closed。切换视图会清理无关 query，不启动、不取消或清空 operation；公共仓库身份与当前 operation 摘要由页面级唯一状态源读取，只有活动 operation 启用一个 polling，治理与缺口请求在切换时取消并以请求序号防止旧结果覆盖。
- “本机诊断”只在定位工作区问题时，通过固定 `full / strict + idempotencyKey` 动作异步调用正式 runner，不替代 GitLab exact-SHA CI。显式 loopback database base 仍受支持，没有显式 base 时自动使用本机已有的固定 `postgres:18.1` 创建本次专用容器、随机凭据和动态 loopback 端口，正式回执、内部临时数据库、容器与进程组清理全部读回后才可通过。浏览器不能提交 DSN、凭据、镜像、命令或路径，也不会清理外部容器。本机历史与 GitLab 流水线分开记录；页面支持刷新恢复、精确取消、有界超时、中文阶段、正式回执、可比环境耗时和最近 20 次脱敏本机记录。当前版本回执优先于旧本机历史，dirty 结果不会升级成发布证明，样本不足时不估算剩余时间，终态不再显示“预计剩余”。诊断执行轨道直接消费服务端 `profiles` 阶段序列与 operation `stageTimings`，自动分出 strict 附加检查和 full 共用主路径；运行前、运行中和终态原位展示阶段状态、第一失败、最长阶段、正式回执与清理读回，回执和清理不计入 runner 阶段。共享基础检查与 Web 阶段的固定子步骤也只从 runner 登记表投影，不在页面复制命令或推测子步骤实时状态；已记录阶段耗时按阶段耗时之和归一化，并明确标注可并行阶段不能相加推算墙钟时间。只有至少 3 个 profile、环境指纹和 dirty / clean 状态相同的正式通过回执才绘制零基线耗时趋势，精确历史表始终保留。技术 ID、完整 SHA、指纹和原始 stage key 默认折叠。
- 本机托管数据库只提供一张默认折叠、展开后才加载的静态 Mermaid 生命周期图，并同步提供有序文字说明；它解释“登记环境或创建本次专用环境—运行正式门禁—精确清理—回执与清理读回”的固定边界，不承担实时运行状态。实时状态仍只读取当前 environment、operation 和正式回执，页面不为每种门禁重复绘制 Mermaid。
- “门禁治理”只读登记风险、触发条件、正式来源引用、唯一证据与退出条件；不复制命令或测试列表，不提供新增、编辑、跳过、禁用或删除。“覆盖缺口”复用 affected 与七类风险边界，按当前或 staged 改动展示应运行门禁、当前结果和仍缺证据，并以语义化“风险 × 门禁”矩阵支持横向比较；原有逐类风险、原因和证据详情继续保留。本地门禁通过不证明目标发布、回滚、客户 UAT 或签收。
- 页面及 `/__dev/api/qa/quality-gates` 仅在 development serve 存在，生产构建和正式部署不包含路由、页面 chunk、operation bridge、本地回执或 DEV 文案。测试数据仍由独立测试数据页管理，版本发布只读当前 exact SHA 的 strict 摘要与深链，不复制阶段、历史、治理或缺口。

### 测试数据中心 `/__dev/data-preparation`

- 页面默认按“确认完整回归能否开始 → 核对最新业务链与数据范围 → 准备并确认新批次 → 查看回执与耗时”组织为一条连续工作流。主路径直接读取业务链与造数的同一合同，显示当前 11 条业务链、67 个步骤、66 个合法场景、9 个现有造数阶段和 51 个页面目标；选择业务链只展开责任岗位、前置状态、允许动作、结果状态、Fact 与该步骤已登记场景，不创建局部造数入口。安全结论、阻断和主动作保持可见；SHA、目标指纹、plan hash、run id、固定步骤及历史事件按需展开。
- 页面只通过 development serve 的 loopback Bridge 使用三个固定 profile，不接受 shell、SQL、脚本路径、DSN、后端地址、密码或自定义环境变量。写入口的信任边界是本机开发进程、Host / Origin / `Sec-Fetch-Site`、CSRF 和 operation 确认，不冒充 ERP RBAC。
- `本地长期基础数据 / core-demo` 只允许登记的 `192.168.0.133:5432/plush_erp` 或 `plush_erp_*_dev`，先确认 migration 已到 head，再顺序准备十个演示账号、当前 V6 的 11 个单位与 4 个仓库。它不生成材料、产品、工艺、BOM、客户、订单、Workflow 或 Fact；这些版本化业务数据由 `scenario-demo` 接续准备，避免两套基础资料和生产工序语义并存。稳定 upsert 不等于跨入口事务，也不提供按 operation 删除。
- `业务场景演示数据 / scenario-demo` 固定使用 `yoyoosun-manual-acceptance / 2026.08.15-v6 / 20260815-V6`，只允许 `127.0.0.1:8300` 对应的登记 133 长期开发库。用户确认后先稳定准备本地岗位账号与至少 30 条由真实控制面操作产生的审计样例，再通过正式 `validate / publish / transition check / activate or rollback / effective-session readback` 对齐当前跟踪的 yoyoosun 本地测试配置，之后才准备 Source Document、已登记的 ProcessRuntime、模拟岗位任务和来源驱动 Fact。同批只允许精确创建或读回；半批、字段或身份漂移直接阻断，不提供清理或重置。收付款覆盖已批准、两笔已过账和已冲销，红冲覆盖一条有效红冲与一组原红冲 / 反向红冲。岗位到期时间是固定 V6 快照，不保证长期维持“今天 / 本周”相对语义；数据前置不替代浏览器验证和岗位人工验收。
- `按最新业务链完整回归 / full-acceptance` 是默认推荐入口，只接受 clean exact commit 和服务端已有的 `LOCAL_ACCEPTANCE_DATABASE_BASE_URL`。每次执行都复用统一 lifecycle 建立新的同批专用库，按当前合同运行全部已登记合法场景、migration、正式 Source / ProcessRuntime / Fact 数据、51 项只读页面验收和收付款、库存人工调整、生产超领三条真实写流程；成功或失败都必须停服、删库并读回零残留。页面记录 operation 实际墙钟时间，并从同一 dataset 回执展示 9 个现有造数阶段的开始、结束和耗时。旧回执只证明对应旧计划，不会被当作最新代码已经回归。
- `scenario-demo` 的页面操作固定为“读取预检 → 点击生成 → 自动准备并冻结 `planHash`、`runId`、仓库和目标摘要 → 核对固定目标 / V6 基线 / 数据范围 / 长期保留边界 → 确认生成 → 异步执行 → 读取回执”，不要求手输长确认串。其他 profile 继续使用完整确认串。执行前身份变化会使原计划失效；页面刷新可恢复最近 operation。进程中断或结果不明确时显示 `not_proven`，不会自动重试；用户可重新准备更晚的同目标 scenario plan 并再次确认，以同一固定批次显式补齐，其他 profile、不同目标或仍在运行的 operation 继续阻断。
- `scenario-demo` 只在固定本机 8300、登记 133 长期开发库、migration 和 runtime identity 已证明后，由后台使用项目登记的本机开发账号约定；显式 Vite 进程环境覆盖值仍优先，但凭据不进入浏览器、命令参数或回执。日常直接在本页点击即可，不需要 `make dev_restart`；只有修改 Vite 凭据覆盖环境时才重启一次 `pnpm start`。后端代码、配置或 migration 变化时才按正式后端流程重启。
- 页面不提供普通“重置全部数据”或 debug cleanup。共享基线按正式账号 / 主数据生命周期退出，已生效业务事实按取消、冲正或调整退出；只有专用验收库允许数据库级自动清理。Workflow task 完成不等于 Fact 已生成。
- `dataVersion` 是一轮可重复、可验收的冻结业务数据基线，不是 Git commit、operation 或每次造数的版本。业务链数据摘要和验证摘要都相同时，长期同批数据仍可用；只有验证摘要变化时，以新 operation / batch 绑定 exact commit 重新核验但继续当前 V6。数据摘要变化时先在隔离批次修正和验证，只有单位含义、记录结构、生命周期 / 状态、业务链映射、稳定编码或数量合同不兼容，或者准备冻结下一轮甲方测试基线时，才集中升级 `dataVersion`。已持久冻结的旧基线不得静默改写；纯样式、重构、性能或不改变数据结果的修复不升级 V6。完整回归仍默认每次使用新隔离批次，长期保留规则只服务 `core-demo / scenario-demo` 的日常联调边界。

### 数据库迁移 `/__dev/database-migration`

- 页面只操作 application config 已登记的 `192.168.0.133:5432/plush_erp` 共享开发库，不接受浏览器传入的 DSN、目标、命令、SQL、脚本路径、凭据或环境变量，也不支持 133 上其他实例、测试或生产数据库。
- 默认只读显示当前 / 最新 migration、pending 数和后端 health / ready。存在 pending 时先点“检查并准备”：Bridge 固定执行同目标 status、停止后端、plan、备份恢复演练和最终身份复核；其它数据库客户端仍占用目标时按既有 guard 阻断，不代替用户强制断开。
- `pnpm start` 在本地预检失败或超时时把本页作为受限恢复入口，普通 ERP 页面与 RPC 暂停。页面先检查实际能力而非指定桌面产品：需要兼容 `docker` CLI/socket 的可用容器运行环境、固定 Atlas、PostgreSQL 18 客户端和基础命令；可使用 Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack，或配置了兼容入口的 Podman。工具不全时不会先停后端，也不会开始 plan / backup。
- 准备成功后，页面要求输入当前 operation 给出的完整确认串；execute 会再次核对 migration / schema 指纹、目标 revision 和准备阶段备份文件身份，随后同一 operation 只执行一次 apply、`pending=0` 读回、后端重启和 health / ready。写入或后续读回结果无法证明时标为 `not_proven`，先读回，不自动重试。已证明迁移成功而后端恢复失败时，只需单独重启后端。旧 ready 计划可重新检查并准备，旧确认随之失效；会话失效后下一次显式操作重新获取会话。
- operation 使用 `0600` 原子状态、幂等键和跨 Vite 进程排他锁。migration / schema / guard / 备份编排真源、目标状态或备份文件身份变化会使旧计划失效；未变化且文件大小与 SHA-256 均读回一致的备份恢复报告可以复用，避免同一计划因非写入阻断反复 dump / restore。命令行 `make migrate` 与该页面复用同一 service；非交互调用必须显式使用 prepare / execute 两阶段，prepare 成功不能冒充已迁移。
- 此入口不运行 `fast`、`full`、`strict`、完整验收 lifecycle 或发布构建。后端只在确认 apply 后重启一次；数据库已到 head 时不为了“证明绿色”重新迁移或重建。正式发布迁移继续使用受控发布制品、目标备份、串行锁、readback、smoke 和 rollback point。

### 客户配置包预检与发布 `/__dev/customer-config`

- 页面通过 `customer`、`view`、`section`、`action`、`release` query 和客户包选择器读取 dev-only registry，当前只登记 `yoyoosun`。未选择或未登记 customer 时只显示状态与已登记列表，不 fallback 到 `yoyoosun`；视图、当前任务和证据批次均可通过 URL 恢复。
- 页面一级任务的用户可见名称为总览、检查配置包、查看变化、页面配置预览和试跑与发布；稳定 `view` 值仍保持 `overview|preflight|diff|assets|import`。配置预检不再一次渲染全部对象，而是通过 `section=package|runtime|flow|evidence` 分成包结构、运行投影、流程策略和验证证据；执行发布通过 `action=dry-run|test-apply|release` 分开试跑证据、测试配置应用和正式发布检查。默认值省略 query，非法或跨视图残留参数会被清理。
- 配置预检和执行发布的当前任务导航在长页面滚动时保持可见；每次只渲染当前任务对应模块，避免把边界、模块、流程、命令和发布操作堆在同一阅读流中。
- 页面配置预览先按业务名称展示品牌和菜单目录，菜单内部键降为展开后的追踪信息；页面配置边界、字段候选、编号规则和打印模板使用互斥展开区，一次只阅读一类明细。
- 页面只读取已登记 customer package，不提供 raw package、任意代码、SQL 或脚本上传。可视内容包括品牌 / 桌面菜单 runtime、字段和编号草案、流程 preview、`moduleStates`、打印模板字段、差异与版本门禁。
- UI Dry Run 只调用 `scripts/import/customerImportDryRun.mjs` 生成 ignored `output/customers/<customer-key>/ui-import-dry-run` 证据，不写数据库。当前登记的 yoyoosun 包仍是 draft / preview-only，`runtimeEnabled / publishEnabled / activateEnabled` 均未开放，因此“测试配置应用”按钮和 handler 都失败关闭，只允许预览和试跑；页面不会把 preview manifest 送入正式编译或发布链路。
- 只有受控配置包明确进入 `release_ready`，同时开放 runtime / publish / activate 后，测试配置应用才会用当前管理员登录态通过 Vite `/rpc` 固定代理 `http://127.0.0.1:8300` 调用后端校验、发布、切换检查、激活和有效配置读回接口。该路径不直写业务数据、不导入真实客户业务数据，也不绕过后端 RBAC；后端以 canonical hash 判断同 revision 幂等或冲突，前端不吞发布错误，并把同一 hash、产品版本和观测到的 active revision 作为 CAS 条件提交，最后按 customer、revision、hash、hash version 和来源读回确认。写入期间客户包和视图会锁定，离开页面不代表已发请求被撤销。
- `moduleStates` 只是控制面输入预览，不安装或卸载模块。`printTemplateDefaults` 只声明甲方 / 委托方默认字段；当前正式消费方是采购订单 `material-purchase-contract` 和委外订单 `processing-contract`，不覆盖供应商 / 加工方业务快照，也不启用销售订单打印模板。
- release readiness 必须显式选择 `deployments/<customer-key>/evidence/releases/<release-batch>` 的已登记批次，不猜 `latest`、不接受父目录或路径穿越。页面只做只读门禁并复制 `customer-config-release-readiness.mjs --print-input-template` 或统一 `customer-config-release-execute.mjs --print-input-template`；备用命令不拼未替换的 `<release-batch>` 或旧 manifest 路径，不再从浏览器直接发布 / 激活“正式版”。正式执行器继续要求目标端点、令牌、确认短语、release report 和 authenticated readback。
- `rollback_customer_config` 只回滚已发布 compiled revision 并记录独立审计，不是 raw 包回滚或业务导入失败恢复；页面不提供裸回滚按钮。
- 维护真源是 `config/customers/<customer-key>/*`、`config/catalog/*`、`config/schemas/*`、`scripts/import/*` 和相关正式文档。

### 版本发布与部署中心 `/__dev/version-center`

- 页面只在 development serve 中存在，展示当前 HEAD/dirty、GitLab 不可变版本、`demo-133` 与 `customer-test-133` 的当前 SHA、容量 blocker 和 operation 状态。它不把本地、CI、制品、目标 smoke 或验收合并成一个绿色结论；根域临时跳转不启用 `erp` target，退役的 `admin.yoyoosun.net` 也不是部署 target。
- 页面顶部先用一张主卡展示所选目标、当前结论与唯一下一步；本地候选、不可变版本、目标运行和公网入口收口为两列事实区，目标切换只显示当前目标的数据边界，不再同时平铺 demo / test 两张重复说明卡。严格门禁、发布动作和发布说明放在同一下一步区域；未结束 operation 与“最近发布与部署”继续常驻。下方以 URL 可恢复的 `版本与部署 / 流水线耗时 / 操作记录` 三个视图分流阅读。最近最多 20 个不可变版本固定每页 6 条，已结束操作每页 10 条；切换视图不重新请求摘要，也不会停止未结束 operation 的轮询。
- 顶部“手动操作指引”只解释 AI 不可用或用户亲自操作时如何沿用同一正式链路：Codex / 本地终端负责验证和中文提交，GitLab 负责代码真源、CI 与不可变 Release，GitHub 只接收 GPT Review 镜像，当前页面负责发布制品、部署、回滚和查看回执。说明会先区分可继续与必须停止的证据，再给出固定顺序和禁止捷径；它不创建 commit、push、tag、凭据输入、后台调度或第二套发布动作。
- “流水线耗时”直接读取固定 GitLab 项目最近 pipeline、job 与时间；GitLab Jobs API 不提供 GitHub 式 step 时间时，界面保持 job 级证据，不伪造步骤。页面分别显示统计读取时间及最近一次流水线、最近一次制品发布和构建制品的事件时间，并默认展示可见关键路径、最长可见环节和建议复核点；全部任务与步骤按需展开，不自动并发、重跑或复制 GitLab 状态。目标部署仍以工作台 operation 独立计时和读回。
- 发布只允许当前 clean exact SHA；GitLab adapter 固定 `gitlab.saurick.me/saurick/plush-toy-erp`、受保护 main、Generic Package 和 `yoyoosun`。版本目录、流水线耗时、发布状态与控制制品下载使用只读 Provider；只有创建新发布调用写 Provider，未加载短期 `PLUSH_GITLAB_TOKEN` 时页面保持可读并停用该动作。显式 `PLUSH_DELIVERY_PROVIDER=github` 才启用 GitHub 应急 adapter；两条发布链不得同时运行。
- 版本列表不改写不可变版本号；GitLab adapter 提供带时区的 `publishedAt`，每行在版本号和 short SHA 下显示本地完整日期时间，并用 HTML `time/dateTime` 保留原始值。Provider 拒绝缺失或非法发布时间，前端摘要合同进一步拒绝无时区值；比 133 当前 manifest 新的版本只允许准备部署，旧版本只允许检查回滚，当前 manifest、migration 序列或客户配置源指纹不能证明时按钮禁用并说明原因。顶部严格门禁与最新不可变版本、当前 operation、历史记录、详情头部和事件流统一显示各自真源提供的完成、发布、开始或更新时间；没有对应真源时显示“时间未证明”，不拿制品发布时间推算目标部署或公网核验时间。
- 发布、部署与回滚先按动作、固定目标、Exact-SHA、版本和发布输入创建或复用 operation；不同窗口的相同意图会合并为一个 operation。同一目标只允许一个执行器；页面刷新从原子 operation store 恢复。test 普通部署保留现有数据且不调用 rebuild / seed；清空并重建测试数据使用独立的两阶段 operation，并固定到 test 当前运行的 exact SHA。只有当前 Codex 任务明确授权时才可另行执行一次性 test core bootstrap，且它不是 promotion 阶段。`failed / blocked` 可由用户显式创建带父 operation 和尝试次数的新 operation，旧终态不变；`not_proven` 必须先读回目标且不提供重试。幂等证据仍以现有“操作记录”和详情为唯一运行真源，不新增幂等写动作或第二套 operation 状态，也不显示原始幂等键或指纹；演练页只读引用其完成状态。
- Operation 列表同时展示开始时间、终态完成时间和工作台操作历时；未结束 operation 显示开始与最近更新时间。已结束记录只提供结果、动作、目标和版本 / SHA / 操作 ID 四类高价值筛选，筛选写入 URL 并在刷新、前进和后退后恢复；不增加低价值日期区间或技术字段筛选。详情按动作分型：制品发布只显示构建、制品和工作台发布操作历时，不把未执行的目标传输、备份或镜像加载写成“未证明”；部署、回滚和重建只显示真实读回的目标指标。技术 ID、重复请求识别依据、digest 和最近 100 条脱敏事件默认折叠；事件仍使用完整本地时间并在 `time/dateTime` 中保留原始带时区值。浏览器不接收本机路径、repo/workflow/target/SSH/shell/SQL/Docker 输入，也不持有 GitLab、GitHub 或 SSH 凭据。
- 效能工作台的质量门禁、测试、数据准备、数据库迁移和客户配置执行证据统一展示真源提供的统计读取、开始、完成、阶段、事件、计划、备份验证、发布或激活时间；ISO 值必须自带时区，后端 Unix 时间只在字段合同明确为秒时转换。缺失或非法值显示“时间未证明”，静态目录和没有权威快照时间的页面不使用页面加载时间冒充更新时间。
- 远端基础回执当前只证明制品、备份恢复检查、migration、Compose、health、ready、Web health 与运行 SHA；带凭据岗位矩阵、PDF、客户 UAT 和签收仍需独立完成。

### 演练与恢复中心 `/__dev/drill-recovery`

- 页面只读复用版本中心同一份摘要、固定目标 preflight、不可变 Release 和 promotion / rollback operation，不新增 Bridge action、后台任务、数据库或第二套状态真源。刷新只会重新读取固定目标状态；目标写入仍回到版本中心按既有准备、确认和读回合同办理。
- 信息层级固定为“当前恢复结论与唯一下一步 → 六项紧凑清单 → 最近交付与应急接管”。桌面只默认展开当前建议，窄屏从全部折叠态开始；目的、触发、证据和安全边界按需展开，不平铺成卡片墙。
- 演练按风险和优先级组织：P0 是目标身份与健康、相同 SHA 幂等、兼容回滚与再前滚；P1 是隔离数据库备份恢复及新服务器 / 正式环境切换；P2 是未来故障注入。普通成功部署不会自动冒充演练；只有明确的 no-target-write 幂等回执，或回滚后再前滚到当前 exact SHA 的完整 operation 链，才显示最近证据可用。
- 每项同时展示建议频率、变化触发条件、完成证据和安全边界。稳定期不要求每次发布都跑完整演练：目标预检仍是每次发布门禁，幂等与隔离恢复建议每月或相关脚本变化后执行，回滚 / 前滚建议每季度及 migration 合同变化后执行。
- 服务器迁移或增加正式环境时，必须先在受控 deployment target registry 登记新的环境身份、路径、Compose、数据库、公网入口和容量合同，再为该目标建立独立 preflight 与 operation。页面使用“环境语义 + 技术 key”展示，不按 IP、机器名或菜单复制一套实现；当前未登记的第二目标保持不可执行。
- 故障注入默认关闭。只有存在独立隔离环境、固定故障目录、明确恢复步骤和残留读回后才可扩展；页面不接受临时主机、路径、凭据、命令、SQL 或 Docker 输入，也禁止对当前试用或正式环境临时制造故障。
- AI 不可用时仍回到版本中心的“手动操作指引”，沿用 clean exact SHA、GitLab CI、不可变 Release、固定 operation 和结果读回；演练页不复制易漂移的命令清单，也不提供绕过门禁的应急按钮。
