# ERP 客户配置包导入控制台设计规范

> 适用场景：Product Core + 行业模板 + 客户配置包 + 客户部署包 + 标准导入和验收流程  
> 文档目标：约束客户差异导入边界，指导前端页面、后端导入服务、校验规则、版本回滚、审计验收的实现。  
> 核心原则：可维护、可扩展、边界清晰、效率优先、业务准确度优先。

---

## 1. 为什么需要客户配置包导入控制台

ERP 如果要支持多甲方、多客户差异，就不能长期依赖：

- 手工改 YAML；
- 手工跑 SQL；
- 手工修改配置表；
- 靠实施人员记导入顺序；
- 靠口头说明判断客户用了哪些差异；
- 上线失败后靠人工回忆回滚。

因此需要一个可视化的导入控制台，用于完成：

```text
上传客户配置包
解析客户差异
导入前校验
差异对比
流程预览
策略与扩展点检查
Dry Run
正式导入
版本发布
审计留痕
失败回滚
```

这个页面的定位不是低代码平台，也不是让甲方随意修改系统，而是：

> 受控客户差异导入 + 版本化配置发布 + 导入前校验 + 可视化确认 + 可回滚审计的交付控制台。

---

## 2. 总体定位

### 2.1 正确定位

```text
客户配置包导入控制台
Tenant Package Import Console
```

它负责导入和管理客户差异化资产。

### 2.2 不应该做成什么

不能做成：

- 万能低代码平台；
- 任意脚本执行器；
- 任意 SQL 导入器；
- 甲方直接改核心模型的入口；
- 绕过状态机、库存、财务、审计的快捷入口；
- 直接上传 Go / JS / Python 代码的插件平台。

### 2.3 核心边界

```text
可以导入：
配置资产
规则资产
流程编排资产
策略绑定
扩展点绑定
模板资产
导入映射资产

不直接导入：
任意代码
任意 SQL
任意脚本
核心业务对象定义
核心业务事实
不受控状态机
绕过审计的流程
```

---

## 3. 导入资产范围

客户配置包建议包含以下资产：

```text
customer-package/
  tenant.yaml
  version.yaml

  menus/
    menus.yaml

  fields/
    sales_order.fields.yaml
    production_order.fields.yaml

  roles/
    roles.yaml
    permissions.yaml
    data_scopes.yaml

  rules/
    validation.rules.yaml
    pricing.rules.yaml
    settlement.rules.yaml
    inventory.rules.yaml

  workflows/
    sales_order_approval.workflow.yaml
    purchase_order_approval.workflow.yaml
    payment_approval.workflow.yaml

  business-flows/
    sales_to_production.flow.yaml
    purchase_to_inventory.flow.yaml
    production_to_delivery.flow.yaml
    delivery_to_settlement.flow.yaml

  state-machines/
    sales_order.lifecycle.yaml
    production_order.lifecycle.yaml
    purchase_order.lifecycle.yaml

  process-policies/
    skip.policy.yaml
    auto_generate.policy.yaml
    close.policy.yaml
    rollback.policy.yaml

  strategies/
    bindings.yaml
    params.yaml

  extensions/
    bindings.yaml

  templates/
    print/
    export/
    report/

  import-mapping/
    legacy_customer.mapping.yaml
    legacy_order.mapping.yaml
```

---

## 4. 各目录的原因和作用

| 目录 | 作用 | 为什么要单独放 |
|---|---|---|
| `tenant.yaml` | 客户基础信息 | 明确客户编码、客户名称、租户标识 |
| `version.yaml` | 包版本和兼容性 | 防止错误版本导入错误系统 |
| `menus/` | 菜单和页面入口 | 控制客户可见模块，避免硬编码菜单 |
| `fields/` | 字段显示、必填、默认值 | 支持客户字段差异，但不能破坏核心模型 |
| `roles/` | 角色、权限、数据范围 | 保证流程节点有人处理，页面有人可用 |
| `rules/` | 业务规则、校验规则 | 把客户差异规则声明化 |
| `workflows/` | 工作流 | 处理审批、待办、会签、驳回、通知 |
| `business-flows/` | 业务流 | 处理单据之间的业务推进 |
| `state-machines/` | 单据生命周期 | 允许受控调整状态流转，但不能随意破坏闭环 |
| `process-policies/` | 流程策略 | 处理跳过、自动生成、关闭、回退等策略 |
| `strategies/` | 策略绑定和参数 | 只绑定已有策略实现，不上传代码 |
| `extensions/` | 扩展点绑定 | 只绑定已注册 handler，不上传任意代码 |
| `templates/` | 打印、导出、报表模板 | 支持客户交付物差异 |
| `import-mapping/` | 老系统数据映射 | 支持初始化迁移和客户历史数据导入 |

