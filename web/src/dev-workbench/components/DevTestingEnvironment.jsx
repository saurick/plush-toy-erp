import { CloudServerOutlined, DesktopOutlined, ReadOutlined } from '@ant-design/icons'
import { getDevTestingEnvironment } from '../config/devTesting.mjs'
import '../styles/dev-testing-navigation.css'

const ICONS = { local: DesktopOutlined, server: CloudServerOutlined, reference: ReadOutlined }

export default function DevTestingEnvironment({ view, context: suppliedContext, ariaLabel = '执行与报告来源', compact = false }) {
  const context = suppliedContext || getDevTestingEnvironment(view, Boolean(import.meta.env.PLUSH_STANDALONE_WORKBENCH))
  const Icon = ICONS[context.kind]
  return (
    <div className="erp-dev-testing-environment" data-environment={context.kind} aria-label={ariaLabel}>
      <strong><Icon aria-hidden="true" />{context.label}</strong>
      {compact ? null : <span>{context.detail}</span>}
    </div>
  )
}
