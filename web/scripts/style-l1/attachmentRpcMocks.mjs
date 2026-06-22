export async function installAttachmentRpcMocks(page, context) {
  const { nowUnix } = context

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
      note: null,
      created_at: nowUnix(),
    }

    const dataByMethod = {
      list_attachments: { attachments: [] },
      listAttachments: { attachments: [] },
      upload_attachment: { attachment },
      uploadAttachment: { attachment },
      download_attachment: {
        attachment: {
          ...attachment,
          content_base64: 'c3R5bGUtbDE=',
        },
      },
      downloadAttachment: {
        attachment: {
          ...attachment,
          content_base64: 'c3R5bGUtbDE=',
        },
      },
      get_attachment_content: {
        attachment: {
          ...attachment,
          content_base64: 'c3R5bGUtbDE=',
        },
      },
      getAttachmentContent: {
        attachment: {
          ...attachment,
          content_base64: 'c3R5bGUtbDE=',
        },
      },
      delete_attachment: { deleted: true },
      deleteAttachment: { deleted: true },
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data: dataByMethod[method] || {},
        },
      }),
    })
  })
}
