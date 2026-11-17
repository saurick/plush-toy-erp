import React, { useState } from 'react'
import { Button, Dropdown, Input } from 'antd'
import { DownOutlined, ExportOutlined } from '@ant-design/icons'
import Modal from '@/common/components/modal/AppModal.jsx'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import { WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import { DEV_FLOW_EXPLORER_BLANK_HREF } from '../../pages/devFlowExplorerNavigation.mjs'

export default function BusinessChainDesignDrafts({ model, onOpen, onNotice, onNotes }) {
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState('')
  const { draft, entries, saved, currentId, dirty } = model
  const close = () => { setDialog(null); setError('') }
  const show = (value) => { setError(''); setDialog(value) }
  const showError = (result) => {
    setError(result.error)
    // Dialog errors stay with their action instead of resizing the underlying canvas.
    if (dialog) model.clearIssue()
  }
  const finishOpen = (id) => {
    const result = model.open(id)
    if (!result.ok) { showError(result); return }
    close()
    onOpen(result.draft)
  }
  const requestOpen = (id) => {
    if (dirty) show({ kind: 'switch', id })
    else finishOpen(id)
  }
  const nameDialog = (mode, after) => show({ kind: 'name', mode, name: mode === 'rename' ? saved.name : mode === 'copy' && saved ? `${saved.name}（副本）` : '', after })
  const saveCurrent = (after) => {
    if (!currentId) { nameDialog('save', after); return }
    const result = model.save()
    if (!result.ok) { showError(result); return }
    if (after) finishOpen(after.id)
    else onNotice('')
  }
  const submitName = () => {
    const result = dialog.mode === 'rename' ? model.rename(dialog.name) : model.save(dialog.name, dialog.mode === 'copy')
    if (!result.ok) { showError(result); return }
    if (dialog.after) finishOpen(dialog.after.id)
    else {
      close()
      onNotice(dialog.mode === 'rename'
        ? dirty ? '视图已重命名，画布修改仍需保存。' : '本地视图已重命名。'
        : '')
    }
  }
  const remove = () => {
    const result = model.remove()
    if (!result.ok) { showError(result); return }
    close()
    onOpen()
    onNotice('已删除这份本地视图，其他视图和现有业务链路未改变。')
  }
  return (
    <>
      <WorkbenchToolbar className="erp-chain-design__drafts">
        <span>本地视图</span>
        <AppSelect
          className="erp-chain-design__draft-select"
          aria-label="选择本地视图"
          placeholder="未命名视图"
          value={currentId || undefined}
          options={entries.map(({ id, name }) => ({ value: id, label: name }))}
          onChange={requestOpen}
          allowClear={false /* 不可清空：新建须先处理未保存内容，不能直接清空当前视图。 */}
          showSearch
          optionFilterProp="label"
          disabled={!entries.length}
        />
        <div className="erp-chain-design__save">
          <Button onClick={() => saveCurrent()}>保存视图</Button>
          <span className="erp-chain-design__save-status" role="status" aria-label="视图保存状态">
            {dirty ? '未保存' : saved ? '已保存' : ''}
          </span>
        </div>
        <Button onClick={() => requestOpen(null)}>新建空白视图</Button>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'copy', label: '另存一份', onClick: () => nameDialog('copy') },
              { key: 'notes', label: draft.ideas.length ? `视图备注（${draft.ideas.length}）` : '视图备注', onClick: onNotes },
              { key: 'rename', label: '重命名', disabled: !currentId, onClick: () => nameDialog('rename') },
              { key: 'restore', label: '恢复已保存', disabled: !currentId, onClick: () => dirty ? show({ kind: 'restore' }) : finishOpen(currentId) },
              { key: 'new-tab', icon: <ExportOutlined />, label: <a href={DEV_FLOW_EXPLORER_BLANK_HREF} target="_blank" rel="noopener noreferrer">在新标签页新建</a> },
              { type: 'divider' },
              { key: 'delete', label: '删除', danger: true, disabled: !currentId, onClick: () => show({ kind: 'delete' }) },
            ],
          }}
        >
          <Button aria-label="更多视图操作">更多 <DownOutlined /></Button>
        </Dropdown>
      </WorkbenchToolbar>
      {dialog?.kind === 'name' ? (
        <Modal
          title={dialog.mode === 'rename' ? '重命名本地视图' : dialog.mode === 'copy' ? '另存一份本地视图' : '保存本地视图'}
          open
          onCancel={close}
          onOk={submitName}
          okText={dialog.mode === 'rename' ? '确定重命名' : '保存'}
          cancelText="取消"
          className="erp-chain-design-draft-dialog"
        >
          <label htmlFor="chain-draft-name">视图名称</label>
          <Input
            id="chain-draft-name"
            autoFocus
            maxLength={60}
            showCount
            value={dialog.name}
            onChange={(event) => { setDialog({ ...dialog, name: event.target.value }); setError('') }}
            onPressEnter={submitName}
            status={error ? 'error' : undefined}
          />
          <p>仅保存在此浏览器，不影响现有业务。</p>
          {error ? <p role="alert">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.kind === 'switch' ? (
        <Modal
          title="当前视图有未保存修改"
          open
          onCancel={close}
          footer={[
            <Button key="cancel" onClick={close}>取消</Button>,
            <Button key="discard" onClick={() => finishOpen(dialog.id)}>{dialog.id === null ? '放弃并新建' : '放弃修改并切换'}</Button>,
            <Button key="save" type="primary" onClick={() => saveCurrent({ id: dialog.id })}>{dialog.id === null ? '保存并新建' : '保存并切换'}</Button>,
          ]}
        >
          <p>是否先保存“{saved?.name || '未命名视图'}”的修改，{dialog.id === null ? '再新建空白视图' : `再切换到“${entries.find((item) => item.id === dialog.id)?.name}”`}？</p>
          {error ? <p role="alert">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.kind === 'restore' ? (
        <Modal title="恢复已保存内容？" open onCancel={close} onOk={() => finishOpen(currentId)} okText="放弃修改并恢复" cancelText="取消">
          <p>将放弃当前未保存修改，恢复“{saved.name}”最近一次保存的内容。</p>
          {error ? <p role="alert">{error}</p> : null}
        </Modal>
      ) : null}
      {dialog?.kind === 'delete' ? (
        <Modal title="删除本地视图？" open onCancel={close} onOk={remove} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <p>删除“{saved.name}”后无法恢复。其他视图和现有业务链路不受影响。</p>
          {dirty ? <p>当前未保存的修改也会一并丢弃。</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </Modal>
      ) : null}
    </>
  )
}
