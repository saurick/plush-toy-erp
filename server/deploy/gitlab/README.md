# GitLab 与隔离 Runner

本目录定义 GitLab 宿主上的代码与 CI 控制面，但不会被仓库脚本自动执行。当前正式拓扑是：GitLab 为代码真源和 CI/CD 主链，GitHub 为单向只读审查镜像，GHCR 暂时继续保存按 digest 固定的运行镜像。

当前物理宿主型号和操作系统短主机名均为 `r740xd`；安装、Runner provisioning 与备份脚本都以该短主机名作为 fail-closed 身份。历史 Runner 显示名不参与宿主身份判断，也不能拿来恢复旧主机名门禁。

## 存储与隔离结论

| 资源 | 放置 | 原因 | 恢复边界 |
| --- | --- | --- | --- |
| GitLab config、PostgreSQL、repositories | GitLab 宿主 SSD：`/srv/gitlab` | 随机 I/O 和数据库延迟敏感 | 由 GitLab backup + config archive 恢复 |
| CI artifacts、Package Registry | GitLab 宿主 RAID5：`/srv/raid5/gitlab/artifacts`、`/srv/raid5/gitlab/packages` | 大文件容量优先；正式制品通过原 GitLab URL 读取 | 保留正式 Release、源码、演练与门禁证据，纳入 GitLab backup |
| GitLab 本地备份生成、临时文件与归档 | GitLab 宿主 RAID5：`/srv/raid5/gitlab/backups/repository` | 直接在 RAID5 生成，避免 SSD 再保留一套全量备份 | config archive、checksum 与状态回执同属 `backups`；只承担快速恢复输入，RAID 不是异机备份 |
| GitLab 加密异机副本 | 独立设备的精确挂载点：`/mnt/plush-gitlab-offsite/gitlab` | 本地 backup、config 与 checksum 全部经 `age` 加密后再原子登记 | 私钥不放 GitLab 宿主；异机包校验通过仍不替代同版本完整恢复演练 |
| Runner VM 系统盘与 job cache | GitLab 宿主 SSD 上的独立 KVM qcow2 | 构建 I/O 与 GitLab 数据隔离 | Runner 可重建，不保存业务真源 |
| 发布镜像 | GHCR digest | 复用现有目标机加载和 release manifest 合同 | 新 GitLab Release 保存 v2 七资产（含同一演练回执）；legacy v1 六资产只读/回滚 |

GitLab 不与业务 PostgreSQL、测试数据库或现有 Docker 容器共享数据目录。Runner 运行在独立 KVM VM 内，只获得 VM 内的 Docker socket；不得挂载 GitLab 宿主机 `/var/run/docker.sock`。

### Storage retention

备份保留 14 天，生成入口用非等待锁串行，先验证真实 RAID5、容器 backup bind、异机精确挂载、独立文件系统、固定 marker 与唯一 `age` recipient；任一缺失即阻断，不回退到 SSD 或同机 RAID。只有本地归档和四个加密文件全部完成后才原子登记异机目录并写成功状态。Compose 不自动创建缺失的冷数据目录。已有安装必须在无活动 CI/backup 的维护窗口先复制并逐文件校验 Package，再切换挂载；读回 GitLab 健康、项目 clone、Package 下载和备份恢复后才能移除旧副本。直接覆盖旧 Compose 前还须保留 live config 与回滚文件。

正式发布和重复发布的入口都先校验七资产、Release、源码包与演练身份，再通过 GitLab API 退役对应 `candidate.tar` 并读回，最后通过 `gitlab-runner-images.mjs` 移除本次构建在专属 Runner 中的六个镜像别名。清理入口只接受可重建默认主机名 `plush-gitlab-runner` 与当前 ESXi 实例主机名 `plush-gitlab-runner-esxi`，并继续同时校验 CI、项目和 exact SHA。每个别名都核对完整 commit，任何现存容器引用或 tag 身份变化都阻止删除；不使用 force，构建层仍受 Docker GC 管理。缺少任何正式恢复输入、尚未发布或身份不唯一时保留候选；不按文件年龄直接删除 Package 底层目录。

