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
  draftRef,
  onDraftChange,
}) {
  const context =
    getEngineeringMaterialTaskContext(task) ||
    getEngineeringMaterialOrderContext(task)
  const canRead = Boolean(context && canReadEngineeringMaterial(profile))
  const permissions = getEngineeringMaterialPermissions(profile, task)
  const canPrepareFinance = Boolean(draftRef && permissions.finance)
  const sourceKey = `${profile?.id}:${task?.id}:${task?.version}:${task?.task_group}:${context?.orderID}:${context?.requestID}:${canPrepareFinance}`
  const entryRef = React.useRef(null)
  const financeEntryRef = React.useRef(null)
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
      {canPrepareFinance ? (
        <Button
          ref={financeEntryRef}
          block
          size={mobile ? 'large' : 'middle'}
          onClick={() => {
            setView('pricing')
            setOpenedSourceKey(sourceKey)
          }}
        >
          填写核价
        </Button>
      ) : null}
      {task.task_group === 'engineering_material_revision' && task.task_status_key === 'ready' ? (
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
          readOnly={view !== 'pricing'}
          preview={view === 'preview'}
          financeDraftOnly={view === 'pricing'}
          workflowTask={view === 'pricing' ? task : undefined}
          draftRef={view === 'pricing' ? draftRef : undefined}
          onDraftChange={view === 'pricing' ? onDraftChange : undefined}
          permissions={permissions}
          onCancel={() => {
            setOpenedSourceKey(null)
            requestAnimationFrame(() => {
              const entry = view === 'pricing' ? financeEntryRef : entryRef
              entry.current?.focus()
            })
          }}
        />
      ) : null}
    </div>
  )
}
