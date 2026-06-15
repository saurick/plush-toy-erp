# deployments/yoyoosun 私有化部署资料包规范

> 适用目录：`deployments/yoyoosun/`
> 适用阶段：客户试用候选 / 私有化部署候选 / 生产交付候选前
> 目标：明确 yoyoosun 私有化部署资料包应该沉淀哪些 runbook、env 样例、备份恢复、发布 evidence、巡检清单，以及哪些内容不应该放在该目录。
> 核心原则：`deployments/yoyoosun` 只保存可复现、可审计、可交付、已脱敏的部署资料；不保存真实 secret、真实备份、客户 raw files 或不可公开的敏感数据。

---

# 1. 总结结论

`deployments/yoyoosun` 应该作为 yoyoosun 私有化部署交付资料包目录。

它应该沉淀：

```text
部署 runbook
升级 runbook
回滚 runbook
备份恢复 runbook
导入执行 runbook
故障处理 runbook
日常巡检 runbook
env 样例
compose 样例
nginx 样例
preflight checklist
post-deploy checklist
smoke test checklist
security checklist
backup restore checklist
release evidence
migration evidence
backup evidence 模板
巡检报告模板
known limitations
acceptance checklist
```

它不应该沉淀：

```text
真实 .env
真实密码
真实 token
SSH 私钥
数据库备份文件
客户原始 Excel/PDF/图片
未脱敏截图
包含手机号/地址/价格/订单明细的日志
生产数据库 dump
真实 npm token
Telegram bot token
长期有效访问地址和凭证
```

---

# 2. 目录定位

## 2.1 deployments/yoyoosun 是什么

它是：

```text
yoyoosun 私有化部署操作手册
yoyoosun 部署配置样例
yoyoosun 上线检查记录
yoyoosun 发布 evidence
yoyoosun 运维巡检模板
yoyoosun 备份恢复演练记录
yoyoosun 客户试用交付资料
```

它不是：

```text
客户原始资料仓库
生产 secret 仓库
数据库备份仓库
长期日志仓库
导入 raw files 仓库
开发测试 fixture 仓库
合同和商务资料仓库
```

---

## 2.2 和其他目录的边界

| 目录                      | 作用                                    |
| ----------------------- | ------------------------------------- |
| `deployments/yoyoosun/` | 部署、运维、发布、巡检、回滚资料                      |
| `customers/yoyoosun/`   | 客户配置、seed、导入 manifest、mapping、客户配置包   |
| `docs/yoyoosun/`        | 客户项目说明、导入说明、验收说明、非敏感文档                |
| `scripts/deploy/`       | 通用部署、备份、恢复脚本                          |
| `scripts/customer/`     | 客户配置、seed、导入、交付包脚本                    |
| `scripts/qa/`           | 通用质量检查脚本                              |
| 受控外部存储                  | 客户 raw files、真实备份、敏感截图、签署文件、生产 `.env` |

---

## 2.3 该目录的核心目标

`deployments/yoyoosun` 必须回答：

```text
如何首次部署？
如何升级？
如何回滚？
如何备份？
如何恢复？
如何执行 migration？
如何执行客户导入？
如何做 smoke test？
如何收集 evidence？
如何做日常巡检？
哪些配置必须提供？
哪些 secret 不能提交？
出问题时如何排查？
客户试用前要检查什么？
```

---

# 3. 推荐目录结构

推荐结构：

```text
deployments/
  yoyoosun/
    README.md

    env/
      .env.example
      server.config.example.yaml
      web.config.example.json
      secrets.required.md

    compose/
      docker-compose.example.yml
      docker-compose.override.example.yml
      nginx.example.conf

    runbooks/
      00-overview.md
      01-first-deploy.md
      02-upgrade.md
      03-rollback.md
      04-backup-restore.md
      05-migration.md
      06-import-apply.md
      07-incident-response.md
      08-daily-ops.md

    checklists/
      pre-deploy-checklist.md
      post-deploy-checklist.md
      smoke-test-checklist.md
      security-checklist.md
      backup-restore-checklist.md
      upgrade-checklist.md
      rollback-checklist.md
      weekly-inspection-checklist.md
      monthly-inspection-checklist.md

    evidence/
      README.md
      releases/
        2026-06-11/
          release-evidence.md
          image-digests.txt
          migration-status.txt
          config-fingerprint.txt
          smoke-test-report.json
          security-scan-report.json
          backup-restore-report.json
          known-limitations.md
          acceptance-checklist.md
      migrations/
        migration-evidence-template.md
      backups/
        backup-evidence-template.md
      smoke/
        smoke-test-report.example.json

    reports/
      latest-preflight-report.json
      latest-smoke-test-report.json
      latest-backup-restore-report.json
      latest-weekly-inspection-report.json

    scripts/
      verify-env.sh
      run-smoke.sh
      collect-evidence.sh
      verify-backup-restore.sh
```

---

# 4. README.md 规范

`deployments/yoyoosun/README.md` 应该回答：

