# QA 脚本说明

本文档只说明当前仓库仍在使用的本地脚本和推荐执行顺序。

## 总览

| 脚本                                                   | 主要作用                                                                                                          | 建议时机                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `scripts/bootstrap.sh`                                 | 安装依赖、启用 hooks、跑快速自检                                                                                  | 新机器 / 首次拉仓库                                        |
| `scripts/project-scan.sh`                              | 扫描项目名、默认密钥、部署地址和页面文案残留                                                                      | 改名后 / 配置收口后                                        |
| `scripts/seed-role-demo-admins.sh`                     | 显式生成 dev/test/demo 角色演示管理员账号，绑定真实 RBAC 角色                                                     | 需要多角色登录 / 岗位任务端验收                            |
| `scripts/seed-phase7-sim-masterdata.sh`                | 显式生成 Phase 7 模拟产品 / 单位主数据，供模拟销售订单行引用                                                      | Phase 7 试用环境演练前                                     |
| `scripts/import/customerSourceSnapshotFreezeCheck.mjs` | customer source snapshot freeze checker，只读取 JSON snapshot 并生成 freeze evidence                              | yoyoosun 导入前 source freeze / 人工 review evidence       |
| `scripts/import/customerImportDryRun.mjs`              | 永绅 yoyoosun 客户导入 dry-run CLI，只读取 JSON snapshot 并生成预览包                                             | yoyoosun 导入前人工 review / 数据映射检查                  |
| `scripts/import/customerImportExecute.mjs`             | 永绅 yoyoosun 导入 execution loader 报告 / 门禁工具；Phase 7 不执行真实导入                                       | import tooling 自检 / 非 Phase 7 的单独数据治理评审        |
| `scripts/qa/phase7-simulated-trial-data.mjs`           | Phase 7 模拟试用数据入口，只创建标记为模拟的 V1 客户 / 供应商 / 联系人 / 销售订单数据                             | Phase 7 试用环境演练                                       |
| `scripts/qa/phase8-simulated-fact-closure.mjs`         | Phase 8 模拟事实闭环入口，只使用显式模拟主数据覆盖生产 / 预留 / 委外 / 出货 / 财务链路                            | Phase 8 内部模拟验收 / 目标环境事实闭环回归                |
| `scripts/qa/phase9-simulated-mobile-closure.mjs`       | Phase 9 模拟岗位任务闭环入口，只创建和更新显式模拟 workflow 任务，覆盖审批 / 质检 / 入库 / 出货放行异常和现场留痕 | Phase 9 岗位任务端回归 / 目标环境移动任务闭环验收          |
| `scripts/qa/industry-template-boundaries.mjs`          | Phase 10 行业模板候选边界检查，确保模板不变成 tenant、runtime loader、真实导入或事实写入入口                      | Phase 10 行业模板调整后                                    |
| `scripts/qa/phase10-industry-template-closure.mjs`      | Phase 10 行业模板模拟闭环入口，只读取候选配置并生成 evidence 报告                                                | Phase 10 行业模板回归 / 目标环境发布前                     |
| `scripts/qa/private-deployment-boundaries.mjs`         | Phase 11 多客户私有化复制边界检查，确保客户包模板不变成 SaaS、tenant、代码分叉或真实导入入口                     | Phase 11 私有化客户包模板调整后                            |
| `scripts/qa/phase11-private-deployment-closure.mjs`     | Phase 11 多客户私有化复制模拟闭环入口，只读取模板并生成 evidence 报告                                           | Phase 11 私有化客户包回归 / 目标环境发布前                 |
| `scripts/phase2b-pg.sh`                                | Phase 2B BOM + 批次库存本地 PostgreSQL migration / 集成测试防呆入口                                               | 验证 Phase 2B schema 和批次库存行为                        |
| `scripts/phase2c-pg.sh`                                | Phase 2C 采购入库本地 PostgreSQL migration / 集成测试防呆入口                                                     | 验证采购入库 schema、IN 入库、REVERSAL 取消和批次追溯      |
| `scripts/phase2d-pg.sh`                                | Phase 2D-A 采购退货本地 PostgreSQL migration / 集成测试防呆入口                                                   | 验证采购退货 schema、OUT 扣减、REVERSAL 回补和批次并发扣减 |
| `scripts/doctor.sh`                                    | 检查本机依赖和 hooks 是否齐全                                                                                     | 环境初始化 / 异常排查                                      |
| `scripts/qa/fast.sh`                                   | 高频快速检查，包含客户导入和 Phase 7 模拟数据工具测试                                                             | 日常开发                                                   |
| `scripts/qa/trial-account-rbac.mjs`                    | 只读验证角色演示账号的真实登录、角色、岗位任务端入口权限和 debug 权限边界                                         | 生成试用 / 演示账号后                                      |
| `scripts/qa/customer-config-boundaries.mjs`            | 只读验证 customer config 草案仍是 draft，未放开 runtime / schema / import / RBAC 边界                             | 调整客户配置草案后                                         |
| `scripts/qa/erp-field-linkage.mjs`                     | 字段联动专项测试并刷新 latest 覆盖报告                                                                            | 改字段真源、保存转换、合同金额、打印快照后                 |
| `scripts/qa/full.sh`                                   | 全量检查，包含客户导入和 Phase 7 模拟数据工具测试                                                                 | 提交前 / 推送前                                            |
| `scripts/qa/strict.sh`                                 | 严格检查，包含客户导入和 Phase 7 模拟数据工具测试                                                                 | 发版前                                                     |
| `scripts/qa/db-guard.sh`                               | 约束 schema 变更必须带 migration                                                                                  | 改数据模型后                                               |
| `scripts/qa/error-code-sync.sh`                        | 校验前后端错误码同步                                                                                              | 改错误码后                                                 |
| `scripts/qa/error-codes.sh`                            | 阻止业务代码裸写已注册错误码                                                                                      | 改接口 / 鉴权 / 前端错误处理后                             |
| `scripts/qa/shellcheck.sh`                             | 检查 shell 脚本                                                                                                   | 调整脚本后                                                 |
| `scripts/qa/shfmt.sh`                                  | 统一 shell 格式                                                                                                   | 调整脚本后                                                 |
| `scripts/qa/go-vet.sh`                                 | 执行 Go vet                                                                                                       | 改 Go 代码后                                               |
| `scripts/qa/golangci-lint.sh`                          | 执行 golangci-lint                                                                                                | 改 Go 代码后                                               |
| `scripts/qa/yamllint.sh`                               | 检查 YAML 语法与风格                                                                                              | 改 YAML 后                                                 |
| `scripts/qa/govulncheck.sh`                            | 扫描 Go 可达漏洞                                                                                                  | 推送前 / 发版前                                            |