CI 的 Package 删除使用当前 `CI_JOB_TOKEN`，发布发起者须具有本项目 Package 删除权限（Maintainer / Owner）；验证和 Release 读写继续使用原有 Developer 发布账号，不提升其常驻权限。缺失 Job Token 或 API 拒绝删除时停止退役，不降级凭据。历史候选可使用同一个 `gitlab-release-candidate.mjs retire-candidate --sha <sha> --version <version> --customer yoyoosun --json` 入口逐份处理；非 CI 运维必须提供本来就有删除权限的 `GITLAB_RELEASE_TOKEN`。

Runner 的工作区、Go/pnpm 缓存和 Docker 层继续在 SSD。每台 Runner 的 Docker 默认 builder 启用 `40GB` GC 保留目标，为重复构建保留余量；该目标仅作用于 Docker 构建缓存，Go/pnpm 缓存和发布镜像另行保留。VM disk 显式使用 `discard=unmap`，guest 启用每周 `fstrim.timer`。在线应用配置须先证明 Runner 空闲，在维护窗口重启并读回；不删除业务 volume，不把镜像大小与共享 build cache 相加。目标部署的旧镜像/中转包先按 live 容器、当前版本、回滚和 operation 引用盘点，必要历史归档放 RAID5，精确清理仍走项目发布边界。

升级前的 VM 内部快照会继续引用旧磁盘块，guest TRIM 成功不等于宿主机已经回收空间。快照归档使用 `/srv/raid5/runner-vm/upgrade-backups/<日期>/`：先停止空闲 VM，保存含快照的 qcow2、backing image、domain/snapshot XML；压缩档解压流的 SHA-256 必须与停机原盘一致，backing image 单独校验。只删除已归档的指定内部快照，再运行 `qemu-img check`、启动 guest、TRIM 和 Runner 验证，并以宿主机 `du` / `df` 读回实际回收量。恢复时先在独立目录解压并核对 backing image 与指定快照，不能直接覆盖运行盘。后续升级复用同一归档路径；正常升级确认后保留最近两次恢复点，额外历史按明确保留需求处理。

旧部署的冷归档使用 `/srv/raid5/cicd-archives/<项目>/`。已完成且超过七天的中转操作可逐文件校验后仅迁走镜像和源码大文件，原 operation 回执与控制文件继续保留；状态不明、活动操作和容器挂载引用的文件不迁走。镜像清理保护所有现存容器引用的版本及其 Server/Web 配对，并额外保留各镜像最近三个版本；每次按精确 tag 列表执行，不扩到其他项目。

Runner VM 的 vCPU、内存和系统盘不是仓库常量，而是 `runner-vm.sh` 创建/重建时彼此独立的必填参数；脚本不设置与工作负载脱节的固定内存下限。`runner-capacity.sh --evidence` 只读回在线 vCPU、MemTotal、swap、根文件系统和槽位配置，证明当前配置身份一致，不把开机快照冒充负载容量结论。Runner slot 的唯一显式参数名是 `RUNNER_CONCURRENT_SLOTS`，不能由 `nproc` 自动派生；注册、重建与后续 live 调整都复用 `runner-capacity.sh`，它只在 Runner 空闲、配置身份和旧值精确匹配时原子更新全局 `concurrent` 与唯一 project runner `limit`，失败恢复旧配置并读回。

当前 canonical 质量 Pipeline 的全局稳定安全并发上限只在 `runner-capacity.env` 保存，DAG 只调度已经就绪的 Job，空槽不预留 CPU 或内存。`concurrent=limit` 把多 Pipeline 即使短暂重叠时的总资源使用也限制在同一个全局上限内；普通完整质量只接受 protected main 的自然 push，新的 commit 自动取消可中断的旧 Pipeline。Job 内 Node 并发仍为 1，PostgreSQL、Docker、Chromium、浏览器锁和 resource-sensitive lane 继续按既有资源边界串行或隔离。只有 VM 资源规格变化，或出现 OOM、swap、持续 iowait、资源残留或清理污染证据时，才重新评估安全上限；不得通过跳过测试保速。

GitLab quality 中的 `server-upgrade` 与 `server-postgres` 各自把 PostgreSQL 官方 volume 根目录挂载为独立、上限 1 GiB 的 tmpfs，使临时表数据和 WAL 不再与 Git checkout、编译缓存及 Docker 写层争用 Runner 系统盘。容器启动后必须从 Docker inspect 读回精确 tmpfs 参数，并确认镜像 `PGDATA` 位于该挂载内；缺失、漂移或越界一律在测试前失败。tmpfs 上限不是预留内存，两座数据库仍保持独立容器和完整清理读回，不能以此放宽 Runner 的内存、swap、OOM 或 PSI 观察。