---

## 5. 使用角色

| 角色 | 权限建议 | 说明 |
|---|---|---|
| 系统超级管理员 | 全部权限 | 可上传、校验、导入、发布、回滚 |
| 实施顾问 | 上传、校验、差异查看、Dry Run | 用于客户交付前确认 |
| 交付工程师 | 策略/扩展点检查、部署包检查 | 负责客户部署包和导入包一致性 |
| 甲方管理员 | 查看差异、确认验收 | 不建议允许直接修改核心流程 |
| 普通业务用户 | 无权限 | 不接触导入控制台 |

---

## 6. 推荐菜单结构

```text
系统管理
  └─ 客户配置包
      ├─ 配置包列表
      ├─ 上传配置包
      ├─ 导入向导
      ├─ 差异对比
      ├─ 流程预览
      ├─ 校验报告
      ├─ 导入记录
      ├─ 配置版本
      ├─ 回滚记录
      └─ 审计日志
```

---

## 7. 导入向导流程

导入向导建议采用步骤式设计：

```text
Step 1 上传配置包
Step 2 解析包内容
Step 3 版本兼容检查
Step 4 导入前校验
Step 5 差异对比
Step 6 流程可视化检查
Step 7 策略与扩展点检查
Step 8 Dry Run
Step 9 人工确认
Step 10 正式导入
Step 11 发布配置版本
Step 12 生成导入报告
```

原则：

```text
不解析不导入
不校验不导入
不对比不导入
不 Dry Run 不导入
不生成快照不导入
不通过阻断项不导入
```

---

## 8. 页面一：配置包上传

### 8.1 功能

支持上传：

```text
customer-package.zip
customer-package.yaml
customer-package.json
```

上传后只做解析，不直接写入业务配置。

### 8.2 页面字段

| 字段 | 说明 |
|---|---|
| 客户编码 | tenant code |
| 客户名称 | tenant name |
| 配置包版本 | package version |
| Product Core 版本 | 适配的核心系统版本 |
| 行业模板版本 | 适配的行业模板版本 |
| 包类型 | 全量包 / 增量包 / 修复包 |
| 目标环境 | dev / test / staging / prod |
| 创建人 | 包制作人 |
| 创建时间 | 包生成时间 |
| 包签名 | 可选，用于防篡改 |
| 包摘要 | sha256 hash |

### 8.3 校验

上传阶段至少校验：

- 文件格式是否合法；
- 文件是否完整；
- 是否包含 `version.yaml`；
- 是否包含客户编码；
- 是否重复上传；
- 是否和目标租户匹配；
- 是否超过大小限制；
- 是否存在禁止文件类型。

---

## 9. 页面二：包内容解析

### 9.1 功能

解析配置包中的资产清单，展示本次包包含哪些内容。

示例：

| 资产类型 | 数量 | 状态 |
|---|---:|---|
| 菜单配置 | 12 | 已解析 |
| 字段配置 | 48 | 已解析 |
| 角色权限 | 8 | 已解析 |
| 工作流 | 3 | 已解析 |
| 业务流 | 4 | 已解析 |
| 状态机 | 3 | 已解析 |
| 规则 | 26 | 已解析 |
| 策略绑定 | 5 | 已解析 |
| 扩展点绑定 | 3 | 已解析 |
| 打印模板 | 6 | 已解析 |

### 9.2 解析失败处理

解析失败时不允许进入导入流程。

失败信息必须明确到：

```text
文件
行号
字段
错误原因
修复建议
```

---

## 10. 页面三：导入前校验

这是整个控制台最重要的页面。

### 10.1 校验结果状态

```text
PASSED              可导入
PASSED_WITH_WARN    可导入但有警告
NEED_CONFIRM        需要人工确认
BLOCKED             阻断，不可导入
FAILED              校验失败
```

### 10.2 校验维度

