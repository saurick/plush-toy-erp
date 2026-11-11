# yoyoosun systemd 定时任务

这些单元将生产 PG＋附件成套备份接到独立的 `plush-toy-erp-paired-*` 定时任务。生产成套包与原 PostgreSQL 专用备份使用不同目录和回执。原任务和 PD-SSD 同步继续使用 [backup.env.example](../env/backup.env.example)，不能用旧的数据库回执证明附件可恢复。包内容、独占停写窗口和恢复报告以[备份恢复](../runbooks/04-backup-restore.md)为准。

生产配置用 [paired-backup.env.example](../env/paired-backup.env.example) 安装为 `/etc/plush-toy-erp/paired-backup.env`（`root:0600`）。安装前核对 `production-133` 的运行 release、Compose、runtime env 和备份目录，将 `BACKUP_TOOL_DIR` 指向经过校验的固定工具目录。成套备份每天北京时间 02:15 运行；错过窗口不补跑停写动作。异地恢复检查每周日北京时间 03:15 运行，恢复本身不暂停生产。

本机生产模板使用与 registry 一致的 root 操作身份，以读取 `root:0600` env 和私有 release 目录；数据库备份仍经只读 `erp_backup`。安装时核对脚本只操作本项目 Compose、本地与异机备份目录。异地目录必须是独立主机或独立存储的受控挂载，不能只是数据库服务器上的另一个普通目录。

备份任务的 `COMPOSE_PROJECT_NAME`、`BACKUP_DATABASE` 必须与 registry 及实际运行容器一致；工具显式传入 project，不按目录猜测。Node 路径需指向项目约定版本，模板为 `/usr/local/bin/node`；恢复工作目录应放在有容量的独立数据盘，需容纳解密包、展开文件与临时 PG / S3。恢复主机预先加载配套应用镜像、PG 18.6 及固定 SeaweedFS 镜像，不在低配目标构建。

异地副本固定使用 `age` 公钥加密。先在受控恢复端生成身份，再只把 recipient 文件复制到数据库服务器；identity 不进入仓库，也不应与异地备份放在一起：

```bash
age-keygen -o /etc/plush-toy-erp/backup-age-identity.txt
age-keygen -y /etc/plush-toy-erp/backup-age-identity.txt \
  > /etc/plush-toy-erp/backup-age-recipient.txt
chmod 0600 /etc/plush-toy-erp/backup-age-identity.txt
chmod 0644 /etc/plush-toy-erp/backup-age-recipient.txt
```

每日备份主机只需要 recipient；每周恢复检查需要 identity，优先把恢复检查 service/timer 安装在独立恢复主机。如果暂时同机验证，不能把该结果描述为密钥与数据库主机已经隔离。

异地存储挂载完成后，在生产专用目录创建固定标记。单元先确认挂载点真实存在，脚本再确认它与本地备份目录不在同一文件系统：

```bash
mountpoint -q /mnt/plush-toy-erp-offsite/database
sudo install -d -m 0700 /mnt/plush-toy-erp-offsite/database/production-133
printf '%s\n' 'plush-toy-erp-offsite-v1' \
  | sudo tee /mnt/plush-toy-erp-offsite/database/production-133/.plush-toy-erp-offsite-target >/dev/null
```

```bash
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-paired-* /etc/systemd/system/
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup-failure@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now plush-toy-erp-paired-backup.timer plush-toy-erp-paired-restore-check.timer
```

每日任务持生产发布锁和 PostgreSQL 专用备份锁，核对 `erp_backup` 只读权限和源容器，再停止原 app-server；若存在其它数据库连接则失败并恢复原应用。停写窗口取得配套 dump / 附件并核对元数据，恢复原容器健康后才加密与传输；本地及异地各保留 7 套 `*.tar.age` 和 checksum，临时明文清理。

`latest-set-status.json` 记录本次 passed / failed 及 `applicationResumed`。任务失败时 systemd 进入 failed，`OnFailure` 写高优先级 `BACKUP_FAILURE` journald 事件；宿主监控须订阅 failed unit 及新报告的新鲜度，不能继续只检查旧 PG 状态。

模板不内置邮箱、Webhook 或凭据。

`KillMode=mixed` 先通知主 Node 进程，由其取消子任务并恢复原应用 / 精确清理隔离资源；三分钟清理宽限到期后才由 systemd 终止余下进程。不得把计划任务与发布、migration、其它业务实例或对象清理安排到同一维护窗口。首次切换前保留原 unit / env / DropIn 及旧备份，新链首跑成功后再确认调度合同。

在已约定的停写窗口至少执行一次实际备份和恢复验证。首套通过后读回两个 timer 的下次运行时间；首次验证已通过的备份不必为安装重复停写。

```bash
sudo systemctl start plush-toy-erp-paired-backup.service
sudo systemctl start plush-toy-erp-paired-restore-check.service
systemctl status plush-toy-erp-paired-backup.service plush-toy-erp-paired-restore-check.service
systemctl list-timers 'plush-toy-erp-paired-*'
```

只有两项 service 都成功、异地目录存在同名 `tar.age` / checksum，且成套恢复报告为 `passed`、`sourceKind=offsite-backup-set`、backupId / 附件数量 / 字节与本次备份一致，才说明新合同已在该目标机落地。默认只选择 36 小时以内的最新异地备份，损坏或不完整时直接失败。`durationSeconds` 为本次实测恢复耗时；业务 smoke 单独执行，未取得证据前不承诺固定 RTO。

## 独立更新恢复检查工具

恢复工具可独立于 ERP 镜像更新。

从已验证的固定发布制品取 `scripts/deploy/backup-set/` 全部模块、`scripts/deploy/backup-replica/` 中的 `retention.mjs`、`storage.mjs`、`config.mjs`、`process.mjs`，以及 `scripts/deploy/postgres-backup-role.sql`、`scripts/lib/file-digest.mjs`，以原相对结构安装到登记目标根目录的 `backup-tools/paired-<内容摘要>/`。逐文件校验并记录来源 release、内容摘要和目标，目录由 root 持有。

不只复制 CLI 一个文件。

两项服务通过 `BACKUP_TOOL_DIR` 使用同一固定工具版本。只更新恢复验证工具时，可通过成套恢复 service 的 DropIn 指向另一个经过校验的固定 CLI，保留原 EnvironmentFile、挂载依赖及 timer。

修改前保存旧 DropIn 和 unit 指纹，确认 service 未运行；再做 `systemd-analyze verify`、daemon-reload 与一次真实成套恢复。只有 PG / S3 / helper 容器、该次匿名卷、internal 网络和临时明文均清理成功才写 passed。

回退时恢复旧 DropIn 并重验；旧 PG-only 入口只能检查旧 PG 备份，不得把降级结果报告为成套恢复。