```text
这个目录是什么
适用哪个客户
适用哪些环境
当前部署状态
当前 release version
如何部署
如何升级
如何回滚
如何巡检
哪些文件不能提交
敏感数据放在哪里
```

建议内容：

```md
# yoyoosun 私有化部署资料包

## 目录用途

本目录用于保存 yoyoosun 私有化部署的 runbook、配置样例、巡检清单和发布 evidence。

## 当前环境

- customerCode: yoyoosun
- deploymentType: private / customer-trial
- timezone: Asia/Shanghai
- releaseVersion:
- serverImage:
- webImage:
- database: PostgreSQL
- storage:

## 敏感信息规则

本目录不保存任何真实 secret、数据库备份、客户原始文件或未脱敏日志。

## 常用文档

- runbooks/01-first-deploy.md
- runbooks/02-upgrade.md
- runbooks/03-rollback.md
- runbooks/04-backup-restore.md
- checklists/pre-deploy-checklist.md
- checklists/smoke-test-checklist.md
- checklists/security-checklist.md
```

---

# 5. env 样例规范

## 5.1 应该放什么

`env/.env.example` 应该放所有必需环境变量的样例，但只能使用 placeholder。

示例：

```env
APP_ENV=production
CUSTOMER_CODE=yoyoosun
TZ=Asia/Shanghai

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=plush_erp
POSTGRES_USER=plush_erp
POSTGRES_PASSWORD=change-this-in-real-env

JWT_SECRET=change-this-in-real-env
ADMIN_BOOTSTRAP_ENABLED=false
BOOTSTRAP_ADMIN_ONCE=false
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=change-this-in-real-env

PUBLIC_REGISTER_ENABLED=false
SMS_MOCK_ENABLED=false
DEBUG_SEED_ENABLED=false
DEBUG_CLEANUP_ENABLED=false
SQL_ARGS_TRACING_ENABLED=false

CORS_ALLOWED_ORIGINS=https://erp.example.com
WEB_PUBLIC_BASE_URL=https://erp.example.com

BACKUP_DIR=/var/backups/plush-erp
FILE_STORAGE_DIR=/var/lib/plush-erp/files

OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=

LOG_LEVEL=info
```

---

## 5.2 secrets.required.md 应该说明什么

新增：

```text
env/secrets.required.md
```

内容应该说明：

```text
哪些 secret 必须提供
这些 secret 从哪里注入
哪些 secret 不能提交到 Git
如何轮换
如何验证 placeholder 没有进入生产
```

建议内容：

```md
# yoyoosun 部署必需 Secret

以下值必须通过服务器环境变量、Docker Secret、CI Secret 或受控配置文件注入，不允许提交到 Git。

## 必需 Secret

- POSTGRES_PASSWORD
- JWT_SECRET
- ADMIN_INITIAL_PASSWORD
- NPM_TOKEN，如部署构建需要私有 registry
- SMS_PROVIDER_SECRET，如启用短信
- OBJECT_STORAGE_SECRET，如启用对象存储
- BACKUP_ENCRYPTION_KEY，如启用备份加密

## 禁止

- 禁止把真实 secret 写入 .env.example。
- 禁止把真实 .env 提交到 deployments/yoyoosun。
- 禁止在 evidence 中粘贴带 secret 的终端输出。
- 禁止在 runbook 中记录真实 token。
- 禁止在截图中展示 secret。
```

---

## 5.3 不应该放什么

禁止提交：

```text
.env
.env.production
.env.customer-trial
真实 JWT secret
真实数据库密码
真实 admin 密码
真实短信 token
真实 npm token
真实 webhook
真实对象存储 key
真实 Telegram bot token
SSH private key
backup encryption key
```

---

# 6. compose 样例规范

## 6.1 应该放什么

`compose` 目录应该放：

```text
compose/docker-compose.example.yml
compose/docker-compose.override.example.yml
compose/nginx.example.conf
```

用途：

```text
说明 yoyoosun 私有化部署推荐容器结构。
说明 volume 位置。
说明网络端口。
说明 healthcheck。
说明 nginx 反向代理。
说明 env_file 使用方式。
说明 restart policy。
说明日志挂载。
```

---

## 6.2 compose 样例要求

compose 样例中：

```text
可以出现 placeholder。
不能出现真实 secret。
镜像 tag 应该可替换。
volume path 应该清晰。
healthcheck 必须存在。
restart policy 必须存在。
不能硬编码真实域名证书路径。
不能硬编码生产数据库密码。
```

示例关键内容：

```yaml
services:
  server:
    image: plush-erp-server:${RELEASE_VERSION}
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  web:
    image: plush-erp-web:${RELEASE_VERSION}
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
```

---

# 7. Runbook 规范

## 7.1 runbooks/00-overview.md

应包含：

```text
系统架构
服务列表
端口说明
数据目录
备份目录
配置目录
日志位置
依赖组件
部署边界
不承诺能力
敏感信息存放规则
```

不应包含：

```text
私人手机号
真实密码
真实 token
真实数据库 URL
客户 raw file 路径
```

联系人建议写角色：

```text
甲方 IT 负责人
乙方部署负责人
乙方开发负责人
乙方运维负责人
```

