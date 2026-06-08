Doc Type / 文档类型: Customer Trial Environment Runbook / 客户试用环境执行手册
Status / 状态: Draft / 草案
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否

# 永绅 yoyoosun 试用环境执行手册 / Yoyoosun Trial Environment Runbook

本文用于把永绅 yoyoosun 目标试用环境的账号、权限、桌面菜单和岗位任务端验证步骤收口成可重复执行的 runbook。本文不是 deployment、runtime、schema、migration、RBAC 或真实账号真源；目标环境的真实配置仍以运行环境、后端 RBAC 真源、当前代码和部署记录为准。

本文禁止记录真实密码、短信验证码、token、私钥、数据库连接串、客户真实账号密钥或生产地址中的敏感凭据。真实密码只通过本地 shell 环境变量输入。

当前没有可直接执行的客户真实数据。Phase 7 不拆 A/B/C/D 或任何字母子阶段，本 runbook 默认一次性按模拟数据试用演练执行：可使用 seed、fixture 或手工构造的模拟客户、供应商、联系人和销售订单数据验证环境、账号、RBAC、菜单、V1 页面、岗位任务端入口和培训口径。模拟数据不等于真实 import，不代表客户字段已确认，也不生成出货、库存或财务事实。

## 1. 适用范围

本 runbook 只覆盖试用前入口和账号权限核对：

| 范围 | 覆盖内容 |
| --- | --- |
| 账号 / RBAC | 9 个 `demo_*` 或等价试用账号能登录，角色、岗位入口权限、debug 权限、super admin 和 disabled 边界正确 |
| 桌面菜单 | yoyoosun 菜单配置下正式入口可见，旧 `partners / project-orders` 入口不可见 |
| 岗位任务端 | 8 个岗位账号能进入对应 `/m/<role>/tasks` |
| 拒绝态 | 无岗位权限账号访问岗位任务端时被拒绝 |
| 模拟数据 | 用 seed / fixture / 手工样本验证 V1 页面和培训口径 |

本 runbook 不覆盖：

- 真实数据导入。
- 把模拟数据转成真实导入结论。
- 把真实导入拆成 Phase 7 的字母子阶段或后续半阶段。
- 新建 schema / migration。
- 生产部署或回滚。
- 库存、出货、财务、生产或委外事实闭环。
- 客户正式签收。

## 2. 前置条件

执行前先确认：

1. 目标后端已经部署并可访问 `/healthz`。
2. 目标前端已经部署，或可以临时从本机启动前端指向目标后端。
3. 目标库 migration 已经到当前服务需要的版本。
4. 已按授权流程创建或更新试用账号；普通业务试用账号不使用 `is_super_admin=true`，不分配 `debug_operator`。
5. 已取得本次核对用的临时密码，但不要写入仓库、文档、聊天记录或截图。
6. yoyoosun 菜单配置仍只作为前端菜单配置，不替代后端 RBAC 或事实规则。
7. 若需要页面数据演练，只使用 seed、fixture 或手工构造的模拟数据，并在证据中标记为模拟数据。

如果目标环境还没有试用账号，先在该环境按授权流程执行账号创建 / seed。常规客户试用账号不要生成 `demo_debug`。

## 3. 环境变量

执行命令前在当前 shell 设置：

```bash
export TRIAL_ACCOUNT_PASSWORD='replace-with-current-trial-password'
export TRIAL_ACCOUNT_BACKEND_URL='https://replace-with-trial-backend.example.com'
export TRIAL_BROWSER_SMOKE_BASE_URL='https://replace-with-trial-frontend.example.com'
export TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL="${TRIAL_ACCOUNT_BACKEND_URL}/healthz"
```

本地 dev 环境可省略 `TRIAL_ACCOUNT_BACKEND_URL` 和 `TRIAL_BROWSER_SMOKE_BASE_URL`，脚本会使用默认 `http://127.0.0.1:8300` 和临时 Vite。

## 4. 执行步骤

### 4.1 后端健康检查

```bash
curl -fsS "${TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL}"
```

预期输出包含：

```text
ok
```

若失败，先停止试用核对，回到部署和后端健康检查排障。

### 4.2 账号和 RBAC 只读核对

```bash
TRIAL_ACCOUNT_PASSWORD="${TRIAL_ACCOUNT_PASSWORD}" \
TRIAL_ACCOUNT_BACKEND_URL="${TRIAL_ACCOUNT_BACKEND_URL}" \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs
```

