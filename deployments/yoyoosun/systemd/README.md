# yoyoosun systemd 定时任务

这些单元把仓库级备份脚本接到目标机定时任务。它们是安装模板，不代表当前目标机已经安装或运行。

安装前先把固定 release 路径调整为目标机实际路径，并将 `env/backup.env.example` 复制到 `/etc/plush-toy-erp/backup.env`。运行账户必须能读取生产 env、写本地与异地备份目录，并只能操作本项目 Compose。异地目录必须是独立主机或独立存储的受控挂载，不能只是数据库服务器上的另一个普通目录。

异地副本固定使用 `age` 公钥加密。先在受控恢复端生成身份，再只把 recipient 文件复制到数据库服务器；identity 不进入仓库，也不应与异地备份放在一起：

```bash
age-keygen -o /etc/plush-toy-erp/backup-age-identity.txt
age-keygen -y /etc/plush-toy-erp/backup-age-identity.txt \
  > /etc/plush-toy-erp/backup-age-recipient.txt
chmod 0600 /etc/plush-toy-erp/backup-age-identity.txt
chmod 0644 /etc/plush-toy-erp/backup-age-recipient.txt
```

每日备份主机只需要 recipient；每周恢复检查需要 identity，优先把恢复检查 service/timer 安装在独立恢复主机。如果暂时同机验证，不能把该结果描述为密钥与数据库主机已经隔离。

异地存储挂载完成后，在挂载内创建固定标记；脚本还会确认它与本地备份目录不在同一文件系统。这样挂载掉线时会直接失败，不会悄悄把所谓异地副本写回数据库主机本地盘：

```bash
printf '%s\n' 'plush-toy-erp-offsite-v1' \
  | sudo tee /mnt/plush-toy-erp-offsite/database/.plush-toy-erp-offsite-target >/dev/null
sudo chmod 0444 /mnt/plush-toy-erp-offsite/database/.plush-toy-erp-offsite-target
```

```bash
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup.service /etc/systemd/system/
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup.timer /etc/systemd/system/
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup-restore-check.service /etc/systemd/system/
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup-restore-check.timer /etc/systemd/system/
sudo install -m 0644 deployments/yoyoosun/systemd/plush-toy-erp-backup-failure@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now plush-toy-erp-backup.timer plush-toy-erp-backup-restore-check.timer
```

每日任务先以 `erp_backup` 读回只读权限，再生成本机明文 dump；离开数据库主机的副本只保存 `*.dump.age` 和加密文件 checksum。任务失败时，备份脚本会写 `latest-status.env` 的 `status=failed`，systemd 单元进入 failed，并由 `OnFailure` 写入高优先级 `BACKUP_FAILURE` journald 事件。正式环境必须让宿主机监控订阅该事件或 failed unit；本模板不内置客户邮箱、Webhook 或凭据。

安装后至少执行一次手动验证：

```bash
sudo systemctl start plush-toy-erp-backup.service
sudo systemctl start plush-toy-erp-backup-restore-check.service
systemctl status plush-toy-erp-backup.service plush-toy-erp-backup-restore-check.service
systemctl list-timers 'plush-toy-erp-backup*'
```

只有两项 service 都成功、异地目录存在同名 `dump.age`/checksum、恢复报告为 `passed`，且报告中的 `backupAgeSeconds` 未超过约定上限，才说明定时合同已在该目标机落地。报告中的 `restoreDurationSeconds` 是本次实测恢复耗时；未取得该证据前不承诺固定 RTO。
