# JSON-RPC API 说明

当前服务只保留一套最小的 JSON-RPC 入口，用于承载通用鉴权和后台账号管理能力。

## 统一入口

协议定义见：

- `/Users/simon/projects/plush-toy-erp/server/api/jsonrpc/v1/jsonrpc.proto`

HTTP 路由：

- `GET /rpc/{url}`
- `POST /rpc/{url}`

其中：

- `{url}` 表示业务域，例如 `system`、`auth`、`admin`
- `method` 表示具体动作，例如 `admin_login`、`me`、`list`

## 当前默认保留的业务域

### `system`

- `ping`
- `version`

用途：无鉴权的基础联通性检查。

### `auth`

- `admin_login`
- `send_sms_code`
- `sms_login`
- `logout`
- `me`

用途：管理员密码登录、管理员短信验证码登录、退出和当前登录态查询。当前产品不提供普通协作账号登录或公开自助注册方法。

### `admin`

- `me`
- `list`
- `create`
- `rbac_options`
- `menu_options`
- `set_roles`
- `set_role_permissions`
- `set_phone`
- `set_erp_column_order`
- `set_disabled`
- `revoke`
- `reset_password`

用途：管理员读取当前账号资料；具备对应系统权限的管理员创建管理员、绑定登录手机号、给管理员分配角色、给角色分配权限、启用 / 禁用普通管理员，以及在普通管理员忘记密码时协助重置密码。

## 已退出运行时的旧接口

以下旧接口不属于当前 API，调用时按未知业务域或未知方法处理：

- `auth.login`
- `user.list`
- `user.set_disabled`
- `user.reset_password`

## 鉴权规则

- `system.*` 默认是公开方法
- `auth.admin_login`、`auth.send_sms_code`、`auth.sms_login`、`auth.logout` 是公开方法
- 其他业务域默认要求已登录
- `user.*` 普通账号管理域已退出运行时，不再作为 JSON-RPC URL 提供
- `admin.*` 管理操作要求管理员登录态，并按 `system.*` 权限码做动作级校验
- super admin 不允许被普通管理员通过管理接口修改、禁用或重置密码

说明：管理员鉴权依赖后端 RBAC 权限码，而不是前端页面路径。菜单隐藏只是体验，不是安全边界。

## 默认返回结构

所有 JSON-RPC 响应统一返回：

- `jsonrpc`
- `id`
- `result.code`
- `result.message`
- `result.data`
- `error`

其中：

- `result.code=0` 表示成功
- 其他错误码统一来源于 `/Users/simon/projects/plush-toy-erp/server/internal/errcode/catalog.go`

## 当前默认保留的数据字段

### `auth.admin_login` / `auth.sms_login`

返回最小登录态信息：

- `id`
- `username`
- `access_token`
- `expires_at`
- `token_type`
- `issued_at`

`auth.sms_login` 只接受 `scope=admin`，验证码通过后按 `admin_users.phone` 查找管理员，返回字段额外包含 `is_super_admin`、`roles`、`permissions`、`menus`、`erp_preferences`。普通协作账号登录链路及 `scope=user` 已退出运行时。

岗位任务端请求 `auth.send_sms_code` 和 `auth.sms_login` 时会额外携带 `mobile_role_key`。对格式合法的手机号，发码接口始终返回相同的“验证码已发送”受理合同；服务端只在账号存在、active 且具备 `mobile.<role>.access` 时实际请求短信发送，账号资格、查询失败或短信供应商失败只进入内部脱敏日志，不能从公开响应判断手机号是否绑定管理员或具备岗位资格。

短信登录先校验验证码，再读取账号和 RBAC。手机号未绑定、账号停用 / 注销、缺少当前岗位入口权限、验证码不存在 / 错误 / 过期或尝试次数耗尽，对外统一返回 `AuthLoginRejected`；内部日志仍使用稳定原因并只记录脱敏手机号。

密码或短信验证码核验完成后，服务端在创建 session 的同一短事务内再次锁定并核对账号状态、`auth_version`、短信登录手机号和当前岗位入口权限；并发禁用、注销、重置密码或调整相关登录条件时，不会返回一个已经失效的“登录成功”结果。

`auth.admin_login` 同样不对外区分用户名不存在、密码错误、账号停用 / 注销或登录期间凭据版本变化，统一返回 `AuthLoginRejected`。凭据查询故障返回 `Internal`，不能降级成“账号不存在”。每个用户名 / 密码尝试都会执行一次 bcrypt 比较；只有密码匹配后才加载完整 RBAC，并再次核对账号状态、密码哈希和 `auth_version`。

### `auth.send_sms_code`

请求字段：

- `phone`：手机号，当前支持中国大陆手机号，允许 `+86`、`86` 前缀和空格 / 连字符
- `scope`：当前只接受 `admin`
- `mobile_role_key`：岗位任务端登录时传当前端口角色；桌面短信登录可省略

返回字段：

- `phone`
- `expires_at`
- `resend_after`
- `mock_delivery`
- `mock_code`

`data.auth.sms.mode=mock` 时，服务端使用进程内验证码存储，验证码 5 分钟有效、60 秒内不可重复发送、最多尝试 5 次，`mock_delivery=true` 且返回 `mock_code` 只用于 local / dev / test。为保持防枚举合同，不合格账号也会收到相同格式但不可验证的诱饵码，因此公开发码响应不能作为账号存在或已授权的证据。`data.auth.sms.mode=provider` 时，后端使用阿里云号码认证 PNVS 短信认证发送并核验验证码，`mock_delivery=false` 且不返回 `mock_code`。

短信登录用户可见错误按错误码收口：

| 错误码 | 典型场景 | 用户提示 |
| --- | --- | --- |
| `AuthInvalidPhone` | 手机号格式不正确 | 手机号格式不正确 |
| `AuthLoginRejected` | 手机号未绑定、账号不可用、无当前岗位入口权限，或验证码不存在 / 错误 / 过期 / 尝试次数耗尽 | 登录信息不正确或账号不可用 |
| `AuthSMSServiceQuotaExceeded` | 阿里云短信套餐 / 余额 / 额度已用完 | 短信服务额度已用完，请联系管理员处理 |
| `AuthSMSServiceUnavailable` | 阿里云服务异常、网络超时或服务商拒绝发送 / 核验 | 短信服务暂不可用，请稍后再试或联系管理员 |

`AuthInvalidSMSCode`、`AuthSMSCodeExpired`、`AuthSMSCodeAttemptsExceeded` 只保留为服务端内部分类，不作为公开短信登录响应返回。

### `auth.me`

返回当前管理员的最小信息，用于前端恢复登录态。旧普通用户 token 会按未登录处理。

### `admin.reset_password`

请求字段：

- `id`：普通管理员 ID
- `password`：新密码，至少 8 位且不超过 72 字节；密码按原值校验，不做 trim 或大小写归一化

成功后在同一事务覆盖该普通管理员的 `password_hash`、递增 `auth_version`、注销该账号全部 active admin session，并追加不含密码、密码哈希或 session key 的控制面审计。旧密码和旧 token 立即失效；接口不返回明文密码，也不允许非超级管理员维护受保护的系统账号。

## 当前未纳入主干的业务能力

以下旧项目或泛平台能力当前不在主干里，不应再假定存在：

- 积分
- 订阅
- 邀请码

如果后续需要这些能力，应按真实需求重新定义 schema、错误码、接口和前端消费层，而不是把历史逻辑直接加回主干。
