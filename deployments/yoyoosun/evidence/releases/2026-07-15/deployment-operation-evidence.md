# 2026-07-15 永绅测试环境部署操作证据

本文只记录 `192.168.0.133` 测试环境本次部署、恢复与登录验证事实，不等同于正式客户验收或签收。

## 发布绑定

| 项目 | 证据 |
| --- | --- |
| Git commit | `56ecf873` (`fix(auth): 精确区分密码登录失败原因`) |
| Server image | `plush-toy-erp-server:yoyoosun-20260715-56ecf873-amd64` / `sha256:81b39011b6a7a47f393c88e881996254ae8e1a44361c60641b76e64a4af5b275` |
| Web image | `plush-toy-erp-web:yoyoosun-20260715-56ecf873-amd64` / `sha256:18dc0d4383b763e03483c56c9b1b2fee27a48924bb23564e595956b5c370dbc4` |
| 目标数据库 | `plush_erp_uat_20260715` |
| Atlas migration | `20260714165115`，已执行 75，pending 0 |
| 数据库备份 | `/opt/plush-toy-erp/backups/20260715-56ecf873/uat.database.dump` / `fe36636dcf51bb8a87e296f79f87801c6fa34bafd143f919fb15e901cf90c91d` |
| 回滚点 | release `929ec0b3` 及其 server/web 镜像继续保留 |

## 客户配置与运行态

受控升级通过标准 JSON-RPC 客户配置流程完成 `validate -> publish -> transition check -> activate -> effective-session readback`，没有直接写入配置内容。当前激活 revision 为 `yoyoosun-customer-trial-133-package-v3.runtime-manifest-v1`，产品版本为 `customer-trial-133-test-2026.07.15-v3`，配置 hash 为 `5131af21c39ca4e180098002e257b28ee8bcfb0adaaab9b54c1ed3a7798490db`。

新 server/web 镜像已冷启动并通过生产预检、health/ready 与客户配置读取；最终复核时 server/web restart count 均为 0，web 为 `healthy`，公网 `https://admin.yoyoosun.net/healthz` 返回 `ok`。

## 管理员恢复与登录验证

- `admin` 已设置新的生产强密码；密码只保存在部署操作者 macOS Keychain 的 service `plush-toy-erp-yoyoosun-admin`、account `admin`，未写入仓库、证据或日志。
- 密码更新后撤销 3 个既有活动会话，bcrypt 匹配校验通过。
- 公网 API 使用新密码登录返回业务码 0 且签发非空 token；旧开发默认密码 `adminadmin` 返回业务码 10002 与 `密码错误`。
- 公网 API 使用不存在账号返回业务码 10001 与 `账号不存在`。
- 真实 Chromium 页面分别验证不存在账号显示 `账号不存在`、错误密码显示 `密码错误`。

## 恢复与安全处置

- 排查期间识别到应用实际数据库与容器默认数据库不同；正式 migration 状态和密码重置随后均显式绑定 `plush_erp_uat_20260715`。默认数据库中误触的管理员密码已从操作前备份精确恢复，临时恢复数据库已删除。
- 本次已轮换应用 JWT 签名密钥，并同步当前与回滚 release，避免回滚配置失配。
- 阿里云短信 AccessKey 属于外部云账号资源，当前环境无法代替账号所有者在控制台轮换；该项仍是明确的外部安全待办，旧密钥值不在本文重复记录。

## 边界

本证据证明固定 commit/image 已部署、目标 UAT migration 为最新、客户试用配置已激活、管理员登录已恢复、精确错误提示已在公网 API 与真实浏览器生效。它不证明甲方已完成岗位业务验收，也不把 trial config 报告中的 `releaseReady=false` 提升为正式签收。
