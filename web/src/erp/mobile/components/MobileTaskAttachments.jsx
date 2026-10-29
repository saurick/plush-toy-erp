import BusinessAttachmentModalButton from '../../components/business-list/BusinessAttachmentModalButton.jsx'

export default function MobileTaskAttachments({ task, canManage = false, busy = false }) {
  if (!task?.id) return null
  return (
    <BusinessAttachmentModalButton
      ownerType="workflow_task"
      ownerId={task.id}
      ownerVersion={task.version}
      buttonText="任务附件"
      countLabel="任务附件"
      emptyUploadLabel="添加任务附件"
      emptyReadLabel="查看任务附件"
      modalTitle="任务附件"
      panelTitle="任务附件"
      description={canManage ? '上传照片、异常截图或处理凭证。' : '查看照片、异常截图或处理凭证。'}
      canUpload={canManage}
      canWithdraw={canManage}
      disabled={busy}
      disabledReason="任务正在提交，请稍候"
      showAttachmentCount
      buttonProps={{ className: 'mobile-detail-attachment-button', 'data-testid': 'mobile-task-attachment-action', size: 'middle' }}
    />
  )
}
