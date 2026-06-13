import React from 'react'
import { Button, Descriptions, Result, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, DashboardOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const RETIRED_MODULE_HINTS = {
  products:
    '产品资料已从旧通用业务记录页退出，后续只使用产品领域表和领域 API。',
  'material-bom': '材料 BOM 不再读取旧通用业务记录，后续只使用 BOM 领域能力。',
  'accessories-purchase':
    '辅材/包材采购旧通用记录页已退出，后续采购事实必须走采购领域 API。',
  'processing-contracts':
    '加工合同/委外下单旧通用记录页已退出，后续委外事实必须走领域 API。',
  inbound:
    '入库通知/检验/入库不再读取旧通用记录，采购入库和质检分别走领域事实表。',
  inventory:
    '库存入口不再读取旧通用记录，库存流水、余额和批次以库存事实表为准。',
  'shipping-release': '出货放行旧通用记录页已退出，放行不等于真实 shipped。',
  outbound: '出库入口不再读取旧通用记录，出货事实以领域 API 为准。',
  'production-scheduling':
    '生产排单旧通用记录页已退出，排产后续走生产领域能力。',
  'production-progress':
    '生产进度旧通用记录页已退出，进度事实后续走生产领域能力。',
  'production-exceptions':
    '生产异常旧通用记录页已退出，异常处理后续走领域能力。',
  'quality-inspections':
    '品质检验旧通用记录页已退出，来料质检以 quality_inspections 为准。',
  reconciliation: '对账/结算旧通用记录页已退出，财务事实后续走财务领域能力。',
  payables: '应付提醒旧通用记录页已退出，应付事实后续走财务领域能力。',
  receivables: '应收提醒旧通用记录页已退出，应收事实后续走财务领域能力。',
  invoices: '发票/开票异常旧通用记录页已退出，开票事实后续走财务领域能力。',
}

export default function BusinessModulePage({ moduleItem }) {
  const navigate = useNavigate()
  const moduleKey = moduleItem?.key || 'unknown'
  const moduleTitle = moduleItem?.title || '业务模块'
  const hint =
    RETIRED_MODULE_HINTS[moduleKey] ||
    '旧通用业务记录页已退出，后续必须接入对应领域表、领域 API 和测试。'

  return (
    <section className="erp-page erp-business-module-retired">
      <Result
        status="info"
        title={`${moduleTitle}入口已退出旧通用记录`}
        subTitle="business_records 表族已进入删除流程；本页面不再查询、创建、更新、删除或恢复旧通用业务记录。"
        extra={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/erp/dashboard')}
            >
              返回任务看板
            </Button>
            <Button
              type="primary"
              icon={<DashboardOutlined />}
              onClick={() => navigate('/erp/business-dashboard')}
            >
              查看业务总览
            </Button>
          </Space>
        }
      />
      <Descriptions
        bordered
        column={1}
        size="small"
        className="erp-business-module-retired__meta"
      >
        <Descriptions.Item label="模块">
          <Space wrap>
            <Typography.Text strong>{moduleTitle}</Typography.Text>
            <Tag>{moduleKey}</Tag>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="当前边界">{hint}</Descriptions.Item>
        <Descriptions.Item label="后续要求">
          接入正式能力时必须回到领域 usecase、schema、RBAC、测试和文档，不得恢复
          business_records 作为运行时真源。
        </Descriptions.Item>
      </Descriptions>
    </section>
  )
}
