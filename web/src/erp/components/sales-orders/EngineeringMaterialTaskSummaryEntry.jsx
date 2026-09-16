import React from 'react'
import { Button } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import EngineeringMaterialRequestModal from './EngineeringMaterialRequestModal.jsx'
import {
  canReadEngineeringMaterial,
  getEngineeringMaterialOrderContext,
  getEngineeringMaterialPermissions,
  getEngineeringMaterialTaskContext,
} from '../../utils/engineeringMaterialTask.mjs'

export default function EngineeringMaterialTaskSummaryEntry({
  task,
  profile,
  mobile = false,
}) {
  const context =
    getEngineeringMaterialTaskContext(task) ||
    getEngineeringMaterialOrderContext(task)
  const canRead = Boolean(context && canReadEngineeringMaterial(profile))
  const sourceKey = `${profile?.id}:${task?.id}:${task?.version}:${task?.task_group}:${context?.orderID}:${context?.requestID}`
  const entryRef = React.useRef(null)
  const [openedSourceKey, setOpenedSourceKey] = React.useState(null)
  const [view, setView] = React.useState('summary')
  React.useEffect(() => {
    setOpenedSourceKey(null)
  }, [sourceKey, canRead])
  if (!canRead) return null

  return (
    <div className="erp-material-task-summary-entry">
      <Button
        ref={entryRef}
        block
        icon={<FileTextOutlined aria-hidden="true" />}
        size={mobile ? 'large' : 'middle'}
        onClick={() => {
          setView('summary')
          setOpenedSourceKey(sourceKey)
        }}
      >
        查看材料汇总
      </Button>
      {task.task_group === 'engineering_material_revision' &&
      task.task_status_key === 'ready' ? (
        <Button
          block
          size={mobile ? 'large' : 'middle'}
          onClick={() => {
            setView('preview')
            setOpenedSourceKey(sourceKey)
          }}
        >
          查看待重提用料
        </Button>
      ) : null}
      {openedSourceKey === sourceKey ? (
        <EngineeringMaterialRequestModal
          key={`${sourceKey}:${view}`}
          {...context}
          mobile={mobile}
          readOnly
          preview={view === 'preview'}
          permissions={getEngineeringMaterialPermissions(profile, task)}
          onCancel={() => {
            setOpenedSourceKey(null)
            requestAnimationFrame(() => {
              entryRef.current?.focus()
            })
          }}
        />
      ) : null}
    </div>
  )
}