前端浏览器级样式回归不在 `scripts/qa` 下，统一执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
```

如需按真实管理员登录流程回归合同编辑与在线预览时延，再执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

## 推荐顺序

### 0. 导入冻结与 dry-run 工具 / Import freeze and dry-run tooling

customer source snapshot freeze checker 只使用 Node.js 内置模块，不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`，也不执行真实导入。

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

输出目录会生成：

```text
freeze-metadata.json
freeze-check-summary.json
freeze-check-report.md
```

`freeze-metadata.json` 中 `noRealImport` 必须为 `true`，`canExecuteRealImport` 必须为 `false`。该脚本是 freeze evidence tooling，不是 runtime loader，不是 import approval。

永绅 yoyoosun 客户导入 dry-run 只使用 Node.js 内置模块，不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`。

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

输出目录会生成：

```text
source-references.json
normalized-rows.json
candidates.json
unresolved-queue.json
duplicates.json
conflicts.json
forbidden-auto-import.json
validation-summary.json
dry-run-report.md
```

`validation-summary.json` 中 `canExecuteRealImport` 永远为 `false`。该脚本是 import QA / preview tooling，不是 runtime loader。

real dry-run evidence 使用 freeze fixtures：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/real-dry-run-evidence \
  --format json,md
```

`output/customers/yoyoosun/source-snapshot-freeze/` 和 `output/customers/yoyoosun/real-dry-run-evidence/` 是本地 evidence 输出，不纳入 git；它们仍不是 import approval。

