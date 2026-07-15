---
name: plush-manual-acceptance-governance
description: 项目人工验收治理（plush-toy-erp）。Use when planning or executing manual acceptance datasets, role accounts, tasks, attachments, source-driven facts, readiness, browser/PDF checks, target trial evidence, retirement, or customer signoff.
---

# Plush Manual Acceptance Governance

本 skill 编排 plush 的人工验收工具链。它负责选择档位、标注写入边界、绑定同一数据批次、收集证据并安全退出；不把模拟数据、浏览器可打开、本地报告或目标试用自动写成正式发布与客户签收。

## Truth Chain / 必读真源

- `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`。
- `scripts/qa/README.md` 和当前 `scripts/qa/manual-acceptance-*.mjs` 的 `--help` / tests；脚本合同优先于本 skill 中的示例。
- `docs/customers/<customer-key>/试用人员全页面手工验收清单.md`、`客户交付矩阵.md`、`客户闭环交付验收清单.md`。
- 涉及目标环境、客户配置或发布时，再读 `server/deploy/README.md`、`scripts/deploy/README.md` 与正式 release evidence。

验收项数量、账号数、模板数和数据版本会变化。每次从 `manual-acceptance-catalog.mjs --format json` 与当前脚本合同读取，不在 skill 中写死。

## Profiles / 档位选择

| 档位 | 允许动作 | 证据边界 |
| --- | --- | --- |
| Local plan | catalog、dataset plan、dry-run、静态边界检查 | 不连接服务、不证明数据已准备 |
| Local simulated apply | 经精确确认词向已核本地环境写模拟数据，并读回 | 只证明指定本地批次，不是客户真实数据 |
| Local browser/PDF | 登录正式试用账号，按脚本合同做只读页面与 PDF 检查 | 登录/审计可能写痕迹；不证明目标发布 |
| Target trial/UAT | 经 target attestation、隧道和独立凭据执行允许的目标试用动作 | 与正式 release evidence、生产写入分开 |
| Release/customer acceptance | 读取正式发布、恢复与签收证据 | 自动化不能代替业务负责人签收 |

每一步必须标注 `no-write`、`simulated-write`、`target-write` 或 `human-only`。不清楚时按高风险档位处理。

## Workflow / 工作流

1. 冻结 scope：customer、target、profile、dataset key/data version/run id、允许写入、禁止路径、验收与停止条件。先运行 `git status --short`，保留其他会话改动。
2. 生成当前目录与数据计划。先读 `scripts/qa/README.md`，运行 catalog 的 JSON 模式；不要复制旧清单数量或依赖历史报告。
3. 检查环境门禁：URL/host、DB、migration、active customer config revision、账号/RBAC、凭据分离、报告目录和精确确认词。凭据只经环境变量传入，不写入命令记录、报告或仓库。
4. 按当前脚本能力准备 source data、账号、任务、附件和 source-driven Fact。计划入口与 apply 入口分开；脚本声明 plan-only、retired 或 unsupported 的阶段立即停止，不用旧报告、generic RPC、直接 SQL 或局部事实代替。
5. 每次写入后以同一 dataset/version/run id 做 readback。校验数量、状态、权限、幂等与报告绑定；单个子链绿色不能扩写为完整验收就绪。
6. 运行 readiness，再按清单做浏览器/PDF 与人工判断。分别记录页面可达、数据满足、交互正确、PDF 合同、人工视觉/业务结果；截图或自动报告不能替代未执行的人工作业。
7. 目标试用与正式发布分开归档：目标报告绑定 target attestation；正式 release 仍需 commit/image、migration、health/ready、smoke、backup/restore 和 rollback evidence。
8. 先 dry-run 再 retire/cleanup。只取消、归档或停用允许的模拟源数据；已过账事实和审计记录不物理删除。报告保留路径、未清对象与后续 owner。

## Stop Conditions / 停止条件

- target、DB、active revision、数据版本或 run id 对不上；确认词、独立凭据或 attestation 缺失。
- 脚本/README 标明 plan-only、unsupported、retired，或报告合同版本不匹配。
- 需要直接改生产数据库、绕过 RBAC/usecase、上传真实客户原件、执行 migration/release 或删除已过账事实。
- readiness 有 blocker、浏览器/PDF 产生 4xx/5xx、关键 readback 不一致，或人工验收项尚未确认。

遇到这些条件要停止对应写入并报告证据，不通过放宽识别、复用旧 report、跳过阶段或伪造空报告继续。

## Validation / 验证要求

- 变更人工验收脚本时运行对应 `node --check`、定向 `node --test`，再由 `$plush-test-governance` 选择 affected/full 范围。
- 验收执行至少保存 catalog、plan/apply/readback、readiness、browser/PDF、retire 的适用报告，并核对它们绑定同一批次。
- 报告默认写入 ignored `output/**` 或正式指定 evidence 目录；不得包含密码、token、完整 DSN、真实客户原件或未脱敏 PII。

## Output / 输出合同

汇报 profile、target、dataset/version/run id、每步写入分类、实际命令与结果、records/readback、浏览器/PDF 与人工结果、报告位置、retire/cleanup 状态。最后分开给出：本地验收准备、目标试用、正式发布、恢复证据、客户签收五个 verdict，以及 blocker 和 owner。
