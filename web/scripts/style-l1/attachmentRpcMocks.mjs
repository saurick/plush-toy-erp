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
      upload_attachment: { attachment },
      download_attachment: {
        attachment: {
          ...attachment,
          content_base64: 'c3R5bGUtbDE=',
        },
      },
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: Object.prototype.hasOwnProperty.call(dataByMethod, method)
            ? 0
            : 40010,
          message: Object.prototype.hasOwnProperty.call(dataByMethod, method)
            ? 'OK'
            : `未知 attachment 接口 method=${String(method || '')}`,
          data: dataByMethod[method] || {},
        },
      }),
    })
  })
}