---

## 7.2 runbooks/01-first-deploy.md

首次部署 runbook 必须包含：

```text
部署前条件
服务器要求
Docker / Compose 版本
PostgreSQL 要求
磁盘要求
域名和 HTTPS
.env 准备
preflight
migration
system seed
customer seed
import dry-run
import apply
smoke test
evidence 收集
客户验收
```

推荐流程：

```text
1. 确认 release version。
2. 准备 .env。
3. 校验 .env 没有 placeholder。
4. 拉取镜像。
5. 启动数据库。
6. 执行 preflight。
7. 执行 migration status。
8. 执行 migration apply。
9. 执行 system seed。
10. 执行 customer seed。
11. 执行 import dry-run。
12. 确认 dry-run report。
13. 执行数据库备份。
14. 执行 import apply。
15. 执行 post-apply verification。
16. 执行 smoke test。
17. 生成 release evidence。
18. 客户验收。
```

---

## 7.3 runbooks/02-upgrade.md

升级 runbook 必须包含：

```text
升级适用范围
升级前备份
镜像版本
image digest
migration 变化
配置变化
停机窗口
升级命令
升级后 smoke
失败回滚
upgrade evidence
```

推荐流程：

```text
1. 阅读 release notes。
2. 确认 known limitations。
3. 确认客户停机窗口。
4. 备份数据库。
5. 备份 .env fingerprint。
6. 记录旧镜像 digest。
7. 拉取新镜像。
8. 执行 migration status。
9. 执行 migration apply。
10. 重启服务。
11. 执行 smoke test。
12. 生成 upgrade evidence。
13. 客户确认。
```

---

## 7.4 runbooks/03-rollback.md

回滚 runbook 必须区分：

```text
应用版本回滚
数据库回滚
导入回滚
配置回滚
```

必须包含：

```text
什么时候回滚
谁决定回滚
回滚前是否需要保留现场
回滚命令
回滚后验证
回滚 evidence
客户通知方式
```

回滚策略：

```text
应用错误：回滚镜像版本。
配置错误：恢复上一个配置。
migration 错误：优先恢复备份。
导入错误：优先通过 import_batch_id 反向处理；库存和财务用反向事实。
```

注意：

```text
库存和财务事实不建议硬删除。
错误导入应通过反向库存流水、取消财务事实、归档错误业务单据处理。
```

---

## 7.5 runbooks/04-backup-restore.md

备份恢复 runbook 必须包含：

```text
备份范围
备份频率
备份路径
备份加密
备份保留周期
恢复步骤
恢复验证
RPO
RTO
演练频率
失败处理
backup evidence
```

备份范围：

```text
PostgreSQL 数据库
上传附件目录
客户配置包
.env 指纹，不保存真实 secret
release evidence
import reports
```

不应该备份到 Git：

```text
数据库 dump
附件原件
客户 raw files
未加密备份
```

---

## 7.6 runbooks/05-migration.md

migration runbook 必须包含：

```text
当前 migration version
目标 migration version
migration status 命令
migration apply 命令
migration 失败处理
migration 回滚策略
migration evidence 模板
```

必须记录：

```text
执行时间
执行人
执行前版本
执行后版本
输出摘要
失败日志脱敏版
是否回滚
关联 release version
```

不能记录：

```text
完整 DB URL，包含密码。
带敏感字段的 SQL 参数。
客户业务数据明细。
数据库 dump 内容。
```

---

## 7.7 runbooks/06-import-apply.md

客户导入执行 runbook 必须包含：

```text
source manifest
mapping version
dry-run
unresolved queue
客户确认
备份
apply
post-apply verification
import evidence
rollback plan
```

注意：

```text
deployments/yoyoosun 只放导入 runbook 和 report，不放 raw Excel/PDF。
raw files 应放受控外部存储。
导入 apply 前必须有 dry-run report。
导入 apply 前必须备份。
导入必须有 import_batch_id。
```

---

## 7.8 runbooks/07-incident-response.md

故障处理 runbook 应覆盖常见故障：

```text
服务无法启动
数据库连接失败
migration 失败
磁盘满
备份失败
登录失败
权限异常
导入失败
库存数据异常
出货重复扣库存
页面 500
Nginx/HTTPS 问题
短信或通知失败
```

每个故障至少包含：

```text
现象
影响范围
检查命令
临时处理
根因排查
恢复步骤
升级处理
evidence 收集
```

---

## 7.9 runbooks/08-daily-ops.md

日常运维 runbook 应包含：

```text
每日检查
每周检查
每月检查
备份检查
磁盘检查
服务健康检查
日志检查
审计日志抽查
性能 smoke
导入队列检查
异常任务检查
证书有效期检查
```

---

# 8. Checklist 规范

## 8.1 checklists/pre-deploy-checklist.md

部署前检查：

