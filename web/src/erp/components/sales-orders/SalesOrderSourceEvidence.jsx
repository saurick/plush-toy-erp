import React, { useEffect, useState } from 'react'
import { Button, Image, Popover, Table, Typography } from 'antd'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'

export function SalesOrderImportImage({
  image,
  attachment,
  ownerID,
  name = '订单产品',
}) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let url
    setSrc('')
    setError(false)
    if (image?.bytes) {
      url = URL.createObjectURL(
        new Blob([image.bytes], { type: image.mimeType })
      )
      setSrc(url)
    } else if (attachment?.id && ownerID) {
      downloadBusinessAttachment({ id: attachment.id })
        .then((result) => {
          if (!active) return
          if (
            result?.owner_type !== 'sales_order' ||
            result?.owner_id !== ownerID ||
            !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
              result?.mime_type
            ) ||
            !result.content_base64
          ) {
            throw new Error('image unavailable')
          }
          setSrc(`data:${result.mime_type};base64,${result.content_base64}`)
        })
        .catch(() => {
          if (active) setError(true)
        })
    }
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [image, attachment?.id, ownerID])
  return src ? (
    <Image
      width={64}
      height={64}
      style={{ objectFit: 'contain' }}
      src={src}
      alt={`${name}原表图片`}
    />
  ) : (
    <Typography.Text type="secondary">
      {error
        ? '图片加载失败，请到订单附件重试'
        : attachment
          ? '图片加载中'
          : '原表无可读取图片'}
    </Typography.Text>
  )
}

export default function SalesOrderSourceEvidence({
  value,
  images = [],
  attachments = [],
  ownerID,
}) {
  if (!value?.row_number) return null
  return (
    <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
      <Popover
        title="首次导入的原表内容"
        trigger="click"
        content={
          <div style={{ maxWidth: 'min(600px, 80vw)' }}>
            <Typography.Paragraph>
              {value.file_name} · {value.sheet_name} 第 {value.row_number} 行
            </Typography.Paragraph>
            <Table
              size="small"
              pagination={false}
              rowKey="column"
              dataSource={value.cells}
              columns={[
                { title: '原表字段', dataIndex: 'label', width: 145 },
                {
                  title: '原表值',
                  dataIndex: 'value',
                  render: (text) => (
                    <span style={{ overflowWrap: 'anywhere' }}>
                      {text || '未填写'}
                    </span>
                  ),
                },
              ]}
              scroll={{ y: 360 }}
            />
          </div>
        }
      >
        <Button type="link" size="small">
          核对原表：{value.sheet_name} 第 {value.row_number} 行
        </Button>
      </Popover>
      <Typography.Text type="secondary">
        原表设计师：
        {value.cells?.find((cell) => cell.label === '设计师')?.value ||
          '未填写'}
      </Typography.Text>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {(value.image_files || []).map((file) => (
          <SalesOrderImportImage
            key={file}
            image={images.find((image) => image.fileName === file)}
            attachment={attachments.find(
              (item) => item.file_name === file && !item.withdrawn_at
            )}
            ownerID={ownerID}
          />
        ))}
      </div>
    </div>
  )
}