| 校验项 | 说明 | 阻断级别 |
|---|---|---|
| 版本兼容 | Product Core、行业模板版本是否匹配 | 高 |
| 租户匹配 | 包是否属于当前客户 | 高 |
| 菜单校验 | 菜单是否引用不存在页面 | 高 |
| 字段校验 | 字段是否引用不存在对象或破坏必填规则 | 高 |
| 权限校验 | 角色是否覆盖所有菜单和流程节点 | 高 |
| 规则校验 | 规则是否冲突、缺少参数 | 高 |
| 工作流校验 | 节点是否闭环、角色是否存在 | 高 |
| 业务流校验 | 单据链路是否断裂 | 高 |
| 状态机校验 | 是否存在非法状态跳转 | 高 |
| 策略校验 | 策略 code 是否已注册 | 高 |
| 扩展点校验 | handler 是否存在、版本是否匹配 | 高 |
| 模板校验 | 模板字段是否存在 | 中 |
| 导入映射校验 | 老系统字段映射是否完整 | 中 |
| 数据安全校验 | 是否覆盖生产配置 | 高 |
| 回滚校验 | 是否能生成回滚快照 | 高 |

### 10.3 典型阻断项

必须阻断：

```text
字段被隐藏，但规则要求必填
流程节点存在，但没有处理角色
菜单存在，但没有任何角色可访问
策略绑定了未注册实现
扩展点绑定了未注册 handler
工作流存在开始节点但没有结束节点
业务流跳过库存出库直接生成结算
状态机允许 已发货 → 草稿
状态机允许 已结算 → 已提交
模板引用不存在字段
目标租户和包租户不一致
无法生成回滚快照
```

---

## 11. 页面四：差异对比

### 11.1 对比对象

差异对比应该至少支持三方对比：

```text
行业模板默认配置
当前客户生效配置
待导入客户配置包
```

### 11.2 差异类型

```text
新增
修改
停用
删除
覆盖
冲突
高风险
```

注意：业务配置原则上不建议物理删除，优先使用：

```text
停用
归档
版本替换
```

### 11.3 示例表格

| 类型 | 当前值 | 待导入值 | 影响 |
|---|---|---|---|
| 菜单 | 无质检菜单 | 启用质检菜单 | 新增业务入口 |
| 字段 | 客户等级隐藏 | 客户等级显示且必填 | 影响客户创建 |
| 流程 | 销售主管审批 | 销售主管 + 财务审批 | 影响订单提交 |
| 策略 | standard_price | customer_a_price | 影响报价 |
| 扩展点 | 未绑定 | BeforeOrderSubmit 绑定 checker | 影响订单提交 |

---

## 12. 页面五：流程可视化

流程可视化分为四类：

```text
工作流可视化
业务流可视化
状态机可视化
流程策略可视化
```

---

### 12.1 工作流可视化

关注：

```text
人
角色
审批
待办
通知
会签
或签
驳回
超时
```

节点信息：

| 字段 | 说明 |
|---|---|
| 节点编码 | node code |
| 节点名称 | 显示名称 |
| 节点类型 | start / task / approval / gateway / end |
| 处理角色 | role code |
| 是否必经 | required |
| 是否可跳过 | skippable |
| 条件 | condition |
| 驳回路径 | reject_to |
| 超时策略 | timeout policy |
| 关联表单 | form code |

---

### 12.2 业务流可视化

关注：

```text
业务对象之间如何推进
哪些单据自动生成
哪些环节可跳过
哪些环节会产生业务事实
哪些环节影响库存和财务
```

典型毛绒 ERP 主链路：

```text
销售订单
  ↓
样品确认
  ↓
BOM 确认
  ↓
生产订单
  ↓
缺料检查
  ├─ 缺料 → 采购申请 → 采购订单 → 原料入库
  └─ 不缺料 → 生产排期
  ↓
领料出库
  ↓
生产报工
  ↓
质检
  ↓
成品入库
  ↓
销售发货
  ↓
客户对账
  ↓
应收结算
```

节点信息：

| 字段 | 说明 |
|---|---|
| 业务对象 | sales_order / production_order 等 |
| 触发条件 | condition |
| 执行动作 | create / update / close / generate |
| 是否自动执行 | auto |
| 是否产生业务事实 | fact_producing |
| 失败处理 | retry / manual / rollback |
| 关联策略 | strategy code |
| 关联扩展点 | extension point |