通过标准：

- 9 个 `demo_*` 或等价试用账号均能通过真实 `/rpc/auth` 登录。
- 8 个业务岗位账号具备对应 `mobile.<role>.access`。
- `demo_admin` 或系统管理员试用账号不具备岗位任务端入口权限。
- 所有普通试用账号 `debug.*` 权限数为 0。
- 所有普通试用账号 `is_super_admin=false`、`disabled=false`。

若失败，先修账号、角色和权限绑定；不要通过前端隐藏菜单绕过。

### 4.3 真实浏览器入口回归

目标前端已经启动时执行：

```bash
TRIAL_ACCOUNT_PASSWORD="${TRIAL_ACCOUNT_PASSWORD}" \
TRIAL_BROWSER_SMOKE_BASE_URL="${TRIAL_BROWSER_SMOKE_BASE_URL}" \
TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL="${TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL}" \
  pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:trial-demo-browser
```

如果只在本机 dev 环境跑，可不传 `TRIAL_BROWSER_SMOKE_BASE_URL`，脚本会自动启动单端口 Vite 并使用 yoyoosun 菜单配置。

通过标准：

- 桌面账号 9 个通过。
- 岗位任务端 8 个通过。
- 无岗位权限拒绝态 1 个通过。
- 旧 `客户/供应商`、`订单/款式立项`、帮助中心、开发与验收和高级文档入口不作为左侧菜单出现。

失败截图会输出到：

```text
web/output/playwright/trial-demo-account-browser-smoke/
```

该目录只作本地 evidence，不纳入 git。

## 5. 证据记录

最终只记录以下非敏感信息：

| 证据 | 记录方式 |
| --- | --- |
| 后端健康检查 | 通过 / 失败、时间、环境名 |
| RBAC 核对 | 脚本是否通过、账号数量、失败角色 |
| 浏览器回归 | 脚本是否通过、桌面账号数、岗位端账号数、拒绝态 |
| 截图 | 只记录本地输出目录，不提交截图 |
| 剩余问题 | 按账号、角色、菜单、岗位任务端、培训口径分类 |

禁止记录：

- 密码。
- token。
- 短信验证码。
- 数据库 DSN。
- 私钥。
- 客户真实敏感账号密钥。

## 6. 停止条件

出现以下任一情况，应停止进入客户试用：

| 停止条件 | 处理方式 |
| --- | --- |
| 目标后端健康检查失败 | 回到部署 / 服务排障 |
| migration 未到当前服务版本 | 先处理 migration，不继续试用 |
| 试用账号需要 `is_super_admin=true` 才能通过 | 修角色权限，不用 super admin 冒充业务账号 |
| 普通试用账号含 `debug.*` 权限 | 立即移除 debug 权限 |
| 有岗位权限的账号不能进入对应岗位任务端 | 修 `mobile.<role>.access` 或入口配置 |
| 无岗位权限账号可以进入岗位任务端 | 停止试用，排查 AuthGuard / `mobile.<role>.access` |
| 旧 `partners / project-orders` 又出现在正式入口 | 停止试用，排查菜单配置 / 旧入口回退 |
| 试用人员把销售订单理解为出货、库存或财务完成 | 先按培训说明重新讲边界 |

## 7. 试用后反馈归类

试用反馈先按下面分类记录，不直接改 Product Core：

| 分类 | 示例 | 下一步 |
| --- | --- | --- |
| 账号 / 权限 | 某角色看不到入口、能看到不该看的入口 | RBAC / 角色模板评审 |
| 菜单 / 文案 | 菜单名不符合业务习惯 | Customer Config / 菜单文案评审 |
| 销售订单字段 | 客户订单号、款号、颜色、尺寸、交期字段不够 | Source Document 字段评审 |
| 出货 / 库存 | 希望销售订单后直接出货或扣库存 | Shipment / Inventory usecase 评审 |
| 财务 | 希望出货后生成应收、发票或收款 | Finance usecase 评审 |
| 数据导入 | 试用人员提出真实客户 / 供应商 / 订单数据导入诉求 | 当前 Phase 7 blocked；另开数据治理评审，不在本阶段执行真实导入 |

只有经过正式评审确认属于 Product Core 的反馈，才进入 schema、runtime、API 或 UI 实现任务。
