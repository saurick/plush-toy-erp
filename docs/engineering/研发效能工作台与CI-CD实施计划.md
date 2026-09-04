# 研发效能工作台与 CI/CD 实施计划 / Engineering Workbench And CI/CD Implementation Plan

## 当前结论

仓库与运行主链已从“GitHub 托管主链”切换为“R640 GitLab canonical + KVM Runner + GitHub Review mirror”。本计划只记录稳定合同和完成标准；当前 SHA、pipeline、Release、Runner 资源、backup/restore 和目标环境必须从对应真源实时读回，不从勾选或历史结论推导。

| 状态            | 当前结论                                                                                                        | 证据                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 仓库定义        | R640 分片 DAG、普通 CI evidence 复用、单次制品构建、冻结演练和 v2 Release 合同由正式代码/测试/文档守住          | `.gitlab-ci.yml`、CI/release 脚本、R640 cloud-init、工作台与合同测试                                                                                                                       |
| Git/远端        | GitLab `origin/main` 是 canonical，GitHub 是 protected-main 单向 mirror 和应急路径                              | 当前结论以 exact remote SHA、protected branch 与 pipeline API 读回为准                                                                                                                     |
| R640/公网运行态 | GitLab、公网入口和独立 KVM Runner 已是实际主链；VM 资源由唯一 provisioning 入口参数化，槽位是独立的受控容量策略 | 每次 Pipeline 通过 root-owned helper 的窄只读 evidence 投影验证 live `concurrent=limit` 与服务状态，并读回 guest vCPU、内存、swap、磁盘；本次 exact-SHA aggregate 绿后才成为已验证容量证据 |
| 业务目标        | `demo-133` 是项目方模拟数据环境，`customer-test-133` 是甲方测试/验收环境；二者均非生产                          | 两目标同 digest、运行与数据完全隔离；test 普通部署保留数据，未来 `erp` 需另行正式启用                                                                                                      |

任何本地绿色都不能改写远端、不可变制品、发布演练、目标部署或客户 UAT 层的状态。

## 已落仓库切片

- [x] `.gitlab-ci.yml`：main/MR canonical plan；main 的唯一 prepare cache writer、七个固定 quality 分片、aggregate、稳定 `CI Gate` 和 serialized release。
- [x] 普通 push CI 的 terminal/receipt/manifest 按 exact pipeline/job/SHA 固化；release 服务器端验证 protected main 与全部 DAG job 后复用，不重跑 strict。
- [x] 同 SHA 的五件候选制品只构建一次并冻结成 `candidate.tar`；同 bytes 隔离演练回执另行冻结，新 publication 固定用 v2 七资产同时绑定 CI、artifact、rehearsal 和 GHCR digest。旧 v1 六资产只读、展示、校验和既有回滚兼容，不能 promotion。
- [x] exact-SHA terminal 与 release catalog 支持真实 `gitlab-ci` provenance，同时保留明确的 `github-actions` 应急 provenance。
- [x] GitLab Provider：固定 URL/project/package/release/pipeline、受限下载根、token 服务端边界和 pipeline/job timing。
- [x] Delivery Bridge 默认 GitLab，只有 `PLUSH_DELIVERY_PROVIDER=github` 才选择 GitHub fallback。
- [x] GitHub 仓库 CI 与专用审查分支已移除；protected main 只接收 GitLab 单向镜像，GPT 审查读取目标提交范围。GitHub emergency release 在完整接入 canonical v2 七资产与同一演练回执前，于任何 checkout、登录、构建或上传前失败关闭。
- [x] 质量工程页面分开展示当前 committed SHA 的 R640 普通 CI 与 Local dirty/本地回执；只有服务器 exact-SHA 证据可提升发布资格，版本中心只从 GitLab 的真实 pipeline、Release/Package 和 target operation 展示效能与交付状态。
- [x] 性能证据区分 R640 宿主与 Runner guest，按冷/热缓存保存 job、关键路径、CPU/内存/IO 峰值、p50、波动和近似 p95；阶段目标不是停止线，资源仍有余量时继续提速且不降低覆盖、隔离、清理或 fail-closed。
- [x] Runner VM vCPU、内存和磁盘由 `runner-vm.sh` 显式参数化；唯一槽位参数 `RUNNER_CONCURRENT_SLOTS` 只在 `runner-capacity.env` 保存，并由同一个 `runner-capacity.sh` 管理旧值、idle、锁、服务读回和回滚。DAG 按实际就绪状态使用该全局安全上限；protected main 自然 push 自动取消旧的可中断 Pipeline，重资源 lane 与 Job 内串行合同不变。
- [x] R640 GitLab Compose、精确安装、备份/校验和 Runner VM cloud-init 定义。
- [x] affected mapping、quality gate catalog、Node 分组、fast web 合同和 GitLab CI 静态门禁。
- [x] 正式部署、QA、Web 与工程文档同步。

