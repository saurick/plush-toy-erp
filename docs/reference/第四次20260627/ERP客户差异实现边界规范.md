# ERP 客户差异实现边界规范

## 1. 文档目的

本文用于指导 ERP 产品化过程中，客户差异应该如何实现，以及不同实现方式之间的边界。

核心目标：

```text
避免所有客户差异都写成 if customer == xxx
避免所有客户差异都变成 Hook
避免客户代码打穿 Product Core
避免流程、状态、库存、财务、审计链路失控
避免每个客户复制一套页面和接口
```

客户差异允许存在，但必须放在受控位置。

推荐处理顺序：

```text
配置
  ↓
规则
  ↓
策略接口
  ↓
流程编排
  ↓
代码级扩展点
```

越靠前越稳定，越适合产品化。
越靠后能力越强，但风险越高，必须严格限制。

---

## 2. 总体原则

### 2.1 Product Core 必须是主导方

Product Core 负责：

```text
主数据模型
单据模型
状态机
权限点
业务事实
审计记录
库存落账
财务落账
标准流程闭环
标准页面能力
标准导入导出能力
```

客户差异只能影响 Product Core 明确开放的部分。

客户扩展包不能反过来接管 Product Core。

---

### 2.2 客户差异只能返回结果，不能直接改核心事实

推荐模式：

```text
Product Core 提供上下文
  ↓
客户差异层返回配置 / 判断 / 计算 / 决策结果
  ↓
Product Core 校验结果
  ↓
Product Core 执行状态变更、库存写入、财务写入、审计记录
```

禁止模式：

```text
客户差异层直接改状态
客户差异层直接写库存
客户差异层直接写财务
客户差异层直接删除核心数据
客户差异层直接绕过权限
客户差异层直接跳过审计
```

---

### 2.3 所有扩展必须有默认实现

任何扩展点都必须有默认实现。

目的：

```text
Product Core 可以独立运行
标准客户可以独立测试
没有客户包时系统不崩溃
新客户可以先使用标准逻辑
客户实现可以对照默认实现开发
```

禁止：

```text
没有客户包就跑不通核心流程
核心页面必须依赖客户代码
核心业务逻辑全部散落在客户包
```

---

## 3. 五层边界总览

| 层级     | 本质     | 适合解决                   | 不适合解决           | 风险  |
| ------ | ------ | ---------------------- | --------------- | --- |
| 配置     | 改参数    | 显示、隐藏、开关、默认值、模板、权限绑定   | 复杂判断、复杂计算、状态变更  | 最低  |
| 规则     | 改判断    | 校验、审批条件、风险提示、条件分支      | 复杂算法、直接写库、状态推进  | 低到中 |
| 策略接口   | 换算法    | 报价、BOM、物料需求、审批人选择、复杂转换 | 直接保存、直接改状态、直接落账 | 中   |
| 流程编排   | 改步骤    | 多一步、少一步、节点启停、退回路径、角色责任 | 绕过状态机、页面自行决定状态  | 中到高 |
| 代码级扩展点 | 客户私有代码 | 特殊文件解析、特殊系统对接、特殊协议适配   | 接管核心业务闭环        | 最高  |

---

## 4. 第一层：配置

## 4.1 配置的定义

配置就是：

```text
不写代码，只改结构化参数。
```

配置适合表达稳定、可枚举、可开关、可默认化的差异。

---

## 4.2 配置适合做什么

配置可以做：

```text
字段显示 / 隐藏
字段必填 / 非必填
字段默认值
字段标签名
页面列表列配置
详情页字段分组
菜单启用 / 停用
功能启用 / 停用
打印模板选择
导入模板字段选择
编号规则配置
角色和权限点绑定
流程节点启用 / 停用
是否允许人工改价
是否启用打样流程
```

示例：

```yaml
sales_order:
  fields:
    customer_style_no:
      visible: true
      required: true
      label: 客户款号

    factory_audit_no:
      visible: false
      required: false

features:
  sample_flow: false
  qc_flow: true
```

