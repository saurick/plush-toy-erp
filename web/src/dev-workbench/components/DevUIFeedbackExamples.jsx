import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Space,
  Tooltip,
  Upload,
} from 'antd'
import Select from '@/common/components/select/AppSelect'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import BusinessFormModal from '@/erp/components/business-list/BusinessFormModal'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import BusinessModal from '@/erp/components/business-list/BusinessModal'
import AlertDialog from '@/common/components/modal/AlertDialog'
import AppModal from '@/common/components/modal/AppModal'
import AppDrawer from '@/common/components/drawer/AppDrawer.jsx'
import { showCopySuccess } from '@/common/components/feedback/copyFeedback.jsx'
import {
  MESSAGE_CONFIG,
  NOTIFICATION_CONFIG,
} from '@/common/utils/feedbackConfig.mjs'
import { withMessageSemantics } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { ERP_MODAL_WIDTHS } from '@/erp/utils/modalSizes.mjs'
import DevControlUsageTable from './DevControlUsageTable.jsx'
import '../styles/dev-ui-feedback.css'

export function useDemoFeedback() {
  const { message: api, notification } = App.useApp()
  const message = useMemo(() => withMessageSemantics(api), [api])
  const key = useId()
  useEffect(
    () => () => {
      message.destroy()
      notification.destroy(key)
    },
    [key, message, notification]
  )
  return { message, notification, key }
}

function useDemoDelay() {
  const controller = useRef(null)
  useEffect(() => {
    controller.current = new AbortController()
    return () => controller.current.abort()
  }, [])
  return (duration = 900) =>
    new Promise((resolve, reject) => {
      const { signal } = controller.current
      const cancel = () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', cancel)
        resolve()
      }, duration)
      if (signal.aborted) cancel()
      else signal.addEventListener('abort', cancel, { once: true })
    })
}

const PART_HIGHLIGHT = 'erp-control-usage-highlight'
const EDITOR_DIALOG_SECTIONS = ['header', 'body', 'footer']
const DEMO_SAVE_FAILURE = '本次样例未保存，输入已保留，请重试。'

