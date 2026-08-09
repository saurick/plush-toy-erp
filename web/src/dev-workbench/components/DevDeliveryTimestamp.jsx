import React from 'react'
import { Typography } from 'antd'

import { formatDeliveryTimestamp } from '../config/devDelivery.mjs'

const { Text } = Typography

export default function DevDeliveryTimestamp({
  value,
  action = '完成于',
  missing = '完成时间未证明',
  className,
}) {
  if (!Number.isFinite(Date.parse(value || ''))) {
    return (
      <Text type="secondary" className={className}>
        {missing}
      </Text>
    )
  }

  return (
    <Text type="secondary" className={className}>
      {action ? `${action} ` : null}
      <time dateTime={value} title={value}>
        {formatDeliveryTimestamp(value, missing)}
      </time>
    </Text>
  )
}
