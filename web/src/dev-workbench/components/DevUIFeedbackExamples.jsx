import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Drawer,
  Dropdown,
  Form,
  Input,
  Select,
  Space,
  Tooltip,
  Upload,
} from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import BusinessFormModal from '@/erp/components/business-list/BusinessFormModal'
import BusinessModal from '@/erp/components/business-list/BusinessModal'
import AlertDialog from '@/common/components/modal/AlertDialog'
import {
  MESSAGE_CONFIG,
  NOTIFICATION_CONFIG,
} from '@/common/utils/feedbackConfig.mjs'
import { withMessageSemantics } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { ERP_MODAL_WIDTHS } from '@/erp/utils/modalSizes.mjs'
import '../styles/dev-ui-feedback.css'

function useDemoFeedback() {
  const { message: api, notification } = App.useApp()
  const message = useMemo(() => withMessageSemantics(api), [api])
  const key = useId()
  useEffect(
    () => () => {
      message.destroy(key)
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

function EditorExample({ size = 'localAction' }) {
  const [form] = Form.useForm()
  const { message, key } = useDemoFeedback()
  const delay = useDemoDelay()
  const [open, setOpen] = useState(false)
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
        throw new Error('本次样例未保存，输入已保留，请重试。')
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
  return (
    <div className="erp-feedback-example" data-feedback-example="editor">
      <Space wrap>
        <label htmlFor={`scenario-${key}`}>保存结果</label>
        <Select
          id={`scenario-${key}`}
          aria-label="样例保存结果"
          value={scenario}
          disabled={open || busy}
          onChange={(value) => {
            reset()
            setScenario(value)
          }}
          options={[
            { value: 'success', label: '保存成功' },
            { value: 'failure', label: '首次失败，可重试' },
            { value: 'unknown', label: '结果未知，先查询' },
          ]}
        />
        <Button type="primary" onClick={() => setOpen(true)}>
          打开编辑弹窗
        </Button>
        <Button onClick={reset} disabled={busy}>
          重置样例
        </Button>
      </Space>
      <p role="status">
        {receipt} · 提交 {attempts} 次
      </p>
      <BusinessFormModal
        title="补充采购说明"
        description="样例采购单 PO-DEMO · 局部操作，保留来源页面"
        open={open}
        forceRender
        form={form}
        size={size}
        dirty={dirty && state !== 'unknown'}
        confirmLoading={busy}
        onCancel={() => {
          setOpen(false)
          if (state !== 'unknown') reset()
        }}
        onOk={save}
        okText="保存说明"
        okButtonProps={{ disabled: state === 'unknown' }}
      >
        {failure ? <Alert type="error" showIcon message={failure} /> : null}
        {state === 'unknown' || state === 'querying' ? (
          <Alert
            type="warning"
            showIcon
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
            <Input placeholder="例如：核对下一批到货时间" />
          </Form.Item>
          <Form.Item name="category" label="事项">
            <Select
              options={['交期', '包装', '其他'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="补充内容">
            <Input.TextArea
              rows={4}
              placeholder="可输入长内容，检查内部滚动和保留输入"
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
          onClick={() =>
            message.success({ key, content: '已应用本次样例条件' })
          }
        >
          短暂成功 Toast
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
            message.destroy(key)
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

function OverlayExample() {
  const { modal } = App.useApp()
  const [drawer, setDrawer] = useState(false)
  const [preview, setPreview] = useState(false)
  const [alert, setAlert] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [files, setFiles] = useState([])
  const confirmation = useRef(null)
  useEffect(() => () => confirmation.current?.destroy(), [])
  return (
    <div className="erp-feedback-example" data-feedback-example="overlays">
      <Space wrap>
        <Dropdown
          menu={{
            items: [
              {
                key: 'summary',
                label: '查看上下文摘要',
                onClick: () => setDrawer(true),
              },
              {
                key: 'preview',
                label: '预览所选文件信息',
                onClick: () => setPreview(true),
              },
            ],
          }}
          trigger={['click']}
        >
          <Button>更多操作</Button>
        </Dropdown>
        <Tooltip title="单击查看已有摘要，不离开当前页面">
          <Button onClick={() => setDrawer(true)}>打开上下文抽屉</Button>
        </Tooltip>
        <Button
          danger
          disabled={cancelled}
          onClick={() => {
            if (confirmation.current) return
            confirmation.current = modal.confirm({
              maskClosable: true,
              title: '作废样例草稿 PO-DEMO？',
              content:
                '仅终止这份尚未生效的样例草稿，不改变库存。作废后不能恢复；可重新新建。',
              width: ERP_MODAL_WIDTHS.confirm,
              centered: true,
              autoFocusButton: 'cancel',
              okText: '作废草稿',
              cancelText: '保留草稿',
              okButtonProps: { danger: true },
              onOk: () => setCancelled(true),
              afterClose: () => {
                confirmation.current = null
              },
            })
          }}
        >
          危险操作确认
        </Button>
        <Button onClick={() => setAlert(true)}>打开单步提示</Button>
        <Button
          onClick={() => {
            setCancelled(false)
            setFiles([])
          }}
        >
          重置浮层样例
        </Button>
      </Space>
      <p role="status">
        样例草稿：{cancelled ? '已作废' : '未生效'}；文件：{files.length}{' '}
        个待上传（仅本地选择）。
      </p>
      <Upload
        beforeUpload={() => false}
        fileList={files}
        onChange={({ fileList }) => setFiles(fileList)}
        onPreview={() => setPreview(true)}
      >
        <Button>选择演示附件</Button>
      </Upload>
      <Drawer
        title="采购单上下文摘要"
        open={drawer}
        onClose={() => setDrawer(false)}
        width={420}
      >
        <p>PO-DEMO · 草稿 · 采购说明待补齐</p>
        <p>摘要关闭后，来源页面的输入和选择仍然保留。</p>
        <Button onClick={() => setPreview(true)}>打开附件预览</Button>
      </Drawer>
      <BusinessModal
        title="附件预览样例"
        open={preview}
        size="recordDetails"
        onCancel={() => setPreview(false)}
        footer={<Button onClick={() => setPreview(false)}>关闭预览</Button>}
      >
        <p>{files[0]?.name || '尚未选择本地文件'}</p>
        <p>这里只预览所选文件的名称；未上传，也未读取文件内容。</p>
      </BusinessModal>
      <AlertDialog
        open={alert}
        title="样例状态已说明"
        message="单步提示沿用 AppModal 的键盘、背景隔离和焦点恢复。"
        confirmText="知道了"
        onClose={() => setAlert(false)}
      />
    </div>
  )
}

function Examples({ topic, size }) {
  const initial =
    topic === 'feedback'
      ? 'feedback'
      : topic === 'closing'
        ? 'overlays'
        : 'editor'
  const [scene, setScene] = useState(initial)
  return (
    <section className="erp-feedback-examples" aria-label="真实共享组件演示">
      <div className="erp-feedback-example-heading">
        <strong>动手试一试</strong>
        <Segmented
          aria-label="反馈演示场景"
          value={scene}
          onChange={setScene}
          options={[
            { value: 'editor', label: '编辑与提交' },
            { value: 'feedback', label: '消息与恢复' },
            { value: 'overlays', label: '浮层与确认' },
          ]}
        />
      </div>
      {scene === 'editor' ? (
        <EditorExample size={size} />
      ) : scene === 'feedback' ? (
        <FeedbackExample />
      ) : (
        <OverlayExample />
      )}
    </section>
  )
}

export default function DevUIFeedbackExamples(props) {
  return (
    <App message={MESSAGE_CONFIG} notification={NOTIFICATION_CONFIG}>
      <Examples {...props} />
    </App>
  )
}
