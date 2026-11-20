import React from 'react'
import { Alert } from 'antd'

export default function SourceActionAccessNotice({ access }) {
  if (!access.blocked) return null
  return <Alert type="info" showIcon message={access.reason} role="status" />
}
