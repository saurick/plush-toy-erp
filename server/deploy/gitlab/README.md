# R640 GitLab 与隔离 Runner

本目录定义 R640 上的代码与 CI 控制面，但不会被仓库脚本自动执行。当前正式拓扑是：GitLab 为代码真源和 CI/CD 主链，GitHub 为单向只读审查镜像，GHCR 暂时继续保存按 digest 固定的运行镜像。

## 存储与隔离结论

| 资源 | 放置 | 原因 | 恢复边界 |
| --- | --- | --- | --- |
| GitLab config、PostgreSQL、repositories、artifacts | R640 SSD：`/srv/gitlab` | 随机 I/O 和数据库延迟敏感 | 由 GitLab backup + config archive 恢复 |
| GitLab 备份副本 | R640 RAID5：`/srv/raid5/gitlab/backups` | 容量和单盘故障容忍优先 | 仍需异机/离线副本，RAID 不是备份 |
| Runner VM 系统盘与 job cache | R640 SSD 上的独立 KVM qcow2 | 构建 I/O 与 GitLab 数据隔离 | Runner 可重建，不保存业务真源 |
| 发布镜像 | GHCR digest | 复用现有目标机加载和 release manifest 合同 | 新 GitLab Release 保存 v2 七资产（含同一演练回执）；legacy v1 六资产只读/回滚 |

GitLab 不与业务 PostgreSQL、测试数据库或现有 Docker 容器共享数据目录。Runner 运行在独立 KVM VM 内，只获得 VM 内的 Docker socket；不得挂载 R640 宿主机 `/var/run/docker.sock`。

Runner VM 的 vCPU、内存和系统盘不是仓库常量，而是 `runner-vm.sh` 创建/重建时彼此独立的必填参数；脚本不设置与工作负载脱节的固定内存下限。`runner-capacity.sh --evidence` 只读回在线 vCPU、MemTotal、swap、根文件系统和槽位配置，证明当前配置身份一致，不把开机快照冒充负载容量结论。Runner slot 的唯一显式参数名是 `RUNNER_CONCURRENT_SLOTS`，不能由 `nproc` 自动派生；注册、重建与后续 live 调整都复用 `runner-capacity.sh`，它只在 Runner 空闲、配置身份和旧值精确匹配时原子更新全局 `concurrent` 与唯一 project runner `limit`，失败恢复旧配置并读回。

当前 canonical 质量 Pipeline 的全局稳定安全并发上限只在 `runner-capacity.env` 保存，DAG 只调度已经就绪的 Job，空槽不预留 CPU 或内存。`concurrent=limit` 把多 Pipeline 即使短暂重叠时的总资源使用也限制在同一个全局上限内；普通完整质量只接受 protected main 的自然 push，新的 commit 自动取消可中断的旧 Pipeline。Job 内 Node 并发仍为 1，PostgreSQL、Docker、Chromium、浏览器锁和 resource-sensitive lane 继续按既有资源边界串行或隔离。只有 VM 资源规格变化，或出现 OOM、swap、持续 iowait、资源残留或清理污染证据时，才重新评估安全上限；不得通过跳过测试保速。

性能调优必须分别观测 R640 宿主机和 Runner guest：在候选内存下运行 protected main 的完整自然 push Pipeline，记录冷/热缓存的 job 时长、DAG 关键路径、峰值工作集、最低 MemAvailable、swap、memory PSI、OOM、IO 峰值、p50、波动和近似 p95，再决定 Runner 内存、slot、分片和语言测试并行度。内存候选以完整 Pipeline 的实测峰值加明确余量为依据；一次绿色只证明该次候选可运行，不直接证明长期稳定，缩容后至少保留可立即恢复的上一档规格。普通 CI 7–9 分钟、热缓存提交到部署 10–15 分钟只是稳健阶段目标；资源仍有余量且未出现排队、IO 争用、OOM、flaky 或波动扩大时，继续冲刺 6–8 分钟和 8–12 分钟，稳定更快也接受。只有资源饱和或进一步提速需要明显不成比例的复杂度时才停止；不得减少测试、放宽 fail-closed / exact-SHA、隔离或清理门禁，也不得用伪缓存命中换取数字。