性能调优必须分别观测 GitLab 宿主机和 Runner guest：在候选内存下运行 protected main 的完整自然 push Pipeline，记录冷/热缓存的 job 时长、DAG 关键路径、峰值工作集、最低 MemAvailable、swap、memory PSI、OOM、IO 峰值、p50、波动和近似 p95，再决定 Runner 内存、slot、分片和语言测试并行度。内存候选以完整 Pipeline 的实测峰值加明确余量为依据；一次绿色只证明该次候选可运行，不直接证明长期稳定，缩容后至少保留可立即恢复的上一档规格。普通 CI 7–9 分钟、热缓存提交到部署 10–15 分钟只是稳健阶段目标；资源仍有余量且未出现排队、IO 争用、OOM、flaky 或波动扩大时，继续冲刺 6–8 分钟和 8–12 分钟，稳定更快也接受。只有资源饱和或进一步提速需要明显不成比例的复杂度时才停止；不得减少测试、放宽 fail-closed / exact-SHA、隔离或清理门禁，也不得用伪缓存命中换取数字。

## Playwright 冷启动与本地运行包

exact SHA `cddd39ff87e3e2ae9cd8c0282431309bb7cb043f` 的自然 push pipeline `7` 是失败证据，不是优化完成证明：`plan` 约 `115s` 通过，`prepare` 约 `3900s` 后以 `job_token_expired` 失败，后续七个分片均未执行。唯一有界失败 trace 显示 pnpm 的 765 个包约 `65s` 完成，随后 Playwright Chromium 公网下载停滞约 `58m51s`。后续 pipeline `11` 已把冷下载改为串行，但第一个 `chrome-linux64.zip` 仍在 12 分钟后超时；pipeline `13` 再次证明 Google Storage 单连接无法满足该边界。exact SHA `7f4120cae6f6de3eeb81d9699b62eff995a37c8f` 的自然 push pipeline `14` 把两个 CFT 大包固定到 Google 官方 edge，并把每个请求延长到 20 分钟；765 个 pnpm 包约 `75s` 完成，但第一个 `chrome-linux64.zip` 仍精确超时，后续分片未运行。该证据否定了“只换 CDN 或继续加长 CI 超时”的方向：局部吞吐采样不能替代完整传输，根因仍是 Runner 公网链路对 175 MB 固定包不具备可接受的有界吞吐。

exact SHA `13d392524fdd414296503dbcf05bb4064bd18fea` 的自然 push pipeline `15` 已证明冷种子闭环本身有效：`prepare` 在约 `2m15s` 内完成 765 个 pnpm 包、一次 Runner 本地种子消费、Generic Package 上传与读回，精确种子目录随后不存在。该流水线仍是失败证据：Node 分片因未离线安装 Web 依赖而找不到 `playwright`，Web 分片因 DEV 版本中心 fixture 缺少当前 `releaseVersionPolicy` 合同而失败，Server 逐测试 Go JSON trace 超过 GitLab 4 MiB 日志上限，浏览器、聚合与 `CI Gate` 按 DAG 跳过。后续修复必须产生新 SHA；不得重试 pipeline `15`，也不得把其局部绿色写成完整 CI 或发布证明。

exact SHA `3aba488752b04e3b930ea181aa04e11d5f143cb8` 的自然 push pipeline `16` 进一步证明缓存与主要质量阶段绿色：Static、Web、Resource、Security 通过；Server 的 3634 项 Go 测试和关键 PostgreSQL、Browser 的真实 Chromium smoke 均通过。该流水线仍是失败证据：Node 的后置 source archive 校验错误地把合法 `sha256:<64hex>` 当成裸 digest；当前 Runner 又漂移为缺失 cloud-init 已声明的 sandbox 清理 helper 与精确 sudo 入口，使 Server / Browser 在测试后清理阶段失败并留下 job 113 / 115 两个 sandbox。运维闭环已按仓库声明恢复精确 root-owned helper 和单命令 sudo drop-in、经全局 `visudo` 与 CI 用户调用验证后删除这两个残留；后续 `prepare` 会在任何 cache 写入前先校验该清理入口。不得重试 pipeline `16`，修复仍须新 SHA 的自然流水线证明。

