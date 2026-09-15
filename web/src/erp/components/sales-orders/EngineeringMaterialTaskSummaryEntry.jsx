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
  const sourceKey = `${task?.id}:${context?.orderID}:${context?.requestID}`
  const entryRef = React.useRef(null)
  const [openedSourceKey, setOpenedSourceKey] = React.useState(null)
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
        onClick={() => setOpenedSourceKey(sourceKey)}
      >
        查看材料汇总
      </Button>
      {openedSourceKey === sourceKey ? (
        <EngineeringMaterialRequestModal
          key={task.id}
          {...context}
          mobile={mobile}
          readOnly
          permissions={getEngineeringMaterialPermissions(profile, task)}
          onCancel={() => {
            setOpenedSourceKey(null)
            requestAnimationFrame(() => entryRef.current?.focus())
          }}
        />
      ) : null}
    </div>
  )
}
