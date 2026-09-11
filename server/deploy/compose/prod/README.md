# Compose 部署说明

本目录是仓库内唯一的单宿主机 Compose 部署真源：

- `compose.yml`：PostgreSQL、SeaweedFS 私有对象存储、Jaeger、业务服务与单一 Web 入口。
- `compose.demo-133.yml`：`demo-133` 的固定 Compose project 覆盖。
- `compose.customer-test-133.yml`：`customer-test-133` 的固定 Compose project 覆盖。
- `.env.example`：运行环境变量示例，不保存真实凭据。
- `migrate_online.sh`：按登记目标执行受控 Atlas migration，并在附件外置维护窗口完成导出与校验。
- `attachment_raid_preflight.sh`：只读检查附件目录实际使用指定本机 RAID5 挂载。

当前可执行环境只有 `demo-133` 与 `customer-test-133`。`erp` 是未来生产环境，尚未启用；根域临时跳转到 `erp.yoyoosun.net` 不会把它变成可执行 target。`admin.yoyoosun.net` 退役后仍不能进入 target、Compose、migration、清理、健康检查、发布或回滚矩阵。

## 目标矩阵

所有精确身份以 [`scripts/deploy/deployment-targets.json`](../../../../scripts/deploy/deployment-targets.json) 为唯一真源，浏览器或命令行不能临时覆盖。

| target              | 业务用途                                         | 公网入口            | Compose project         | 数据库                       | PostgreSQL / API / Web |
| ------------------- | ------------------------------------------------ | ------------------- | ----------------------- | ---------------------------- | ---------------------- |
| `demo-133`          | 项目方造数、演练、培训与回归；允许受控重建       | `demo.yoyoosun.net` | `plush-toy-erp-demo-v1` | `plush_erp_demo_v1`          | `55436 / 8325 / 5195`  |
| `customer-test-133` | 甲方测试与验收；普通部署保留数据，需要时独立重建 | `test.yoyoosun.net` | `plush-toy-erp-test-v1` | `plush_erp_customer_test_v1` | `55437 / 8335 / 5205`  |

两个环境部署同一不可变 release digest，但数据库、上传、Compose project、端口、runtime env、数据目录、migration 锁、备份、回滚点、operation 与 smoke 必须完全独立。demo 造数不能进入 test；test 的普通 promotion 保留数据，显式重建或清理不能影响 demo。

`customer-trial-133` 仍是 demo 内部模拟数据合同的 target key，不是第三个部署环境。它只能在 `demo-133` 的受控数据准备链中使用。

## 快速开始（仅本地或新建隔离环境）

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
cp .env.example .env
${EDITOR:-vi} .env

cd /Users/simon/projects/plush-toy-erp
bash scripts/deploy/production-preflight.sh \
  --env-file server/deploy/compose/prod/.env

cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose --env-file .env -f compose.yml up -d
```

不得把这段本地命令用于绕过登记 target。远端 promotion、rollback、数据库重建和 smoke 必须通过 `scripts/deploy` 的 controller / executor 主路径。

## 运行环境边界

首次启动前至少设置：

- 固定版本的 `POSTGRES_IMAGE`、`JAEGER_IMAGE`、`APP_IMAGE`、`WEB_IMAGE`，不得使用 `latest` 或 `dev`。
- 互不复用的 PostgreSQL 管理、迁移、备份和应用凭据，以及各环境独立的附件 S3 凭据。
- `APP_JWT_SECRET` 与按目标登记的管理员初始化输入。
- `POSTGRES_DATA_DIR`、`MIGRATION_LOCK_FILE`、宿主端口和 `PROJECT_SLUG` 必须与目标 registry 一致。
- `POSTGRES_BIND_ADDR=127.0.0.1`、`APP_HTTP_BIND_ADDR=127.0.0.1`、`JAEGER_BIND_ADDR=127.0.0.1`。
- `WEB_DESKTOP_BIND_ADDR=127.0.0.1`；公网流量只经各目标的独立、受控 Web 入口。
- `BOOTSTRAP_ADMIN_ONCE=false`；仅新库的受控一次性管理员初始化窗口可临时开启。
- `ERP_DEBUG_ENV=prod`，所有 debug seed / cleanup / business clear 开关保持关闭。

生产 Compose 不持久注入 `APP_ADMIN_PASSWORD`。初始化成功后必须回到无密码的 steady env，并单独完成客户配置、health、ready、smoke 与目标读回。

运行 env 必须是目标用户拥有的普通文件、权限精确为 `0600`，文件与父路径都不得是符号链接。preflight 使用私有快照读取并在结束前复核原文件身份；冲突只报告键名，不输出值。

## 一次性管理员 bootstrap

全新库先完成 migration，并保持常驻 `app-server` 停止。再从仓库根目录运行受控入口：

```bash
APP_ADMIN_PASSWORD='<ephemeral-secret>' \
  bash scripts/deploy/bootstrap-production-admin.sh \
    --deployment-target '<demo-133|customer-test-133>' \
    --env-file '<absolute-runtime-env>' \
    --expected-database '<exact-database>' \
    --expected-migration '<14-digit-atlas-version>' \
    --expected-release '<40-character-lowercase-git-sha>' \
    --confirm 'BOOTSTRAP_PRODUCTION_ADMIN:<project>:<database>:<username>:<migration>:<release>'
```

脚本成功只证明管理员、marker、audit 与内置 RBAC 已读回；它不替代客户配置、数据准备、目标 smoke 或验收。

## demo 模拟数据

只有 `demo-133` 可以启用内部 `customer-trial-133` 模拟数据合同：

- 数据库固定为 `plush_erp_demo_v1`。
- Compose project 固定为 `plush-toy-erp-demo-v1`。
- 运行根目录固定为 `/home/simon/plush-toy-erp-demo-v1`。
- 稳态仍必须 `BOOTSTRAP_ADMIN_ONCE=false`，不得持久保存 bootstrap 密码。
- 造数只走正式 JSON-RPC / usecase，不复制数据库行，不用 Workflow payload 冒充 Fact。
- 凭据轮换、完整账号矩阵、PDF 与业务页面验收均是独立证据。

模拟数据可以通过受控 rebuild operation 重建，但执行器必须先创建并恢复校验备份、保存旧物理数据代和精确回滚身份。禁止裸清表、volume 删除、临时 SQL 或跨环境复制。

## customer-test 干净基线

`customer-test-133` 用于甲方自行录入真实测试数据。它不执行 demo 的 seed / fixture / 模拟业务造数。需要恢复干净基线时，只能走正式 database rebuild 主路径：

1. 绑定当前不可变 release、目标身份与未结束 operation。
2. 创建并恢复校验备份，记录精确 rollback point。
3. 保存旧 PostgreSQL 物理数据代，再创建 fresh 物理代。
4. 执行 migration、一次性管理员 bootstrap 和空业务基线读回。
5. 读回 release、migration、health、ready、登录入口与备份/回滚身份。

本轮环境登记不代表现在立即清理 test。没有现状分类、保留/删除合同和恢复验证时，任何数据清理都必须停止。

## 公网入口

`demo.yoyoosun.net` 与 `test.yoyoosun.net` 各自绑定其登记 Web 入口。切换只允许使用 `deployments/yoyoosun/scripts/cutover-public-web.sh`，并要求：

- target、容器前缀、Docker network 和宿主端口与 registry 精确一致；
- 镜像 release、健康、ready、Provider 能力和公网 exact SHA 可读回；
- 失败恢复原入口，不修改数据库、后端或 Jaeger 的 loopback 边界。

DNS、TLS 和反向代理是目标运行证据，不是 Compose 文件中的第二套环境真源。

## 迁移脚本

登记目标只使用：

```bash
DEPLOYMENT_TARGET_KEY='<demo-133|customer-test-133>' \
  sh server/deploy/compose/prod/migrate_online.sh --status-only

