# R640 GitLab 与隔离 Runner

本目录定义 R640 上的代码与 CI 控制面，但不会被仓库脚本自动执行。当前正式拓扑是：GitLab 为代码真源和 CI/CD 主链，GitHub 为单向只读审查镜像，GHCR 暂时继续保存按 digest 固定的运行镜像。

## 存储与隔离结论

| 资源 | 放置 | 原因 | 恢复边界 |
| --- | --- | --- | --- |
| GitLab config、PostgreSQL、repositories、artifacts | R640 SSD：`/srv/gitlab` | 随机 I/O 和数据库延迟敏感 | 由 GitLab backup + config archive 恢复 |
| GitLab 备份副本 | R640 RAID5：`/srv/raid5/gitlab/backups` | 容量和单盘故障容忍优先 | 仍需异机/离线副本，RAID 不是备份 |
| Runner VM 系统盘与 job cache | R640 SSD 上的独立 KVM qcow2 | 构建 I/O 与 GitLab 数据隔离 | Runner 可重建，不保存业务真源 |
| 发布镜像 | GHCR digest | 复用现有目标机加载和 release manifest 合同 | GitLab Release 保存六件可移植制品 |

GitLab 不与业务 PostgreSQL、测试数据库或现有 Docker 容器共享数据目录。Runner 运行在独立 KVM VM 内，只获得 VM 内的 Docker socket；不得挂载 R640 宿主机 `/var/run/docker.sock`。

## 文件职责

- `compose.yml`：固定 GitLab CE 镜像 digest，只监听宿主机 `127.0.0.1:8929` 和 LAN SSH `192.168.0.133:2224`。
- `.env.example`：非敏感路径与端口模板；实际 `.env` 不进入 Git。
- `install-r640.sh`：默认只读预检；只有精确 `--execute --confirm` 才创建目录并启动单个 GitLab 服务。
- `runner-vm-cloud-init.yml`：专用 Ubuntu Runner VM 的工具链与 fail-closed 注册入口。
- `gitlab-backup.sh`：生成 GitLab 应用备份、config archive 和 RAID5 checksum；默认只预览。
- `gitlab-backup-verify.sh`：只校验归档、checksum 与当前 GitLab 自检，不会覆盖在线实例。

## Runner Go 模块网络与完整性

Runner VM 的 Go 模块下载统一由 `/etc/profile.d/plush-go-module-network.sh` 提供登录环境：`GOPROXY=https://goproxy.cn,direct`，`GOSUMDB=sum.golang.google.cn`。`goproxy.cn` 只负责在大陆网络中提供可达的模块代理；模块内容仍必须通过 Go checksum database 校验，不得设置 `GOSUMDB=off` 或改为跳过校验。

`govulncheck` 固定安装 `v1.6.0`，`shfmt` 固定安装 `v3.13.1`；两者的安装命令都使用上述代理和 checksum database，并保留有界重试与超时。Runner bootstrap 不依赖 GitHub Release CDN，避免可达性间歇变化绕过统一模块校验路径。最终门禁必须分别用 `ubuntu`、`root`、`gitlab-runner` 的登录 shell 读回相同的 `GOPROXY` 与 `GOSUMDB`，防止 bootstrap 成功但 CI job 回到不可达或未校验的下载路径。

恢复执行 Runner bootstrap 时，只有 Node、pnpm、Go 的固定安装路径、符号链接目标和精确版本同时匹配，才跳过对应的基础工具下载。任一条件缺失或不匹配时，仍走原有的 checksum 校验下载与原子替换；不得仅凭 `command -v` 或文件存在就判定可复用。

`govulncheck`、`shfmt`、Atlas、gitleaks 与 GitLab Runner 同样只在固定路径、精确版本及 `root:root 0755` 同时匹配时复用，否则重新进入各自的校验安装路径。gitleaks 先解压到私有临时目录，再显式安装为 `root:root 0755`，不继承发布归档内的 uid/gid。

GitLab Runner 使用官方版本化 `gitlab-runner_amd64.deb` 作为压缩传输载体，只在本轮私有临时目录内有界续传。脚本先校验包的精确长度与 SHA-256，再通过 `dpkg-deb --fsys-tarfile` 只提取 `/usr/bin/gitlab-runner`，并再次校验二进制 SHA-256 后原子安装；不会执行 `dpkg -i`、maintainer script 或包自带的服务动作。普通小文件仍使用失败即删除的下载路径，避免把不完整内容误作可复用制品。

## 公网入口

唯一建议链路为：

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

6. 用 Ubuntu 24.04 cloud image 创建独立 KVM VM，应用 `runner-vm-cloud-init.yml`；cloud-init 固定安装 GNU Make、GCC 与当前 Playwright 1.58.2 Chromium 所需系统包，并要求 `ubuntu`、`root`、`gitlab-runner` 的 Go 环境都读回 `CGO_ENABLED=1`，job 不能自行取得 apt 权限。在 GitLab 创建 project runner 后，把 token 只写入 VM 的 `/etc/plush-runner/registration.env`，权限 `0600`，再运行 `/usr/local/sbin/plush-register-gitlab-runner`。脚本注册后销毁 token 文件。
7. Runner 必须显示 tags `plush,isolated,amd64`、locked、run untagged=false；运行一次非发布 pipeline，核对 VM 内临时 PostgreSQL 被清理且 R640 宿主容器列表未变化。

## GitHub 单向镜像与 GPT Review

在 GitLab 项目 `Settings -> Repository -> Mirroring repositories` 配置 push mirror：

- 目标固定为 `ssh://git@github.com/saurick/plush-toy-erp.git`；
- 只镜像 protected branches，因此自动镜像只承载 protected main；
- 使用 GitHub 专用 deploy key/token，不复用个人高权限凭据；
- GitHub 禁止直接写 `main`，主分支变化只来自 GitLab push mirror；
- 本地 remote 固定为 `origin=GitLab`、`github=GitHub`；需要 GPT Review 时，取得单独 push 授权后使用既有 `prepare-push.sh --review --remote github` 将同一 clean main SHA 推到 GitHub `review/gpt`，不把该审查 ref 设为 protected，也不从 GitHub 合并 main；
- GitHub `GitHub Review Mirror CI` 只响应 PR、`review/gpt/**` 和手动运行，不响应镜像 main；
- GitHub `Emergency Immutable Release (GitHub)` 只作显式应急回退，不与 GitLab release pipeline 同时执行。

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

## 当前未执行事项

本目录只完成仓库内可审查定义。创建容器、VM、DNS/FRP/Nginx、GitLab 项目、Runner、变量、镜像规则、备份定时器、push mirror 和首次 pipeline 都属于目标运行态写入，必须在再次核对现场后取得部署/远端授权。