---

## 4.3 配置不能做什么

配置不能做：

```text
复杂业务判断
复杂价格计算
复杂物料计算
直接修改订单状态
直接写库存事实
直接写财务事实
直接触发外部系统同步
跨对象复杂推导
```

错误示例：

```yaml
if customer_level == "VIP" and amount > 100000 and region == "EU":
  discount: 0.85
```

这种已经不是配置，而是规则或策略。

---

## 4.4 配置的实现建议

推荐结构：

```text
server/
  internal/
    config/
      customer_config.go
      field_config.go
      page_config.go
      menu_config.go
      template_config.go
      permission_config.go
```

推荐配置来源：

```text
数据库配置
客户部署包 YAML
默认配置文件
行业模板配置
```

推荐加载顺序：

```text
Product Core 默认配置
  ↓
行业模板配置
  ↓
客户配置包
  ↓
数据库运行时配置
```

后加载的配置可以覆盖前面的配置，但必须经过校验。

---

## 4.5 配置校验要求

配置加载时必须校验：

```text
字段是否存在
字段类型是否匹配
必填字段是否被错误隐藏
菜单权限点是否存在
模板 ID 是否存在
流程节点是否存在
配置值是否合法
是否破坏核心必需字段
```

特别注意：

```text
核心必需字段不能被删除
核心必需状态不能被删除
核心审计字段不能被隐藏到系统不可追溯
核心业务事实不能被配置关闭
```

---

## 5. 第二层：规则

## 5.1 规则的定义

规则就是：

```text
用结构化条件表达业务判断。
```

规则适合解决“如果满足条件，就产生某种结果”的问题。

---

## 5.2 规则适合做什么

规则可以做：

```text
提交前校验
审核前校验
出货前校验
金额超限审批
信用额度检查
交期风险提示
损耗率超限提示
客户等级判断
是否需要老板审批
是否需要加急审批
是否允许人工改价
```

示例：

```json
{
  "ruleId": "order_amount_approval",
  "module": "sales_order",
  "scenario": "before_submit",
  "condition": "order.amount > 100000",
  "effect": {
    "type": "require_approval",
    "role": "boss",
    "message": "订单金额超过 10 万，需要老板审批"
  }
}
```

---

## 5.3 规则不能做什么

规则不能做：

```text
直接保存订单
直接修改订单状态
直接创建采购单
直接扣减库存
直接生成应收应付
直接发送外部系统请求
直接删除数据
直接跨租户查询数据
```

规则只返回判断结果，不执行最终动作。

正确：

```text
规则返回：需要老板审批
Product Core 创建审批任务
Product Core 记录审计
Product Core 控制状态
```

错误：

```text
规则自己创建审批任务
规则自己修改订单状态
规则自己写数据库
```

---

## 5.4 规则引擎接口建议

```go
type RuleContext struct {
    TenantID   string
    CustomerID string
    Module     string
    Scenario   string
    Actor      ActorDTO
    Facts      map[string]any
}

type RuleResult struct {
    Passed   bool
    Errors   []RuleError
    Warnings []RuleWarning
    Effects  []RuleEffect
}

type RuleEngine interface {
    Evaluate(ctx context.Context, input RuleContext) (RuleResult, error)
}
```

规则结果：

```go
type RuleEffect struct {
    Type    string
    Role    string
    Message string
    Level   string
}
```

---

## 5.5 规则边界校验

规则执行后，Product Core 必须校验：

```text
Effect 类型是否合法
Role 是否存在
Permission 是否存在
返回字段是否存在
错误级别是否合法
是否尝试返回非法动作
是否和当前状态机冲突
```

规则不能说：

```text
直接进入 shipped 状态
直接跳过审核
直接生成库存流水
```

这些属于状态机或业务事实，不归规则控制。

---

