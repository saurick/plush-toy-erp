import React from 'react'
import { Button, Space, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import BusinessModal from '../business-list/BusinessModal.jsx'
import BusinessImage from '../business-list/BusinessImage.jsx'
import DocumentGuide from '../DocumentGuide.jsx'
import {
  MAX_BOM_IMPORT_ROWS,
  MAX_BOM_XLSX_FILE_BYTES,
} from '../../utils/bomXlsxImport.mjs'
import {
  BOM_IMPORT_EXAMPLE_FILENAME,
  BOM_IMPORT_FORMAT_GUIDE,
} from '../../data/bomImportFormat.mjs'
import preview from '../../data/bomImportExamplePreview.generated.json'
import './bomExcelImportFormat.css'

const exampleURL = new URL(
  '../../data/bom-import-example.xlsx',
  import.meta.url
).href
const previewURL = new URL('../../data/bom-import-example-preview.png', import.meta.url).href

export default function BOMExcelImportFormat({ open, onClose }) {
  return (
    <BusinessModal
      open={open}
      title="Excel 格式说明"
      width="min(900px, calc(100vw - 32px))"
      onCancel={onClose}
      footer={
        <Space wrap>
          <Button onClick={onClose}>关闭</Button>
          <Button
            type="primary"
            aria-label="下载示例 Excel"
            icon={<DownloadOutlined aria-hidden="true" />}
            href={exampleURL}
            download={BOM_IMPORT_EXAMPLE_FILENAME}
          >
            下载示例 Excel
          </Button>
        </Space>
      }
    >
      <section className="erp-bom-excel-guide" aria-label="Excel 导入图示说明">
        <Typography.Paragraph>
          沿用现有 .xlsx 材料分析表，无需重排；可保留汇总等其他工作表。
        </Typography.Paragraph>
        <DocumentGuide parts={BOM_IMPORT_FORMAT_GUIDE}>
          <div className="erp-bom-excel-guide__preview" style={{ aspectRatio: `${preview.width} / ${preview.height}` }}>
            <BusinessImage src={previewURL} alt="Excel 材料分析明细表示意图" width={preview.width} height={preview.height} />
            {BOM_IMPORT_FORMAT_GUIDE.map((part, index) => (
              <span
                key={part.title}
                className="erp-document-guide__number erp-bom-excel-guide__marker"
                style={{ left: `${part.marker.x}%`, top: `${part.marker.y}%` }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ))}
          </div>
        </DocumentGuide>
        <p className="erp-bom-excel-guide__requirements">
          每个文件仅放一张“材料分析明细表”或“材料分析明细表-1”，最多{' '}
          {MAX_BOM_XLSX_FILE_BYTES / 1024 / 1024}MB、{MAX_BOM_IMPORT_ROWS} 个部位。
          含公式时，先在 Excel / WPS 中重算并保存。
        </p>
      </section>
    </BusinessModal>
  )
}
