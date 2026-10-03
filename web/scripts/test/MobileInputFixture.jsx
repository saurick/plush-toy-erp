import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import MobileTaskActionScreen from '../../src/erp/mobile/components/MobileTaskActionScreen.jsx'
import 'antd/dist/reset.css'
import '../../src/tailwind.css'
import '../../src/erp/styles/app.css'
import '../../src/erp/mobile/mobileRoleTasks.css'

const task = {
  id: 98001,
  task_name: '核对模拟生产审批输入',
  task_status_key: 'ready',
  owner_role_key: 'boss',
  source_type: 'production_report',
  source_no: 'STYLE-L1-INPUT',
  required_capability_key: 'production.exception.approve',
  process_instance_id: 98002,
}

function Fixture() {
  const [action, setAction] = useState('done')
  const [reason, setReason] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submission, setSubmission] = useState(null)
  const dark = new URLSearchParams(location.search).get('theme') === 'dark'
  document.documentElement.dataset.erpTheme = dark ? 'dark' : 'light'
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <div className="mobile-app-layout">
        <MobileTaskActionScreen
          task={task}
          accessState="actionable"
          hasActionCapability
          availableActions={['done', 'blocked', 'rejected', 'urge']}
          selectedAction={action}
          onActionChange={setAction}
          reason={reason}
          onReasonChange={setReason}
          approvedQuantity={quantity}
          onApprovedQuantityChange={setQuantity}
          onSubmit={setSubmission}
        />
        <output data-testid="input-submission" hidden>
          {JSON.stringify(submission)}
        </output>
      </div>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