## 6. 第三层：策略接口

## 6.1 策略接口的定义

策略接口就是：

```text
Product Core 定义稳定接口，客户包提供具体实现。
```

它适合处理配置和规则表达不了的复杂算法。

---

## 6.2 策略接口适合做什么

策略接口可以做：

```text
复杂报价算法
复杂 BOM 展开
复杂物料需求计算
复杂损耗率计算
复杂审批人选择
复杂导入字段映射
复杂出货拆分建议
复杂外部系统字段转换
```

示例：

```go
type PricingPolicy interface {
    Calculate(ctx context.Context, input PricingInput) (PricingResult, error)
}
```

---

## 6.3 策略接口不能做什么

策略接口不能做：

```text
直接保存订单
直接修改订单状态
直接写库存
直接写财务
直接创建业务事实
直接删除核心数据
直接绕过权限
直接跳过审计
```

策略接口应该是：

```text
输入上下文 -> 返回计算结果
```

不应该是：

```text
输入上下文 -> 操作数据库 -> 改变业务状态
```

---

## 6.4 策略接口实现建议

目录：

```text
server/
  internal/
    extension/
      contract/
        pricing_policy.go
        material_requirement_policy.go
        approval_policy.go

      defaultimpl/
        default_pricing_policy.go
        default_material_requirement_policy.go
        default_approval_policy.go

      registry/
        policy_registry.go

    customers/
      yongshen/
        policies/
          pricing_policy.go
          material_requirement_policy.go
```

接口示例：

```go
type PricingInput struct {
    TenantID   string
    CustomerID string
    ProductID  string
    Quantity   int
    Currency   string
    Materials  []MaterialCostDTO
    Config     PricingConfigDTO
}

type PricingResult struct {
    Price        decimal.Decimal
    Currency     string
    TaxRate      decimal.Decimal
    DiscountRate decimal.Decimal
    Items        []PricingItemDTO
    Explanation  string
}

type PricingPolicy interface {
    Calculate(ctx context.Context, input PricingInput) (PricingResult, error)
}
```

注册：

```go
type PolicyRegistry struct {
    pricingPolicies map[string]PricingPolicy
}

func (r *PolicyRegistry) RegisterPricingPolicy(customerID string, policy PricingPolicy) {
    r.pricingPolicies[customerID] = policy
}

func (r *PolicyRegistry) PricingPolicy(customerID string) PricingPolicy {
    if p, ok := r.pricingPolicies[customerID]; ok {
        return p
    }
    return r.pricingPolicies["default"]
}
```

---

## 6.5 策略接口返回值校验

Product Core 必须校验策略结果：

```text
价格不能为负数
币种必须合法
税率必须在允许范围内
物料需求不能出现不存在的物料
审批人必须存在
返回结果必须属于当前租户
返回结果不能引用无权限对象
```

策略接口不能因为是代码实现就绕过校验。

---

## 7. 第四层：流程编排

## 7.1 流程编排的定义

流程编排就是：

```text
通过配置和状态机引擎表达客户业务步骤差异。
```

它适合解决流程多一步、少一步、顺序不同、审批不同、角色责任不同的问题。

---

## 7.2 流程编排适合做什么

流程编排可以做：

```text
启用 / 禁用流程节点
增加客户确认节点
增加内部评审节点
配置退回路径
配置跳过动作
配置自动通过动作
配置节点责任角色
配置动作所需权限
配置动作是否需要原因
配置动作是否阻塞后续流程
```

示例：

```yaml
workflow: sales_order
customer: yongshen

states:
  - draft
  - submitted
  - approved
  - production_ready
  - shipped
  - closed

actions:
  submit:
    from: draft
    to: submitted
    permission: order.submit

  approve:
    from: submitted
    to: approved
    permission: order.approve

  skip_sample:
    from: approved
    to: production_ready
    permission: order.sample.skip
    reason_required: true

  ship:
    from: production_ready
    to: shipped
    permission: shipment.confirm
```