CI 冷启动因此不再承担公网下载。运行包合同固定 `playwright 1.63.0 / Chromium 153.0.8010.12 / revision 1243 / FFmpeg 1011`，并绑定下列原始 ZIP：

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `chrome-linux64.zip` | `195836009` | `8aac35011c18f6e2d10696154af89a5728ac2ddd6dc6fad24ffdf243c3fcfd5a` |
| `chrome-headless-shell-linux64.zip` | `119809080` | `a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d` |
| `ffmpeg-linux.zip` | `2376500` | `ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc` |

只有 protected main 的自然 push `prepare` job 在同项目 Generic Package 精确返回 404 时，才允许消费一次 Runner 本地冷种子。运维 owner 在 CI 外下载上述三个公开固定文件，逐项核对长度和 SHA-256，再通过受信 SSH 写入 `/home/gitlab-runner/.plush-ci-playwright-runtime-seed-playwright-1.63.0-linux-x64-r1243-v1`：目录必须为当前 `gitlab-runner` uid、真实目录、`0700`，且只含三个当前 uid、真实普通文件、`0600` 的精确 basename。`prepare` 会在任何 package 写入前再次检查身份、mode、inventory、长度和 SHA-256，只把校验后的副本打为 `runtime.tar`，用内存中的 job token 上传 GitLab Generic Package，再下载、解包并复核同一内层集合；成功或失败后仅删除已经完整接受的精确本地种子目录。种子缺失或任何身份/内容歧义立即失败，不回退到 Runner 公网下载。

后续 job 只能消费 GitLab 本地 package 或其已校验 ZIP cache；含 job token 的 package GET/PUT 继续使用 Node fetch，token 只作为内存 header，不进入参数、输出或 cache。已解压目录不进 cache，每个 job 在独立目录 materialize，核对 Chrome、headless shell、FFmpeg 和安装标记后使用，并在成功或失败时清理。GitLab 普通 CI 全绿前，不得把 pipeline `7`、`11`、`13`、`14`、`15`、`16` 或局部路由采样写成完整 CI 或发布证据。

## 文件职责

- `compose.yml`：固定 GitLab CE 镜像 digest，只监听宿主机 `127.0.0.1:8929` 和 LAN SSH `192.168.0.133:2224`。
- `.env.example`：非敏感路径与端口模板；实际 `.env` 不进入 Git。
- `install-gitlab.sh`：默认只读预检；只有精确 `--execute --confirm` 才创建目录并启动单个 GitLab 服务。
- `runner-vm-cloud-init.yml`：专用 Ubuntu Runner VM 的工具链、QEMU Guest Agent、canonical 内网路由与 fail-closed 注册入口。
- `runner-vm.sh`：唯一 VM provisioning 入口；显式验证 vCPU、内存、磁盘参数形状，不替工作负载猜测固定内存下限，并从唯一容量参数读取初始槽位和安全上限；默认只读预览，失败只回滚本操作创建的 domain/volume。
- `runner-capacity.env`：唯一受版本控制的当前槽位参数；VM 创建、live helper 和 CI evidence 只从该参数建立一致性证明。
- `runner-capacity.sh`：VM 内唯一槽位更新 helper；锁定旧值和 idle 状态，原子更新、服务读回并生成脱敏容量回执。
- `gitlab-backup.sh`：生成 GitLab 应用备份、config archive、本地 checksum、状态回执和加密异机副本；默认只预览，必须显式给出 execute 与精确确认串。
- `gitlab-backup-verify.sh`：校验本地归档、checksum 与当前 GitLab 自检，不会覆盖在线实例。
- `gitlab-backup-health.sh`：检查最近成功状态、36 小时新鲜度和对应加密异机包。
- `gitlab-offsite-backup-verify.sh`：在持有私钥的独立恢复主机解密并校验异机包、归档和身份；不连接或覆盖在线 GitLab。
- `gitlab-backup-failure-notify.sh`：通过 root-only curl 配置向唯一 HTTPS receiver 发送脱敏失败事件；`--check` 只验证配置，不发送。
- `systemd/`：版本化每日 timer、备份 service、失败通知 unit 与兼容 drop-in；安装不会由仓库或普通 CI 自动执行。

