# JSON-RPC API 说明

当前服务只保留一套最小的 JSON-RPC 入口，用于承载通用鉴权和后台账号管理能力。

## 统一入口

协议定义见：

- `/Users/simon/projects/plush-toy-erp/server/api/jsonrpc/v1/jsonrpc.proto`

HTTP 路由：

- `GET /rpc/{url}`
- `POST /rpc/{url}`

其中：

- `{url}` 表示业务域，例如 `system`、`auth`、`user`
- `method` 表示具体动作，例如 `login`、`me`、`list`

## 当前默认保留的业务域

### `system`

- `ping`
- `version`

用途：无鉴权的基础联通性检查。

### `auth`

- `login`
- `admin_login`
- `send_sms_code`
- `sms_login`
- `register`
- `logout`
- `me`

用途：用户登录、管理员登录、短信验证码登录、注册、退出和当前登录态查询。

### `user`

- `list`
- `set_disabled`
- `reset_password`

用途：管理员查看协作账号目录，启用/禁用用户，以及在用户忘记密码时协助重置密码。

### `admin`

- `me`
- `list`
- `create`
- `menu_options`
- `set_permissions`
- `set_erp_column_order`
- `set_disabled`
- `reset_password`

用途：管理员读取当前账号资料；超级管理员创建普通管理员、调整菜单权限、启用/禁用普通管理员，以及在普通管理员忘记密码时协助重置密码。

## 鉴权规则

- `system.*` 默认是公开方法
- `auth.login`、`auth.admin_login`、`auth.send_sms_code`、`auth.sms_login`、`auth.register`、`auth.logout` 是公开方法
- 其他业务域默认要求已登录
- `user.*` 额外要求管理员登录态
- `admin.reset_password` 和普通管理员管理操作要求超级管理员登录态，且不允许通过该接口重置超级管理员密码

说明：管理员鉴权依赖 token 里的角色信息，而不是前端页面路径。

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

### `auth.login` / `auth.admin_login` / `auth.sms_login` / `auth.register`

返回最小登录态信息：

- `user_id`
- `username`
- `access_token`
- `expires_at`
- `token_type`
- `issued_at`

`auth.sms_login` 通过 `scope` 区分登录目标：

- `scope=user` 或省略：普通协作账号短信登录
- `scope=admin`：管理员短信登录，返回字段额外包含 `admin_level`、`menu_permissions`、`erp_preferences`

当前账号表还没有独立手机号字段，短信登录暂以“手机号就是账号名”为主路径；后续如果增加手机号字段，应在 repo 查询层切换真源，不要在接口层补第二套账号匹配规则。

### `auth.send_sms_code`

请求字段：

- `phone`：手机号，当前支持中国大陆手机号，允许 `+86`、`86` 前缀和空格 / 连字符
- `scope`：`user` 或 `admin`，省略时按 `user`

返回字段：

- `phone`
- `expires_at`
- `resend_after`
- `mock_delivery`
- `mock_code`

当前暂未接入运营商短信，服务端使用进程内验证码存储，验证码 5 分钟有效、60 秒内不可重复发送、最多尝试 5 次。`mock_delivery=true` 时 `mock_code` 只用于本地和过渡期联调；接入短信供应商后应由发送适配层替换该返回口径，登录校验接口保持不变。

### `auth.me`

返回当前用户或当前管理员的最小信息，用于前端恢复登录态。

### `user.list`

返回后台账号目录所需的最小字段：

- `id`
- `username`
- `disabled`
- `created_at`
- `last_login_at`

### `user.reset_password`

请求字段：

- `user_id`
- `password`：新密码，至少 6 位

成功后覆盖该协作账号的 `password_hash`，旧密码立即失效；接口不返回明文密码。

### `admin.reset_password`

请求字段：

- `id`：普通管理员 ID
- `password`：新密码，至少 6 位

成功后覆盖该普通管理员的 `password_hash`，旧密码立即失效；接口不返回明文密码，也不允许重置超级管理员账号。

## 当前未纳入主干的业务能力

以下旧项目或泛平台能力当前不在主干里，不应再假定存在：

- 积分
- 订阅
- 邀请码

如果后续需要这些能力，应按真实需求重新定义 schema、错误码、接口和前端消费层，而不是把历史逻辑直接加回主干。