---

## 7.3 流程编排不能做什么

流程编排不能做：

```text
绕过状态机
让前端自己决定状态
让客户代码任意跳状态
跳过审计
跳过权限检查
直接写库存事实
直接写财务事实
删除关键业务节点导致后续数据缺失
```

流程编排只能定义可走路径。
真正执行动作时必须由 Product Core 统一处理。

---

## 7.4 流程少一环的边界

客户少一环时，不允许简单删除。

必须明确：

```text
这个节点是否产生后续必需数据
这个节点是否承担审批责任
这个节点是否产生业务事实
这个节点是否影响库存、采购、生产、出货、财务
这个节点是否需要审计追溯
```

可接受方式：

```text
节点禁用
节点自动通过
节点合并到上一节点
节点合并到下一节点
节点由系统默认完成
节点由同一角色兼任完成
```

示例：

```yaml
sample:
  enabled: false
  mode: auto_skip
  skip_reason: "该客户不需要打样流程"
```

必须记录：

```text
谁跳过
为什么跳过
什么时候跳过
从什么状态到什么状态
是否系统自动跳过
```

---

## 7.5 流程多一环的边界

客户多一环时，必须定义：

```text
节点名称
节点位置
进入条件
完成条件
责任角色
所需权限
是否阻塞后续流程
退回路径
审计要求
失败处理
```

示例：

```yaml
states:
  - draft
  - internal_review
  - customer_confirmed
  - approved

actions:
  submit_review:
    from: draft
    to: internal_review
    permission: order.submit_review

  internal_approve:
    from: internal_review
    to: customer_confirmed
    permission: order.internal_approve

  customer_confirm:
    from: customer_confirmed
    to: approved
    permission: order.customer_confirm
```

---

## 7.6 流程引擎接口建议

```go
type WorkflowContext struct {
    TenantID   string
    CustomerID string
    Module     string
    EntityID   string
    State      string
    Actor      ActorDTO
}

type WorkflowAction struct {
    Code           string
    From           string
    To             string
    Permission     string
    ReasonRequired bool
    Auto           bool
}

type WorkflowEngine interface {
    GetAvailableActions(ctx context.Context, input WorkflowContext) ([]WorkflowAction, error)
    ExecuteAction(ctx context.Context, input ExecuteActionInput) error
}
```

执行动作必须包含：

```text
状态校验
权限校验
规则校验
动作合法性校验
原因校验
状态推进
业务事实处理
审计记录
```

---

## 8. 第五层：代码级扩展点

## 8.1 代码级扩展点的定义

代码级扩展点就是：

```text
客户包可以接入自定义代码，但这是最后手段。
```

只用于配置、规则、策略接口、流程编排都表达不了的客户私有能力。

---

## 8.2 代码级扩展点适合做什么

代码级扩展点可以做：

```text
特殊文件解析
特殊导入清洗
特殊外部系统协议
特殊单据格式转换
特殊历史系统兼容
特殊数据映射
特殊第三方接口适配
```

示例：

```go
type Importer interface {
    Parse(ctx context.Context, file FileDTO) (ImportResult, error)
}
```

---

## 8.3 代码级扩展点不能做什么

代码级扩展点禁止：

```text
直接拿 ent.Client
直接拿 *sql.DB
直接调用核心 Repository 写数据
直接修改订单状态
直接写库存
直接写财务
直接删除核心数据
直接跨租户访问数据
直接绕过权限
直接跳过审计
直接启动不可控 goroutine
直接发起不可控外部请求
直接 panic 影响主流程
```

---

## 8.4 代码级扩展点实现建议

目录：

```text
server/
  internal/
    extension/
      contract/
      registry/
      defaultimpl/
      port/

    customers/
      yongshen/
        importers/
        exporters/
        integrations/
        policies/
```

客户代码通过注册中心接入：

