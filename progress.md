# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### CI/CD 与 133 promotion 收口

- 133 根卷已扩容并完成虚拟机快照。最近一次只读 preflight 显示约 163 GB 可用空间、migration 锁空闲；扩容过程未重启 ERP 容器。
- exact SHA `078e1500ad0c39334593158f37de322dc77e4f43` 已完成一次本地 `prepare-push`、GitHub CI、strict、不可变 Release 和下载制品本地演练。其 Release 制品校验、migration/readback、客户配置、PDF、备份恢复及演练清理均已执行，但不等于 133 已升级。
- 首次 133 promotion 操作 `705e2c3d-df6c-4de1-aadd-ae43063dc626` 在 migration 前失败关闭并冻结为 `not_proven`，禁止重试或改写。目标容器仍运行旧 SHA `ba2a6860883fa91a7ffc4fafcc576bfa9701b96f`；该次操作没有启动备份、migration 或服务切换。
- 失败根因是不同 Docker image store 对 `docker image inspect .Id` 的合法表示不同：经典 Docker 返回 OCI config digest，133 的 containerd image store 返回 OCI manifest digest。发布 tar 与 `GIT_SHA` 均正确，旧校验器却只接受 config digest。
- 当前前向修复同时收口三个合同：严格校验并接受同一 tar 唯一对应的 OCI config / manifest 双身份；promotion / rollback 回执输出真正 boolean；外部 Release manifest 的本地演练回执改用仓库内安全路径。不能手工绕过，也不能复用失败操作。
- 当前 deploy 测试全集 536/536、补强后的核心合同 23/23、文档清单与链接 3/3 通过；`fast.sh` 完成且 Server quick 为 3016/3016。ShellCheck、shfmt、Bash 语法和 diff whitespace 通过；实际 Release tar 已同时验证唯一标签、config blob、OCI manifest blob、config digest、manifest digest、`linux/amd64` 与内置 SHA，并与 133 读到的 image ID 精确对应。仍须在新 clean exact SHA 上完成一次最终门禁和新 Release 后，才可创建一次全新的 promotion。

### 发布停止条件

1. 一个候选 SHA 只执行一次 `prepare-push`；push 后只等待该 SHA 的 CI，不因无关 warning 重建。
2. 一个 exact SHA 只构建一套不可变 Server/Web 制品；本地和目标环境都消费同一下载字节，不在 133 构建。
3. 一个 promotion operation 只执行一次；`failed` 或 `not_proven` 后冻结证据，必须形成新 SHA、新 Release 和新 operation，禁止原地重跑。
4. promotion 前先做只读 preflight；目标写入开始后必须依次绑定 backup、migration status/apply/readback、镜像身份、health/ready、客户配置与 smoke。
5. CI、Release、migration 或目标 smoke 的真实阻塞只报告精确失败点和回滚/前向修复边界，不扩充新门禁、研发工作台或全仓证明循环。

### 下一步

1. 创建唯一前向修复 SHA，审查 clean tree 后只运行一次该 SHA 的 `prepare-push`。
2. 推送该 SHA并只等待一次远端 CI 和 Release，不复用旧 SHA 的失败操作。
3. 对新 Release 下载一次资产并完成一次本地生产 Compose 演练，确认外部 manifest 回执也通过。
4. 重新执行 133 只读 preflight，创建新 operation 并只执行一次 promotion。
5. 从 133 读回 exact SHA、image identity、migration latest、active config、health/ready、岗位技术 smoke、PDF 与 rollback point。
6. 技术发布完成后再单独安排真实岗位人工验收和甲方 UAT；未完成前不得写成客户已交付或已签收。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署必须各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- 133 上较早固定 V5 的技术试用证据不能证明当前 Product Core HEAD。客户配置 V7、V5 → V7 激活边界、目标 migration 和岗位 smoke 都必须以本次 promotion 后的目标读回为准。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- Git、CI、Release、promotion 和部署只允许一个收口 owner 串行推进；共享 dirty worktree 的其他任务改动不回退、不暂存、不提交，也不计入本轮成果。

## 归档索引

- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：本次 OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：异常流 V1 四项收口最终 Handoff 前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。