## Runner Go 模块网络与完整性

Runner VM 的 Go 模块下载统一由 `/etc/profile.d/plush-go-module-network.sh` 提供登录环境：`GOPROXY=https://goproxy.cn,direct`，`GOSUMDB=sum.golang.google.cn`。`goproxy.cn` 只负责在大陆网络中提供可达的模块代理；模块内容仍必须通过 Go checksum database 校验，不得设置 `GOSUMDB=off` 或改为跳过校验。

Node 公共依赖安装固定优先使用 pnpm store，并直连 `https://registry.npmmirror.com`；CI 安装命令清除通用代理环境，避免大包流量被低速代理接管。`pnpm audit` 仍固定请求 npm 官方审计接口，第一次强制直连；只有连接、DNS、429 或 5xx 瞬时失败且 Runner 环境已配置代理时，最后一次重试才使用该代理。合法漏洞报告和非瞬时错误继续立即失败关闭。

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

GitLab 宿主侧必须先有只监听 bridge/LAN 443 的 canonical TLS proxy。Tailscale 节点域名只表示主机身份，不作为 GitLab 服务地址，也不得把 GitLab 挂到节点 `tailscale serve` 根路径。Runner 的 UFW 规则只允许 `192.168.124.0/24` 经 KVM bridge 接口访问目标 `192.168.124.1/tcp/443`；Mac、Windows 等 LAN 客户端若需 canonical 内网直连，只按实际客户端 `/32` 向 `192.168.0.133/tcp/443` 添加精确规则。不得改成 wildcard 443、LAN 整段放行或公网 FRP 绕行。主机防火墙、proxy listener、客户端自然解析、系统信任链 curl 和 Node fetch 必须一起读回，单独的 `/etc/hosts` 或端口监听不算可达性证明。

## 公网入口（独立可选）

公网入口不参与 Runner canonical 内网路由，也不能替代上述 bridge、NO_PROXY 和系统信任链门禁。若未来明确启用公网访问，建议链路为：

```text
gitlab.saurick.me
  -> 阿里云 Nginx TLS
  -> FRP remote_port 18226
  -> GitLab 宿主 127.0.0.1:8929
  -> plush-gitlab:8929
```

阿里云现有同名站点若仍指向旧端口，发布前必须先备份配置，再把 upstream 精确切到 `127.0.0.1:18226` 并完成 `nginx -t`、外网 `/-/health` 与登录页读回。不要开放 GitLab 容器的 8929 到公网。Git over SSH 默认只供 LAN 使用；确需公网 SSH 时另行评审端口、防火墙和审计。

## 首次安装顺序

1. 在 GitLab 宿主上复制模板并复核挂载点、容量、端口和现有容器：

   ```bash
   cp server/deploy/gitlab/.env.example server/deploy/gitlab/.env
   bash server/deploy/gitlab/install-gitlab.sh
   ```

2. 取得单独的部署授权后执行精确安装：

   ```bash
   sudo bash server/deploy/gitlab/install-gitlab.sh \
     --execute \
     --confirm INSTALL_GITLAB:r740xd:gitlab.saurick.me
   ```

3. 不把初始 root 密码打印到流水线或聊天；在 GitLab 宿主本机读取容器内固定文件，首次登录后立即修改并启用 MFA。
4. 创建私有项目 `saurick/plush-toy-erp`，将 `main` 设为 protected，禁止 force push，并要求 merge pipeline 成功；最终汇总 job 固定为 `CI Gate`。
5. 创建 protected environment `release`，只允许受保护 main 运行；以下变量设为 masked + protected，并把 environment scope 固定为 `release`：

   | 变量                    | 最小权限                                     |
   | ----------------------- | -------------------------------------------- |
   | `GITHUB_PACKAGES_USER`  | GHCR 发布账号名                              |
   | `GITHUB_PACKAGES_TOKEN` | GitHub Packages write/read，不授 repo 管理   |
   | `GITLAB_RELEASE_TOKEN`  | 当前项目 API 与 Release 管理，不授管理员权限 |

