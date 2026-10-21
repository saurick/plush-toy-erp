import { Card, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import DevDeliveryTimestamp from '../../../components/DevDeliveryTimestamp.jsx'
import { DEV_DRILL_RECOVERY_SOURCE_PATH } from '../../../config/devRecovery.mjs'
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
        extra={
          <Link
            to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(DEV_DRILL_RECOVERY_SOURCE_PATH)}`}
          >
            防入侵与防勒索指引
          </Link>
        }
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
                <th scope="col">当前证据</th>
                <th scope="col">下一步</th>
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
                    <p>{check.evidence}</p>
                    {check.verifiedAt ? (
                      <details>
                        <summary>回执与核验时间</summary>
                        <DevDeliveryTimestamp
                          value={check.verifiedAt}
                          action="核验于"
                        />
                        <small>回执：{check.evidenceId}</small>
                      </details>
                    ) : null}
                  </td>
                  <td>
                    <p>{check.next}</p>
                    <Link
                      to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(check.guidePath)}${check.guideAnchor ? `#${check.guideAnchor}` : ''}`}
                      aria-label={`阅读${check.title}核验要求`}
                    >
                      核验要求
                    </Link>
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