---

### 12.3 状态机可视化

状态机用于展示核心单据生命周期。

示例：

```text
草稿
  ↓
已提交
  ↓
已审核
  ↓
执行中
  ↓
已完成
  ↓
已关闭
```

必须禁止：

```text
已发货 → 草稿
已结算 → 已提交
已关闭 → 执行中
已入库事实被流程回退抹掉
```

### 12.4 流程策略可视化

流程策略包括：

```text
跳过策略
自动生成策略
关闭策略
回退策略
异常处理策略
补偿策略
```

---

## 13. 页面六：角色 / 菜单 / 字段矩阵

### 13.1 角色-菜单矩阵

| 角色 | 销售订单 | 生产订单 | 采购订单 | 库存 | 对账 | 结算 |
|---|---:|---:|---:|---:|---:|---:|
| 业务员 | 可编辑 | 只读 | 不可见 | 只读 | 不可见 | 不可见 |
| 生产计划 | 只读 | 可编辑 | 只读 | 只读 | 不可见 | 不可见 |
| 财务 | 只读 | 不可见 | 只读 | 只读 | 可编辑 | 可编辑 |

### 13.2 角色-流程节点矩阵

| 流程节点 | 处理角色 | 是否有人处理 | 风险 |
|---|---|---:|---|
| 销售主管审批 | sales_manager | 是 | 无 |
| 财务审核 | finance | 否 | 高风险 |
| 生产确认 | production_planner | 是 | 无 |

### 13.3 字段影响矩阵

| 字段 | 是否显示 | 是否必填 | 被哪些规则引用 | 风险 |
|---|---:|---:|---|---|
| order_amount | 是 | 是 | 财务审批规则 | 无 |
| customer_level | 隐藏 | 否 | 价格策略 | 中风险 |
| delivery_date | 是 | 是 | 生产排期 | 无 |

---

## 14. 页面七：策略与扩展点检查

### 14.1 策略检查

客户配置包只允许导入策略绑定和策略参数，不允许导入策略代码。

正确方式：

```yaml
pricing_strategy: customer_a_price_strategy
params:
  discount_rate: 0.95
  min_profit_rate: 0.12
```

不允许：

```go
func CalculatePrice(...) {
  // 客户上传任意代码
}
```

检查内容：

| 检查项 | 说明 |
|---|---|
| 策略 code 是否存在 | 必须已注册 |
| 策略版本是否兼容 | 防止参数不匹配 |
| 策略参数是否完整 | 防止运行时报错 |
| 策略来源 | product-core / industry-template / customer-deploy |
| 是否可用于当前业务对象 | 防止绑定错对象 |

### 14.2 扩展点检查

客户配置包只允许导入扩展点绑定，不允许导入扩展点代码。

示例：

```yaml
extensions:
  BeforeOrderSubmit:
    handler: customer_a_order_submit_checker
    enabled: true
```

检查内容：

| 检查项 | 说明 |
|---|---|
| 扩展点是否存在 | Product Core 必须定义 |
| handler 是否注册 | 客户部署包必须提供 |
| handler 版本是否兼容 | 防止运行时错误 |
| 是否允许阻断主流程 | 明确失败策略 |
| 失败后如何处理 | reject / warn / fallback / ignore |

---

## 15. 页面八：Dry Run

Dry Run 是正式导入前的模拟执行。

### 15.1 Dry Run 输出

```text
本次导入计划：
- 新增 3 个菜单
- 修改 12 个字段配置
- 新增 2 个角色
- 修改 1 条销售订单工作流
- 新增 1 条业务流
- 更新 3 条规则
- 绑定 2 个策略
- 绑定 1 个扩展点
- 更新 4 个打印模板
```

### 15.2 风险输出

```text
高风险：
- 销售订单流程新增财务审批节点，可能影响订单提交效率
- 字段 customer_level 被隐藏，但价格策略仍引用它

阻断项：
- BeforeOrderSubmit 绑定的 handler 未注册
```

### 15.3 原则

```text
Dry Run 不写入生效配置
Dry Run 可以生成导入计划
Dry Run 可以生成失败报告
Dry Run 必须和正式导入使用同一套校验逻辑
```

---

