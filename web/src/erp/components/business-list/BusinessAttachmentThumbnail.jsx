import { useEffect, useRef, useState } from 'react'
import {
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
} from '@ant-design/icons'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'
import { isBusinessAttachmentWithdrawn } from '../../utils/businessAttachmentPresentation.mjs'
import { isBusinessAttachmentImage } from '../../utils/businessAttachmentPanelState.mjs'
import BusinessImage from './BusinessImage.jsx'

const THUMBNAIL_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export default function BusinessAttachmentThumbnail({ item }) {
  const rootRef = useRef(null)
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  const withdrawn = isBusinessAttachmentWithdrawn(item)
  const { id, mime_type: mimeType, content_base64: content } = item

  useEffect(() => {
    setSource('')
    setFailed(false)
    if (withdrawn || !THUMBNAIL_TYPES.has(mimeType) || (!content && !id)) {
      return undefined
    }
    let active = true
    let objectURL = ''
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      try {
        // Protected file content is read only when its row enters the viewport.
        const file = content
          ? { content_base64: content }
          : await downloadBusinessAttachment({ id })
        if (!active) return
        if (!file?.content_base64) throw new Error('empty attachment image')
        const bytes = Uint8Array.from(atob(file.content_base64), (char) =>
          char.charCodeAt(0)
        )
        objectURL = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
        setSource(objectURL)
      } catch {
        if (active) setFailed(true)
      }
    })
    observer.observe(rootRef.current)
    return () => {
      active = false
      observer.disconnect()
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [content, id, mimeType, withdrawn])

  return (
    <div
      ref={rootRef}
      className="business-attachment-panel__thumbnail"
      aria-hidden="true"
    >
      {source || failed ? (
        <BusinessImage src={source} loadFailed={failed} alt={item.file_name || '附件图片'} compact />
      ) : isBusinessAttachmentImage(item) ? (
        <FileImageOutlined />
      ) : mimeType === 'application/pdf' ? (
        <FilePdfOutlined />
      ) : (
        <FileOutlined />
      )}
    </div>
  )
}
