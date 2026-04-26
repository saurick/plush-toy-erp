import React from 'react'
import { Link } from 'react-router-dom'
import { Card, Space, Tag, Typography } from 'antd'
import HelpCenterDocLinks from '../components/HelpCenterDocLinks'

const { Paragraph, Text, Title } = Typography

const NEWCOMER_FLOW_STEPS = [
  {
    key: 'project-order',
    title: '客户 / 款式立项',
    description: '先确认客户、订单编号、产品订单编号、款式编号和交期。',
  },
  {
    key: 'material-bom',
    title: '材料 BOM',
    description: '两份材料分析表确认主料、损耗和工艺。',
  },
  {
    key: 'accessories',
    title: '辅材 / 包材采购',
    description: '原辅料采购汇总表单独下单，不并回主料真源。',
  },
  {
    key: 'processing-contract',
    title: '加工合同 / 委外',
    description: '按合同 PDF 和加工汇总确认工序、单价和回货日期。',
  },
  {
    key: 'warehouse-iqc',
    title: '主辅料到仓 / IQC',
    description: '仓库与品质验收主辅料和包装材料。',
  },
  {
    key: 'production',
    title: '生产排单 / 跟进',
    description: 'PMC 和生产经理跟齐套、延期、返工、异常。',
  },
  {
    key: 'packaging',
    title: '包装 / 成品入库',
    description: '包装材料领用、成品回仓、待出货清单收口。',
  },
  {
    key: 'settlement',
    title: '对账 / 结算',
    description: '加工费与辅包材费用对账，保留待付款提醒。',
  },
]

const SOURCE_FLOW_CHAINS = [
  {
    key: 'project-bom-processing',
    title: '客户 / 款式 -> BOM -> 加工合同',
    steps: ['客户/款式立项', '材料 BOM', '加工合同'],
    tags: [
      { label: '主流程', color: 'blue' },
      { label: '资料先齐套', color: 'default' },
    ],
    note: '生产订单总表截图给出客户、订单编号、产品编号和出货日期；两份材料分析表继续承接款式编号、数量和设计师。',
  },
  {
    key: 'bom-purchase',
    title: '材料明细 -> 汇总 -> 主辅料采购',
    steps: ['材料分析明细表', '材料分析汇总表', '主料/辅包材采购'],
    tags: [
      { label: 'BOM 真源', color: 'green' },
      { label: '汇总派生', color: 'default' },
    ],
    note: '主料以材料分析明细表为真源，汇总表只负责采购与补采视角；辅材 / 包材继续走独立采购汇总表。',
  },
  {
    key: 'processing-production-shipping',
    title: '加工合同 -> 裁切 / 车缝 / 手工 -> 成品入库 / 待出货',
    steps: ['加工合同', '裁切/车缝/手工', '成品入库/待出货'],
    tags: [
      { label: '合同快照', color: 'purple' },
      { label: '生产主线', color: 'geekblue' },
    ],
    note: '加工合同 PDF 证明工序、单价、数量、条款和纸样附件都要保留快照；生产链继续按“裁切 -> 车缝 -> 手工 -> 包装 -> 成品仓”理解。',
  },
  {
    key: 'packaging-branch',
    title: '包装材料支线 -> 包装 -> 发货放行',
    steps: ['包装材料打单表', '包装质量检查', '业务确认/财务放行'],
    tags: [
      { label: '独立支线', color: 'cyan' },
      { label: '老板审核', color: 'gold' },
    ],
    note: '老板先审核包装材料打单表，再进入包装材料到仓、领用和最终包装；发货前仍需业务确认、仓库出货单和财务放行。',
  },
]