6. 用 `runner-vm.sh` 显式传入 Ubuntu 24.04 base volume、vCPU、内存、磁盘和受信 SSH 公钥；槽位与安全上限只从 `runner-capacity.env` 读取。preview 给出绑定全部参数和源文件身份的精确确认值，execute 才渲染并应用 `runner-vm-cloud-init.yml`。cloud-init 固定安装 GNU Make、GCC、用于 PDF 验证的 `poppler-utils`、QEMU Guest Agent、Docker Buildx v0.30.1、Docker Compose v2.40.3 与当前 Playwright 1.63.0 Chromium 所需系统包，并要求 `ubuntu`、`root`、`gitlab-runner` 的 Go 环境都读回 `CGO_ENABLED=1`，job 不能自行取得 apt 权限。先在 GitLab 宿主上完成上一节的 proxy listener 与精确 UFW bridge 规则并读回，再在 GitLab 创建 project runner，把 token 只写入 VM 的 `/etc/plush-runner/registration.env`，权限 `0600`，运行 `/usr/local/sbin/plush-register-gitlab-runner`。注册脚本只把同一个显式参数交给共享 capacity helper 初始化槽位，不再维护第二份 TOML 改写；成功后销毁 token 文件并验证 Runner 进程环境。
7. Runner 必须显示 tags `plush,isolated,amd64`、locked、run untagged=false；运行一次非发布 pipeline，核对 VM 内临时 PostgreSQL 被清理且 GitLab 宿主容器列表未变化。

## GitHub 单向镜像与 GPT Review

在 GitLab 项目 `Settings -> Repository -> Mirroring repositories` 配置 push mirror：

- 目标固定为 `ssh://git@github.com/saurick/plush-toy-erp.git`；
- 只镜像 protected branches，因此自动镜像只承载 protected main；
- 使用 GitHub 专用 deploy key/token，不复用个人高权限凭据；
- GitHub 禁止直接写 `main`，主分支变化只来自 GitLab push mirror；
- 本地 remote 固定为 `origin=GitLab`、`github=GitHub`；正式代码只推 GitLab `origin/main`，不从本地直接写 GitHub main，也不创建专用审查分支；
- GitHub 不配置仓库 CI workflow，main 镜像不重复执行 GitLab 门禁；
- GitHub 只保留历史 Release 读取；仓库没有 Actions workflow、publisher 或 strict 复用 writer。恢复任何发布写路径都必须重新专项评审 canonical v2 七资产、演练回执、并发 Provider 和凭据边界。

GPT Review 按本次 GitLab push 前后的 base/head SHA 读取 GitHub main 提交差异；审查意见回到当前任务处理，GitHub 不成为字段、发布或部署真源。

## 备份、恢复和升级

Compose 固定 GitLab CE `19.3.2` 的镜像 digest；该版本包含 [GitLab 官方 2026-09-10 安全补丁](https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-3-2-released/)。配置版本不替代目标机运行版本与升级后检查。

备份启用前必须先准备独立存储和外部通知接收端；没有真实前置时保持现有服务不变，不能填占位值冒充完成：

