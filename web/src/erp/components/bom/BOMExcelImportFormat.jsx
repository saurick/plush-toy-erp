import React, { useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import BusinessModal from '../business-list/BusinessModal.jsx'
import BusinessImage from '../business-list/BusinessImage.jsx'
import DocumentGuide, { DocumentGuideAnnotations } from '../DocumentGuide.jsx'
import { isUsableImageDimensions } from '../../utils/imageDisplay.mjs'
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
const previewURL = new URL(
  '../../data/bom-import-example-preview.png',
  import.meta.url
).href

export default function BOMExcelImportFormat({ open, onClose }) {
  const [imageReady, setImageReady] = useState(false)
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
          {({ activeIndex, onSelect }) => (
            <div className="erp-document-guide__frame erp-document-guide__frame--both-sides">
              <div
                className="erp-bom-excel-guide__preview"
                style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
                onLoadCapture={(event) =>
                  setImageReady(isUsableImageDimensions(event.target))
                }
                onErrorCapture={() => setImageReady(false)}
              >
                <BusinessImage
                  src={previewURL}
                  alt="Excel 材料分析明细表示意图"
                  width={preview.width}
                  height={preview.height}
                />
                {imageReady && (
                  <DocumentGuideAnnotations
                    parts={BOM_IMPORT_FORMAT_GUIDE}
                    regions={BOM_IMPORT_FORMAT_GUIDE.map((part) => part.region)}
                    activeIndex={activeIndex}
                    onSelect={onSelect}
                  />
                )}
              </div>
            </div>
          )}
        </DocumentGuide>
        <p className="erp-bom-excel-guide__requirements">
          每个文件仅放一张“材料分析明细表”或“材料分析明细表-1”，最多{' '}
          {MAX_BOM_XLSX_FILE_BYTES / 1024 / 1024}MB、{MAX_BOM_IMPORT_ROWS}{' '}
          个部位。 含公式时，先在 Excel / WPS 中重算并保存。
        </p>
      </section>
    </BusinessModal>
  )
}