## 16. 页面九：正式导入

正式导入必须采用事务化、批次化、版本化设计。

### 16.1 导入顺序

```text
1. 创建导入批次
2. 生成当前配置快照
3. 校验版本兼容
4. 导入基础配置
5. 导入角色权限
6. 导入菜单字段
7. 导入规则
8. 导入工作流
9. 导入业务流
10. 导入状态机配置
11. 导入流程策略
12. 导入策略绑定
13. 导入扩展点绑定
14. 导入模板
15. 重新校验整体闭环
16. 发布配置版本
17. 生成导入报告
```

### 16.2 关键原则

```text
不要边导入边生效
先导入草稿版本
整体校验通过后再发布
发布失败必须保留旧版本
导入失败必须可以回滚
```

推荐状态：

```text
UPLOADED
PARSED
VALIDATING
VALIDATED
DRY_RUN_PASSED
IMPORTING
IMPORTED_DRAFT
PUBLISHING
PUBLISHED
FAILED
ROLLED_BACK
```

---

## 17. 页面十：配置版本与回滚

### 17.1 配置版本

每次正式导入生成配置版本：

```text
tenant_config_version = 2026.06.28-001
```

示例：

| 版本 | 导入人 | 时间 | 包版本 | 状态 | 操作 |
|---|---|---|---|---|---|
| v1.3.0 | 张三 | 2026-06-28 | customer-a-1.3.0 | 当前生效 | 查看 |
| v1.2.0 | 李四 | 2026-06-20 | customer-a-1.2.0 | 已归档 | 回滚 |
| v1.1.0 | 王五 | 2026-06-10 | customer-a-1.1.0 | 已归档 | 查看 |

### 17.2 回滚原则

回滚不是删除业务数据，而是：

```text
恢复上一份配置快照
重新发布配置版本
保留回滚记录
保留审计日志
```

不能做：

```text
删除业务事实
删除库存流水
删除财务流水
删除发货记录
删除结算记录
```

如果配置影响已经产生业务事实，需要通过业务补偿处理，而不是配置回滚直接抹除事实。

---

## 18. 页面十一：导入报告

导入完成后必须生成报告。

报告内容：

```text
客户信息
导入包信息
系统版本
导入环境
导入人
导入时间
导入内容摘要
差异列表
风险项
校验结果
失败项
回滚点
验收建议
```

报告用途：

```text
内部交付复盘
甲方验收
上线审批
问题追责
后续升级
```

---

## 19. 审计日志

所有关键动作都必须审计：

| 动作 | 是否审计 |
|---|---:|
| 上传配置包 | 是 |
| 删除上传包 | 是 |
| 解析配置包 | 是 |
| 校验配置包 | 是 |
| Dry Run | 是 |
| 正式导入 | 是 |
| 发布配置版本 | 是 |
| 回滚配置版本 | 是 |
| 下载导入报告 | 是 |
| 人工确认风险项 | 是 |

审计字段：

```text
操作人
操作时间
租户
环境
配置包版本
操作类型
操作结果
失败原因
请求 IP
User-Agent
变更摘要
```

---

## 20. 权限控制

建议权限点：

```text
tenant_package:view
tenant_package:upload
tenant_package:parse
tenant_package:validate
tenant_package:dry_run
tenant_package:import
tenant_package:publish
tenant_package:rollback
tenant_package:audit_view
tenant_package:report_download
```

生产环境导入和回滚建议增加二次确认或审批。

---

## 21. 数据模型建议

### 21.1 tenant_config_package

用于记录上传包。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tenant_id | 租户 |
| package_code | 包编码 |
| package_version | 包版本 |
| product_core_version | 核心版本 |
| industry_template_version | 行业模板版本 |
| package_type | full / incremental / patch |
| env | dev / test / staging / prod |
| file_path | 文件路径 |
| file_hash | 文件摘要 |
| status | 状态 |
| uploaded_by | 上传人 |
| uploaded_at | 上传时间 |

### 21.2 tenant_config_import_batch

用于记录导入批次。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tenant_id | 租户 |
| package_id | 配置包 |
| batch_no | 导入批次号 |
| status | 导入状态 |
| dry_run_result | Dry Run 结果 |
| validation_result | 校验结果 |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| created_by | 操作人 |

### 21.3 tenant_config_version

