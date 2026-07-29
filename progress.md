# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 近期产品与研发能力统一收口

- 当前共享 Local 已冻结为一个完整收口范围，共包含配置、正式文档、QA / 本地运行脚本、Go 服务端、Ent / Atlas、正式 Web 与 DEV-only 工作台改动。详细任务过程已归档到 `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`。
- 产品能力包括岗位权限 / 数据范围 / 双列表菜单原子保存、审批责任原子应用、Workflow 任务来源读取、客户退货与收付款读写投影、生产异常处置页面、登录样式恢复、标准 demo 账号和甲方汇报映射。
- 研发能力包括数据准备、测试覆盖率采集、共享开发库 migration 工作台、affected / full / prepare-push 去重与版本中心交互。DEV-only 能力继续受 loopback、same-origin、固定 action、目标身份、幂等 operation 和生产制品边界约束。
- `roles.secondary_menu_paths` 与退出数据库自定义执行对象的两个 Atlas migration 已纳入当前候选。`server/make data` 已读回 migration 目录与 Ent schema 零漂移，`db-guard` 已通过；尚未把这些 migration 写入 133。
- 当前候选仍须形成 clean exact SHA，再执行一次 `prepare-push`。开发期既有定向验证只证明对应切片，不替代最终 full、GitHub CI、目标 migration / readback、岗位 smoke 或客户 UAT。

### CI/CD 与防重复构建边界

- `origin/main` 已包含三个 CI/CD 前向修复；Local 收口必须以普通非改写 merge 合入，不 rebase、不 force push，也不复用旧失败 SHA、Release 或 promotion operation。
- 同一个候选 SHA 只执行一次 `prepare-push`；push 后只等待该 SHA 的一次自动 CI，不在本轮手工触发 Immutable Release。
- 只有 CI 绿色且另行明确进入发布流程后，才允许为 exact SHA 构建一套不可变制品。测试服务器和 133 只消费同一制品，不在目标机重新构建。
- fixture、mock、文案、开发工作台或证据展示问题若不影响生产正确性，记录为后续事项，不为当前候选重复扩门禁、改代码并重跑完整 lifecycle。

## 下一步与停止条件

1. 精确提交当前冻结范围，并以非改写 merge 合入 `origin/main` 的三个 CI/CD 修复。
2. 合入后复跑 `make data`、`db-guard`、受影响测试与浏览器门禁；任何生成物变化先形成新 clean SHA。
3. 对最终 clean exact SHA 只运行一次 `bash scripts/qa/prepare-push.sh`，随后立即非强制推送。
4. 只观察本次 push 自动产生的 GitHub CI；失败时固定 exact SHA 和唯一失败阶段，不自动重建、不触发 Release。
5. 本轮不部署 133、不 apply 目标 migration、不执行客户 UAT。后续发布必须重新确认 commit / image、backup、migration、health / ready、客户配置、岗位 smoke 和 rollback point。

## 归档索引

- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：本次近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录；归档前为 323 行 / 80,399 bytes，SHA-256 `2d8d7f536e7b2844de9e8d2e35fa5b44a3fc2c508086fa54cad859f50e2b43c3`。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：异常流 V1 四项收口最终 Handoff 前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。
