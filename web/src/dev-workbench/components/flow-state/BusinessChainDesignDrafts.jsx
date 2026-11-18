import React, { useState } from 'react'
import { Button, Dropdown } from 'antd'
import { DownOutlined, ExportOutlined } from '@ant-design/icons'
import Modal from '@/common/components/modal/AppModal.jsx'
import { WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import { DEV_FLOW_EXPLORER_BLANK_HREF } from '../../pages/devFlowExplorerNavigation.mjs'

export default function BusinessChainDesignDrafts({ confirmNew, onNew, notesCount, onNotes }) {
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
      <WorkbenchToolbar className="erp-chain-design__drafts">
        <Button onClick={() => confirmNew ? setConfirming(true) : startNew()}>新建空白视图</Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'notes', label: notesCount ? `视图备注（${notesCount}）` : '视图备注', onClick: onNotes },
              { key: 'new-tab', icon: <ExportOutlined />, label: <a href={DEV_FLOW_EXPLORER_BLANK_HREF} target="_blank" rel="noopener noreferrer">在新标签页新建</a> },
            ],
          }}
        >
          <Button aria-label="更多视图操作">更多 <DownOutlined /></Button>
        </Dropdown>
      </WorkbenchToolbar>
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
