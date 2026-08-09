import React from 'react'
import { Typography } from 'antd'

import { normalizeDevTimestamp } from '../config/devTimestamp.mjs'

const { Text } = Typography

export default function DevTimestamp({
  value,
  unit = 'iso',
  action = '',
  missing = '时间未证明',
  className,
  strong = false,
}) {
  const timestamp = normalizeDevTimestamp(value, { unit })
  if (!timestamp) {
    return (
      <Text type="secondary" className={className} strong={strong}>
        {missing}
      </Text>
    )
  }

  return (
    <Text type="secondary" className={className} strong={strong}>
      {action ? `${action} ` : null}
      <time dateTime={timestamp.dateTime} title={timestamp.dateTime}>
        {timestamp.label}
      </time>
    </Text>
  )
}
