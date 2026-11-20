import React, { useRef, useState } from 'react'
import { Button, Dropdown } from 'antd'
import { DownOutlined, ExportOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons'
import Modal from '@/common/components/modal/AppModal.jsx'
import BusinessChainDesignExport from './BusinessChainDesignExport.jsx'
import { DEV_FLOW_EXPLORER_BLANK_HREF } from '../../pages/devFlowExplorerNavigation.mjs'

export default function BusinessChainDesignDrafts({ confirmNew, onNew, notesCount, onNotes, onExample, onUndo, onRedo, exportDisabled, getGraph, onNotice }) {
  const trigger = useRef(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const close = () => { setConfirming(false); setError('') }
  const startNew = () => {
    const message = onNew()
    if (message) {
      setError(message)
      setConfirming(true)
    } else close()
  }
  return (
    <>
      <Dropdown
        trigger={['click']}
        getPopupContainer={(element) => element.closest('.erp-chain-design-shell')}
        menu={{
          items: [
            { key: 'undo', label: '撤销', icon: <UndoOutlined aria-hidden="true" />, disabled: !onUndo, onClick: onUndo },
            { key: 'redo', label: '重做', icon: <RedoOutlined aria-hidden="true" />, disabled: !onRedo, onClick: onRedo },
            { key: 'new', label: '新建空白视图', onClick: () => confirmNew ? setConfirming(true) : startNew() },
            { key: 'export', label: '导出当前范围', disabled: exportDisabled, onClick: () => setExportOpen(true) },
            { key: 'notes', label: notesCount ? `视图备注（${notesCount}）` : '视图备注', onClick: onNotes },
            { key: 'example', label: '员工定位示例', onClick: onExample },
            { key: 'new-tab', icon: <ExportOutlined />, label: <a href={DEV_FLOW_EXPLORER_BLANK_HREF} target="_blank" rel="noopener noreferrer">在新标签页新建</a> },
          ],
        }}
      >
        <Button ref={trigger} aria-label="更多视图操作">更多 <DownOutlined /></Button>
      </Dropdown>
      <BusinessChainDesignExport open={exportOpen} onClose={() => setExportOpen(false)} triggerRef={trigger} getGraph={getGraph} onNotice={onNotice} />
      {confirming ? (
        <Modal
          title="替换当前探索？"
          open
          onCancel={close}
          onOk={startNew}
          okText="直接新建"
          cancelText="取消"
          className="erp-chain-design-draft-dialog"
        >
          <p>新建空白视图会替换当前探索。要保留当前画布，可在新标签页新建。</p>
          {error ? <p role="alert">{error}</p> : null}
        </Modal>
      ) : null}
    </>
  )
}