function EditorExample({ size = 'localAction', usageRules, usageId }) {
  const [form] = Form.useForm()
  const { message, key } = useDemoFeedback()
  const delay = useDemoDelay()
  const [open, setOpen] = useState(false)
  const [highlightedPart, setHighlightedPart] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [scenario, setScenario] = useState('success')
  const [state, setState] = useState('editing')
  const [failure, setFailure] = useState('')
  const [receipt, setReceipt] = useState('尚未保存样例')
  const [attempts, setAttempts] = useState(0)
  const busy = state === 'saving' || state === 'querying'
  const busyRef = useRef(false)
  const failedOnce = useRef(false)
  const save = async () => {
    if (busyRef.current || state === 'unknown') return
    busyRef.current = true
    try {
      const values = await form.validateFields()
      setState('saving')
      setFailure('')
      setAttempts((count) => count + 1)
      await delay()
      if (scenario === 'unknown') {
        setState('unknown')
        return
      }
      if (scenario === 'failure' && !failedOnce.current) {
        failedOnce.current = true
        setState('failed')
        setFailure(DEMO_SAVE_FAILURE)
        return
      }
      setReceipt(`已保存样例：${values.subject}`)
      setDirty(false)
      setState('saved')
      setOpen(false)
      message.success({ key, content: '样例已保存' })
    } catch (error) {
      if (isRpcAbortError(error)) return
      if (error?.errorFields) throw error
      setState('failed')
      setFailure(getActionErrorMessage(error, '保存样例'))
    } finally {
      busyRef.current = false
    }
  }
  const query = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setState('querying')
    try {
      await delay()
      setReceipt(`已查询确认：${form.getFieldValue('subject')}`)
      setState('saved')
      setDirty(false)
      setOpen(false)
      message.success({ key, content: '已查到样例保存结果，无需再次提交' })
    } catch (error) {
      if (!isRpcAbortError(error)) setState('unknown')
    } finally {
      busyRef.current = false
    }
  }
  const reset = () => {
    form.resetFields()
    setDirty(false)
    setState('editing')
    setFailure('')
    setReceipt('尚未保存样例')
    setAttempts(0)
    failedOnce.current = false
  }
  const openEditor = (part = null) => {
    setHighlightedPart(part)
    setOpen(true)
  }
  const locateUsage = (part) => {
    if (part === 'failure' || part === 'unknown') {
      const failed = part === 'failure'
      if (!form.getFieldValue('subject')?.trim()) {
        form.setFieldsValue({ subject: '确认里布交期' })
      }
      setScenario(part)
      setState(failed ? 'failed' : 'unknown')
      setFailure(failed ? DEMO_SAVE_FAILURE : '')
      failedOnce.current = failed
    } else if (!scenario) {
      setScenario('success')
    }
    openEditor(part)
  }
  return (
    <div className="erp-feedback-example" data-feedback-example="editor">
      <Space wrap>
        <label htmlFor={`scenario-${key}`}>保存结果</label>
        <Select
          placeholder="样例保存结果"
          id={`scenario-${key}`}
          aria-label="样例保存结果"
          value={scenario}
          disabled={open || busy}
          onChange={(value) => {
            reset()
            setScenario(value)
            setHighlightedPart(null)
          }}
          options={[
            { value: 'success', label: '保存成功' },
            { value: 'failure', label: '首次失败，可重试' },
            { value: 'unknown', label: '结果未知，先查询' },
          ]}
        />
        <Button type="primary" disabled={!scenario} onClick={() => openEditor()}>
          打开编辑弹窗
        </Button>
        <Button
          onClick={() => {
            reset()
            setHighlightedPart(null)
          }}
          disabled={busy}
        >
          重置样例
        </Button>
      </Space>
      <p role="status">
        {receipt} · 提交 {attempts} 次
      </p>
      {usageRules && (
        <DevControlUsageTable
          id={usageId}
          rows={usageRules}
          hint="点整行可打开弹窗并高亮对应部位或状态"
          activeTarget={highlightedPart}
          dialogTargets={usageRules.map((row) => row[3])}
          onLocate={locateUsage}
        />
      )}
      <BusinessFormModal
        title="补充采购说明"
        description="样例采购单 PO-DEMO · 局部操作，保留来源页面"
        open={open}
        forceRender
        form={form}
        size={size}
        dirty={dirty && state !== 'unknown'}
        confirmLoading={busy}
        classNames={EDITOR_DIALOG_SECTIONS.includes(highlightedPart) ? { [highlightedPart]: PART_HIGHLIGHT } : undefined}
        styles={highlightedPart === 'footer' ? { footer: { backgroundImage: 'var(--erp-control-usage-fill)' } } : undefined}
        cancelButtonProps={highlightedPart === 'cancel' ? { className: PART_HIGHLIGHT } : undefined}
        onCancel={() => {
          setOpen(false)
          if (state !== 'unknown') reset()
        }}
        onOk={save}
        okText="保存说明"
        okButtonProps={{ disabled: state === 'unknown' }}
      >
        {failure ? (
          <Alert type="error" showIcon message={failure} className={highlightedPart === 'failure' ? PART_HIGHLIGHT : undefined} />
        ) : null}
        {state === 'unknown' || state === 'querying' ? (
          <Alert
            type="warning"
            showIcon
            className={highlightedPart === 'unknown' ? PART_HIGHLIGHT : undefined}
            message="还不能确认是否保存成功"
            description="保留本次内容，查询结果后再继续；关闭后重新打开仍保留待确认状态。"
            action={
              <Button loading={busy} onClick={query}>
                查询结果
              </Button>
            }
          />
        ) : null}
        <Form
          form={form}
          name={`feedback-form-${key.replace(/:/gu, '')}`}
          layout="vertical"
          disabled={busy || state === 'unknown'}
          initialValues={{ subject: '', category: '交期', note: '' }}
          onValuesChange={() => {
            setDirty(true)
            setFailure('')
          }}
        >
          <Form.Item
            name="subject"
            label="说明标题"
            rules={[
              { required: true, whitespace: true, message: '请填写说明标题' },
            ]}
          >
            <Input placeholder="如核对到货时间" />
          </Form.Item>
          <Form.Item name="category" label="事项">
            <Select
              placeholder="请选择事项"
              options={['交期', '包装', '其他'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="补充内容">
            <BusinessTextArea
              minRows={4}
              placeholder="填写演示备注"
            />
          </Form.Item>
        </Form>
        <p className="erp-feedback-note">
          {busy ? '正在处理，请稍候' : dirty ? '有未保存修改' : '尚未修改'}
          。本演示不写入业务数据。
        </p>
      </BusinessFormModal>
    </div>
  )
}

function FeedbackExample() {
  const { message, notification, key } = useDemoFeedback()
  const delay = useDemoDelay()
  const [failure, setFailure] = useState('')
  const [working, setWorking] = useState(false)
  const workingRef = useRef(false)
  const load = async () => {
    if (workingRef.current) return
    workingRef.current = true
    setWorking(true)
    message.loading({ key, content: '正在生成演示导出文件', duration: 0 })
    try {
      await delay()
      message.success({ key, content: '演示文件已生成（未触发下载）' })
      setFailure('')
    } catch (error) {
      if (!isRpcAbortError(error))
        { setFailure(getActionErrorMessage(error, '生成演示文件')) }
    } finally {
      workingRef.current = false
      setWorking(false)
    }
  }
  return (
    <div className="erp-feedback-example" data-feedback-example="feedback">
      <Space wrap>
        <Button
          data-feedback-part="message"
          onClick={() =>
            message.success({ key, content: '已应用本次样例条件' })
          }
        >
          短暂成功 Toast
        </Button>
        <Button
          data-feedback-part="copy"
          onClick={(event) => showCopySuccess('样例编号', event.currentTarget, message)}
        >
          复制成功 Toast（可关闭）
        </Button>
        <Button
          onClick={() =>
            message.info({
              key,
              content:
                '同一操作使用同一个 key，连续点击更新这一条消息。较长的说明在视口内换行，不遮住整页内容。',
            })
          }
        >
          长消息 / 同条更新
        </Button>
        <Button loading={working} onClick={load}>
          加载后更新成功
        </Button>
        <Button
          data-feedback-part="recovery"
          onClick={() =>
            setFailure(
              getActionErrorMessage(new Error('Network error'), '读取样例')
            )
          }
        >
          区域错误
        </Button>
        <Button
          onClick={() =>
            notification.warning({
              key,
              message: '演示导出未完成',
              description: '当前条件已保留，请查看恢复入口。此通知需手动关闭。',
              role: 'alert',
              actions: (
                <Button
                  onClick={() => {
                    notification.destroy(key)
                    setFailure('演示文件未生成，请重新生成。')
                  }}
                >
                  查看恢复入口
                </Button>
              ),
            })
          }
        >
          持续通知
        </Button>
        <Button
          onClick={() => {
            const cancelled = new DOMException('Aborted', 'AbortError')
            if (!isRpcAbortError(cancelled)) message.error('请求失败')
          }}
        >
          取消读取（无失败提示）
        </Button>
        <Button
          disabled={working}
          onClick={() => {
            message.destroy()
            notification.destroy(key)
            setFailure('')
          }}
        >
          重置反馈
        </Button>
      </Space>
      {failure ? (
        <Alert
          type="error"
          showIcon
          message={failure}
          action={
            <Button loading={working} onClick={load}>
              重新生成
            </Button>
          }
        />
      ) : null}
      <p className="erp-feedback-note">
        Toast 不移走焦点；重要错误保留在操作处。同一问题只选一处说明与恢复。
      </p>
    </div>
  )
}

function StandardModal({ open, close, classNames }) {
  return (
    <AppModal
      open={open}
      title="共享标准弹窗"
      width={560}
      classNames={classNames}
      onCancel={close}
      footer={<Button onClick={close}>关闭</Button>}
    >
      <p>系统设置与只读信息使用标准弹窗，尺寸和内容按当前任务提供。</p>
    </AppModal>
  )
}

function ContextDrawer({ open, close, classNames, children }) {
  return (
    <AppDrawer title="采购单上下文摘要" open={open} onClose={close} width={420} classNames={classNames}>
      <p>PO-DEMO · 草稿 · 采购说明待补齐</p>
      {children}
    </AppDrawer>
  )
}

function RecordModal({ open, close, classNames, children }) {
  return (
    <BusinessModal
      title="附件预览样例"
      open={open}
      size="recordDetails"
      classNames={classNames}
      onCancel={close}
      footer={<Button onClick={close}>关闭预览</Button>}
    >
      {children}
    </BusinessModal>
  )
}

function SessionAlertExample({ open, close, part }) {
  return (
    <AlertDialog
      open={open}
      title="登录状态已失效"
      message="请重新登录后继续使用。"
      confirmText="重新登录"
      className={part ? `erp-feedback-alert-part--${part}` : undefined}
      onClose={close}
    />
  )
}

const STANDALONE_OVERLAYS = {
  standard: { label: '打开标准弹窗', Component: StandardModal },
  record: { label: '打开业务弹窗', Component: RecordModal, content: '包装说明 · 演示附件 · 只读预览' },
  drawer: { label: '打开上下文抽屉', Component: ContextDrawer },
  alert: { label: '打开会话提示', Component: SessionAlertExample },
}

const OVERLAY_PARTS = {
  heading: ['header', 'body'],
  frame: ['content'],
  footer: ['footer'],
  body: ['body'],
}

function StandaloneOverlayExample({ type, usageId, usageRules, onEditorExample }) {
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState(null)
  const { label, Component, content } = STANDALONE_OVERLAYS[type]
  const openPart = (nextPart = null) => {
    if (nextPart === 'editor') {
      onEditorExample()
      return
    }
    setPart(nextPart)
    setOpen(true)
  }
  const classNames = part && OVERLAY_PARTS[part]
    ? Object.fromEntries(OVERLAY_PARTS[part].map((name) => [name, PART_HIGHLIGHT]))
    : undefined
  return (
    <div className="erp-feedback-example">
      <Button onClick={() => openPart()}>{label}</Button>
      <Component open={open} close={() => setOpen(false)} part={part} classNames={classNames}>
        {content && <p>{content}</p>}
      </Component>
      {usageRules && (
        <DevControlUsageTable
          id={usageId}
          rows={usageRules}
          hint="点整行可打开样例并高亮对应部位"
          activeTarget={part}
          dialogTargets={usageRules.map((row) => row[3]).filter((target) => target !== 'editor')}
          onLocate={openPart}
        />
      )}
    </div>
  )
}

function AttachmentDrawerExample() {
  const [drawer, setDrawer] = useState(false)
  const [preview, setPreview] = useState(false)
  const [files, setFiles] = useState([])
  const attachmentName = files[0]?.name ?? '采购说明.txt'
  return (
    <div className="erp-feedback-example" data-feedback-example="attachment-drawer">
      <Tooltip title="单击查看已有摘要，不离开当前页面">
        <Button onClick={() => setDrawer(true)}>打开上下文抽屉</Button>
      </Tooltip>
      <ContextDrawer
        open={drawer}
        close={() => {
          setPreview(false)
          setDrawer(false)
        }}
      >
        <p>附件：{attachmentName}</p>
        <Space wrap>
          <Button onClick={() => setPreview(true)}>打开附件预览</Button>
          <Upload
            beforeUpload={() => false}
            fileList={files}
            maxCount={1}
            showUploadList={false}
            onChange={({ fileList }) => setFiles(fileList)}
          >
            <Button>选择演示附件</Button>
          </Upload>
        </Space>
      </ContextDrawer>
      <RecordModal open={preview} close={() => setPreview(false)}>
        <p>{attachmentName}</p>
        <p>示例展示附件名称，文件留在本地。</p>
      </RecordModal>
    </div>
  )
}

function DangerConfirmExample() {
  const { modal } = App.useApp()
  const [voided, setVoided] = useState(false)
  const confirmation = useRef(null)
  useEffect(() => () => confirmation.current?.destroy(), [])
  const confirmVoid = () => {
    if (confirmation.current) return
    confirmation.current = modal.confirm({
      maskClosable: true,
      title: '作废样例草稿 PO-DEMO？',
      content: '仅终止这份尚未生效的样例草稿，不改变库存。作废后不能恢复；可重新新建。',
      width: ERP_MODAL_WIDTHS.confirm,
      centered: true,
      autoFocusButton: 'cancel',
      okText: '作废草稿',
      cancelText: '保留草稿',
      okButtonProps: { danger: true },
      onOk: () => setVoided(true),
      afterClose: () => {
        confirmation.current = null
      },
    })
  }
  return (
    <div className="erp-feedback-example" data-feedback-example="danger-confirm">
      <Space wrap>
        <Button danger disabled={voided} onClick={confirmVoid}>危险操作确认</Button>
        <Button onClick={() => setVoided(false)}>重置草稿</Button>
      </Space>
      <p role="status">样例草稿：{voided ? '已作废' : '未生效'}</p>
    </div>
  )
}

const FEEDBACK_SCENES = {
  editor: { label: '编辑与提交', Component: EditorExample },
  feedback: { label: '消息与恢复', Component: FeedbackExample },
  'attachment-drawer': { label: '抽屉内查看附件', Component: AttachmentDrawerExample },
  'danger-confirm': { label: '危险操作确认', Component: DangerConfirmExample },
}
const SCENE_OPTIONS = Object.entries(FEEDBACK_SCENES).map(([value, { label }]) => ({ value, label }))

function Examples({ topic, size }) {
  const initial =
    topic === 'feedback'
      ? 'feedback'
      : topic === 'closing'
        ? 'attachment-drawer'
        : 'editor'
  const [scene, setScene] = useState(initial)
  const { Component } = FEEDBACK_SCENES[scene]
  return (
    <section className="erp-feedback-examples" aria-label="真实共享组件演示">
      <div className="erp-feedback-example-heading">
        <strong>动手试一试</strong>
        <Segmented
          aria-label="反馈演示场景"
          value={scene}
          onChange={setScene}
          options={SCENE_OPTIONS}
        />
      </div>
      <Component size={size} />
    </section>
  )
}

export default function DevUIFeedbackExamples({ sample, ...props }) {
  const Sample = FEEDBACK_SCENES[sample]?.Component
  return (
    <App message={MESSAGE_CONFIG} notification={NOTIFICATION_CONFIG}>
      {Sample ? <Sample {...props} /> : sample ? <StandaloneOverlayExample type={sample} {...props} /> : <Examples {...props} />}
    </App>
  )
}
