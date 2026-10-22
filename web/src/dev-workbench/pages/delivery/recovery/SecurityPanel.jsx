import { Card, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import { DEV_DOCS_ROUTE } from '../../../config/devRoutes.mjs'

const { Paragraph } = Typography

export function SecurityPanel({ activeView, overview }) {
  return (
    <section
      hidden={activeView !== 'security'}
      id="dev-recovery-panel-security"
      role="tabpanel"
      aria-labelledby="dev-recovery-tab-security"
    >
      <Card
        title="安全检查"
        className="erp-dev-security-checks"
      >
        <Paragraph type="secondary" className="erp-dev-security-checks__scope">
          安全项以各自核验记录为准，目标预检不能代替安全核验。
        </Paragraph>
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table erp-dev-security-table"
            data-table-lines="appearance"
            aria-label="安全检查"
          >
            <thead>
              <tr>
                <th scope="col">检查项</th>
                <th scope="col">核验状态</th>
                <th scope="col">下一步与依据</th>
              </tr>
            </thead>
            <tbody>
              {overview.securityChecks.map((check) => (
                <tr key={check.key}>
                  <th scope="row">{check.title}</th>
                  <td>
                    <Tag
                      color={check.status === 'partial' ? 'blue' : undefined}
                    >
                      {check.statusLabel}
                    </Tag>
                  </td>
                  <td>
                    <details className="erp-dev-delivery-inline-details">
                      <summary>{check.actionLabel}</summary>
                      <p>{check.next}</p>
                      <p>{check.evidence}</p>
                      {check.verifiedAt ? (
                        <>
                          <DevTimestamp
                            missing="完成时间未证明"
                            value={check.verifiedAt}
                            action="核验于"
                          />
                          <small>回执：{check.evidenceId}</small>
                        </>
                      ) : null}
                      <Link
                        to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(check.guidePath)}${check.guideAnchor ? `#${check.guideAnchor}` : ''}`}
                        aria-label={`阅读${check.title}核验要求`}
                      >
                        核验要求
                      </Link>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}