```text
[ ] release version 已固定
[ ] server image digest 已记录
[ ] web image digest 已记录
[ ] .env 已准备
[ ] .env 不含 placeholder
[ ] JWT secret 非 change-this
[ ] DB password 非弱密码
[ ] admin password 非弱密码
[ ] public register 关闭
[ ] SMS mock 关闭
[ ] debug seed 关闭
[ ] debug cleanup 关闭
[ ] SQL args tracing 关闭
[ ] CORS 非 *
[ ] backup path 存在
[ ] PostgreSQL 可连接
[ ] 磁盘空间充足
[ ] migration status 已检查
[ ] 数据库已备份
[ ] rollback plan 已确认
[ ] 客户已确认停机窗口
[ ] known limitations 已确认
```

---

## 8.2 checklists/post-deploy-checklist.md

部署后检查：

```text
[ ] server healthcheck 通过
[ ] web healthcheck 通过
[ ] nginx/https 正常
[ ] 登录成功
[ ] 首页加载成功
[ ] migration version 正确
[ ] seed report 正常
[ ] import report 正常
[ ] smoke test 通过
[ ] 审计日志有记录
[ ] 备份任务正常
[ ] 无明显错误日志
[ ] 生成 release evidence
[ ] 客户确认可访问
```

---

## 8.3 checklists/smoke-test-checklist.md

客户试用 smoke：

```text
[ ] 登录 admin
[ ] 登录普通业务用户
[ ] 首页打开
[ ] 我的待办打开
[ ] 客户列表打开
[ ] 供应商列表打开
[ ] 产品列表打开
[ ] SKU 列表打开
[ ] BOM 列表打开
[ ] 销售订单列表打开
[ ] 采购订单列表打开
[ ] 采购收货列表打开
[ ] 质检任务打开
[ ] 库存余额打开
[ ] 库存流水打开
[ ] 库存预留打开
[ ] 出货单打开
[ ] 应收/应付事实打开
[ ] 审计日志打开
[ ] 权限菜单符合预期
[ ] 不出现 phase8 菜单
[ ] 不出现 demo 数据
[ ] 不出现 test fixture
[ ] 不显示 secret 明文
```

---

## 8.4 checklists/security-checklist.md

安全检查：

```text
[ ] release package 无 secret
[ ] .env 不入库
[ ] .npmrc 不入库
[ ] token 已通过 Secret 注入
[ ] public register 关闭
[ ] 默认 admin 密码已修改
[ ] SMS mock 关闭
[ ] debug cleanup 关闭
[ ] debug seed 关闭
[ ] SQL 参数 tracing 关闭
[ ] HTTPS 正常
[ ] CORS 非 *
[ ] 安全响应头存在
[ ] 日志不打印 token
[ ] 日志不打印 SQL 参数
[ ] 审计日志启用
[ ] 生产配置 preflight 通过
[ ] 禁止真实 secret 出现在 evidence
```

---

## 8.5 checklists/backup-restore-checklist.md

备份恢复检查：

```text
[ ] 备份脚本存在
[ ] 备份路径存在
[ ] 备份文件生成
[ ] 备份 hash 生成
[ ] 备份加密，如启用
[ ] 恢复到测试库成功
[ ] migration version 匹配
[ ] smoke query 成功
[ ] backup-restore-report.json 生成
[ ] 备份文件未提交到 Git
[ ] 恢复演练 evidence 已归档
```

---

## 8.6 checklists/upgrade-checklist.md

升级检查：

```text
[ ] release notes 已阅读
[ ] known limitations 已确认
[ ] 旧镜像 digest 已记录
[ ] 新镜像 digest 已记录
[ ] migration diff 已确认
[ ] 配置变更已确认
[ ] 数据库已备份
[ ] 停机窗口已确认
[ ] 回滚方案已确认
[ ] upgrade smoke test 通过
[ ] upgrade evidence 已生成
```

---

## 8.7 checklists/rollback-checklist.md

回滚检查：

```text
[ ] 回滚原因已记录
[ ] 影响范围已确认
[ ] 是否保留现场已确认
[ ] 使用哪个备份已确认
[ ] 使用哪个旧镜像已确认
[ ] 配置回滚文件已确认
[ ] migration 回滚策略已确认
[ ] 回滚后 smoke test 已执行
[ ] 回滚 evidence 已生成
[ ] 客户已通知
```

---

## 8.8 checklists/weekly-inspection-checklist.md

每周巡检：

```text
[ ] 服务健康
[ ] 容器重启次数
[ ] 磁盘使用率
[ ] 数据库连接数
[ ] 慢查询摘要
[ ] 最近备份状态
[ ] 最近恢复演练状态
[ ] 错误日志摘要
[ ] 登录失败次数
[ ] 未处理导入队列
[ ] 未处理异常任务
[ ] 库存负数检查
[ ] 预留过期检查
[ ] 审计日志抽查
[ ] 证书有效期检查
```

---

## 8.9 checklists/monthly-inspection-checklist.md

每月巡检：

```text
[ ] 完整备份恢复演练
[ ] 权限矩阵复核
[ ] 用户账号复核
[ ] 禁用离职/无效账号
[ ] 磁盘容量趋势
[ ] 数据库膨胀检查
[ ] known limitations 更新
[ ] release evidence 归档
[ ] 导入报告归档
[ ] 安全配置复核
[ ] 异常库存复核
[ ] 业务闭环 smoke 复核
```