## Playwright 冷启动与本地运行包

exact SHA `cddd39ff87e3e2ae9cd8c0282431309bb7cb043f` 的自然 push pipeline `7` 是失败证据，不是优化完成证明：`plan` 约 `115s` 通过，`prepare` 约 `3900s` 后以 `job_token_expired` 失败，后续七个分片均未执行。唯一有界失败 trace 显示 pnpm 的 765 个包约 `65s` 完成，随后 Playwright Chromium 公网下载停滞约 `58m51s`。后续 pipeline `11` 已把冷下载改为串行，但第一个 `chrome-linux64.zip` 仍在 12 分钟后超时；pipeline `13` 再次证明 Google Storage 单连接无法满足该边界。exact SHA `7f4120cae6f6de3eeb81d9699b62eff995a37c8f` 的自然 push pipeline `14` 把两个 CFT 大包固定到 Google 官方 edge，并把每个请求延长到 20 分钟；765 个 pnpm 包约 `75s` 完成，但第一个 `chrome-linux64.zip` 仍精确超时，后续分片未运行。该证据否定了“只换 CDN 或继续加长 CI 超时”的方向：局部吞吐采样不能替代完整传输，根因仍是 Runner 公网链路对 175 MB 固定包不具备可接受的有界吞吐。

exact SHA `13d392524fdd414296503dbcf05bb4064bd18fea` 的自然 push pipeline `15` 已证明冷种子闭环本身有效：`prepare` 在约 `2m15s` 内完成 765 个 pnpm 包、一次 Runner 本地种子消费、Generic Package 上传与读回，精确种子目录随后不存在。该流水线仍是失败证据：Node 分片因未离线安装 Web 依赖而找不到 `playwright`，Web 分片因 DEV 版本中心 fixture 缺少当前 `releaseVersionPolicy` 合同而失败，Server 逐测试 Go JSON trace 超过 GitLab 4 MiB 日志上限，浏览器、聚合与 `CI Gate` 按 DAG 跳过。后续修复必须产生新 SHA；不得重试 pipeline `15`，也不得把其局部绿色写成完整 CI 或发布证明。

exact SHA `3aba488752b04e3b930ea181aa04e11d5f143cb8` 的自然 push pipeline `16` 进一步证明缓存与主要质量阶段绿色：Static、Web、Resource、Security 通过；Server 的 3634 项 Go 测试和关键 PostgreSQL、Browser 的真实 Chromium smoke 均通过。该流水线仍是失败证据：Node 的后置 source archive 校验错误地把合法 `sha256:<64hex>` 当成裸 digest；当前 Runner 又漂移为缺失 cloud-init 已声明的 sandbox 清理 helper 与精确 sudo 入口，使 Server / Browser 在测试后清理阶段失败并留下 job 113 / 115 两个 sandbox。运维闭环已按仓库声明恢复精确 root-owned helper 和单命令 sudo drop-in、经全局 `visudo` 与 CI 用户调用验证后删除这两个残留；后续 `prepare` 会在任何 cache 写入前先校验该清理入口。不得重试 pipeline `16`，修复仍须新 SHA 的自然流水线证明。

CI 冷启动因此不再承担公网下载。运行包合同固定 `playwright 1.58.2 / Chromium 145.0.7632.6 / revision 1208 / FFmpeg 1011`，并绑定下列原始 ZIP：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `chrome-linux64.zip` | `175440843` | `b5e3195041af345a668d110f5daf5581961fa3608626ea588c97dd0fe81c4e38` |
| `chrome-headless-shell-linux64.zip` | `116288461` | `2536e97d8f410df0394b3e7c4252e88ce9f239f04f3af4e247a26caf45baf49e` |
| `ffmpeg-linux.zip` | `2376500` | `ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc` |