1. 把异机或独立设备直接挂载到 `.env` 登记的精确目录，确认它与 `/srv/raid5` 的 filesystem device 不同，并在挂载根写入内容严格为 `plush-gitlab-offsite-v1` 的 `.plush-gitlab-offsite-target`。
2. 在独立恢复主机生成并保管 `age` 私钥；GitLab 宿主只安装 `age` 和单个公钥 recipient 文件 `/etc/plush-gitlab/backup-age-recipient.txt`，文件必须 root 所有且不可被 group/world 写入。
3. 把 `backup-alert.curl.example` 复制为 `/etc/plush-gitlab/backup-alert.curl`，替换为真实 HTTPS receiver，并保持 `root:root 0600`。认证 header 只放该文件，不进入 unit 参数、仓库或日志。
4. 先运行只读预检和通知配置检查；两者都通过后，才在独立备份窗口安装脚本和 unit：

   ```bash
   sudo bash server/deploy/gitlab/gitlab-backup.sh
   sudo bash server/deploy/gitlab/gitlab-backup-failure-notify.sh \
     --unit plush-gitlab-backup.service \
     --config /etc/plush-gitlab/backup-alert.curl \
     --check

   sudo install -d -o root -g root -m 0700 /etc/plush-gitlab
   sudo install -d -o root -g root -m 0755 /usr/local/libexec
   sudo install -o root -g root -m 0600 server/deploy/gitlab/.env /etc/plush-gitlab/gitlab.env
   sudo install -o root -g root -m 0755 \
     server/deploy/gitlab/gitlab-backup.sh \
     server/deploy/gitlab/gitlab-backup-verify.sh \
     server/deploy/gitlab/gitlab-backup-health.sh \
     server/deploy/gitlab/gitlab-backup-failure-notify.sh \
     /usr/local/libexec/
   sudo install -d -o root -g root -m 0755 \
     /etc/systemd/system/plush-gitlab-backup.service.d
   sudo install -o root -g root -m 0644 \
     server/deploy/gitlab/systemd/plush-gitlab-backup.service \
     server/deploy/gitlab/systemd/plush-gitlab-backup.timer \
     server/deploy/gitlab/systemd/plush-gitlab-backup-failure@.service \
     /etc/systemd/system/
   sudo install -o root -g root -m 0644 \
     server/deploy/gitlab/systemd/plush-gitlab-backup.service.d/20-alert.conf \
     /etc/systemd/system/plush-gitlab-backup.service.d/20-alert.conf
   sudo systemd-analyze verify \
     /etc/systemd/system/plush-gitlab-backup.service \
     /etc/systemd/system/plush-gitlab-backup.timer \
     /etc/systemd/system/plush-gitlab-backup-failure@.service
   sudo systemctl daemon-reload
   ```

首次受控执行会生成本地归档和加密异机包，属于高 I/O 运维动作，必须放在无活动 CI、升级或其他备份的窗口：

```bash
sudo /usr/local/libexec/plush-gitlab-backup.sh \
  --env-file /etc/plush-gitlab/gitlab.env \
  --execute \
  --confirm BACKUP_GITLAB:r740xd:gitlab.saurick.me
sudo /usr/local/libexec/plush-gitlab-backup-verify.sh \
  --env-file /etc/plush-gitlab/gitlab.env
sudo /usr/local/libexec/plush-gitlab-backup-health.sh \
  --env-file /etc/plush-gitlab/gitlab.env
```

把对应异机目录提供给独立恢复主机后，使用私钥运行 `gitlab-offsite-backup-verify.sh --backup-dir <精确挂载点> --age-identity-file <私钥文件> --report <回执路径>`；报告的边界只是“加密副本和归档完整”。随后仍需每季度把同一 GitLab backup、config archive 和 checksum 放入一次性同版本 VM，按 GitLab 官方恢复流程演练。只有登录、项目 clone、pipeline artifact 和 Release package 都读回后，恢复证据才算完整。在线 health、归档校验或异机解密都不能替代恢复演练。首次手工闭环通过后再执行 `systemctl enable plush-gitlab-backup.timer` 和 `systemctl start plush-gitlab-backup.timer`；`Persistent=true` 可能立即补跑错过的日程，因此启动 timer 也必须位于同一备份窗口。

升级前先固定当前 compose digest、GitLab 版本、最新已验证备份和回滚窗口；按 GitLab 支持的逐版本升级路径修改 digest。不得使用浮动 `latest`，不得在失败时删除 `/srv/gitlab` 或 RAID5 备份。

## 运行态证据与重建边界

GitLab、独立 KVM Runner、公网入口、protected main、GitHub 单向 mirror 和 main pipeline 已进入实际运行主链。本文档只固定重建和安全合同，不把某次历史绿灯写成当前运行证明；当前 SHA、Runner 配置、pipeline/job 终态、Package/Release、backup/restore 仍必须从 GitLab API、Runner VM 和对应脱敏回执实时读回。

`runner-vm.sh` 与其消费的 `runner-vm-cloud-init.yml` 共同构成新建或重建 Runner VM 的唯一正式入口，不会被普通 CI job 自动应用。VM 资源不保存一次性的固定数字；每次 preview/execute 都必须显式提供并读回。当前槽位由 VM 内 root-owned capacity policy、live config 和 configuration receipt 共同绑定；普通 Pipeline 的 prepare job 只能通过精确的只读 `sudo ... --evidence` 投影验证 live `concurrent=limit`、service 与 safety ceiling，并记录本次候选资源。七类 aggregate 全绿只证明该 exact SHA 在该候选资源下完成一次；内存是否适合作为稳定规格仍以完整 Pipeline 窗口内的峰值、余量、PSI、swap、OOM 和多次波动证据判断，不能从 prepare 的空载快照推导。线上参数漂移时，只在无活动 job 的有界窗口内用共享 capacity helper 修正、重启 Runner 并读回；不回显 token，不把 live 手工改动作为唯一真源。GitLab 宿主的 UFW bridge 规则和 canonical TLS proxy 属于宿主机前置状态，Runner VM 重建不会替它们补写；每次重建都必须重新完成宿主 listener/firewall 与 guest curl/Node 的双边读回。

