import React from 'react'
import { Button } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import EngineeringMaterialRequestModal from './EngineeringMaterialRequestModal.jsx'
import {
  canReadEngineeringMaterial,
  getEngineeringMaterialPermissions,
  getEngineeringMaterialTaskContext,
} from '../../utils/engineeringMaterialTask.mjs'

export default function EngineeringMaterialTaskSummaryEntry({
  task,
  profile,
  mobile = false,
  compact = true,
  buttonText = '查看材料汇总',
}) {
  const context = getEngineeringMaterialTaskContext(task)
  const canRead = Boolean(context && ['engineering_material_boss_review', 'engineering_material_finance_review'].includes(task?.task_group) && canReadEngineeringMaterial(profile))
  const sourceKey = `${profile?.id}:${task?.id}:${task?.version}:${task?.task_group}:${context?.orderID}:${context?.requestID}`
  const entryRef = React.useRef(null)
  const [openedSourceKey, setOpenedSourceKey] = React.useState(null)
  React.useEffect(() => {
    setOpenedSourceKey(null)
  }, [sourceKey, canRead])
  const closeSummary = () => {
    setOpenedSourceKey(null)
    requestAnimationFrame(() => {
      entryRef.current?.focus({ preventScroll: true })
    })
  }
  if (!canRead) return null

  return (
    <div
      className={`erp-material-task-summary-entry${compact ? ' erp-material-task-summary-entry--compact' : ''}`}
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && openedSourceKey === sourceKey) {
          event.preventDefault()
          event.stopPropagation()
          closeSummary()
        }
      }}
    >
      <Button
        ref={entryRef}
        block={!compact}
        icon={<FileTextOutlined aria-hidden="true" />}
        size={mobile && !compact ? 'large' : 'middle'}
        aria-label="查看材料汇总"
        onClick={(event) => {
          entryRef.current = event.currentTarget
          setOpenedSourceKey(sourceKey)
        }}
      >
        {buttonText}
      </Button>
      {openedSourceKey === sourceKey ? (
        <EngineeringMaterialRequestModal
          key={sourceKey}
          {...context}
          mobile={mobile}
          readOnly
          permissions={getEngineeringMaterialPermissions(profile, task)}
          onCancel={closeSummary}
        />
      ) : null}
    </div>
  )
}
