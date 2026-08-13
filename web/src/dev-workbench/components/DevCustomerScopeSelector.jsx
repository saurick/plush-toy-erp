import React from 'react'
import { TeamOutlined } from '@ant-design/icons'
import { Alert, Select, Tag, Typography, theme } from 'antd'

const { Text } = Typography

export default function DevCustomerScopeSelector({
  scope,
  onChange,
  disabled = false,
  note = '选择只更新当前开发页地址，不会创建租户或切换任意目标。',
  label = '当前甲方',
  invalidDescription = '当前地址中的甲方未登记；客户相关读取与操作已停止，请选择已登记甲方。',
}) {
  const { token } = theme.useToken()
  const ready = scope?.status === 'ready'
  const duplicateQuery = scope?.reason === 'duplicate_customer_query'
  const requestedCustomerKey = scope?.requestedCustomerKey || '未选择'
  const invalidTag = duplicateQuery ? '地址冲突' : '未登记'
  const invalidMessage = duplicateQuery
    ? '地址中存在多个甲方参数'
    : `未登记甲方：${requestedCustomerKey}`
  const options = (scope?.registeredCustomers || []).map((customer) => ({
    value: customer.customerKey,
    label: customer.label,
  }))

  return (
    <section
      className="erp-dev-customer-scope"
      data-customer-scope-status={scope?.status || 'invalid'}
      data-customer-key={scope?.customerKey || ''}
      style={{
        '--dev-customer-scope-border': token.colorBorder,
        '--dev-customer-scope-bg': token.colorBgContainer,
        '--dev-customer-scope-soft': token.colorFillAlter,
        '--dev-customer-scope-muted': token.colorTextSecondary,
        '--dev-customer-scope-primary': token.colorPrimary,
      }}
      aria-label={`${label}选择`}
    >
      <div className="erp-dev-customer-scope__main">
        <span className="erp-dev-customer-scope__icon" aria-hidden="true">
          <TeamOutlined />
        </span>
        <div className="erp-dev-customer-scope__copy">
          <div className="erp-dev-customer-scope__title">
            <Text strong>{label}</Text>
            {ready && scope.defaulted ? <Tag color="green">默认</Tag> : null}
            {!ready ? <Tag color="warning">{invalidTag}</Tag> : null}
          </div>
          <Text type="secondary">{note}</Text>
        </div>
        <Select
          aria-label={`${label}选择`}
          value={ready ? scope.customerKey : undefined}
          placeholder="选择已登记甲方"
          options={options}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          message={invalidMessage}
          description={invalidDescription}
        />
      ) : null}
    </section>
  )
}