这些勾选只表示长期实现合同，不表示任何指定 SHA 已经 commit、push、CI 绿灯、发布或部署。

## 本地收口顺序

1. 运行新增/受影响 Node 合同：GitLab Provider、exact-SHA、release catalog、GitLab/GitHub workflow、affected、quality catalog、Bridge、工作台配置和样式。
2. 对 `.gitlab-ci.yml`、Compose、cloud-init 和 Shell 脚本做 YAML/Shell 静态检查；不执行安装、备份或远端命令。
3. 运行 `git diff --check` 和精确变更审查，确认没有触碰外部脏路径、generated path、schema/migration 或生产配置。
4. 根据 affected plan 判断是否需要更高成本验证。full、strict、完整 Style L1 或真实浏览器门禁仍需按测试治理另行点名授权。
5. commit、GitLab push、GitHub mirror、发布和目标部署继续按各自合同与当前授权边界分层执行；一层完成不自动推定后一层。

## GitLab 部署前置证据

在取得部署授权后，重新只读检查并记录：

| 事项        | 必须证明                                                                         | 停止条件                           |
| ----------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| R640 存储   | `/srv` SSD 与 `/srv/raid5` 实际 mount、余量、inode、SMART/RAID 状态              | mount 不符、降级或余量不足         |
| 现有容器    | 名称、端口、数据目录和 restart 状态                                              | 8929/2224 冲突或路径重叠           |
| KVM         | `/dev/kvm`、libvirt network、VM 磁盘与资源预算                                   | 需要复用 GitLab 宿主 Docker socket |
| 公网        | DNS、阿里云现有 vhost、FRP remote 18226、证书与回滚配置                          | 同名站点来源不明或切换不可回滚     |
| GitLab 镜像 | digest 与目标 CE 版本、升级路径和备份兼容                                        | 浮动 tag 或不支持的跳版本          |
| Secrets     | root 初始化、MFA、Runner token、project token、GHCR token、mirror key 的最小权限 | token 需要进入仓库/浏览器/日志     |

## 目标搭建顺序

1. 为 GitLab SSD 数据和 RAID5 backup 建立精确目录、权限和容量告警。
2. 以 `server/deploy/gitlab/install-r640.sh` preview 检查，再用精确确认启动单个 `plush-gitlab`。
3. 只在 R640 本机处理初始密码，立即修改、启用 MFA，创建非 root 管理员。
4. 创建私有项目 `saurick/plush-toy-erp`，保护 main、禁止 force push，要求 merge pipeline 成功并以 `CI Gate` 作为稳定汇总 job。
5. 创建 protected `release` environment 和三项最小权限 protected variables。
6. 用唯一 `runner-vm.sh` 显式传入 VM 资源与独立槽位参数并渲染 cloud-init；完成后通过 `0600` 一次性 token 文件注册 locked project runner，读回动态资源、`concurrent=limit`、tags 与 untagged=false。
7. 配置 GitLab push mirror 到 GitHub，只同步 protected main；GitHub main 禁止直接更新，仓库不配置 GitHub CI 或专用审查分支。
8. 在阿里云备份旧 vhost，切换 `gitlab.saurick.me -> 18226`，完成 Nginx config test、TLS、health 和登录读回。
9. 运行非发布 MR/main pipeline，核对 `CI Gate`、缓存、一次性 PostgreSQL 清理、Runner VM 与 R640 宿主隔离。
10. 用合法正式版本运行 release pipeline，核对普通 push CI terminal 复用、单次 candidate build、同 bytes rehearsal、v2 manifest、GHCR digest、含同一 `release-rehearsal.json` 的七资产 package、GitLab Release 和工作台读取。
11. 配置每日 backup；立即生成一份备份、checksum 和在线 verify，再在一次性同版本 VM 完成恢复演练。

任何一步失败都停在当前层，不继续把未知状态带入下一层。

## GitHub 与 GPT Review 验收

- GitHub main SHA 与 GitLab main 一致，mirror 方向只有 GitLab → GitHub。
- GitHub 仓库没有自动 CI workflow，main 镜像不重复执行 GitLab 已完成的质量门禁。
- GPT Review 能按本次 GitLab push 前后的 base/head SHA 读取 GitHub main 提交差异；finding 返回仓库处理，不在 GitHub 直接形成第二条 main 写入链。
- GitHub emergency release 当前固定在任何副作用前失败关闭；只有未来完整支持 canonical v2 七资产和同一演练回执后，fallback 演练才可另行评审。

## 工作台验收