```go
func RegisterYongshenExtensions(registry *ExtensionRegistry) {
    registry.RegisterImporter("yongshen", "sales_order", &YongshenOrderImporter{})
    registry.RegisterExternalAdapter("yongshen", "legacy_erp", &YongshenLegacyERPAdapter{})
}
```

核心启动时加载：

```go
func BootstrapExtensions(registry *ExtensionRegistry) {
    defaultimpl.Register(registry)
    yongshen.RegisterYongshenExtensions(registry)
}
```

核心调用时只认接口：

```go
importer := registry.GetImporter(customerID, "sales_order")
result, err := importer.Parse(ctx, file)
```

---

## 8.5 只能提供受限 Port

客户扩展代码不能直接访问数据库。

可以提供受限 Port：

```go
type ExtensionDataPort interface {
    GetProduct(ctx context.Context, productID string) (ProductDTO, error)
    GetCustomer(ctx context.Context, customerID string) (CustomerDTO, error)
    FindMaterials(ctx context.Context, query MaterialQuery) ([]MaterialDTO, error)
}
```

必要时提供写入请求 Port，但不能直接写库：

```go
type ExtensionCommandPort interface {
    RequestCreateImportDraft(ctx context.Context, input ImportDraftInput) (ImportDraftResult, error)
    RequestExternalSync(ctx context.Context, input ExternalSyncInput) (ExternalSyncResult, error)
}
```

注意命名要体现 `Request`，表示客户代码只是提出请求，最终是否执行由 Product Core 决定。

---

## 9. 跨层边界规则

## 9.1 配置不能升级成脚本

禁止把配置做成万能脚本。

错误方向：

```text
配置里写大量 if / else
配置里写 SQL
配置里写 JavaScript
配置里直接调用接口
```

一旦配置需要复杂判断，应升级为规则。

---

## 9.2 规则不能直接执行动作

规则只能返回 effect，不能直接执行动作。

允许：

```text
reject
warn
require_approval
mark_risk
suggest_value
```

禁止：

```text
save_order
change_state
create_inventory_record
create_finance_record
delete_data
```

---

## 9.3 策略接口不能绕开 Product Core

策略接口只能返回计算、选择、转换结果。

允许：

```text
PricingResult
MaterialRequirementResult
ApprovalAssigneeResult
ImportMappingResult
```

禁止：

```text
直接保存订单
直接创建采购单
直接生成库存流水
直接推进状态
```

---

## 9.4 流程编排不能破坏状态机

流程配置必须经过状态机校验。

禁止：

```text
从 draft 直接 shipped
从 approved 直接 closed 且没有出货事实
跳过必需业务事实
删除后续流程依赖的数据来源
```

如果流程少一步，必须提供替代数据来源或自动跳过审计。

---

## 9.5 代码级扩展点不能接触核心基础设施

客户代码禁止直接访问：

```text
数据库连接
核心 Repository
事务对象
消息队列 Producer
库存服务写接口
财务服务写接口
权限服务内部实现
状态机内部实现
```

客户代码只能访问：

```text
DTO
只读 Query Port
受控 Command Request Port
当前租户上下文
当前操作者上下文
```

---

## 10. 权限边界

所有层级都必须遵守权限边界。

配置不能打开不存在的权限点。
规则不能授予用户额外权限。
策略接口不能绕过权限判断。
流程编排动作必须绑定权限点。
代码级扩展点不能直接判断并绕过权限。

正确做法：

```text
Product Core 定义 Permission Point
客户配置绑定 Role -> Permission Point
Workflow Action 绑定 Permission Point
Product Core 在执行动作时统一检查权限
```

示例：

```yaml
actions:
  approve:
    from: submitted
    to: approved
    permission: order.approve
```

---

## 11. 状态机边界

订单、采购、生产、出货等核心业务对象必须由状态机控制。

客户差异不能直接修改状态。

状态变更必须经过：