DEPLOYMENT_TARGET_KEY='<demo-133|customer-test-133>' \
  sh server/deploy/compose/prod/migrate_online.sh
```

写入前仍需项目既有的 prepare / confirmation / maintenance 门禁。脚本固定使用目标 release 内 migration、目标根目录登记的 Atlas、`psql` 和独立 `flock`；宿主或 env 不能覆盖工具/路径键。`status-only` 是只读证据，不等于 migration 已执行。

## PDF 与可观测性

- 服务端镜像内置固定 Chromium，中文字体由前端静态资源随包交付，并内嵌到每次 PDF 快照；不再重复安装系统 CJK 字体包。最终镜像的版本、业务 PDF、系统包和体积按 [`pdf-runtime`](../../../../scripts/qa/README.md#打印引擎验证--pdf-runtime) 检查，目标 warmup、sandbox、内存与并发继续由 preflight 和 smoke 守住。
- Jaeger 仅绑定 loopback，不直接暴露到公网或办公网。
- 应用连接池预算必须与 PostgreSQL `max_connections`、migration、备份和运维保留量一起计算。
- 日志、回执和 evidence 不保存密码、token、客户正文、原始配置或 PDF 正文。

## 发布与回滚

目标机不构建源码，只 load / pull 已发布的不可变制品。promotion 必须绑定同一 Git SHA、image digest、migration 序列、客户配置源指纹和 release rehearsal；成功后分别读回 Compose、容器 image/content identity、`GIT_SHA`、health、ready、公网入口和 rollback point。

代码回滚只允许 migration 序列与客户配置源指纹兼容的旧 manifest；不自动 down migration，也不把数据库恢复隐藏在代码回滚中。任何结果为 `not_proven` 时先只读核对目标，禁止重试。

## 最小检查

```bash
bash -n scripts/deploy/production-preflight.sh
bash -n server/deploy/compose/prod/migrate_online.sh
node --test scripts/deploy/deployment-targets.test.mjs \
  scripts/deploy/production-preflight.test.mjs \
  scripts/deploy/migrate-online.test.mjs
git diff --check
```

自动化绿色不替代目标 DNS/TLS、备份恢复、运行 SHA、数据身份和业务 smoke 的实时读回。

## 附件存储与RAID5

附件通过 S3 访问，每个环境使用独立 bucket 和凭据，支持以下两种部署方式：

| 模式 | 运行配置 | 存储检查 |
| --- | --- | --- |
| `managed` | `ATTACHMENT_STORAGE_MODE=managed`、`COMPOSE_PROFILES=attachment-local`；由 ERP Compose 启动 SeaweedFS | 校验 RAID5 实际挂载、固定镜像、健康和管理登录保护 |
| `external` | `ATTACHMENT_STORAGE_MODE=external`、`COMPOSE_PROFILES=`；填写独立 `ATTACHMENT_S3_*` | 使用已部署服务，校验运行连接、独立 bucket 和凭据；RAID5、备份与管理入口由存储服务负责 |

外部模式不启动 `attachment-store`，无需在 ERP env 中保存存储管理员密码或数据目录。S3 origin 允许 HTTPS 或局域网 HTTP IP 地址，不接受带凭据、文件路径、query 的 URL。Compose profile 只允许表中值，宿主环境仍不得覆盖受控 env。业务服务会在存储不可用时拒绝文件操作，不能用数据库内容回退。

本机模式使用 SeaweedFS `4.46` 固定 digest，所有 volume、filer metadata 和 master 数据均挂载到 `ATTACHMENT_DATA_DIR`。`ATTACHMENT_RAID_MOUNT=/srv/raid5`；demo 建议目录 `/srv/raid5/plush-toy-erp/demo-133/attachments`、bucket `plush-demo-133-files`，test 使用对应 `customer-test-133` 路径和 bucket。新目标初始化按这组路径生成独立随机凭据；已存在目标在发布前准备运行 env、目录和固定镜像，不能直接套用新目标初始化。

目标主机先确认 `/srv/raid5` 已挂载到预期块设备，再创建专用目录并限制权限。启动前执行：

```bash
bash server/deploy/compose/prod/attachment_raid_preflight.sh \
  /srv/raid5 /srv/raid5/plush-toy-erp/demo-133/attachments
