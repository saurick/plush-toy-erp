# CI 与共享开发库收口前历史过程归档 / Progress Archive Before CI And Migration Closeout

本页原文保存从 `progress.md` 移出的 2026-09-04 报价运费与 2026-09-05 双目标发布记录，仅用于历史追溯，不替代当前代码、CI 或目标运行证据。

### 销售订单报价运费独立金额（2026-09-04）

- 业务闭环：销售订单新增整单“报价运费”，沿用订单币种；“报价不含运费（另计）”时纳入同一计税基础和订单总额，允许草稿暂缺但提交 / 生效前必须明确填写，`0` 表示明确免收；“报价含运费”时自动清空该金额并禁止重复计入。出货单实际运费仍是独立物流事实，不复制、不回写，也不自动形成应付或付款。
- 真源 / 历史：后端 usecase 唯一计算货款、税额和总额，API、列表、详情、导出、帮助与试用模拟数据同步读取同一字段；数据库只新增可空 `quoted_freight_amount` 及非负、运费条件一致性约束。历史记录不猜测回填，既有已生效单仍可读取，后续需要商业条件完备的状态转换按新规则失败关闭。
- Schema / 迁移：完成 Ent 生成、Atlas migration、风险元数据、`atlas.sum` 和数据字典同步；`make data` 读回 migration 目录与目标 schema 一致，`scripts/qa/db-guard.sh` 通过。本批未连接或 apply 开发库、测试库或目标库，未发布或部署。
- 验证：Go `internal/biz`、`internal/service`、`internal/data` 全包通过；报价运费字段链、计算、页面、帮助、模拟数据、原型和 Schema 文档定向 Node `156 / 156` 通过；Vite production build（`3396` modules）、阶段编号边界与 `git diff --check` 通过。隔离浏览器的销售订单竞态场景通过；可见原型交互确认含运费会清空并禁用另计金额，不含运费填 `250.00` 后税额和总额分别更新为 `617.50`、`5367.50`。全业务页面场景在销售订单检查之后被无关的出货附件审计断言阻断，不能算本批绿色；客户 UAT、目标 migration smoke、full / strict、提交和推送均未执行。

### 不可变发布与双目标部署完成（2026-09-05）

- 发布：固定提交 `01fc1476a11ab6ab2bdfe77934fa391c542e8919`，实时确认与远端 `main` 一致。[完整 CI #139](https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/139) 成功，执行耗时 `211` 秒；[Release #140](https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/140) 复用其 exact-SHA 门禁，约 `229` 秒完成构建、隔离演练和 `2026.09.05-1` 发布。v2 七资产、独立 `source.tar` 与 manifest 绑定的演练回执均已读回校验；演练的 migration、health/ready、登录、PDF、备份恢复、稳态重启通过，临时容器零残留。
- 目标部署：正式 controller/executor 先完成 `demo-133`（operation `fe5f06b0-da91-460d-8976-c33007c67bca`，远端执行 `97.797` 秒），读回通过后再完成 `customer-test-133`（operation `51d1c917-d923-45cf-9c9a-d9f354b15c09`，`94.392` 秒）。两个 v5 回执均为 `passed`；最终 `target-preflight` 确认前端、后端与各自公网入口均运行同一 `01fc1476…` 制品，health/ready/Web health 通过、migration 为 `20260904030457`、客户配置保持 active、迁移锁空闲。普通升级保留两个环境的现有业务数据。
- 恢复与传输：旧版 `af4cc02808ebffc919201748561f7027b97679f3` 回滚制品在目标写入前已校验可取得；两个目标各自新建备份并完成隔离恢复校验，备份分别为 `866560` 与 `476846` bytes，完整 digest 绑定在对应 operation 回执。此次两个目标均为冷缓存，各自通过内网 TLS 取得并校验 `580313796` bytes，未经过 Mac 大文件中转；未据此宣称跨环境缓存命中或重复加载已消除。
- 专用凭据：经用户明确授权创建本项目 Deploy Token `plush-target-package-read`，GitLab 回读 `Expires=Never`，唯一 scope 为 `read_package_registry`；安全保存于本机 macOS Keychain 的 `plush-toy-erp.gitlab-target-fetch`，不记录令牌值。两个目标取件成功且回执均证明临时凭据文件已清理；长期令牌保留，不在部署后撤销。
- 验证边界：本轮没有重建或清空数据，没有改业务代码或 AGENTS。CI 与隔离发布演练不重复运行；目标带凭据岗位矩阵、目标 PDF smoke、客户 UAT / 签收和真实代码回滚演练仍未执行，不能由基础部署 smoke 或备份恢复校验代替。