```text
当前状态校验
目标状态校验
动作合法性校验
权限校验
规则校验
必填数据校验
审计记录
```

禁止：

```go
order.Status = "shipped"
repo.Save(order)
```

推荐：

```go
workflowEngine.ExecuteAction(ctx, ExecuteActionInput{
    EntityID: orderID,
    Action:   "ship",
    Actor:    actor,
    Reason:   reason,
})
```

---

## 12. 业务事实边界

业务事实包括：

```text
库存流水
采购订单
出货记录
生产记录
质检记录
应收应付
审批记录
审计记录
```

业务事实必须由 Product Core 生成和落账。

客户差异层只能返回建议或计算结果。

例如：

```text
物料策略返回物料需求结果
Product Core 创建采购需求

价格策略返回报价结果
Product Core 保存报价明细

流程规则返回需要审批
Product Core 创建审批任务

导入扩展返回解析结果
Product Core 创建导入草稿
```

---

## 13. 数据访问边界

客户差异层原则上不能直接访问数据库。

允许访问：

```text
当前租户数据
当前业务上下文
Product Core 提供的 DTO
Product Core 提供的只读查询接口
Product Core 提供的受控请求接口
```

禁止访问：

```text
其他租户数据
数据库连接对象
核心 Repository
事务对象
未授权字段
未发布内部模型
```

---

## 14. 审计边界

所有客户差异导致的结果，都必须可追溯。

至少记录：

```text
客户 ID
租户 ID
业务对象 ID
扩展点名称
扩展点版本
配置版本
规则版本
策略实现名称
输入摘要
输出摘要
执行人
执行时间
执行结果
错误信息
```

特别是：

```text
流程跳过
自动通过
规则拒绝
价格重算
物料需求重算
外部系统同步
导入解析
```

必须留痕。

---

## 15. 版本边界

扩展点接口要版本化。

推荐：

```text
PricingPolicyV1
PricingPolicyV2
MaterialRequirementPolicyV1
WorkflowActionPolicyV1
ImporterV1
```

客户包必须声明兼容版本：

```yaml
customer: yongshen
compatibleCoreVersion: 1.3.x

extensionPoints:
  PricingPolicy: v1
  MaterialRequirementPolicy: v1
  Importer: v1
```

升级规则：

```text
新增可选字段可以兼容
删除字段必须升版本
改变字段语义必须升版本
改变返回结构必须升版本
改变调用时机必须升版本
```

---

## 16. 测试边界

每一层都必须有测试。

### 16.1 配置测试

必须验证：

```text
默认配置可运行
客户配置可覆盖
核心必需字段不能隐藏为不可用
隐藏字段不影响保存
导入模板跟字段配置一致
打印模板跟字段配置一致
菜单和权限一致
```

---

### 16.2 规则测试

必须验证：

```text
规则命中正确
规则未命中正确
规则优先级正确
规则关闭后不生效
规则返回 effect 合法
规则不能返回非法动作
规则错误信息正确
```

---

### 16.3 策略接口测试

必须验证：

```text
默认策略可运行
客户策略可运行
客户策略返回值合法
异常输入可处理
返回结果不跨租户
返回结果不破坏核心状态
```

---

### 16.4 流程编排测试

必须验证：

```text
标准流程可闭环
少一步流程可闭环
多一步流程可闭环
非法状态不能跳转
跳过动作必须有审计
退回路径正确
角色合并后责任仍可追溯
```

---

### 16.5 代码级扩展点测试

必须验证：

```text
客户代码不能直接访问数据库
客户代码不能跨租户读写
客户代码异常不会拖垮核心流程
客户代码返回结果会被 Product Core 校验
客户代码执行过程可审计
```

---

## 17. 推荐验收清单

实现客户差异前，必须回答：