真实执行器已提供受控报告模式，默认不调用后端：

```bash
node scripts/import/customerImportExecute.mjs \
  --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
  --approval scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json \
  --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
  --out output/customers/yoyoosun/import-execution
```

该命令会生成 `import-execution-report.json` 和 `import-execution-report.md`，并校验 approval、backup evidence、unresolved block、forbidden auto-import 和 supported target。没有 `--execute` 时不会连接数据库或后端。

当前 Phase 7 没有可执行客户真实数据，不使用该 loader 执行真实导入。即使未来另开数据治理评审，真实写入也只能显式开启，并且只走 JSON-RPC V1 API，不直接写表、不写 `business_records`、不生成 schema / migration，也不创建出货、库存或财务事实：

```bash
CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT \
CUSTOMER_IMPORT_ADMIN_USERNAME='admin' \
CUSTOMER_IMPORT_ADMIN_PASSWORD='replace-with-password' \
  node scripts/import/customerImportExecute.mjs \
    --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
    --approval output/customers/yoyoosun/import-approval.json \
    --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
    --out output/customers/yoyoosun/import-execution \
    --backend-url http://127.0.0.1:8300 \
    --execute
```

执行前必须已有客户确认、数据库备份、rollback / forward-fix 方案和目标环境信息；不要把 fixture approval 当真实客户批准。Phase 7 不满足这些条件，不能执行该真实写入命令。

Phase 7 只允许模拟数据试用。先生成报告，确认模拟数据边界：

```bash
node scripts/qa/phase7-simulated-trial-data.mjs \
  --out output/customers/yoyoosun/phase7-simulated-trial
```

若要把模拟数据写入本地或目标试用环境，只能显式 `--apply`，并提供已有活跃产品和单位 ID。该脚本会先按稳定模拟编号查找已有记录，缺失才通过 V1 JSON-RPC 创建；它不执行真实 import，不写 `business_records`，不生成 schema / migration，也不创建出货、库存或财务事实：

如果当前环境没有可引用的活跃产品 / 单位，可先 seed Phase 7 模拟主数据。该 seed 只写 `units` 和 `products` 两个 MasterData 表，编码固定带 `SIM-YOYOOSUN-PHASE7` 前缀，不写客户、供应商、联系人、销售订单、`business_records`、库存、出货或财务事实：

```bash
bash scripts/seed-phase7-sim-masterdata.sh
```

输出中的 `unit_id` 和 `product_id` 可传给后续模拟数据脚本。

```bash
PHASE7_SIM_CONFIRM=APPLY_SIMULATED_PHASE7_DATA \
PHASE7_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/phase7-simulated-trial-data.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --out output/customers/yoyoosun/phase7-simulated-trial
```

默认岗位账号模式会用 `demo_sales` 写客户、联系人和销售订单，用 `demo_purchase` 写供应商和供应商联系人。若目标环境提供了具备全部 V1 权限的账号，也可以改用 `PHASE7_SIM_ADMIN_TOKEN` 或 `PHASE7_SIM_ADMIN_USERNAME` / `PHASE7_SIM_ADMIN_PASSWORD`。

Phase 8 只允许模拟事实闭环验收，不执行真实客户数据导入。先生成报告，确认模拟范围：

```bash
node scripts/qa/phase8-simulated-fact-closure.mjs \
  --product-id 1 \
  --unit-id 1 \
  --warehouse-id 1 \
  --out output/customers/yoyoosun/phase8-simulated-fact-closure
```

若要写入本地或目标试用环境，只能显式 `--apply`，并提供已有模拟产品、单位和仓库 ID。该脚本使用 `demo_pmc`、`demo_purchase`、`demo_warehouse` 和 `demo_finance` 角色账号覆盖生产、库存预留、委外、出货和财务五条 Phase 8 最小事实链；所有编号固定带 `SIM-YOYOOSUN-PHASE8` 前缀，不写真实客户数据，不执行 import，不绕过 `Phase8Usecase` 直接写事实表：