---

# 9. Evidence 规范

## 9.1 evidence/README.md

应说明：

```text
evidence 用来记录什么
evidence 不能记录什么
版本、hash、状态如何记录
secret 如何脱敏
备份文件为什么不放 Git
截图如何脱敏
日志如何脱敏
```

---

## 9.2 release evidence

每次发布目录：

```text
evidence/releases/<date>/
```

建议文件：

```text
release-evidence.md
image-digests.txt
migration-status.txt
config-fingerprint.txt
smoke-test-report.json
security-scan-report.json
backup-restore-report.json
known-limitations.md
acceptance-checklist.md
```

---

## 9.3 release-evidence.md 模板

内容：

```md
# yoyoosun Release Evidence

## 基本信息

- customerCode: yoyoosun
- releaseVersion:
- releaseDate:
- operator:
- environment:
- serverImage:
- serverImageDigest:
- webImage:
- webImageDigest:
- gitCommit:
- migrationBefore:
- migrationAfter:

## 配置指纹

- envFingerprint:
- customerConfigFingerprint:
- menuConfigFingerprint:
- permissionConfigFingerprint:

注意：这里只记录 hash，不记录真实 secret。

## 执行结果

- preflight:
- migration:
- seed:
- import:
- smoke:
- security scan:
- backup restore:

## 已知限制

- limitation 1:
- limitation 2:

## 回滚信息

- previousReleaseVersion:
- backupId:
- rollbackRunbook:
```

---

## 9.4 migration evidence

记录：

```text
执行时间
执行人
执行前版本
执行后版本
命令摘要
输出摘要
错误摘要
是否回滚
关联 release version
```

不能记录：

```text
完整 DB URL，包含密码。
带敏感字段的 SQL 参数。
客户业务数据明细。
数据库 dump 内容。
```

---

## 9.5 backup evidence

只记录：

```text
backup id
backup time
backup size
backup hash
backup storage location alias
restore test status
operator
retention policy
encryption enabled
```

不记录：

```text
备份文件本体
真实存储 access key
真实下载链接
数据库 dump
附件原件
```

---

## 9.6 smoke evidence

记录：

```text
测试项
状态
时间
环境
版本
失败原因
截图，如已脱敏
```

截图可以放，但必须脱敏：

```text
手机号遮挡
地址遮挡
金额遮挡或汇总
token 删除
密码删除
个人姓名按角色替代
客户敏感订单号遮挡
```

---

# 10. Reports 规范

`reports/` 可以保存最新报告或模板：

```text
latest-preflight-report.json
latest-smoke-test-report.json
latest-backup-restore-report.json
latest-weekly-inspection-report.json
```

要求：

```text
报告必须脱敏。
报告不能包含 secret。
报告不能包含大规模客户业务明细。
报告可以包含汇总数量、状态、hash、版本。
```

---

# 11. scripts 规范

`deployments/yoyoosun/scripts/` 只能放客户部署辅助脚本，且不应复制通用逻辑。

适合放：

```text
verify-env.sh
run-smoke.sh
collect-evidence.sh
verify-backup-restore.sh
```

不适合放：

```text
完整通用部署框架
大量业务导入逻辑
数据库迁移实现
硬编码 secret 的脚本
带客户 raw path 的脚本
私有 token
数据库 dump 处理脚本中的真实路径
```

通用脚本应该放：

```text
scripts/deploy/
scripts/customer/
scripts/qa/
```

`deployments/yoyoosun/scripts/` 应该只是 thin wrapper。

---

# 12. 哪些不该放在 deployments/yoyoosun

## 12.1 绝对禁止

```text
真实 .env
真实 JWT secret
真实 DB password
真实 admin password
真实 npm token
真实 Telegram bot token
SSH private key
数据库 dump
生产备份文件
客户 raw Excel/PDF/JPG/PNG
包含客户敏感数据的完整日志
未脱敏截图
包含 token 的 curl 命令输出
长期有效下载链接
对象存储 access key
备份加密 key
```

---

## 12.2 不建议放

```text
大体积构建产物
node_modules
dist
coverage
临时 debug 输出
本机路径
个人联系方式
客户合同
报价单
发票
客户隐私资料
生产数据库连接串
IDE 配置
临时压缩包
```

---

## 12.3 可以放但必须脱敏

```text
smoke test screenshot
error log excerpt
migration output
import report summary
backup report
customer signoff summary
deployment evidence
```

脱敏要求：

```text
手机号遮挡
地址遮挡
金额遮挡或汇总
token 删除
密码删除
个人姓名按角色替代
客户敏感订单号遮挡
内网 IP 按需遮挡
主机名按需遮挡
```

---

# 13. 部署测试流程

## 13.1 本地验证

本地验证应做：

```text
1. 读取 env/.env.example。
2. 校验必需变量存在。
3. 校验没有真实 secret。
4. 校验 compose 样例可解析。
5. 校验 runbook 链接有效。
6. 校验 checklist 存在。
7. 校验 evidence 模板存在。
8. 校验禁止文件不存在。
```