const FLOW_LANES = [
  {
    key: 'foundation',
    title: '1. 基础资料与业务立项',
    summary:
      '先把客户、供应商、款式 / SKU 和订单层级收清楚，后续 BOM、合同、生产和打印都复用这批基础信息。',
    tags: ['必做', '主数据'],
    steps: [
      {
        key: 'partners',
        title: '客户 / 供应商',
        description: '维护客户、加工厂、辅包材供应商、联系人、电话和地址。',
        note: '加工 成慧怡.xlsx 的加工厂商资料和 模板-材料与加工合同.xlsx 的材料厂商编号是当前主体真源。',
      },
      {
        key: 'product-style',
        title: '产品 / 款式',
        description: '区分款式编号、产品编号 / SKU、产品名称和颜色款。',
        note: '两份材料分析表给出 26029# / 26204# 这类款式编号；生产总表截图继续给出产品编号、颜色和图片。',
      },
      {
        key: 'project-order',
        title: '客户 / 款式立项',
        description: '先收客户、订单编号、产品订单编号、交期和业务负责人。',
        note: '生产订单总表截图里的客户、订单编号、产品编号、出货日期是当前立项层的核心快照。',
      },
      {
        key: 'source-review',
        title: '资料齐套 / 包装材料打单审批',
        description: '资料不齐时先回到立项层处理，不直接往下补采购或生产。',
        note: '正式汇报版第 4 页明确老板先审核订单和包装材料打单表，再让工程 + PMC 输出生产资料。',
      },
    ],
  },
  {
    key: 'materials',
    title: '2. 材料与委外准备',
    summary:
      '主料、辅材 / 包材、加工合同和到仓 IQC 这段要按真源分层处理，不能再混成一张表。',
    tags: ['主链路', '材料真源'],
    steps: [
      {
        key: 'bom',
        title: '材料 BOM',
        description:
          '材料分析明细表维护主料名称、规格、单位用量、损耗和加工方式。',
        note: '26029 / 26204 明细表是真源；材料分析汇总表只是派生采购层。',
      },
      {
        key: 'accessories-purchase',
        title: '辅材 / 包材采购',
        description:
          '原辅料采购汇总表单独维护包装材料、辅材数量、单价和下单人。',
        note: '辅材、包材 成慧怡.xlsx 的“厂商料号”列经常承载供应商简称，不能误当正式料号。',
      },
      {
        key: 'processing-contract',
        title: '加工合同 / 委外下单',
        description:
          '根据加工合同 PDF 和加工汇总表确认加工方、工序、单价、数量和回货日期。',
        note: '9.3 加工合同 PDF 同时承载合同头、合同行、条款和纸样附件快照。',
      },
      {
        key: 'warehouse-iqc',
        title: '主辅料到仓 / IQC',
        description:
          '仓库与品质接收主料、辅料和包装材料，并按主料仓、其他仓、成品仓分层管理。',
        note: '所有材料、半成品、返工成品和外发件都先入仓或出仓，不绕过仓库直接流转。',
      },
    ],
  },
  {
    key: 'production-shipping',
    title: '3. 生产到仓库出货',
    summary:
      '当前先收口齐套、排产、返工、品质、包装和发货放行这条执行主线，不假装扩展硬件链路已上线。',
    tags: ['生产/仓库', '包装支线'],
    steps: [
      {
        key: 'cutting',
        title: '主料仓 -> 机器加工 / 裁切',
        description:
          '主料先从主料仓出库，再进入激光、机器加工和裁切；外发代工同样先走仓库出库。',
        note: '裁切后的裁片回仓或挂仓管理，后续车缝只能从主料仓领取已加工 / 已裁切好的裁片。',
      },
      {
        key: 'sewing-handmade',
        title: '车缝 -> 其他仓 -> 手工组装',
        description:
          '车缝从主料仓领取裁片缝纫，缝后半成品先回其他仓；手工再从仓库领取主料、辅料做缝合、组装和包装。',
        note: '第 7 页 PMC / 生产经理桌面 + 手机端示意继续支撑排单、延期和返工处理；返工成品也继续回仓再领用。',
      },
      {
        key: 'quality',
        title: '品质检验 / 返工异常',
        description: '针检、抽检、部分客户验货和返工异常都单独记录。',
        note: '返工、延期、异常不继续沉在备注里，当前帮助中心按独立事件理解。',
      },
      {
        key: 'packaging',
        title: '最终包装 / 成品入成品仓',
        description:
          '包装材料领用后完成最终包装，手工完成的成品统一回成品仓，返工完成品同样回成品仓等待后续处理。',
        note: '包装材料支线最终回到包装环节；成品仓是待出货和成品回仓的正式落点。',
      },
      {
        key: 'shipping-release',
        title: '业务确认 / 仓库出货单 / 财务放行',
        description: '发货前由业务确认、仓库出货单和财务放行三方收口。',
        note: '正式汇报版第 4 页把出货前的业务、仓库、财务动作明确串在一起。',
      },
    ],
  },
  {
    key: 'settlement-mobile',
    title: '4. 结算与移动端协同',
    summary:
      '财务暂不抢跑完整账务模型，但加工费、辅包材费用、待付款提醒和手机端协同已经可以作为正式口径呈现。',
    tags: ['财务', '桌面+手机'],
    steps: [
      {
        key: 'reconciliation',
        title: '加工费 / 辅包材对账',
        description: '先围绕合同金额、加工汇总和辅包材金额做对账入口。',
        note: '加工 成慧怡.xlsx 和 辅材、包材 成慧怡.xlsx 提供当前最稳定的金额线索。',
      },
      {
        key: 'payment-reminder',
        title: '待付款 / 异常费用',
        description:
          '当前先做待付款、异常费用和结算提醒，不抢跑正式结算单模型。',
        note: '加工合同条款已经明确“次月开始对账、每月 15 号前完成对账、次月支付货款”。',
      },
      {
        key: 'mobile-workbench',
        title: 'PMC / 生产经理手机端',
        description:
          'PMC、生产经理、仓库和财务继续用手机看卡点、催办、返工和待处理。',
        note: '正式汇报版第 7 页展示了 PMC 与生产经理的桌面 + 手机端视图，当前移动端按角色拆端口访问。',
      },
    ],
  },
]