只有 protected main 的自然 push `prepare` job 在同项目 Generic Package 精确返回 404 时，才允许消费一次 Runner 本地冷种子。运维 owner 在 CI 外下载上述三个公开固定文件，逐项核对长度和 SHA-256，再通过受信 SSH 写入 `/home/gitlab-runner/.plush-ci-playwright-runtime-seed-playwright-1.58.2-linux-x64-r1208-v1`：目录必须为当前 `gitlab-runner` uid、真实目录、`0700`，且只含三个当前 uid、真实普通文件、`0600` 的精确 basename。`prepare` 会在任何 package 写入前再次检查身份、mode、inventory、长度和 SHA-256，只把校验后的副本打为 `runtime.tar`，用内存中的 job token 上传 GitLab Generic Package，再下载、解包并复核同一内层集合；成功或失败后仅删除已经完整接受的精确本地种子目录。种子缺失或任何身份/内容歧义立即失败，不回退到 Runner 公网下载。

后续 job 只能消费 GitLab 本地 package 或其已校验 ZIP cache；含 job token 的 package GET/PUT 继续使用 Node fetch，token 只作为内存 header，不进入参数、输出或 cache。已解压目录不进 cache，每个 job 在独立目录 materialize，核对 Chrome、headless shell、FFmpeg 和安装标记后使用，并在成功或失败时清理。R640 普通 CI 全绿前，不得把 pipeline `7`、`11`、`13`、`14`、`15`、`16` 或局部路由采样写成完整 CI 或发布证据。

## 文件职责

- `compose.yml`：固定 GitLab CE 镜像 digest，只监听宿主机 `127.0.0.1:8929` 和 LAN SSH `192.168.0.133:2224`。
- `.env.example`：非敏感路径与端口模板；实际 `.env` 不进入 Git。
- `install-r640.sh`：默认只读预检；只有精确 `--execute --confirm` 才创建目录并启动单个 GitLab 服务。
- `runner-vm-cloud-init.yml`：专用 Ubuntu Runner VM 的工具链、QEMU Guest Agent、canonical 内网路由与 fail-closed 注册入口。
- `runner-vm.sh`：唯一 VM provisioning 入口；显式验证 vCPU、内存、磁盘参数形状，不替工作负载猜测固定内存下限，并从唯一容量参数读取初始槽位和安全上限；默认只读预览，失败只回滚本操作创建的 domain/volume。
- `runner-capacity.env`：唯一受版本控制的当前槽位参数；VM 创建、live helper 和 CI evidence 只从该参数建立一致性证明。
- `runner-capacity.sh`：VM 内唯一槽位更新 helper；锁定旧值和 idle 状态，原子更新、服务读回并生成脱敏容量回执。
- `gitlab-backup.sh`：生成 GitLab 应用备份、config archive 和 RAID5 checksum；默认只预览。
- `gitlab-backup-verify.sh`：只校验归档、checksum 与当前 GitLab 自检，不会覆盖在线实例。

## Runner Go 模块网络与完整性

Runner VM 的 Go 模块下载统一由 `/etc/profile.d/plush-go-module-network.sh` 提供登录环境：`GOPROXY=https://goproxy.cn,direct`，`GOSUMDB=sum.golang.google.cn`。`goproxy.cn` 只负责在大陆网络中提供可达的模块代理；模块内容仍必须通过 Go checksum database 校验，不得设置 `GOSUMDB=off` 或改为跳过校验。

`govulncheck` 固定安装 `v1.6.0`，`shfmt` 固定安装 `v3.13.1`；两者的安装命令都使用上述代理和 checksum database，并保留有界重试与超时。Runner bootstrap 不依赖 GitHub Release CDN，避免可达性间歇变化绕过统一模块校验路径。最终门禁必须分别用 `ubuntu`、`root`、`gitlab-runner` 的登录 shell 读回相同的 `GOPROXY` 与 `GOSUMDB`，防止 bootstrap 成功但 CI job 回到不可达或未校验的下载路径。