用于记录配置版本。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tenant_id | 租户 |
| version | 配置版本 |
| package_id | 来源配置包 |
| snapshot_id | 快照 |
| status | draft / active / archived / rollback |
| published_by | 发布人 |
| published_at | 发布时间 |

### 21.4 tenant_config_snapshot

用于回滚。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tenant_id | 租户 |
| version_id | 配置版本 |
| snapshot_data | 快照数据 |
| created_at | 创建时间 |

### 21.5 tenant_config_audit_log

用于审计。

| 字段 | 说明 |
|---|---|
| id | 主键 |
| tenant_id | 租户 |
| action | 操作 |
| target_type | 操作对象类型 |
| target_id | 操作对象 ID |
| operator_id | 操作人 |
| operator_name | 操作人名称 |
| result | 成功 / 失败 |
| detail | 操作详情 |
| created_at | 创建时间 |

---

## 22. 后端服务边界

建议拆成以下服务：

```text
PackageUploadService
PackageParseService
PackageValidationService
PackageDiffService
PackageDryRunService
PackageImportService
ConfigVersionService
ConfigPublishService
ConfigRollbackService
ImportAuditService
ImportReportService
```

### 22.1 PackageValidationService

负责：

```text
版本兼容校验
租户匹配校验
字段合法性校验
菜单合法性校验
规则冲突校验
流程闭环校验
状态机合法性校验
策略注册校验
扩展点注册校验
模板字段校验
回滚可行性校验
```

### 22.2 PackageImportService

负责：

```text
导入草稿版本
写入导入批次
调用各资产 importer
失败处理
整体一致性校验
不负责直接发布
```

### 22.3 ConfigPublishService

负责：

```text
将草稿配置发布为生效版本
切换租户配置版本
刷新配置缓存
记录发布审计
```

---

## 23. API 建议

```text
POST   /api/admin/tenant-packages/upload
GET    /api/admin/tenant-packages
GET    /api/admin/tenant-packages/{id}
POST   /api/admin/tenant-packages/{id}/parse
POST   /api/admin/tenant-packages/{id}/validate
GET    /api/admin/tenant-packages/{id}/diff
GET    /api/admin/tenant-packages/{id}/flow-preview
POST   /api/admin/tenant-packages/{id}/dry-run
POST   /api/admin/tenant-packages/{id}/import
POST   /api/admin/config-versions/{id}/publish
POST   /api/admin/config-versions/{id}/rollback
GET    /api/admin/import-batches
GET    /api/admin/import-batches/{id}
GET    /api/admin/import-batches/{id}/report
GET    /api/admin/import-audit-logs
```

---

## 24. 前端页面组件建议

```text
PackageUploadPanel
PackageMetaCard
PackageAssetSummary
ValidationResultPanel
ValidationIssueTable
DiffViewer
WorkflowPreviewCanvas
BusinessFlowPreviewCanvas
StateMachinePreviewCanvas
RoleMenuMatrix
RoleWorkflowMatrix
FieldImpactMatrix
StrategyRegistryCheckTable
ExtensionRegistryCheckTable
DryRunPlanPanel
ImportProgressPanel
ImportReportPanel
ConfigVersionTable
RollbackConfirmDialog
AuditLogTable
```

---

## 25. MVP 实现范围

第一版不要做太大。

### P0 必做

| 功能 | 说明 |
|---|---|
| 上传配置包 | 支持 zip/yaml/json |
| 解析包内容 | 展示资产清单 |
| 版本兼容校验 | Product Core / 行业模板 |
| 基础校验报告 | 输出阻断项和警告项 |
| 差异对比 | 当前配置 vs 待导入配置 |
| Dry Run | 生成导入计划 |
| 正式导入 | 导入草稿版本 |
| 配置版本快照 | 支持回滚 |
| 发布配置版本 | 草稿发布为生效 |
| 导入记录 | 可查看历史导入 |
| 审计日志 | 关键动作留痕 |

### P1 增强

| 功能 | 说明 |
|---|---|
| 工作流可视化 | 节点、角色、驳回、会签 |
| 业务流可视化 | 单据链路和业务事实 |
| 状态机可视化 | 生命周期闭环 |
| 角色/菜单/字段矩阵 | 排查权限和字段冲突 |
| 策略/扩展点注册检查 | 绑定与部署包一致性 |
| 导入报告导出 | PDF / Markdown / HTML |