- 默认 Provider 为 GitLab；无 `PLUSH_GITLAB_READ_TOKEN` 时版本目录与流水线证据保持不可用，无短期 `PLUSH_GITLAB_TOKEN` 时仍可只读查看但不能创建新发布。两类 token 均不向浏览器暴露原始值、header 或内部栈。
- 版本列表只接受固定 GitLab project 的 `artifact-<40sha>` Release；只有 v2 七资产与同一演练回执完整时才可 promotion，v1 六资产只读/回滚且 `promotionEligible=false`。
- 质量工程只把当前 committed SHA 的普通 push CI 投影为服务器证据，必须包含 plan、prepare、七分片、aggregate 和 `CI Gate`；Local dirty 和本地回执单独展示。
- 版本中心 pipeline 只接受固定 GitLab URL、合法状态、时间和 job；无 step 数据显示空列表，不估算。版本与部署只展示真实不可变 Release/Package 和 target operation。
- “发布当前 SHA”只接受 clean HEAD 且由 GitLab main 精确匹配；dispatch 只生成不可变版本，不自动写 demo 或 test。
- GitHub fallback 必须由服务端环境显式选择，浏览器没有 Provider 选择器。
- 人工接管说明明确 GitLab 主链、GitHub review mirror、固定操作顺序与禁止捷径。
- 生产 build 仍排除全部 `/__dev` 路由与 Bridge。

## 备份与恢复验收

- GitLab application backup 和 config archive 同批生成，RAID5 copy 与 checksum 权限为私密。
- retention 只删除 `/srv/raid5/gitlab/backups` 内受管且超期的精确文件。
- 在线 verify 通过 tar/checksum 与 `gitlab:check`，报告明确不等于恢复。
- 一次性 VM 恢复后能登录、clone、读取 pipeline artifact、Generic Package 和 Release。
- 恢复演练记录 GitLab 版本、backup filename/hash、config hash、开始/完成时间、结果和清理读回；不保存密码/token。

## demo、test 与未来生产

当前可执行 target 是 `demo-133` 与 `customer-test-133`：

- `demo.yoyoosun.net`：项目方造数、演练、培训和回归，允许经受控流程重建 seed / fixture / 模拟数据。
- `test.yoyoosun.net`：甲方测试与验收；普通部署默认保留现有数据，开始新一轮测试时可通过独立 rebuild operation 恢复干净业务基线。
- `erp.yoyoosun.net`：未来生产，尚未启用，不能提前进入工作台或流水线可执行目标。

demo 与 test 共享同一 Product Core 与不可变 release digest，不复制代码或字段真源；数据库、上传、Compose project、端口、runtime env、备份、rollback point、operation 与 smoke 全部独立。demo 造数不得污染 test，test 重建不得影响 demo。

根域 `yoyoosun.net` 临时使用 `302` 跳转到 `https://erp.yoyoosun.net`；这不启用未来生产 target。`admin.yoyoosun.net` 退役后不进入 CI/CD 环境矩阵、target registry、数据清理、健康检查、发布验证或回滚。当前目标登记与普通 promotion 都不代表已执行 test 数据清理；只有独立 rebuild operation 才携带清理意图。

## 回滚与停止条件

| 故障层                  | 回滚/处置                                                  | 禁止动作                            |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------- |
| GitLab 容器首次启动失败 | 保留 `/srv/gitlab` 和日志，修正单一配置或回到已固定 digest | 删除 data/config、全局 Docker prune |
| 公网入口失败            | 恢复备份的阿里云 vhost/FRP upstream，GitLab LAN 入口保持   | 临时开放 8929 公网                  |
| Runner 不可信           | pause/delete Runner token，保留 GitLab；重建一次性 VM      | 改挂宿主 Docker socket              |
| mirror 异常             | pause push mirror，GitLab main 继续作为真源                | 从 GitHub 强推覆盖 GitLab           |
| release 身份不一致      | 终止 job，保留 package/release 证据，使用新版本修复        | 覆盖同名 asset/tag 或猜 digest      |
| backup/restore 未通过   | 阻断 GitLab 升级和正式依赖切换                             | 把 RAID 健康当恢复证据              |

遇到以下任一条件立即停止：目标身份/挂载漂移、活动 writer/部署、端口重叠、备份不可验证、secret 可能落盘/输出、Runner 需要越过 VM、GitLab/GitHub 同时发布、release SHA 与 main 不一致、目标结果 `not_proven`、或需要数据库/域名破坏性动作但没有独立授权。

## 完成定义

本任务只有在以下证据分别存在时才能说“GitLab CI/CD 已搭建完成”：

1. 仓库实现通过定向检查并完成获准 commit/push；
2. R640 GitLab、KVM Runner、域名/FRP/Nginx、保护规则、变量和 mirror 已实际读回；
3. main `CI Gate` 与 exact-SHA release pipeline 各成功一次；
4. GHCR digest、GitLab Package/Release v2 七资产、同一演练回执和工作台一致；
5. backup、checksum、在线 verify 与隔离 restore drill 均有证据；
6. 现有业务容器、数据、端口和公网入口无回归。

demo/test 的真实部署、数据隔离与公网验收仍需绑定同一候选 SHA/digest 分别完成；test 数据清理和未来 erp 生产发布是独立高风险切片，不能由 GitLab 或工作台本地绿色推定完成。