建议命令：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
```

---

## 13.2 staging 验证

staging 验证流程：

```text
1. 准备 staging .env。
2. 运行 production-like preflight。
3. 启动服务。
4. 执行 migration。
5. 执行 seed。
6. 执行 import dry-run。
7. 执行 smoke。
8. 执行 backup restore drill。
9. 生成 evidence。
10. 记录 known limitations。
```

---

## 13.3 customer-trial 验证

customer-trial 验证流程：

```text
1. 使用客户确认的数据。
2. 禁止 demo seed。
3. 禁止 test fixture。
4. 禁止 mock SMS。
5. 禁止 SQL args tracing。
6. 执行 preflight。
7. 执行备份。
8. 执行 migration。
9. 执行导入 apply。
10. 执行 smoke。
11. 生成 delivery report。
12. 客户签收。
```

---

# 14. 部署命令模板

## 14.1 preflight

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh \
  --env-file /secure/path/yoyoosun/.env
```

注意：

```text
/secure/path/yoyoosun/.env 不应该提交到 Git。
```

---

## 14.2 启动

示例：

```bash
docker compose \
  -f deployments/yoyoosun/compose/docker-compose.example.yml \
  --env-file /secure/path/yoyoosun/.env \
  up -d
```

---

## 14.3 migration

如果项目支持 server CLI，可以使用：

```bash
docker compose exec server ./erp-server migrate status
docker compose exec server ./erp-server migrate apply
```

如果当前项目还没有这样的 server CLI，应在 runbook 中记录实际命令。

---

## 14.4 smoke

示例：

```bash
bash deployments/yoyoosun/scripts/run-smoke.sh \
  --endpoint https://erp.example.com \
  --customer yoyoosun \
  --report deployments/yoyoosun/reports/latest-smoke-test-report.json
```

注意：

```text
endpoint 示例不能包含真实 token。
生产 smoke 不应该创建正式业务事实。
如需写入，只能创建 SMOKE_TEST 草稿并清理或作废。
```

---

## 14.5 evidence 收集

示例：

```bash
bash deployments/yoyoosun/scripts/collect-evidence.sh \
  --release-version <version> \
  --output deployments/yoyoosun/evidence/releases/<date>/
```

---

# 15. 巡检规范

## 15.1 每日巡检

每日检查：

```text
[ ] server healthcheck
[ ] web healthcheck
[ ] database health
[ ] 磁盘使用率
[ ] 最近错误日志
[ ] 最近备份状态
[ ] 未处理异常任务
[ ] 登录失败异常
[ ] 关键队列是否积压
```

---

## 15.2 每周巡检

每周检查：

```text
[ ] 备份恢复抽查
[ ] 慢查询摘要
[ ] 审计日志抽查
[ ] 库存负数检查
[ ] 库存预留过期检查
[ ] 导入 unresolved queue 检查
[ ] 任务积压检查
[ ] 证书有效期检查
[ ] 容器镜像版本检查
[ ] 磁盘增长趋势
[ ] 最近 7 天错误日志摘要
```

---

## 15.3 每月巡检

每月检查：

```text
[ ] 完整备份恢复演练
[ ] 权限矩阵复核
[ ] 用户账号复核
[ ] 禁用离职/无效账号
[ ] 磁盘容量趋势
[ ] 数据库膨胀检查
[ ] known limitations 更新
[ ] release evidence 归档
[ ] 导入报告归档
[ ] 安全配置复核
[ ] 异常库存复核
[ ] 业务闭环 smoke 复核
```

---

# 16. 自动化校验建议

建议新增：

```text
scripts/deploy/deployment-package-lint.mjs
```

校验：

```text
deployments/yoyoosun/env/.env.example 存在
deployments/yoyoosun/env/secrets.required.md 存在
deployments/yoyoosun/compose/docker-compose.example.yml 存在
deployments/yoyoosun/runbooks/*.md 存在
deployments/yoyoosun/checklists/*.md 存在
deployments/yoyoosun/evidence/README.md 存在
没有 .env
没有 *.key
没有 *.pem
没有 *.sql
没有 *.dump
没有真实 token pattern
没有 node_modules
没有 dist
没有 coverage
没有客户 raw Excel/PDF/JPG/PNG
```

---

# 17. 部署资料包 lint 规则

## 17.1 必须存在

```text
deployments/yoyoosun/README.md
deployments/yoyoosun/env/.env.example
deployments/yoyoosun/env/secrets.required.md
deployments/yoyoosun/compose/docker-compose.example.yml
deployments/yoyoosun/runbooks/01-first-deploy.md
deployments/yoyoosun/runbooks/02-upgrade.md
deployments/yoyoosun/runbooks/03-rollback.md
deployments/yoyoosun/runbooks/04-backup-restore.md
deployments/yoyoosun/checklists/pre-deploy-checklist.md
deployments/yoyoosun/checklists/post-deploy-checklist.md
deployments/yoyoosun/checklists/smoke-test-checklist.md
deployments/yoyoosun/checklists/security-checklist.md
deployments/yoyoosun/evidence/README.md
```