```text
这个差异能不能用配置解决？
这个差异是不是只是条件判断？
这个差异是不是复杂算法？
这个差异是不是流程步骤变化？
这个差异是不是客户私有集成或私有解析？
这个差异是否影响状态机？
这个差异是否影响库存、财务、审计、追溯？
这个差异是否有默认实现？
这个差异是否有测试用例？
这个差异是否需要版本化？
```

如果无法回答清楚，不允许直接写客户代码。

---

## 18. 常见场景归类

| 客户需求         | 推荐实现层     | 说明              |
| ------------ | --------- | --------------- |
| 某字段不显示       | 配置        | 字段配置控制 visible  |
| 某字段改名        | 配置        | label 配置        |
| 某字段必填        | 配置 / 规则   | 简单必填用配置，条件必填用规则 |
| 金额超过 10 万审批  | 规则        | 条件判断            |
| 信用额度不足禁止提交   | 规则        | 提交前校验           |
| 复杂报价公式       | 策略接口      | 算法逻辑            |
| BOM 特殊展开     | 策略接口      | 复杂计算            |
| 不需要打样        | 流程编排      | 节点禁用或自动跳过       |
| 多一个内部评审      | 流程编排      | 增加节点和动作         |
| 老系统特殊 TXT 导入 | 代码级扩展点    | 私有解析            |
| 对接客户内部 OA    | 代码级扩展点    | 外部系统适配          |
| 打印模板不同       | 配置 / 策略接口 | 普通模板用配置，复杂渲染用策略 |
| 角色身兼多职       | 配置        | 角色权限绑定          |
| 审批人动态选择      | 策略接口 / 规则 | 简单条件用规则，复杂选择用策略 |

---

## 19. 禁止清单

项目中禁止出现以下实现：

```text
if customer == "xxx" 散落在核心业务代码中
beforeSave / afterSave 作为万能 Hook
客户包复制整套页面
客户包复制整套后端接口
客户扩展直接拿数据库连接
客户扩展直接写库存
客户扩展直接写财务
客户扩展直接改订单状态
客户扩展直接删除数据
规则直接执行数据库写入
配置里写复杂脚本
流程配置绕过状态机
没有默认实现的扩展点
没有契约测试的扩展点
没有版本声明的客户包
```

---

## 20. 推荐项目落地结构

```text
server/
  internal/
    core/
      customer/
      product/
      material/
      sales_order/
      purchase/
      production/
      shipment/
      inventory/
      finance/
      workflow/
      audit/

    config/
      field_config.go
      page_config.go
      menu_config.go
      template_config.go
      permission_config.go

    rule/
      rule_engine.go
      rule_context.go
      rule_result.go

    extension/
      contract/
      defaultimpl/
      registry/
      port/

    customers/
      yongshen/
        config/
        policies/
        importers/
        exporters/
        integrations/
```

前端：

```text
web/
  src/
    core/
      pages/
      components/
      workflow/
      permissions/

    config/
      fieldConfig/
      pageConfig/
      menuConfig/

    customers/
      yongshen/
        pageConfig/
        templates/
```

部署包：

```text
deployments/
  yongshen/
    customer-config.yaml
    field-config.yaml
    workflow-config.yaml
    role-config.yaml
    template-config.yaml
    extension-manifest.yaml
```

---

## 21. 最终结论

客户差异必须先分类，再实现。

分类顺序：

```text
配置：客户差异是参数问题
规则：客户差异是判断问题
策略接口：客户差异是算法问题
流程编排：客户差异是步骤问题
代码级扩展点：客户差异是私有实现问题
```

项目实现时必须坚持：

```text
Product Core 主导业务闭环
客户差异只能进入受控边界
扩展点必须有默认实现
返回结果必须被核心校验
状态机、权限、审计、业务事实不能被绕过
代码级扩展点只能作为最后手段
```

一句话总结：

> 客户差异不是不能做，而是不能乱做。能配置就配置，能规则就规则，复杂算法才策略接口，流程变化才流程编排，极特殊私有逻辑才代码级扩展点。