恢复执行 Runner bootstrap 时，只有 Node、pnpm、Go 的固定安装路径、符号链接目标和精确版本同时匹配，才跳过对应的基础工具下载。任一条件缺失或不匹配时，仍走原有的 checksum 校验下载与原子替换；不得仅凭 `command -v` 或文件存在就判定可复用。

`govulncheck`、`shfmt`、Atlas、gitleaks 与 GitLab Runner 同样只在固定路径、精确版本及 `root:root 0755` 同时匹配时复用，否则重新进入各自的校验安装路径。gitleaks 先解压到私有临时目录，再显式安装为 `root:root 0755`，不继承发布归档内的 uid/gid。

GitLab Runner 使用官方版本化 `gitlab-runner_amd64.deb` 作为压缩传输载体，只在本轮私有临时目录内有界续传。脚本先校验包的精确长度与 SHA-256，再通过 `dpkg-deb --fsys-tarfile` 只提取 `/usr/bin/gitlab-runner`，并再次校验二进制 SHA-256 后原子安装；不会执行 `dpkg -i`、maintainer script 或包自带的服务动作。普通小文件仍使用失败即删除的下载路径，避免把不完整内容误作可复用制品。

## Runner canonical 内网路由

Runner 和 shell job 始终使用 canonical 身份 `https://gitlab.saurick.me`，但在 Runner VM 内只把该主机名解析到 KVM bridge gateway `192.168.124.1`。`runner-vm-cloud-init.yml` 负责以下可重建合同：

- `/etc/hosts` 只能有一条 `192.168.124.1 gitlab.saurick.me`；发现同名冲突或重复时 fail closed，不覆盖其他映射。
- systemd Runner 服务和登录 shell 同时继承大小写 `NO_PROXY/no_proxy` 的 exact-host 绕过，Node native fetch 与 curl 共用同一 canonical 路径。
- `gitlab-runner` 账号的 passwd shell 固定为 `/usr/sbin/nologin`；GitLab shell executor 仍显式使用 `/bin/bash --login`，bootstrap 的跨用户验证也必须显式指定 `/bin/bash`。
- `qemu-guest-agent` 随 VM 安装并启动，QEMU channel、服务存活和持久化状态进入 bootstrap 门禁；它只提供宿主机管理和只读身份证明，不成为 CI 凭据通道。
- 注册前必须以系统信任链分别通过 curl 与 Node 的无认证 canonical GET；注册后还要读回 Runner service 配置环境和实际主进程环境。任一环节不绿，不消费注册 token，也不启动 Runner。

R640 侧必须先有只监听 bridge/LAN 443 的 canonical TLS proxy。Tailscale 节点域名只表示主机身份，不作为 GitLab 服务地址，也不得把 GitLab 挂到节点 `tailscale serve` 根路径。Runner 的 UFW 规则只允许 `192.168.124.0/24` 经 KVM bridge 接口访问目标 `192.168.124.1/tcp/443`；Mac、Windows 等 LAN 客户端若需 canonical 内网直连，只按实际客户端 `/32` 向 `192.168.0.133/tcp/443` 添加精确规则。不得改成 wildcard 443、LAN 整段放行或公网 FRP 绕行。主机防火墙、proxy listener、客户端自然解析、系统信任链 curl 和 Node fetch 必须一起读回，单独的 `/etc/hosts` 或端口监听不算可达性证明。

## 公网入口（独立可选）

公网入口不参与 Runner canonical 内网路由，也不能替代上述 bridge、NO_PROXY 和系统信任链门禁。若未来明确启用公网访问，建议链路为：

```text
gitlab.saurick.me
  -> 阿里云 Nginx TLS
  -> FRP remote_port 18226
  -> R640 127.0.0.1:8929
  -> plush-gitlab:8929
```

