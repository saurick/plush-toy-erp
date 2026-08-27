# 研发效能工作台与 CI/CD 实施计划 / Engineering Workbench And CI/CD Implementation Plan

## 当前结论

仓库内实现已从“GitHub 托管主链”切换为“R640 GitLab canonical + KVM Runner + GitHub Review mirror”。本计划区分三个状态：

| 状态 | 当前结论 | 证据 |
| --- | --- | --- |
| 仓库定义 | 已实现，待定向测试和审查收口 | `.gitlab-ci.yml`、GitLab Provider、R640 deploy 定义、工作台与合同测试 |
| Git/远端 | 未执行 | 当前任务没有 commit、push、fetch 或 GitLab/GitHub 设置授权 |
| R640/公网运行态 | 未部署 | 当前任务没有服务器、云、DNS、FRP、Nginx、VM、数据库或服务重启授权 |

任何本地绿色都不能把后两项改写为已完成。

## 已落仓库切片

- [x] `.gitlab-ci.yml`：main/MR canonical plan、quality、稳定 `CI Gate`、protected exact-SHA strict 和 serialized release。
- [x] exact-SHA terminal 与 release catalog 支持真实 `gitlab-ci` provenance，同时保留明确的 `github-actions` 应急 provenance。
- [x] GitLab Provider：固定 URL/project/package/release/pipeline、受限下载根、token 服务端边界和 pipeline/job timing。
- [x] Delivery Bridge 默认 GitLab，只有 `PLUSH_DELIVERY_PROVIDER=github` 才选择 GitHub fallback。
- [x] GitHub CI 取消 main push，只保留 PR、`review/gpt/**` 和手工审查；GitHub release 标为应急。
- [x] 工作台文案和人工接管说明改为 GitLab 主链、GitHub 单向镜像。
- [x] R640 GitLab Compose、精确安装、备份/校验和 Runner VM cloud-init 定义。
- [x] affected mapping、quality gate catalog、Node 分组、fast web 合同和 GitLab CI 静态门禁。
- [x] 正式部署、QA、Web 与工程文档同步。

这些勾选只表示实现已写入工作区，不表示已经 commit、push 或部署。

## 本地收口顺序

1. 运行新增/受影响 Node 合同：GitLab Provider、exact-SHA、release catalog、GitLab/GitHub workflow、affected、quality catalog、Bridge、工作台配置和样式。
2. 对 `.gitlab-ci.yml`、Compose、cloud-init 和 Shell 脚本做 YAML/Shell 静态检查；不执行安装、备份或远端命令。
3. 运行 `git diff --check` 和精确变更审查，确认没有触碰外部脏路径、generated path、schema/migration 或生产配置。
4. 根据 affected plan 判断是否需要更高成本验证。full、strict、完整 Style L1 或真实浏览器门禁仍需按测试治理另行点名授权。
5. 向用户分别询问本地 commit、GitLab/GitHub push 和部署授权；三者不能合并推定。

## GitLab 部署前置证据

在取得部署授权后，重新只读检查并记录：

| 事项 | 必须证明 | 停止条件 |
| --- | --- | --- |
| R640 存储 | `/srv` SSD 与 `/srv/raid5` 实际 mount、余量、inode、SMART/RAID 状态 | mount 不符、降级或余量不足 |
| 现有容器 | 名称、端口、数据目录和 restart 状态 | 8929/2224 冲突或路径重叠 |
| KVM | `/dev/kvm`、libvirt network、VM 磁盘与资源预算 | 需要复用 GitLab 宿主 Docker socket |
| 公网 | DNS、阿里云现有 vhost、FRP remote 18226、证书与回滚配置 | 同名站点来源不明或切换不可回滚 |
| GitLab 镜像 | digest 与目标 CE 版本、升级路径和备份兼容 | 浮动 tag 或不支持的跳版本 |
| Secrets | root 初始化、MFA、Runner token、project token、GHCR token、mirror key 的最小权限 | token 需要进入仓库/浏览器/日志 |

## 目标搭建顺序

1. 为 GitLab SSD 数据和 RAID5 backup 建立精确目录、权限和容量告警。
2. 以 `server/deploy/gitlab/install-r640.sh` preview 检查，再用精确确认启动单个 `plush-gitlab`。
3. 只在 R640 本机处理初始密码，立即修改、启用 MFA，创建非 root 管理员。
4. 创建私有项目 `saurick/plush-toy-erp`，保护 main、禁止 force push，要求 merge pipeline 成功并以 `CI Gate` 作为稳定汇总 job。
5. 创建 protected `release` environment 和三项最小权限 protected variables。
6. 创建独立 KVM Runner VM，完成 cloud-init 后通过 `0600` 一次性 token 文件注册 locked project runner；读回 tags 与 untagged=false。
7. 配置 GitLab push mirror 到 GitHub，只同步 protected main；GitHub main 禁止直接更新。另验证经过独立授权的 `review/gpt` 快照使用单独 GitHub remote，不成为第二条 main 写入链。
8. 在阿里云备份旧 vhost，切换 `gitlab.saurick.me -> 18226`，完成 Nginx config test、TLS、health 和登录读回。
9. 运行非发布 MR/main pipeline，核对 `CI Gate`、缓存、一次性 PostgreSQL 清理、Runner VM 与 R640 宿主隔离。
10. 用专用测试版本运行一次 release pipeline，核对 v3 GitLab provenance、GHCR digest、六件 package、GitLab Release 和工作台读取。
11. 配置每日 backup；立即生成一份备份、checksum 和在线 verify，再在一次性同版本 VM 完成恢复演练。