const FLOW_GLOSSARY = [
  {
    key: 'codes',
    title: '编号四层',
    description:
      '客户 / 订单编号 / 产品订单编号 / 款式编号 / 产品编号必须分开理解，不能再混成一个字段。',
  },
  {
    key: 'snapshot',
    title: '合同快照',
    description:
      '合同头、合同行、条款和纸样附件都按打印当下保留，不因主档调整自动重刷历史合同。',
  },
  {
    key: 'derived',
    title: '派生汇总',
    description:
      '材料 / 加工汇总、待出货、待付款等字段按派生口径理解，不反写覆盖原始真源。',
  },
  {
    key: 'deferred',
    title: 'Deferred 边界',
    description:
      '扩展硬件链路、PDA、条码枪、图片识别继续 deferred，不进入当前正式主路径。',
  },
]

export default function OperationFlowPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="erp-page-card" variant="borderless">
        <Title level={4} style={{ margin: 0 }}>
          ERP 流程图总览
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
          按“客户 / 款式立项 → 材料 / 委外准备 → 生产 / 仓库出货 → 对账 /
          结算提醒”串起毛绒工厂主要业务链路，适合老板、业务、采购、 PMC、
          仓库和财务先看全景。
        </Paragraph>
        <div className="erp-flow-overview__quickstart">
          <div className="erp-flow-overview__quickstart-header">
            <Text strong>流程速览</Text>
            <Text type="secondary">
              可以先把毛绒 ERP 理解成“先接单立项，再拆 BOM、下辅料与加工合同，
              然后排产、入库、包装、出货，最后对账和结算提醒”的流水线。
            </Text>
          </div>
          <div className="erp-flow-overview__quickstart-scroll">
            <div className="erp-flow-overview__quickstart-steps">
              {NEWCOMER_FLOW_STEPS.map((step, index) => (
                <React.Fragment key={step.key}>
                  <article className="erp-flow-overview__quickstart-node">
                    <Text
                      strong
                      className="erp-flow-overview__quickstart-title"
                    >
                      {step.title}
                    </Text>
                    <Text
                      type="secondary"
                      className="erp-flow-overview__quickstart-desc"
                    >
                      {step.description}
                    </Text>
                  </article>
                  {index < NEWCOMER_FLOW_STEPS.length - 1 ? (
                    <div
                      className="erp-flow-overview__quickstart-connector"
                      aria-hidden="true"
                    >
                      <span>→</span>
                    </div>
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
          <Text type="secondary" className="erp-flow-overview__quickstart-note">
            包装材料是独立支线，但最终仍回到包装、成品入库和发货放行；完整字段和计算规则继续看帮助中心另外三页。
          </Text>
        </div>

        <div className="erp-flow-overview__related-links">
          <Text strong>相关入口：</Text>
          <HelpCenterDocLinks
            currentPath="/erp/docs/operation-flow-overview"
            variant="inline"
          />
          <Link
            className="erp-help-doc-links__text-link"
            to="/erp/docs/operation-playbook"
          >
            查看完整版流程文档
          </Link>
        </div>

        <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
          <Tag color="cyan">流程图总览</Tag>
          <Text type="secondary">长链路支持左右滑动查看</Text>
        </Space>
      </Card>

      <Card className="erp-page-card" variant="borderless">
        <div className="erp-flow-overview__chain-summary">
          <div className="erp-flow-overview__chain-summary-header">
            <div>
              <Title level={5} style={{ marginTop: 0, marginBottom: 0 }}>
                来源链路速览
              </Title>
              <Paragraph
                type="secondary"
                className="erp-flow-overview__chain-summary-note"
              >
                总览页只回答“链怎么走、哪一段是正式主链、哪一段是独立支线”。
                具体字段真源、快照边界和公式继续看 ERP 字段联动口径与 ERP
                计算口径。
              </Paragraph>
            </div>
            <Space size={[8, 8]} wrap>
              <Tag color="blue">主流程</Tag>
              <Tag color="green">BOM 真源</Tag>
              <Tag color="cyan">独立支线</Tag>
              <Tag color="purple">合同快照</Tag>
            </Space>
          </div>

          <div className="erp-flow-overview__chain-grid">
            {SOURCE_FLOW_CHAINS.map((chain) => (
              <section
                key={chain.key}
                className="erp-flow-overview__chain-card"
              >
                <div className="erp-flow-overview__chain-card-header">
                  <Text strong className="erp-flow-overview__chain-card-title">
                    {chain.title}
                  </Text>
                  <Space size={[6, 6]} wrap>
                    {chain.tags.map((tag) => (
                      <Tag key={tag.label} color={tag.color}>
                        {tag.label}
                      </Tag>
                    ))}
                  </Space>
                </div>
                <div className="erp-flow-overview__chain-path">
                  {chain.steps.map((step, index) => (
                    <React.Fragment key={`${chain.key}-${step}`}>
                      <span className="erp-flow-overview__chain-pill">
                        {step}
                      </span>
                      {index < chain.steps.length - 1 ? (
                        <span
                          className="erp-flow-overview__chain-arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
                <Text
                  type="secondary"
                  className="erp-flow-overview__chain-card-note"
                >
                  {chain.note}
                </Text>
              </section>
            ))}
          </div>
        </div>
      </Card>

      <Card className="erp-page-card" variant="borderless">
        <div className="erp-flow-overview">
          {FLOW_LANES.map((lane) => (
            <section key={lane.key} className="erp-flow-overview__lane">
              <div className="erp-flow-overview__lane-header">
                <div>
                  <Text strong className="erp-flow-overview__lane-title">
                    {lane.title}
                  </Text>
                  <Paragraph
                    type="secondary"
                    className="erp-flow-overview__lane-summary"
                  >
                    {lane.summary}
                  </Paragraph>
                </div>
                <Space size={[8, 8]} wrap>
                  {lane.tags.map((tag) => (
                    <Tag key={tag} color="blue">
                      {tag}
                    </Tag>
                  ))}
                </Space>
              </div>

              <div className="erp-flow-overview__scroll">
                <div className="erp-flow-overview__steps">
                  {lane.steps.map((step, index) => (
                    <React.Fragment key={step.key}>
                      <article className="erp-flow-overview__node">
                        <span className="erp-flow-overview__node-index">
                          {index + 1}
                        </span>
                        <Text strong className="erp-flow-overview__node-title">
                          {step.title}
                        </Text>
                        <Paragraph className="erp-flow-overview__node-desc">
                          {step.description}
                        </Paragraph>
                        <Text
                          type="secondary"
                          className="erp-flow-overview__node-note"
                        >
                          {step.note}
                        </Text>
                      </article>
                      {index < lane.steps.length - 1 ? (
                        <div
                          className="erp-flow-overview__connector"
                          aria-hidden="true"
                        >
                          <span>→</span>
                        </div>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card className="erp-page-card" variant="borderless">
        <Title level={5} style={{ marginTop: 0 }}>
          关键口径速记
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          这页先回答主流程怎么走；下沉到字段和历史单据时，默认继续按真源、快照、派生和
          deferred 四类理解。
        </Paragraph>
        <div className="erp-flow-overview__legend-grid">
          {FLOW_GLOSSARY.map((item) => (
            <div key={item.key} className="erp-flow-overview__legend-card">
              <Text strong className="erp-flow-overview__legend-title">
                {item.title}
              </Text>
              <Text type="secondary">{item.description}</Text>
            </div>
          ))}
        </div>
      </Card>
    </Space>
  )
}
