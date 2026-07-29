# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 近期产品与研发能力统一收口

- 当前共享 Local 已冻结为一个完整收口范围，共包含配置、正式文档、QA / 本地运行脚本、Go 服务端、Ent / Atlas、正式 Web 与 DEV-only 工作台改动。详细任务过程已归档到 `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`。
- 产品能力包括岗位权限 / 数据范围 / 双列表菜单原子保存、审批责任原子应用、Workflow 任务来源读取、客户退货与收付款读写投影、生产异常处置页面、登录样式恢复、标准 demo 账号和甲方汇报映射。
- 研发能力包括数据准备、测试覆盖率采集、共享开发库 migration 工作台、affected / full / prepare-push 去重与版本中心交互。DEV-only 能力继续受 loopback、same-origin、固定 action、目标身份、幂等 operation 和生产制品边界约束。
- `roles.secondary_menu_paths` 与退出数据库自定义执行对象的两个 Atlas migration 已纳入提交 `6e911995`。合入 CI/CD 修复前，`server/make data` 已读回 migration 目录与 Ent schema 零漂移，`db-guard` 已通过；尚未把这些 migration 写入 133。
- 开发期既有定向验证只证明对应切片，不替代最终 clean exact SHA 的 full、GitHub CI、目标 migration / readback、岗位 smoke 或客户 UAT。

### CI/CD 与防重复构建边界

- `origin/main` 的三个 CI/CD 前向修复已通过普通非改写 merge 进入本地候选；OCI config / manifest 双身份、仓库 / release 根路径与 promotion / rollback 回执修复均保留。历史失败操作和完整证据见 `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`。
- merge 候选 `60778b03` 的首次有效 `prepare-push` 在 fast Node 阶段停止，未进入 Web 构建、浏览器、Go、PostgreSQL 或 push：它准确发现一个已过期的质量角色筛选断言和一处审批保存失败可能透传原始异常。两处已按当前业务合同与用户提示边界修正，fast Node 复验为 504 / 504 通过、0 skip；修复提交将形成新的最终候选 SHA。
- 修复候选 `76e663c8` 的唯一一次 `prepare-push` 已完成 full Node 1561 / 1561，随后停在客户配置静态边界：新增且已有专门 Go 测试的工作台岗位监督读入口未计入旧的调用数断言。生产权限未改，静态合同已纳入该正式入口；客户配置后续静态门禁与工作台监督读定向 Go 测试均通过，下一提交将形成新的最终候选 SHA。
- 同一个候选 SHA 只执行一次 `prepare-push`；push 后只等待该 SHA 的一次自动 CI，不在本轮手工触发 Immutable Release。
- 只有 CI 绿色且另行明确进入发布流程后，才允许为 exact SHA 构建一套不可变制品。测试服务器和 133 只消费同一制品，不在目标机重新构建。
- fixture、mock、文案、开发工作台或证据展示问题若不影响生产正确性，记录为后续事项，不为当前候选重复扩门禁、改代码并重跑完整 lifecycle。

## 下一步与停止条件

1. 完成 merge 提交后复跑 `make data`、`db-guard`、受影响测试与浏览器门禁；任何生成物变化先形成新 clean SHA。
2. 对最终 clean exact SHA 只运行一次 `bash scripts/qa/prepare-push.sh`，随后立即非强制推送。
3. 只观察本次 push 自动产生的 GitHub CI；失败时固定 exact SHA 和唯一失败阶段，不自动重建、不触发 Release。
4. 本轮不部署 133、不 apply 目标 migration、不执行客户 UAT。后续发布必须重新确认 commit / image、backup、migration、health / ready、客户配置、岗位 smoke 和 rollback point。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署必须各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- 133 上较早固定 V5 的技术试用证据不能证明当前 Product Core HEAD。客户配置 V7、V5 → V7 激活边界、目标 migration 和岗位 smoke 都必须以本次 promotion 后的目标读回为准。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- Git、CI、Release、promotion 和部署只允许一个收口 owner 串行推进。

## 归档索引

- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：本次近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录；归档前为 323 行 / 80,399 bytes，SHA-256 `2d8d7f536e7b2844de9e8d2e35fa5b44a3fc2c508086fa54cad859f50e2b43c3`。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：本次 OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：异常流 V1 四项收口最终 Handoff 前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。
