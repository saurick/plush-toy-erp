# Source Materials

本文件只记录 current 客户资料用途，不把资料直接升级为通用产品真源。

| 资料类型 | 用途分类 | 说明 |
| --- | --- | --- |
| Excel | Customer Material / Demo Seed / Industry Template Candidate | 可作为字段、导入、seed 和行业模板候选；需评审后再沉淀 |
| PDF | Customer Material / Print Template Input | 可作为合同、报表或交付样式输入；不直接决定 schema |
| 图片 / 截图 | Customer Material / QA Debug | 可帮助识别页面、字段和流程线索；不作为唯一真源 |
| seed / demo 数据 | Demo Seed / QA Debug | 只用于开发验收和演示，不替代真实业务事实 |
| print template | Print Template Input | 可进入客户打印模板或行业模板候选，数据来源必须统一 |

使用规则：

1. 资料先归档用途，再决定是否进入 Product Core、Industry Template、Customer Config 或 Customer Extension。
2. 当前客户特殊字段、特殊流程和特殊报表不能直接进入核心 usecase。
3. 涉及库存、出货、财务事实的资料必须进入架构评审。