### P2 后续

| 功能 | 说明 |
|---|---|
| 沙箱预演 | 在隔离环境验证导入 |
| UAT 验收流 | 甲方确认后发布 |
| 多环境发布 | dev → test → staging → prod |
| 包签名校验 | 防篡改 |
| 配置灰度发布 | 小范围启用配置 |
| 自动化回归测试 | 导入后跑核心链路测试 |

---

## 26. 验收标准

### 26.1 导入前验收

必须满足：

```text
配置包能上传
配置包能解析
版本不兼容能阻断
租户不匹配能阻断
未注册策略能阻断
未注册扩展点能阻断
流程无结束节点能阻断
流程节点无角色能阻断
非法状态跳转能阻断
字段隐藏但规则依赖能提示风险
Dry Run 能输出导入计划
```

### 26.2 导入后验收

必须满足：

```text
导入后生成配置版本
导入后生成审计记录
导入后可以查看差异
导入后可以查看导入报告
发布失败不影响旧版本
导入失败可以回滚
回滚不删除业务事实
配置版本切换后业务页面使用新配置
```

### 26.3 核心业务链路验收

至少跑通：

```text
销售订单创建
销售订单审批
销售到生产
生产到采购
采购入库
生产领料
成品入库
销售发货
客户对账
应收结算
```

---

## 27. 自动化测试建议

### 27.1 单元测试

覆盖：

```text
配置包解析
版本兼容判断
字段校验
菜单校验
角色校验
规则校验
工作流闭环校验
业务流闭环校验
状态机非法跳转校验
策略注册校验
扩展点注册校验
```

### 27.2 集成测试

覆盖：

```text
上传 → 解析 → 校验 → Dry Run
上传 → 校验失败 → 阻断
上传 → Dry Run → 正式导入 → 发布
导入失败 → 回滚
发布失败 → 保留旧版本
```

### 27.3 E2E 测试

覆盖：

```text
实施顾问上传配置包
系统显示差异
系统显示流程预览
系统提示风险项
管理员确认风险
系统执行 Dry Run
系统正式导入
系统发布配置版本
业务页面使用新配置
```

---

## 28. 风险边界

必须明确：

```text
客户配置包不能直接修改核心业务对象定义
客户配置包不能删除业务事实
客户配置包不能绕过库存流水
客户配置包不能绕过财务流水
客户配置包不能绕过审计日志
客户配置包不能上传任意代码
客户配置包不能执行任意 SQL
客户配置包不能导入未注册策略实现
客户配置包不能导入未注册扩展点 handler
客户配置包不能让状态机出现非法回退
```

---

## 29. 推荐实现原则

```text
声明式优先
版本化优先
导入前校验优先
Dry Run 优先
快照优先
发布切换优先
回滚不删事实
代码实现走部署包
配置导入走客户配置包
客户差异必须可追溯
```

---

## 30. 给 Codex 的实现提示词关键词

如果后续让 Codex 实现，可使用这些关键词：

```text
实现客户配置包导入控制台
不要做万能低代码平台
不要允许上传任意代码、SQL、脚本
导入对象包括配置、规则、流程编排、策略绑定、扩展点绑定、模板、导入映射
策略实现和扩展点实现必须来自已注册部署包
先上传解析，再校验，再差异对比，再 Dry Run，再导入草稿版本，再发布
必须支持配置版本快照和回滚
必须记录审计日志
必须阻断非法状态跳转、未注册策略、未注册扩展点、流程无闭环、角色缺失
回滚不能删除业务事实
保持 Product Core、行业模板、客户配置包、客户部署包边界清晰
```

---

## 31. 最终结论

客户配置包导入控制台是 ERP 产品化交付的关键能力。

它应该解决：

```text
客户差异怎么导入
导入前怎么校验
导入影响怎么看
流程差异怎么看
策略和扩展点是否匹配
失败如何回滚
上线后如何审计
后续升级如何追溯
```

最终原则：

> 配置、规则、流程编排、策略绑定、扩展点绑定可以导入；  
> 策略实现、扩展点实现、代码级差异必须通过客户部署包受控发布；  
> 流程可以编排，但不能破坏核心状态机、业务事实、库存、财务和审计闭环。