---

## 17.2 必须禁止

```text
deployments/yoyoosun/**/*.env
deployments/yoyoosun/**/*.pem
deployments/yoyoosun/**/*.key
deployments/yoyoosun/**/*.sql
deployments/yoyoosun/**/*.dump
deployments/yoyoosun/**/node_modules/**
deployments/yoyoosun/**/dist/**
deployments/yoyoosun/**/coverage/**
deployments/yoyoosun/**/*.xlsx
deployments/yoyoosun/**/*.xls
deployments/yoyoosun/**/*.pdf
deployments/yoyoosun/**/*.jpg
deployments/yoyoosun/**/*.png
```

例外：

```text
sanitized sample 可以放到 customers/yoyoosun/import/samples，不建议放 deployments。
```

---

# 18. 客户交付报告模板

每次客户试用或生产部署应生成：

```text
customer-delivery-report.md
```

模板：

```md
# yoyoosun 客户交付报告

## 基本信息

- customerCode: yoyoosun
- releaseVersion:
- serverImage:
- webImage:
- gitCommit:
- deployTime:
- environment:
- operator:

## 配置结果

- env fingerprint:
- customer config fingerprint:
- menu config fingerprint:
- permission config fingerprint:
- feature flags:
- preflight status:

## Migration 结果

- before version:
- after version:
- migration status:
- evidence:

## Seed 结果

- seed status:
- created:
- updated:
- skipped:
- failed:

## 导入结果

- import batch:
- source count:
- row count:
- created:
- updated:
- skipped:
- failed:
- unresolved:
- blocking errors:

## 验证结果

- smoke test:
- security scan:
- backup restore:
- audit log:
- permission check:

## 已知限制

- limitation 1:
- limitation 2:

## 回滚方案

- backup id:
- previous release:
- rollback runbook:
- rollback owner:

## 客户签收

- signer:
- signedAt:
- remarks:
```

---

# 19. Codex 任务拆分

## YOYOOSUN-DEPLOY-01：建立部署资料包结构

任务说明：

```text
建立 deployments/yoyoosun 标准目录结构。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-01：建立 deployments/yoyoosun 部署资料包结构。

要求：
1. 创建 env、compose、runbooks、checklists、evidence、reports、scripts 子目录。
2. 增加 README.md。
3. 增加 evidence/README.md。
4. 不要提交真实 secret、真实 .env、客户 raw files、数据库备份。
5. 所有示例使用 placeholder。
6. 输出新增文件列表。
```

验收标准：

```text
目录结构存在。
README 存在。
不包含敏感文件。
```

---

## YOYOOSUN-DEPLOY-02：补 env 和 compose 样例

任务说明：

```text
补齐部署环境变量样例和 compose 样例。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-02：补 env 和 compose 样例。

要求：
1. 增加 env/.env.example。
2. 增加 env/secrets.required.md。
3. 增加 compose/docker-compose.example.yml。
4. 增加 compose/docker-compose.override.example.yml。
5. 增加 compose/nginx.example.conf。
6. 所有 secret 必须是 placeholder。
7. 不允许出现真实 token、真实密码、真实域名凭证。
8. compose 样例必须包含 healthcheck 和 restart policy。
```

验收标准：

```text
env example 完整。
secrets.required.md 说明清楚。
compose 可读。
无真实 secret。
```

---

## YOYOOSUN-DEPLOY-03：补部署 runbook

任务说明：

```text
补齐首次部署、升级、回滚、备份恢复等 runbook。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-03：补部署 runbook。

要求：
1. 在 deployments/yoyoosun/runbooks 下增加：
   - 00-overview.md
   - 01-first-deploy.md
   - 02-upgrade.md
   - 03-rollback.md
   - 04-backup-restore.md
   - 05-migration.md
   - 06-import-apply.md
   - 07-incident-response.md
   - 08-daily-ops.md
2. 内容必须包含步骤、前置条件、失败处理和 evidence 要求。
3. 不要写真实服务器地址、密码、token。
4. 所有命令使用 placeholder。
```

验收标准：

```text
runbook 文件齐全。
每份都有步骤和失败处理。
无敏感信息。
```

---

## YOYOOSUN-DEPLOY-04：补 checklists

任务说明：

```text
补齐部署、升级、回滚、巡检 checklist。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-04：补部署检查清单。

要求：
1. 在 deployments/yoyoosun/checklists 下增加：
   - pre-deploy-checklist.md
   - post-deploy-checklist.md
   - smoke-test-checklist.md
   - security-checklist.md
   - backup-restore-checklist.md
   - upgrade-checklist.md
   - rollback-checklist.md
   - weekly-inspection-checklist.md
   - monthly-inspection-checklist.md
2. 清单必须可直接用于客户试用前验收。
3. security checklist 必须覆盖 public register、SMS mock、debug seed、debug cleanup、SQL args tracing。
4. smoke checklist 必须覆盖核心菜单页面。
```

验收标准：