```

本机模式的 Compose 不自动创建缺失的附件目录，也不发布 S3 / filer / master / 管理界面端口；业务容器通过附件私有网络访问存储。`production-preflight --runtime` 会核对实际挂载、服务健康、S3 bucket 访问及管理界面的登录保护和凭据。目标机预装 `.env.example` 中固定的 SeaweedFS 镜像；低配目标不构建镜像。初始化或恢复失败时保留附件目录供核对，不沿用数据库清理脚本删除文件。

已有库外置按正式 promotion 的停写窗口进行。发布前保留旧版本、完整 PG 备份及其恢复验证；候选镜像包含 `/app/attachment-storage`。`migrate_online.sh --reconcile-permissions` 和 `--apply` 在同一 Atlas 串行锁范围中导出、逐个读回校验并提供迁移摘要，回执保存在 migration receipt 旁。纯只读预检遇到待外置数据时会明确阻断，不会自行复制文件。迁移后继续走权限对账、health / ready 和附件上传下载 smoke。若尚未移除旧列，可回到旧版本和旧库；旧列移除后回滚旧代码必须同时恢复配套旧 PG dump，不能只切镜像。

`cmd/attachment-storage` 提供以下维护入口，默认写操作均为 dry-run；实际操作要求 `-execute` 和精确 `-confirm`。连接只从 `POSTGRES_DSN` 与 `ATTACHMENT_S3_*` 环境变量读取，凭据放受控 `0600` 文件或临时进程环境，不进入命令参数、Git 或日志。

| mode | 用途 | 额外参数 |
| --- | --- | --- |
| `inventory` | 只读盘点当前库数量、字节和存储结构 | `-database <exact-db>` |
| `check` | 校验配置和 bucket 可访问 | `-database <exact-db>` |
| `export` | 旧 PG 内容复制到不可覆盖的对象 key 并全量读回 | `-receipt <new-private-file> -execute -confirm ATTACHMENT_EXPORT:<db>` |
| `verify` | 逐对象验证大小与 SHA-256 | 可加 `-receipt <file>` 约束原导出身份 |
| `backup` | 导出可迁移的普通文件和 manifest，完成后才写 manifest | `-dir <new-directory> -execute -confirm ATTACHMENT_BACKUP:<db>` |
| `restore` | 验证配套数据库元数据与备份，再恢复同一 key | `-dir <backup-directory> -execute -confirm ATTACHMENT_RESTORE:<db>` |

本地开发也必须配置同一组 `ATTACHMENT_S3_*` 变量；使用 RAID5 上独立的开发 bucket，可通过受控局域网端点或 SSH tunnel 连接已有服务，或在隔离本地验证中使用一次性 SeaweedFS。开发配置保存在忽略 Git 的 `server/.env`（`0600`），`make run / dev_restart` 会读取同一组变量。不要让开发和 demo/test 复用 bucket。共享开发库迁移前，停写后执行 `export`，再用 `verify -receipt <file> -pg-options` 的输出设置本次进程的 `PGOPTIONS`，然后按 `make migrate_prepare → make migrate_execute` 的同一 ready 输出执行，完成后 `unset PGOPTIONS`。运行 API 没有 PG 内容回退。

备份时保持相关写入停止，在同一窗口生成 PG custom-format dump 和 `backup` 文件目录，外加当前 release 与 migration 身份；保存到独立磁盘、另一台机器或云端受控存储。已有 `scheduled-postgres-backup.sh` 只负责 PG，不能作为本次外置后的完整系统备份。不要直接打包运行中的 SeaweedFS 原始数据目录。

恢复先把配套 PG dump 导入隔离目标，再使用新 S3 endpoint / bucket 执行 `restore` 和 `verify`，保留原 key、附件 ID、哈希和审计。全部核对通过后才切业务连接；源对象和旧备份保留到回滚窗口结束。文件服务不可用时上传下载明确失败，附件列表仍读 PG 元数据。

共享开发库的备份恢复演练遇到旧 PG 附件迁移时，会另外启动一次性 SeaweedFS，把恢复库中的文件导出并全量校验，以恢复库身份生成迁移凭证；原库凭证不能跨库复用。完成 Atlas 升级后再次验证文件，演练服务和临时凭据随该次演练清理。

隔离验证入口为 `bash scripts/qa/attachment-storage-integration.sh`：创建一次性 PostgreSQL 与 SeaweedFS 容器，验证 fresh / upgrade、未导出与过期凭证阻断、匿名访问拒绝、不可覆盖写入、撤销审计、PG dump 加文件备份恢复、现有附件并发回归及管理界面只读权限，最后清理本轮容器和临时文件。它不连接或修改共享开发、demo 或 test 库。

### 只读查看存储

本机模式的管理界面复用同一 SeaweedFS 容器，查看存储状态、bucket 和底层文件。外部模式使用存储服务的管理入口；在 File Browser 中打开 `/buckets/<ATTACHMENT_S3_BUCKET>/attachments`。已识别的 PNG、JPEG、GIF、WebP 对象写入图片类型，便于只读预览；其他格式保留下载类型。它供项目管理员排查存储使用，文件对应的产品、单据和撤销状态仍以 ERP 为准。界面显示的是存储服务信息，不证明 RAID 控制器或磁盘健康，也不证明备份完成。

| 账号 | 配置 | 用途 |
| --- | --- | --- |
| `viewer` | `ATTACHMENT_VIEWER_PASSWORD` | 日常只读查看；服务端拒绝上传、删除及配置修改 |
| `storage-admin` | `ATTACHMENT_ADMIN_PASSWORD` | SeaweedFS 原生鉴权要求的管理账号；受控保管，不作为日常查看账号 |

两个密码各自随机生成至少 32 位，与 S3、数据库和 JWT 凭据独立；保存在目标权限为 `0600` 的 runtime env 和受控密码管理器中，不放入命令参数或日志。新目标初始化自动生成，已有目标须在升级前补齐。Compose 缺值会拒绝启动，生产预检同时拒绝占位、短密码和凭据复用。业务容器不接收这两个密码。

目标部署完成后，在本机仓库运行：

```bash
node scripts/deploy/attachment-console.mjs --target demo-133
# 查看 test 时使用 --target customer-test-133；同时查看可加 --port 23647。
```

命令只核对 registry 对应的 SSH 主机、唯一健康存储容器及登录保护，然后把本机 `127.0.0.1:23646` 经 SSH 转发到该容器私有地址，不启动或部署远端服务。打开 `http://127.0.0.1:23646`，使用 `viewer` 登录；密码取自对应目标的受控凭据。按 `Ctrl+C` 关闭通道。容器重建后重新运行命令，以重新取得私有地址。

此通道依赖现有 SSH 密钥和已核实的主机指纹，不自动接受未知主机，也不加入公网反向代理。存储界面不继承 ERP 的业务权限；只读账号也能查看底层文件，仅分配给有整个环境文件访问权的项目管理员。附件撤销、替换等业务操作继续经过 ERP。

固定版本的原生界面仍会显示部分新建、上传和删除按钮，`viewer` 的这些请求由服务端返回 `403` 拒绝；当前复用原版界面，不另行维护前端分支。

单独验证界面时运行 `node scripts/qa/attachment-console-integration.mjs`。该入口从正式 Compose 创建一次性存储，测试覆盖文件临时增加浏览器访问所需的随机本机端口和测试网络，正式配置仍无端口发布；验证登录、只读浏览、服务端写入拒绝和退出登录后清理。