阿里云现有同名站点若仍指向旧端口，发布前必须先备份配置，再把 upstream 精确切到 `127.0.0.1:18226` 并完成 `nginx -t`、外网 `/-/health` 与登录页读回。不要开放 GitLab 容器的 8929 到公网。Git over SSH 默认只供 LAN 使用；确需公网 SSH 时另行评审端口、防火墙和审计。

## 首次安装顺序

1. 在 R640 复制模板并复核挂载点、容量、端口和现有容器：

   ```bash
   cp server/deploy/gitlab/.env.example server/deploy/gitlab/.env
   bash server/deploy/gitlab/install-r640.sh
   ```

2. 取得单独的部署授权后执行精确安装：

   ```bash
   sudo bash server/deploy/gitlab/install-r640.sh \
     --execute \
     --confirm INSTALL_GITLAB:R640:gitlab.saurick.me
   ```

3. 不把初始 root 密码打印到流水线或聊天；在 R640 本机读取容器内固定文件，首次登录后立即修改并启用 MFA。
4. 创建私有项目 `saurick/plush-toy-erp`，将 `main` 设为 protected，禁止 force push，并要求 merge pipeline 成功；最终汇总 job 固定为 `CI Gate`。
5. 创建 protected environment `release`，只允许受保护 main 运行；以下变量设为 masked + protected，并把 environment scope 固定为 `release`：

   | 变量 | 最小权限 |
   | --- | --- |
   | `GITHUB_PACKAGES_USER` | GHCR 发布账号名 |
   | `GITHUB_PACKAGES_TOKEN` | GitHub Packages write/read，不授 repo 管理 |
   | `GITLAB_RELEASE_TOKEN` | 当前项目 API 与 Release 管理，不授管理员权限 |

6. 用 `runner-vm.sh` 显式传入 Ubuntu 24.04 base volume、vCPU、内存、磁盘和受信 SSH 公钥；槽位与安全上限只从 `runner-capacity.env` 读取。preview 给出绑定全部参数和源文件身份的精确确认值，execute 才渲染并应用 `runner-vm-cloud-init.yml`。cloud-init 固定安装 GNU Make、GCC、QEMU Guest Agent、Docker Buildx v0.30.1、Docker Compose v2.40.3 与当前 Playwright 1.58.2 Chromium 所需系统包，并要求 `ubuntu`、`root`、`gitlab-runner` 的 Go 环境都读回 `CGO_ENABLED=1`，job 不能自行取得 apt 权限。先在 R640 完成上一节的 proxy listener 与精确 UFW bridge 规则并读回，再在 GitLab 创建 project runner，把 token 只写入 VM 的 `/etc/plush-runner/registration.env`，权限 `0600`，运行 `/usr/local/sbin/plush-register-gitlab-runner`。注册脚本只把同一个显式参数交给共享 capacity helper 初始化槽位，不再维护第二份 TOML 改写；成功后销毁 token 文件并验证 Runner 进程环境。
7. Runner 必须显示 tags `plush,isolated,amd64`、locked、run untagged=false；运行一次非发布 pipeline，核对 VM 内临时 PostgreSQL 被清理且 R640 宿主容器列表未变化。

## GitHub 单向镜像与 GPT Review

在 GitLab 项目 `Settings -> Repository -> Mirroring repositories` 配置 push mirror：

- 目标固定为 `ssh://git@github.com/saurick/plush-toy-erp.git`；
- 只镜像 protected branches，因此自动镜像只承载 protected main；
- 使用 GitHub 专用 deploy key/token，不复用个人高权限凭据；
- GitHub 禁止直接写 `main`，主分支变化只来自 GitLab push mirror；
- 本地 remote 固定为 `origin=GitLab`、`github=GitHub`；需要 GPT Review 时，取得单独 push 授权后使用既有 `prepare-push.sh --review --remote github` 将同一 clean main SHA 推到 GitHub `review/gpt`，不把该审查 ref 设为 protected，也不从 GitHub 合并 main；
- GitHub `GitHub Review Mirror CI` 只响应 PR、`review/gpt/**` 和手动运行，不响应镜像 main；
- GitHub `Emergency Immutable Release (GitHub)` 当前在 checkout、登录、构建或上传前固定失败关闭；只有未来完整支持 canonical v2 七资产与同一演练回执后才可另行恢复，且不得与 GitLab release pipeline 同时执行。

