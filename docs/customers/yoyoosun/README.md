# 永绅 yoyoosun 客户资料 / Yoyoosun Customer Materials

`yoyoosun` 是永绅客户的稳定客户 key。本目录只保存可进入 Product Core 的脱敏资料分类、导入准备、客户差异、客户配置草案、试用说明和历史 evidence 索引。真实原件与私密 manifest 已进入专属 Private 仓库，Product Core 当前工作树不再保存副本；它们不是 Product Core 或 SaaS tenant 真源。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 判断客户交付状态 | `客户交付矩阵.md` | `docs/当前真源与交接顺序.md`、部署 evidence、当前代码和测试 |
| 判断客户差异归属 | `客户差异台账.md` | `docs/product/客户差异策略.md`、Product Core 评审 |
| 判断 Excel 字段是否进 Product Core | `Excel字段产品核心映射评审.md` | 私有 manifest 的脱敏分类、当前代码、migration 和测试 |
| 做导入 dry-run / freeze | `导入策略.md`、`导入试跑工具说明.md` | 客户私有仓库、`来源快照冻结.md`、`真实试跑证据.md`、导入脚本测试 |
| 准备试用或培训 | `试用培训说明.md`、`试用账号角色菜单核对清单.md`、`试用环境执行手册.md`、`试用人员全页面手工验收清单.md` | 真实环境账号、岗位、菜单和岗位任务端核对 |
| 查原始资料边界 | `原始客户文件归档评审.md`、`来源材料.md` | 客户私有仓库中的 manifest、远端回读校验和用途分类 |

## 客户投影边界图 / Customer Projection Boundary

这张图回答：客户资料可以流向哪些客户侧文档、配置、模拟和模板候选，什么时候才可能进入 Product Core。

```mermaid
flowchart TD
  privateRepo["客户专属 Private 仓库<br/>原始 Excel / PDF / 图片 / manifest / 私密评审 / 验证入口"]
  review["人工评审<br/>字段分类 / 敏感信息 / 导入 dry-run / 差异判断"]
  docs["docs/customers/yoyoosun<br/>客户资料 / 交付矩阵 / 差异台账 / 验收证据"]
  config["config/customers/yoyoosun<br/>客户配置草案 / runtimeEnabled=false"]
  training["seed / fixture / training<br/>模拟试用数据 / 账号 / 岗位任务端演练"]
  templates["打印模板 / 字段显示 / 编号规则<br/>客户配置或候选模板"]
  productCore["Product Core<br/>通用 ERP 内核"]
  coreGate["Product Core 评审<br/>通用性依据 / 排除客户专属内容 / 测试同步"]
  facts["Fact tables<br/>库存 / 出货 / 预留 / 财务事实"]
  tenant["tenant_id / SaaS runtime tenant"]

  privateRepo --> review
  review --> docs
  review --> config
  review --> training
  review --> templates
  review -->|只有确认通用能力后| coreGate
  coreGate --> productCore
  docs -. 不得自动升级 .-> productCore
  config -. 不是 .-> tenant
  training -. 不得写入 .-> facts
  review -. 禁止自动导入 .-> facts
```

## 文档分组 / Document Groups

| 分组 | 文档 |
| --- | --- |
| 资料入口与线索 | `来源材料.md`、`需求线索.md`、`Excel字段产品核心映射评审.md`、`问题待办.md`、`假设登记.md`、`决策日志.md`、`变更请求流程.md` |
| 客户交付与差异 | `客户交付矩阵.md`、`客户差异台账.md`、`差异登记.md`、`客户配置草案.md` |
| 导入准备 | `导入来源清单.md`、`导入字段分类.md`、`导入待确认队列.md`、`导入验收清单.md`、`导入策略.md`、`导入风险登记.md`、`导入试跑工具说明.md` |
| freeze / dry-run evidence | `来源快照冻结.md`、`来源快照人工复查清单.md`、`真实试跑证据.md`；私密 manifest 在客户私有仓库 |
| 试用和培训 | `试用培训说明.md`、`试用账号角色菜单核对清单.md`、`试用环境执行手册.md`、`试用人员全页面手工验收清单.md` |
| 字段和编号确认 | `字段编号确认清单.md`、`字段编号确认结果模板.md` |
| 原始资料边界 | `原始客户文件归档评审.md`、`来源材料.md`；当前真源是客户专属 Private 仓库，Product Core 当前工作树已移除原件副本 |
| 历史 evidence | `docs/archive/customer-evidence/yoyoosun/` |

## 真源边界 / Source Boundary

客户资料可以进入脱敏客户文档、客户配置草案、模拟 seed、培训验收或模板候选。进入 Product Core 前必须有通用性依据、对应实现评审和测试同步。当前 yoyoosun 没有可直接执行的客户真实数据；真实导入、库存、出货、预留、财务事实、`tenant_id` 或 SaaS runtime tenant 都不能由本目录材料自动生成。

当前外置状态必须分层理解：Product Core 当前提交树与索引已移除旧原件、真实 manifest 和客户工程指导图片，这只证明当前树客户原件隔离完成。客户原件数量、hash / size、结构化提取、远端回读与当前私有仓版本以客户专属 Private 仓库的 manifest、README 和正式验证记录为准，本目录不复写易漂移的客户仓提交号。

可变产品版本锁定只以客户私有仓 `product.lock.json` 为真源；Product Core `HEAD` 每次推进后，均需在两边已提交且工作树清洁时重新锁定，并以 `FORMAL_PRODUCT_PIN=1` 执行私有仓 `scripts/validate.sh`。既有 Git 历史中的旧副本治理、真实导入批准和客户签收仍是独立未完成项，不能由当前树隔离或一次私有仓验证替代。

`config/customers/yoyoosun/` 与 `deployments/yoyoosun/` 仍是当前产品仓内的非原件配置 / 部署资料，本轮不迁出。客户私有仓库通过兄弟目录或 CI multi-checkout 固定产品版本做验证，不作为 Product Core submodule。

`docs/archive/customer-evidence/yoyoosun/` 只保存历史 evidence：它可以证明当时的发布、模拟或验收记录，不替代当前客户签收、真实导入批准、当前目标环境状态或最新代码验证。

## 更新规则 / Maintenance

新增、删除、重命名本目录长期维护文档，或改变客户交付状态、客户差异分类、导入结论、试用口径时，必须同步检查：

- 本 README。
- `docs/customers/README.md`。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 对应 `config/customers/yoyoosun/`、`deployments/yoyoosun/`、导入脚本和测试断言。
- 客户私有仓库 manifest、来源文件、远端状态与权限边界；不得把私密字段、hash 或访问凭据复制进本目录。
