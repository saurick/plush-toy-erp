import { SafetyCertificateOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { DeliveryTaskPath } from '../DeliveryTaskPath.jsx'
import { DEV_VERSION_CENTER_ROUTE } from '../../../config/devDelivery.mjs'
import { DEV_DRILL_RECOVERY_SOURCE_PATH } from '../../../config/devRecovery.mjs'
import { DEV_DOCS_ROUTE } from '../../../config/devRoutes.mjs'

const { Paragraph } = Typography

export function EmergencyPanel({
  activeView,
  customerReady,
  navigateWithinCustomerScope,
}) {
  return (
    <section
      hidden={activeView !== 'emergency'}
      id="dev-recovery-panel-emergency"
      role="tabpanel"
      aria-labelledby="dev-recovery-tab-emergency"
      className="erp-dev-recovery-support"
    >
      <details open className="erp-dev-recovery-emergency">
        <summary>疑似入侵或勒索时的处置</summary>
        <div className="erp-dev-recovery-emergency__content">
          <DeliveryTaskPath
            columns={2}
            ariaLabel="安全事件处置顺序"
            items={[
              {
                title: '保全证据与隔离',
                description:
                  '记录发现时间与脱敏日志，受控隔离受影响主机和账号，暂停相关写入。',
              },
              {
                title: '撤销受影响身份',
                description: '使用可信终端撤销会话，按影响范围轮换凭据。',
              },
              {
                title: '在隔离目标恢复',
                description:
                  '选取攻击前可信的数据库与附件备份，在干净目标恢复并核验。',
              },
              {
                title: '确认后切回业务',
                description:
                  '核对丢失数据、漏洞修复与业务入口，批准恢复方案后再切回。',
              },
            ]}
          />
          <Link
            to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(DEV_DRILL_RECOVERY_SOURCE_PATH)}#incident-response`}
          >
            阅读事件处置与恢复边界
          </Link>
        </div>
      </details>

      <details className="erp-dev-recovery-emergency">
        <summary>
          <SafetyCertificateOutlined aria-hidden="true" /> AI 不可用时的应急接管
        </summary>
        <div className="erp-dev-recovery-emergency__content">
          <Paragraph>
            继续使用 clean exact SHA、GitLab
            CI、不可变版本、固定目标和结果读回；不复制容易漂移的命令清单。
          </Paragraph>
          <Paragraph type="secondary">
            新服务器必须先登记目标。禁止对当前试用或正式环境临时注入故障。
          </Paragraph>
          <Paragraph type="secondary">
            演练结果须有正式回执；普通成功部署不自动算作演练。
          </Paragraph>
          <Button
            type="link"
            disabled={!customerReady}
            onClick={() =>
              navigateWithinCustomerScope(DEV_VERSION_CENTER_ROUTE)
            }
          >
            查看版本中心的手动操作指引
          </Button>
        </div>
      </details>
    </section>
  )
}