```bash
PHASE8_SIM_CONFIRM=APPLY_SIMULATED_PHASE8_FACTS \
PHASE8_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/phase8-simulated-fact-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --warehouse-id 1 \
    --run-id target-yyyymmdd-closure \
    --out output/customers/yoyoosun/phase8-simulated-fact-closure-target
```

Phase 9 只允许模拟岗位任务闭环验收，不执行真实客户数据导入，也不写生产、出货、库存、预留或财务事实。先生成报告，确认模拟范围：

```bash
node scripts/qa/phase9-simulated-mobile-closure.mjs \
  --out output/customers/yoyoosun/phase9-simulated-mobile-closure
```

若要写入本地或目标试用环境，只能显式 `--apply`。该脚本使用 `demo_pmc` 创建 `SIM-YOYOOSUN-PHASE9` 模拟 workflow 任务，再用 `demo_boss`、`demo_quality` 和 `demo_warehouse` 分别处理老板审批、成品抽检、仓库入库确认、出货放行异常上报和现场留痕 evidence；它不执行真实 import，不写 `business_records`，不生成 schema / migration，也不绕过 `WorkflowUsecase` 或 Phase 8 fact usecase：

```bash
PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS \
PHASE9_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/phase9-simulated-mobile-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --run-id target-yyyymmdd-mobile \
    --out output/customers/yoyoosun/phase9-simulated-mobile-closure-target
```

Phase 10 只允许行业模板候选模拟闭环验收，不执行真实客户数据导入，不写业务表，不把单客户样本直接升成行业默认。先运行边界守卫：

```bash
node scripts/qa/industry-template-boundaries.mjs
```

再生成本地 evidence 报告：

```bash
node scripts/qa/phase10-industry-template-closure.mjs \
  --out output/customers/yoyoosun/phase10-industry-template-closure
```

Phase 11 只允许多客户私有化复制包模拟闭环验收，不创建真实客户目录，不执行真实客户数据导入，不复制核心 schema / migration / usecase / RBAC，也不在目标服务器构建。先运行边界守卫：

```bash
node scripts/qa/private-deployment-boundaries.mjs
```

再生成本地 evidence 报告：

```bash
node scripts/qa/phase11-private-deployment-closure.mjs \
  --out output/customers/yoyoosun/phase11-private-deployment-closure
```

`SIM-PRIVATE-PHASE11` 只是模拟 customer key，不得创建为正式 `docs/customers/`、`config/customers/` 或 `deployments/` 目录。真实新增客户前必须先确认稳定 customer key、客户资料入仓边界、导入 dry-run / unresolved queue、部署地址、备份恢复和验收清单。