任何一步失败都停在当前层，不继续把未知状态带入下一层。

## GitHub 与 GPT Review 验收

- GitHub main SHA 与 GitLab main 一致，mirror 方向只有 GitLab → GitHub。
- GitHub main push 不启动 `GitHub Review Mirror CI`。
- 经过 `prepare-push.sh --review --remote github` 和单独 push 授权的 `review/gpt/**` 或 Draft PR 可以启动审查 CI，但结果不冒充 GitLab `CI Gate`，也不从 GitHub 合并 main。
- GPT Review 能读取目标 SHA；finding 返回仓库处理，不在 GitHub 直接形成第二条 main 写入链。
- GitHub emergency release 默认不运行；演练 fallback 时先证明 GitLab release 没有 active job，并在结束后切回 GitLab Provider。

## 工作台验收

- 默认 Provider 为 GitLab；无 `PLUSH_GITLAB_TOKEN` 时只显示服务端 Provider 不可用，不向浏览器暴露 token、原始 header 或内部栈。
- 版本列表只接受固定 GitLab project 的 `artifact-<40sha>` Release，六件 package 不齐时不能 promotion。
- pipeline 只接受固定 GitLab URL、合法状态、时间和 job；无 step 数据显示空列表，不估算。
- “发布当前 SHA”只接受 clean HEAD 且由 GitLab main 精确匹配；dispatch 不直接写 133。
- GitHub fallback 必须由服务端环境显式选择，浏览器没有 Provider 选择器。
- 人工接管说明明确 GitLab 主链、GitHub review mirror、固定操作顺序与禁止捷径。
- 生产 build 仍排除全部 `/__dev` 路由与 Bridge。

## 备份与恢复验收

- GitLab application backup 和 config archive 同批生成，RAID5 copy 与 checksum 权限为私密。
- retention 只删除 `/srv/raid5/gitlab/backups` 内受管且超期的精确文件。
- 在线 verify 通过 tar/checksum 与 `gitlab:check`，报告明确不等于恢复。
- 一次性 VM 恢复后能登录、clone、读取 pipeline artifact、Generic Package 和 Release。
- 恢复演练记录 GitLab 版本、backup filename/hash、config hash、开始/完成时间、结果和清理读回；不保存密码/token。

## 真实数据与双环境后续

GitLab 完成不自动授权清空测试服务器。甲方真实数据 UAT 与模拟数据演示建议分成独立环境：既有稳定域名保留给 UAT，新增 `demo.yoyoosun.net` 保存可重置模拟数据；若希望语义更明确，可将真实数据入口固定为 `uat.yoyoosun.net`。

实施前必须新增独立 deployment target、数据库、上传、Compose project、端口、备份、preflight 和 operation。两环境共享同一 Product Core 与 release digest，不复制代码或字段真源。真实数据导入/清理、域名切换和 UAT 是后续独立授权，不包含在 GitLab 部署中。

## 回滚与停止条件

| 故障层 | 回滚/处置 | 禁止动作 |
| --- | --- | --- |
| GitLab 容器首次启动失败 | 保留 `/srv/gitlab` 和日志，修正单一配置或回到已固定 digest | 删除 data/config、全局 Docker prune |
| 公网入口失败 | 恢复备份的阿里云 vhost/FRP upstream，GitLab LAN 入口保持 | 临时开放 8929 公网 |
| Runner 不可信 | pause/delete Runner token，保留 GitLab；重建一次性 VM | 改挂宿主 Docker socket |
| mirror 异常 | pause push mirror，GitLab main 继续作为真源 | 从 GitHub 强推覆盖 GitLab |
| release 身份不一致 | 终止 job，保留 package/release 证据，使用新版本修复 | 覆盖同名 asset/tag 或猜 digest |
| backup/restore 未通过 | 阻断 GitLab 升级和正式依赖切换 | 把 RAID 健康当恢复证据 |

遇到以下任一条件立即停止：目标身份/挂载漂移、活动 writer/部署、端口重叠、备份不可验证、secret 可能落盘/输出、Runner 需要越过 VM、GitLab/GitHub 同时发布、release SHA 与 main 不一致、目标结果 `not_proven`、或需要数据库/域名破坏性动作但没有独立授权。

## 完成定义

本任务只有在以下证据分别存在时才能说“GitLab CI/CD 已搭建完成”：

1. 仓库实现通过定向检查并完成获准 commit/push；
2. R640 GitLab、KVM Runner、域名/FRP/Nginx、保护规则、变量和 mirror 已实际读回；
3. main `CI Gate` 与 exact-SHA release pipeline 各成功一次；
4. GHCR digest、GitLab Package/Release 六件资产和工作台一致；
5. backup、checksum、在线 verify 与隔离 restore drill 均有证据；
6. 现有业务容器、数据、端口和公网入口无回归。

客户真实数据环境、双域名、业务 UAT、数据库清理与正式生产发布不属于上述完成定义，必须单独计划、授权和验收。
