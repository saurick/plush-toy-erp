# yoyoosun 升级 / Upgrade Runbook

升级只推广已验证的不可变发布包，复用[首次部署](01-first-deploy.md#准备与执行)的 controller、operation、确认和执行器。目标机不构建，也不通过手工修改 `.env` 镜像后直接启动形成第二条发布路径。

## 升级检查

| 检查 | 标准 |
| --- | --- |
| 目标 | 显式选择 registry 中的目标；默认 demo/test 不带入 production |
| 版本 | 同 SHA CI、v2 七资产与同 bytes 演练；test 验收的包原样进入生产 |
| 存量升级 | 核对 migration、已有数据和客户配置；需要时先用备份在隔离目标完成升级及附件恢复验证 |
| 恢复点 | 本次 operation 新建并恢复检查 PG 备份；附件与 PG 配套，保留旧制品及受控 env |
| 维护窗口 | 明确停写、业务影响、数据范围与执行授权；普通升级默认保留业务数据 |

## 执行顺序

1. 运行 `promotion-controller.mjs` 准备固定目标计划，核对即时预检、目标当前版本、候选版本和迁移身份。
2. 明确授权后通过版本中心或 `promotion-executor.mjs` 提交本次完整确认串。
3. 执行器依次完成制品校验、备份恢复检查、受控 env 更新、串行 migration、Compose 和公网读回；所有阶段绑定同一 operation。
4. 核对回执、运行 SHA、health / ready、客户配置及适用业务 smoke。部署成功不替代岗位验收。
5. 结果未知或失败时保留现场，按[回滚流程](03-rollback.md)处理，不重复点击或自动重试。

客户配置使用正式 validate / publish / transition check / activate / effective-session 链路；不直写数据库。真实数据导入、数据重建及备份恢复不包含在普通升级中。生产不得调用固定测试凭据轮换或测试数据重建。

证据范围与命令入口见[证据说明](../evidence/README.md)、[发布脚本](../../../scripts/deploy/README.md)和[部署约定](../../../docs/部署约定.md)。
