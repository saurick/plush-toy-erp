import { Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import { PERMISSION_CENTER_TAB_KEYS } from '@/common/consts/permissionCenterTabs.mjs'
import policySource from '../../../../../docs/product/配置与权限策略.md?raw'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'

const { Text } = Typography
const approvalRule = policySource.match(
  /<a id="customer-order-approval-policy"><\/a>\r?\n\s*### [^\n]+\n([\s\S]*?)(?=\r?\n#{1,3} |$)/u
)?.[1]?.trim()

export default function CustomerApprovalPolicy() {
  return (
    <WorkbenchSection
      flat
      className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      title="销售与采购订单审批"
      tools={<Tag color="blue">条件可调整</Tag>}
      description="产品当前规则。此处不读取客户目标环境的审批设置。"
      footer={import.meta.env.MODE === 'workbench' ? (
        <Text type="secondary">在 ERP 权限管理的「审批责任」调整条件和人员。</Text>
      ) : (
        <Link to={`/erp/system/permissions?tab=${PERMISSION_CENTER_TAB_KEYS.APPROVALS}`}>
          打开权限管理 · 审批责任
        </Link>
      )}
    >
      {approvalRule ? (
        <Markdown source={approvalRule} />
      ) : (
        <WorkbenchNotice tone="warning" title="审批规则说明暂不可用" />
      )}
    </WorkbenchSection>
  )
}
