# 变更请求流程 / Change Request Process

本流程只说明后续客户需求如何分类和评审，不创建 Change 模块，不新增 `change_records`。

## 步骤

1. 记录需求来源、业务场景和样本资料。
2. 判断属于 Product Core、Industry Template、Customer Config、Customer Extension、Data Import Adapter、Print Template Candidate、Reporting 或 Deferred。
3. 涉及库存、出货、质检、财务事实时，必须进入架构评审。
4. 只服务 yoyoosun 的内容先进入 `docs/customers/yoyoosun` 或 `config/customers/yoyoosun`。
5. 可以通用化的内容再进入 `docs/product/*`、`docs/architecture/*`、schema、usecase 和 tests。
6. 每轮实现必须给出验收命令和剩余风险。

## 禁止

- 不把“甲方提过”直接等同 Product Core。
- 不用 workflow payload 补造事实。
- 不用前端本地派生替代后端事实 usecase。
- 不为需求管理提前创建泛化 ChangeUsecase。
