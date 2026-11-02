import React from 'react'
import { Alert, Form } from 'antd'
import { getBOMImportDraftIssues, describeBOMImportIssues, describeBOMImportQuantity } from '../../utils/bomXlsxImport.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { BOMLossSource } from '../../../common/consts/statuses.generated.mjs'
import { bomLossSourceLabel } from '../../utils/bomSourceValues.mjs'

export default function BOMImportReviewSummary({ form, review, productOptions }) {
  const issues =
    Form.useWatch(getBOMImportDraftIssues, {
      form,
      preserve: true,
    }) || []
  const productID = Form.useWatch('product_id', { form, preserve: true })
  const quantityText = Form.useWatch('quantity_text', { form, preserve: true })
  if (!review) return null
  const quantityNotice = review.detailsOnly
    ? describeBOMImportQuantity(quantityText, review.quantityText)
    : ''
  const affectedRows = new Set(
    issues
      .filter((issue) => issue.scope === 'item')
      .flatMap((issue) => issue.itemIndexes)
  ).size
  const lossEvidence = review.lossEvidence || {}
  const issueText =
    issues.length > 0
      ? `请先${describeBOMImportIssues(issues)}${
          affectedRows > 0 ? `（涉及 ${affectedRows} 个部位）` : ''
        }`
      : '明细已全部关联，可保存草稿'

  return (
    <Alert
      className="erp-business-source-summary erp-bom-import-review"
      data-bom-import-issue-count={issues.length}
      data-bom-import-product-status={productID ? 'matched' : 'unresolved'}
      description={
        <div className="erp-bom-import-review__details">
          <span>
            来源：{review.fileName} / {review.sheetName}
          </span>
          <span>
            原表产品：{review.productCode || review.productName || '原表未填写'}
            ；
            {review.detailsOnly ? '产品与版本沿用当前草稿' : productID
              ? `已关联：${referenceLabel(productOptions, productID, '产品')}`
              : '尚未关联，请在上方选择对应产品档案'}
          </span>
          {quantityNotice ? <span>{quantityNotice}</span> : null}
          <span>
            自动匹配已有档案；未匹配的物料可选择或新建，同种物料只需处理一次。
          </span>
          <span>
            损耗来源：{Object.values(BOMLossSource).filter((kind) => Number(lossEvidence[kind]) > 0).map((kind) => `${bomLossSourceLabel(kind)} ${lossEvidence[kind]} 行`).join('；')}
          </span>
          <span>
            {review.detailsOnly
              ? '原文件不会自动上传，也不创建主数据。'
              : '文件仅在当前浏览器解析；保存时只创建 BOM 草稿，并把来源文件名写入备注，不会自动上传原文件或创建主数据。'}
          </span>
        </div>
      }
      message={`已读取 ${review.rowCount} 条 BOM 明细；${issueText}`}
      showIcon
      type={issues.length > 0 ? 'warning' : 'success'}
    />
  )
}
