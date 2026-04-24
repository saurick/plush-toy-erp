import React from 'react'
import AppModal from '@/common/components/modal/AppModal'

export default function AlertDialog({
  open,
  onClose,
  title = '提示',
  message = '',
  confirmText = '确定',
  onConfirm = null,
  className = '',
}) {
  const handleConfirm = () => {
    onConfirm?.()
    onClose?.()
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      className={`app-alert-dialog ${className}`.trim()}
    >
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        {title ? (
          <div
            className="text-xl font-semibold leading-8 text-slate-900 sm:text-2xl"
            data-app-alert-title
          >
            {title}
          </div>
        ) : null}

        {message ? (
          <div
            className="whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base"
            data-app-alert-message
          >
            {message}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleConfirm}
          className="min-w-[152px] rounded-full bg-cyan-300 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(8,145,178,0.18)] transition hover:bg-cyan-200 active:bg-cyan-400"
          data-app-alert-confirm
        >
          {confirmText}
        </button>
      </div>
    </AppModal>
  )
}
