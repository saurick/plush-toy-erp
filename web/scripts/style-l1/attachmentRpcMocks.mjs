export async function installAttachmentRpcMocks(page, context) {
  const { nowUnix } = context
  let workflowAttachment = {
    id: 1,
    owner_type: 'workflow_task',
    owner_id: 1,
    attachment_type: 'evidence',
    slot_key: null,
    file_name: 'style-l1-evidence.txt',
    mime_type: 'text/plain',
    file_size: 12,
    sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    uploaded_by: 1,
    uploaded_by_username: 'demo_boss',
    note: null,
    withdrawn_at: null,
    withdrawn_by: null,
    withdrawn_by_username: null,
    withdrawal_reason: null,
    created_at: nowUnix(),
  }

  await page.route('**/rpc/attachment', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const attachment = {
      id: Number(params.id || 1),
      owner_type: params.owner_type || 'workflow_task',
      owner_id: Number(params.owner_id || 1),
      attachment_type: params.attachment_type || 'evidence',
      slot_key: params.slot_key || null,
      file_name: params.file_name || 'style-l1-evidence.txt',
      mime_type: params.mime_type || 'text/plain',
      file_size: Number(params.file_size || 12),
      sha256:
        '0000000000000000000000000000000000000000000000000000000000000000',
      uploaded_by: 1,
      uploaded_by_username: 'demo_boss',
      note: null,
      withdrawn_at: null,
      withdrawn_by: null,
      withdrawn_by_username: null,
      withdrawal_reason: null,
      created_at: nowUnix(),
    }
    let code = 0
    let message = 'OK'
    let data = {}
    switch (method) {
      case 'list_attachments':
        data = {
          attachments:
            attachment.owner_type === 'workflow_task'
              ? [workflowAttachment]
              : [],
        }
        break
      case 'upload_attachment':
        if (attachment.owner_type === 'workflow_task') {
          workflowAttachment = attachment
        }
        data = { attachment }
        break
      case 'withdraw_attachment':
        workflowAttachment = {
          ...workflowAttachment,
          withdrawn_at: nowUnix(),
          withdrawn_by: 1,
          withdrawn_by_username: 'demo_boss',
          withdrawal_reason: String(params.reason || '').trim(),
        }
        data = { attachment: workflowAttachment }
        break
      case 'clear_product_image':
        data = { cleared: true }
        break
      case 'download_attachment':
        if (workflowAttachment.withdrawn_at) {
          code = 40010
          message = '附件已撤销，不能预览或下载'
        } else {
          data = {
            attachment: {
              ...workflowAttachment,
              content_base64: 'c3R5bGUtbDE=',
            },
          }
        }
        break
      default:
        code = 40010
        message = `未知 attachment 接口 method=${String(method || '')}`
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code,
          message,
          data,
        },
      }),
    })
  })
}