```text
checklist 文件齐全。
覆盖安全、备份、smoke、巡检。
可直接执行。
```

---

## YOYOOSUN-DEPLOY-05：补 evidence 模板

任务说明：

```text
补齐 release evidence、migration evidence、backup evidence 模板。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-05：补 evidence 模板。

要求：
1. 增加 evidence/releases/<date>/ 模板或 README。
2. 增加 release-evidence.md 模板。
3. 增加 migration evidence 模板。
4. 增加 backup evidence 模板。
5. 增加 smoke report example。
6. 只记录 hash、版本、状态，不记录真实 secret。
7. 不提交真实备份或真实截图。
```

验收标准：

```text
evidence 模板齐全。
无 secret。
记录内容可用于客户交付审计。
```

---

## YOYOOSUN-DEPLOY-06：部署资料包 lint

任务说明：

```text
增加自动化 lint，防止 deployments/yoyoosun 放入不该放的内容。
```

Codex 提示词：

```text
请完成 YOYOOSUN-DEPLOY-06：部署资料包 lint。

要求：
1. 新增 scripts/deploy/deployment-package-lint.mjs。
2. 校验 deployments/yoyoosun 必需文件存在。
3. 禁止 .env、*.pem、*.key、*.sql、*.dump、真实 token pattern。
4. 禁止 node_modules、dist、coverage。
5. 禁止客户 raw Excel/PDF/JPG/PNG。
6. 将测试加入 node --test scripts/**/*.test.mjs 或 qa strict。
7. 输出清晰错误。
```

验收标准：

```text
deployment-package-lint 可运行。
发现敏感文件会失败。
CI 可集成。
```

---

# 20. 人工 Review 清单

每次修改 `deployments/yoyoosun/` 必须检查：

```text
[ ] 是否提交了真实 .env。
[ ] 是否提交了真实 password/token/secret。
[ ] 是否提交了 SSH key。
[ ] 是否提交了数据库 dump 或备份文件。
[ ] 是否提交了客户 raw Excel/PDF/图片。
[ ] 是否提交了未脱敏截图。
[ ] runbook 是否可执行。
[ ] rollback 是否明确。
[ ] backup restore 是否有步骤。
[ ] smoke test 是否覆盖核心页面。
[ ] evidence 是否记录版本和 hash。
[ ] evidence 是否避免记录 secret。
[ ] env.example 是否完整。
[ ] compose example 是否有 healthcheck。
[ ] security checklist 是否包含 public register、SMS mock、debug seed、debug cleanup、SQL args tracing。
[ ] 巡检清单是否包含备份、磁盘、日志、审计、库存异常。
[ ] 文档是否没有依赖个人本机路径。
[ ] 是否没有放客户合同、报价单、发票。
[ ] 是否没有放生产连接串。
[ ] 是否没有放长期有效下载链接。
[ ] 是否没有放真实域名证书和私钥。
```

---

# 21. 完成定义

`deployments/yoyoosun` 资料包完成后，应满足：

```text
[ ] 标准目录结构存在。
[ ] README.md 存在。
[ ] env/.env.example 存在。
[ ] env/secrets.required.md 存在。
[ ] compose 样例存在。
[ ] 首次部署 runbook 存在。
[ ] 升级 runbook 存在。
[ ] 回滚 runbook 存在。
[ ] 备份恢复 runbook 存在。
[ ] migration runbook 存在。
[ ] import apply runbook 存在。
[ ] incident response runbook 存在。
[ ] daily ops runbook 存在。
[ ] pre/post deploy checklist 存在。
[ ] smoke/security/backup checklist 存在。
[ ] weekly/monthly inspection checklist 存在。
[ ] release evidence 模板存在。
[ ] migration/backup/smoke evidence 模板存在。
[ ] deployment-package-lint 存在。
[ ] 无真实 secret。
[ ] 无真实 .env。
[ ] 无客户 raw files。
[ ] 无数据库备份。
[ ] 无未脱敏截图。
[ ] 可用于客户试用交付。
```

---

# 22. 最短落地顺序

建议按这个顺序补齐：

```text
1. YOYOOSUN-DEPLOY-01 建立目录结构。
2. YOYOOSUN-DEPLOY-02 env 和 compose 样例。
3. YOYOOSUN-DEPLOY-03 runbooks。
4. YOYOOSUN-DEPLOY-04 checklists。
5. YOYOOSUN-DEPLOY-05 evidence 模板。
6. YOYOOSUN-DEPLOY-06 部署资料包 lint。
```

完成后，`deployments/yoyoosun` 会从“资料堆放目录”变成“可执行的私有化交付包”。

---

# 23. 最终原则

一句话：

```text
deployments/yoyoosun 只放可交付、可复现、已脱敏的部署资料，不放任何真实 secret、raw data 或生产备份。
```

更具体：

```text
runbook 要能执行。
env 只能是 example。
backup 只放报告，不放备份。
evidence 只放版本、hash、结果，不放敏感值。
巡检清单要覆盖安全、备份、日志、审计、库存异常。
部署资料包必须能被自动化 lint。
```