### 1. 初始化环境

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
```

### 2. 收口默认占位和配置

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

### 2A. 生成角色演示账号

角色演示账号只服务开发 / 验收登录测试，不写入 `server/configs/*/config.yaml`，也不是客户配置包。脚本会先确保内置 RBAC 权限和角色已 seed，再创建或更新以下账号并绑定真实角色：

| 账号              | 角色         |
| ----------------- | ------------ |
| `demo_boss`       | `boss`       |
| `demo_sales`      | `sales`      |
| `demo_purchase`   | `purchase`   |
| `demo_production` | `production` |
| `demo_warehouse`  | `warehouse`  |
| `demo_quality`    | `quality`    |
| `demo_finance`    | `finance`    |
| `demo_pmc`        | `pmc`        |
| `demo_admin`      | `admin`      |

默认不生成 `debug_operator` 账号；如确需调试权限账号，必须显式加 `--include-debug`，此时会额外生成 `demo_debug`。

```bash
ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' \
  bash /Users/simon/projects/plush-toy-erp/scripts/seed-role-demo-admins.sh
```

已有账号重跑时会恢复 `disabled=false`、`is_super_admin=false` 和对应单一角色绑定；默认不重置已有账号密码。如需统一重置演示账号密码：

```bash
ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' \
  bash /Users/simon/projects/plush-toy-erp/scripts/seed-role-demo-admins.sh --reset-password
```

脚本默认拒绝 `configs/prod` 或 `APP_ENV / ERP_ENV / GO_ENV=prod|production`，除非显式传 `--allow-prod`。常规开发和验收不要对生产库执行该脚本。

生成或重置演示账号后，可执行只读核对。该脚本不创建账号、不改密码、不写数据库，只通过真实 `/rpc/auth` 登录和 `me` 返回校验角色、`mobile.<role>.access`、`debug.*` 权限、`is_super_admin` 和 `disabled` 边界：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs
```

如需核对其他后端地址：

```bash
TRIAL_ACCOUNT_BACKEND_URL='http://127.0.0.1:8300' \
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs
```

需要用真实浏览器核对桌面菜单、岗位任务端和无岗位权限拒绝态时，先确认后端已启动，再执行：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:trial-demo-browser
```

该浏览器回归会自动启动单端口桌面 Vite，并使用 yoyoosun 菜单配置；如需核对已启动前端地址，可设置 `TRIAL_BROWSER_SMOKE_BASE_URL`。

如只核对岗位任务端登录后回跳和生产单端口路由，执行：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:mobile-auth-login-route
```

该回归默认验证 `/m/<role>/tasks`，与当前生产 `web-desktop` 单容器主路径一致。旧的 `mobile-*` 多实例 `/tasks` 路径仅用于本地兼容调试，需要显式设置 `MOBILE_AUTH_SMOKE_LEGACY_MULTI_APP=1`。

### 2B. Customer Config 草案边界检查

调整 yoyoosun 字段显示、编号规则或其他 customer config 草案后，执行：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-boundaries.mjs
```

该脚本只读取 `config/customers/yoyoosun/fieldNumberingConfig.mjs`，验证其仍为 draft，`runtimeEnabled=false`，且不放开 tenant、schema、migration、后端 RBAC、Workflow / Fact 或真实导入边界。脚本不连接数据库、不调用后端、不写配置。

### 3. 日常开发检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

前端样式任务额外执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

字段联动、残值、缺值或打印快照字段改动后额外执行：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/erp-field-linkage.mjs
```

### 4. 提交前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

### 5. 发版前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh
```

## 关键说明

### `bootstrap.sh`

- 安装 `web` 和 `server` 依赖
- 安装 Git hooks
- 默认执行一次 `scripts/qa/fast.sh`

### `project-scan.sh`

- 检查项目名、服务名、镜像名和页面标题占位
- 检查默认密码、JWT 密钥、数据库名、远端主机等示例值
- 检查文档里是否重新引入初始化占位措辞
- 检查当前仓库是否误引入不需要的部署目录

### `doctor.sh`

- 检查 `git`、`node`、`pnpm`、`go`
- 检查 `gitleaks`、`shellcheck`、`golangci-lint`、`yamllint`、`shfmt`、`govulncheck`
- 检查 hooks 和关键脚本是否可执行

### `fast.sh`

- 前端：`pnpm lint && pnpm css`
- 后端：优先执行 `go test ./internal/... ./pkg/...`
- 错误码同步和魔法数字检查

### `full.sh`

- 包含 `fast.sh`
- 补充更完整的 shell、Go、YAML 和 secrets 检查
- 若定义了前端 `test`，会一并执行，但它不替代浏览器里的样式 / box 模型回归

## Hook 对应关系

- `pre-commit` -> `scripts/git-hooks/pre-commit.sh`
- `pre-push` -> `scripts/git-hooks/pre-push.sh`
- `commit-msg` -> `scripts/git-hooks/commit-msg.sh`

## 版本锁定

- 根目录 `.n-node-version` 用于约束 Node 版本（`n auto` 会优先读取）
- 建议执行：`n auto` 后再运行 QA 脚本

## `-h/--help`

上述脚本均支持 `-h/--help`，可直接在终端查看脚本说明。

示例：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh --help
```