GPT Review 读取 GitHub main 镜像或显式 `review/gpt` 快照即可；审查意见回到当前任务处理，GitHub 不成为字段、发布或部署真源。

## 备份、恢复和升级

每日备份由 root 定时器调用：

```bash
sudo bash server/deploy/gitlab/gitlab-backup.sh \
  --execute \
  --confirm BACKUP_GITLAB:R640
sudo bash server/deploy/gitlab/gitlab-backup-verify.sh
```

每季度把同一 GitLab backup、config archive 和 checksum 放入一次性 VM，按 GitLab 官方同版本恢复流程演练。只有登录、项目 clone、pipeline artifact 和 Release package 都读回后，恢复证据才算完整。在线 `gitlab-backup-verify.sh` 不能替代恢复演练。

升级前先固定当前 compose digest、GitLab 版本、最新已验证备份和回滚窗口；按 GitLab 支持的逐版本升级路径修改 digest。不得使用浮动 `latest`，不得在失败时删除 `/srv/gitlab` 或 RAID5 备份。

## 运行态证据与重建边界

R640 GitLab、独立 KVM Runner、公网入口、protected main、GitHub 单向 mirror 和 main pipeline 已进入实际运行主链。本文档只固定重建和安全合同，不把某次历史绿灯写成当前运行证明；当前 SHA、Runner 配置、pipeline/job 终态、Package/Release、backup/restore 仍必须从 GitLab API、Runner VM 和对应脱敏回执实时读回。

`runner-vm.sh` 与其消费的 `runner-vm-cloud-init.yml` 共同构成新建或重建 Runner VM 的唯一正式入口，不会被普通 CI job 自动应用。VM 资源不保存一次性的固定数字；每次 preview/execute 都必须显式提供并读回。当前槽位由 VM 内 root-owned capacity policy、live config 和 configuration receipt 共同绑定；普通 Pipeline 的 prepare job 只能通过精确的只读 `sudo ... --evidence` 投影验证 live `concurrent=limit`、service 与 safety ceiling，并记录本次候选资源。七类 aggregate 全绿只证明该 exact SHA 在该候选资源下完成一次；内存是否适合作为稳定规格仍以完整 Pipeline 窗口内的峰值、余量、PSI、swap、OOM 和多次波动证据判断，不能从 prepare 的空载快照推导。线上参数漂移时，只在无活动 job 的有界窗口内用共享 capacity helper 修正、重启 Runner 并读回；不回显 token，不把 live 手工改动作为唯一真源。R640 的 UFW bridge 规则和 canonical TLS proxy 属于宿主机前置状态，Runner VM 重建不会替它们补写；每次重建都必须重新完成宿主 listener/firewall 与 guest curl/Node 的双边读回。

`quality_security` 只在自身 Job 内限制 `govulncheck` 可用的 Go 调度并行度并收紧 GC 目标；仍执行默认 symbol 级 `./...` 源码扫描，不改成 package/module 级，也不以资源优化跳过安全门禁。具体参数以 `.gitlab-ci.yml` 为唯一真源；Runner vCPU、Go / govulncheck 版本或服务端包图明显变化时，必须在同一 SHA、同一 Runner 的空闲窗口重新比较峰值 RSS、墙钟、CPU 与扫描结果，再决定是否调整。单独扫描的改进不能证明更小 VM 容量可用，容量仍需完整自然 Pipeline 的 OOM、swap、PSI 与最低余量证据。
