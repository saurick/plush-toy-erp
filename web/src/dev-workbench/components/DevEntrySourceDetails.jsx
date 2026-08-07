import React from 'react'

export default function DevEntrySourceDetails({ route, source }) {
  return (
    <details className="erp-dev-entry-source-details">
      <summary>查看路径与维护来源</summary>
      <dl>
        <div>
          <dt>页面路径</dt>
          <dd>
            <code className="erp-dev-hub-card__route">{route}</code>
          </dd>
        </div>
        <div>
          <dt>维护来源</dt>
          <dd>
            <code className="erp-dev-hub-card__source">{source}</code>
          </dd>
        </div>
      </dl>
    </details>
  )
}
