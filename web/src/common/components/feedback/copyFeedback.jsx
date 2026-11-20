import React from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { message } from '../../utils/antdApp'
import { COPY_SUCCESS_DURATION } from '../../utils/feedbackConfig.mjs'

const COPY_FAILURE_KEY = 'clipboard-copy-failure'
let copySuccessSequence = 0

export function showCopySuccess(label, trigger) {
  const key = `clipboard-copy-success-${++copySuccessSequence}`
  const text = `${label}已复制`
  let closeButton
  message.destroy(COPY_FAILURE_KEY)
  message.success({
    key,
    duration: COPY_SUCCESS_DURATION,
    className: 'erp-feedback-message--copy-success',
    content: (
      <span className="erp-feedback-copy-content">
        <span>{text}</span>
        <Button
          ref={(node) => { closeButton = node }}
          type="text"
          size="small"
          icon={<CloseOutlined aria-hidden="true" />}
          aria-label={`关闭「${text}」提示`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => message.destroy(key)}
        />
      </span>
    ),
    onClose: () => {
      if (closeButton && document.activeElement === closeButton && trigger?.isConnected) {
        trigger.focus({ preventScroll: true })
      }
    },
  })
}

export function showCopyFailure(content = '复制失败，请手动复制') {
  message.error({ key: COPY_FAILURE_KEY, content })
}
