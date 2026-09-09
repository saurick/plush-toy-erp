import React, { useEffect, useState } from 'react'
import { Button, Select, Space } from 'antd'
import { listAllSuppliers } from '../../api/masterDataOrderApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

export default function MaterialSupplierSelect(props) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listAllSuppliers({}, { signal: controller.signal })
      .then(({ suppliers }) => {
        if (controller.signal.aborted) return
        setOptions(
          suppliers.map((item) => ({
            value: item.id,
            label: `${item.code} / ${item.name}`,
            disabled: !item.is_active,
          }))
        )
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(err, '加载厂商'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [retry])
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        {...props}
        style={{ width: '100%' }}
        allowClear
        showSearch
        optionFilterProp="label"
        options={options}
        loading={loading}
        placeholder="选择厂商 / 供应商"
      />
      {error ? (
        <span role="alert">
          {error}
          <Button size="small" onClick={() => setRetry((value) => value + 1)}>
            重试
          </Button>
        </span>
      ) : null}
    </Space>
  )
}