`quality_security` 只在自身 Job 内限制 `govulncheck` 可用的 Go 调度并行度并收紧 GC 目标；仍执行默认 symbol 级 `./...` 源码扫描，不改成 package/module 级，也不以资源优化跳过安全门禁。具体参数以 `.gitlab-ci.yml` 为唯一真源；Runner vCPU、Go / govulncheck 版本或服务端包图明显变化时，必须在同一 SHA、同一 Runner 的空闲窗口重新比较峰值 RSS、墙钟、CPU 与扫描结果，再决定是否调整。单独扫描的改进不能证明更小 VM 容量可用，容量仍需完整自然 Pipeline 的 OOM、swap、PSI 与最低余量证据。

## 打印引擎 CI

打印引擎的固定版本、最终镜像业务 PDF、真实系统包清单、漏洞和体积规则见 [`scripts/qa/README.md`](../../../scripts/qa/README.md#打印引擎验证--pdf-runtime)。正式制品构建会执行该门禁；已有 VM 需先由运维核对 Poppler 已安装，不由普通 Job 取得 apt 权限。上游版本检查使用独立的受保护定时入口及不可变镜像引用，不自动升级，也不改变普通 push 的质量 DAG。


## GitLab 部署前置证据

在取得部署授权后，重新只读检查并记录：

| 事项 | 必须证明 | 停止条件 |
| --- | --- | --- |
| GitLab 宿主存储 | `/srv` SSD 与 `/srv/raid5` 实际 mount、余量、inode、SMART/RAID 状态 | mount 不符、降级或余量不足 |
| 现有容器 | 名称、端口、数据目录和 restart 状态 | 8929/2224 冲突或路径重叠 |
| KVM | `/dev/kvm`、libvirt network、VM 磁盘与资源预算 | 需要复用 GitLab 宿主 Docker socket |
| 公网 | DNS、阿里云现有 vhost、FRP remote 18226、证书与回滚配置 | 同名站点来源不明或切换不可回滚 |
| GitLab 镜像 | digest 与目标 CE 版本、升级路径和备份兼容 | 浮动 tag 或不支持的跳版本 |
| Secrets | root 初始化、MFA、Runner token、project token、GHCR token、mirror key 的最小权限 | token 需要进入仓库/浏览器/日志 |

## 回滚与停止条件

| 故障层 | 回滚/处置 | 禁止动作 |
| --- | --- | --- |
| GitLab 容器首次启动失败 | 保留 `/srv/gitlab` 和日志，修正单一配置或回到已固定 digest | 删除 data/config、全局 Docker prune |
| 公网入口失败 | 恢复备份的阿里云 vhost/FRP upstream，GitLab LAN 入口保持 | 临时开放 8929 公网 |
| Runner 不可信 | pause/delete Runner token，保留 GitLab；重建一次性 VM | 改挂宿主 Docker socket |
| mirror 异常 | pause push mirror，GitLab main 继续作为真源 | 从 GitHub 强推覆盖 GitLab |
| release 身份不一致 | 终止 job，保留 package/release 证据，使用新版本修复 | 覆盖同名 asset/tag 或猜 digest |
| backup/restore 未通过 | 阻断 GitLab 升级和正式依赖切换 | 把 RAID 健康当恢复证据 |

遇到以下任一条件立即停止：目标身份/挂载漂移、活动 writer/部署、端口重叠、备份不可验证、异机副本或告警 receiver 未就绪、secret 可能落盘/输出、Runner 需要越过 VM、出现未评审的 GitHub 发布写路径、release SHA 与 main 不一致、目标结果 `not_proven`、或需要数据库/域名破坏性动作但没有独立授权。
