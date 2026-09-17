import React from 'react'

export function visibleDetailValue(value) {
  if (React.isValidElement(value)) return value
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (['string', 'number', 'bigint'].includes(typeof value)) {
    return String(value)
  }
  return '-'
}

function fieldRows(fields) {
  const rows = []
  for (const field of fields) {
    if (
      !rows.length ||
      field?.rowStart ||
      field?.fullWidth ||
      rows.at(-1)[0]?.fullWidth
    ) {
      rows.push([])
    }
    rows.at(-1).push(field)
  }
  return rows
}

export default function BusinessRowItemCards({
  getItemFields,
  getItemKey,
  getItemLabel,
  getItemSummary,
  items,
  record,
  startIndex = 0,
  view,
}) {
  return (
    <div className="erp-business-row-items-preview__items">
      {items.map((item, localIndex) => {
        const index = startIndex + localIndex
        const context = { index, record, view }
        const fields = getItemFields?.(item, context) || []
        const label = getItemLabel?.(item, context) || `明细 ${index + 1}`
        const summary = getItemSummary?.(item, context)
        const key = getItemKey?.(item, context)
        return (
          <article
            className="erp-business-row-item-card"
            key={key ?? item?.id ?? `${label}-${index}`}
          >
            <div className="erp-business-row-item-card__head">
              <strong>{label}</strong>
              {summary ? <span>{summary}</span> : null}
            </div>
            <div className="erp-business-row-item-card__content">
              {fieldRows(fields).map((row, rowIndex) => (
                <dl className="erp-business-row-item-card__grid" key={rowIndex}>
                  {row.map((field, fieldIndex) => (
                    <div
                      className={[
                        'erp-business-row-item-card__field',
                        field?.fullWidth
                          ? 'erp-business-row-item-card__field--full'
                          : field?.wide
                            ? 'erp-business-row-item-card__field--wide'
                            : '',
                        field?.strong
                          ? 'erp-business-row-item-card__field--strong'
                          : '',
                        field?.media
                          ? 'erp-business-row-item-card__field--media'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-tone={field?.tone}
                      key={field?.key || field?.label || fieldIndex}
                    >
                      <dt>{field?.label || '字段'}</dt>
                      <dd>{visibleDetailValue(field?.value)}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
