import { Typography } from 'antd'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { StatusTag, statusText } from './presentation.jsx'

const { Text, Title } = Typography

export function DiffPanel({ consoleSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="差异预览"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <Title level={2}>产品默认与候选配置</Title>
        <Text type="secondary" className="erp-dev-customer-inline-note">
          比较登记的产品默认值与工作区客户包；线上实际配置需另行读回。
        </Text>
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table erp-dev-customer-diff-table"
            data-table-lines="appearance"
            aria-label="客户配置变化对比"
          >
            <thead>
              <tr>
                <th scope="col">配置项</th>
                <th scope="col">产品默认 / 现有实现</th>
                <th scope="col">工作区候选包</th>
                <th scope="col">影响</th>
              </tr>
            </thead>
            <tbody>
              {consoleSummary.diffItems.map((item) => (
                <tr key={item.key}>
                  <th scope="row">
                    <span>{item.type}</span>
                    {statusText(item.status) !== item.type ? (
                      <StatusTag status={item.status} />
                    ) : null}
                  </th>
                  <td>{item.current}</td>
                  <td>{item.incoming}</td>
                  <td>{item.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <DevStaticGuidance title="候选包的运行与发布开关">
          <div className="erp-dev-customer-guard-list">
            {consoleSummary.versionGates.map((gate) => (
              <div className="erp-dev-customer-guard" key={gate.key}>
                <Text>{gate.label}</Text>
                <Text>{gate.enabled ? '已开启' : '未开启'}</Text>
              </div>
            ))}
          </div>
        </DevStaticGuidance>
      </section>
    </div>
  )
}
