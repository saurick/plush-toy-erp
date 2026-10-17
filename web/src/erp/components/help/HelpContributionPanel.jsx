import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Spin } from 'antd'
import { CommentOutlined } from '@ant-design/icons'
import { useBlocker } from 'react-router-dom'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { modal } from '../../../common/utils/antdApp'
import { isRpcAbortError } from '../../../common/utils/jsonRpc.js'
import {
  createHelpFeedback,
  readHelpChapter,
  respondHelpFeedback,
  writeHelpSupplement,
} from '../../api/helpContentApi.mjs'
import HelpSupplementMarkdown from './HelpSupplementMarkdown'
import { HelpContentPolicy } from '../../../common/consts/policies.generated.mjs'

const actionLabels = {
  save: '保存草稿',
  publish: '发布',
  restore: '恢复为草稿',
}
const time = (value) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : ''

function ContributionDialog({
  document,
  publishedVersion,
  onClose,
  onPublished,
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [baseline, setBaseline] = useState('')
  const [summary, setSummary] = useState('')
  const [quote, setQuote] = useState('')
  const [feedback, setFeedback] = useState('')
  const [response, setResponse] = useState({})
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedRevision, setSelectedRevision] = useState(null)
  const feedbackKey = useRef(crypto.randomUUID())
  const active = useRef(true)
  const editorRef = useRef(null)
  const dirty =
    markdown !== baseline ||
    Boolean(
      summary.trim() ||
      quote.trim() ||
      feedback.trim() ||
      Object.values(response).some((value) => value.trim())
    )
  const close = useCallback(() => {
    if (busy) return
    if (!dirty) {
      onClose()
      return
    }
    modal.confirm({
      maskClosable: true,
      title: '放弃未保存的内容？',
      content: '尚未保存的草稿、纠错或回复将丢失。',
      okText: '放弃并关闭',
      cancelText: '继续填写',
      onOk: onClose,
    })
  }, [busy, dirty, onClose])
  const blocker = useBlocker(dirty || busy)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (busy) {
      blocker.reset()
      return
    }
    modal.confirm({
      maskClosable: true,
      title: '离开前放弃未保存的内容？',
      okText: '放弃并离开',
      cancelText: '继续填写',
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    })
  }, [blocker, busy])
  useEffect(() => {
    const beforeUnload = (event) => {
      if (dirty || busy) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, busy])
  const load = useCallback(
    async (signal, keepEditor = false) => {
      const chapter = await readHelpChapter(document.id, signal)
      if (!active.current || signal?.aborted) return
      setData((previous) =>
        keepEditor && previous
          ? { ...chapter, supplement: previous.supplement }
          : chapter
      )
      if (!keepEditor) {
        setMarkdown(chapter.supplement.draft_markdown || '')
        setBaseline(chapter.supplement.draft_markdown || '')
        setSummary('')
      }
    },
    [document.id]
  )
  useEffect(() => {
    const controller = new AbortController()
    active.current = true
    load(controller.signal)
      .catch((err) => {
        if (!controller.signal.aborted && !isRpcAbortError(err)) {
          setError('本章维护内容未能读取，请重试。')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      active.current = false
      controller.abort()
    }
  }, [load])
  const run = async (action) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch {
      if (active.current) {
        setError(
          '操作未完成。内容可能已被更新，或当前权限、连接已变化。当前输入已保留，请重新读取后核对。'
        )
      }
    } finally {
      if (active.current) setBusy(false)
    }
  }
  const write = (action, restoreVersion) =>
    run(async () => {
      await writeHelpSupplement(action, {
        document_id: document.id,
        expected_version: data.supplement.version,
        summary:
          summary.trim() ||
          (action === 'restore'
            ? '恢复历史内容为草稿'
            : '发布已核对的企业补充'),
        ...(action === 'save' ? { markdown } : {}),
        ...(action === 'restore' ? { restore_version: restoreVersion } : {}),
      })
      await load()
      if (action === 'publish') onPublished()
      if (action === 'restore') {
        setHistoryOpen(false)
        setSelectedRevision(null)
      }
      setNotice(
        action === 'publish'
          ? '企业补充已发布。'
          : action === 'restore'
            ? '历史内容已恢复为新草稿，发布后才对读者生效。'
            : '草稿已保存，读者仍看到已发布内容。'
      )
      editorRef.current?.closest('.ant-modal-body')?.scrollTo({ top: 0 })
    })
  const reload = () => {
    const action = () =>
      run(async () => {
        await load()
        setNotice('已读取最新保存内容。')
      })
    if (markdown !== baseline || summary.trim()) {
      modal.confirm({
        maskClosable: true,
        title: '用最新保存内容替换当前输入？',
        content: '当前尚未保存的企业补充和修改说明将被替换。',
        okText: '重新读取',
        cancelText: '继续填写',
        onOk: action,
      })
    } else action()
  }
  return (
    <BusinessModal
      open
      title={`${document.title} · 纠错与企业补充`}
      onCancel={close}
      maskClosable={!busy}
      keyboard={!busy}
      closable={!busy}
      width={980}
      className="erp-help-contribution-dialog"
      footer={
        <Button onClick={close} disabled={busy}>
          关闭
        </Button>
      }
    >
      {loading ? (
        <Spin tip="正在读取本章记录">
          <div style={{ minHeight: 100 }} />
        </Spin>
      ) : null}
      {error ? (
        <p role="alert">
          {error}{' '}
          <Button onClick={reload} disabled={busy}>
            重新读取
          </Button>
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {data ? (
        <>
          {(data.can_edit || data.can_publish) && document.supplement ? (
            <section
              ref={editorRef}
              className="erp-help-contribution-editor"
              aria-label="编辑企业补充"
            >
              <div className="erp-help-contribution-heading">
                <h3>企业补充</h3>
                <span className="erp-help-contribution-state">
                  {markdown !== baseline
                    ? '未保存修改'
                    : !data.supplement.version
                      ? '尚未编写'
                      : data.supplement.version ===
                          data.supplement.published_version
                        ? '已发布'
                        : '已保存，待发布'}
                </span>
                <Button onClick={() => setPreview((value) => !value)}>
                  {preview ? '返回编辑' : '预览排版'}
                </Button>
              </div>
              <p>
                补充本公司的操作约定、示例和注意事项。系统功能与规则以正式手册为准。
              </p>
              {data.history[0]?.source_hash !== document.source_hash &&
              data.history.length > 0 ? (
                <p role="status">
                  正式手册在这份补充之后有过更新，请核对内容是否仍适用。
                </p>
              ) : null}
              {preview ? (
                <HelpSupplementMarkdown
                  source={markdown || '尚未填写企业补充。'}
                />
              ) : (
                <Input.TextArea
                  aria-label="企业补充正文"
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  disabled={!data.can_edit || busy}
                  autoSize={{ minRows: 6, maxRows: 16 }}
                  maxLength={HelpContentPolicy.markdownMaxCharacters}
                  showCount
                />
              )}
              <label className="erp-help-contribution-field">
                修改说明
                <Input
                  aria-label="修改说明"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  maxLength={HelpContentPolicy.summaryMaxCharacters}
                  disabled={busy}
                  placeholder="说明这次调整了什么"
                />
              </label>
              <div className="erp-help-contribution-actions">
                {data.can_edit ? (
                  <Button
                    onClick={() => write('save')}
                    loading={busy}
                    disabled={
                      !summary.trim() ||
                      (markdown === baseline && data.supplement.version > 0)
                    }
                  >
                    保存草稿
                  </Button>
                ) : null}
                {data.can_publish ? (
                  <Button
                    type="primary"
                    onClick={() => write('publish')}
                    loading={busy}
                    disabled={
                      markdown !== baseline ||
                      !data.supplement.version ||
                      data.supplement.version ===
                        data.supplement.published_version
                    }
                  >
                    {markdown.trim() ? '发布企业补充' : '发布空内容并撤下补充'}
                  </Button>
                ) : null}
                <Button
                  onClick={() => setHistoryOpen((value) => !value)}
                  disabled={busy}
                >
                  {historyOpen ? '收起修改记录' : '修改记录与恢复'}
                </Button>
              </div>
              {historyOpen ? (
                <div
                  className="erp-help-contribution-history"
                  aria-label="企业补充修改记录"
                >
                  {data.history.length ? (
                    data.history.map((revision) => (
                      <div
                        key={revision.version}
                        className="erp-help-contribution-history__row"
                      >
                        <div>
                          <strong>{actionLabels[revision.action]}</strong> ·{' '}
                          {revision.actor_name} · {time(revision.created_at)}
                          <p>{revision.summary}</p>
                          {revision.restored_from > 0 ? (
                            <small>由历史记录恢复</small>
                          ) : null}
                        </div>
                        <div className="erp-help-contribution-actions">
                          <Button onClick={() => setSelectedRevision(revision)}>
                            查看内容
                          </Button>
                          {data.can_edit ? (
                            <Button
                              onClick={() => {
                                const restore = () =>
                                  write('restore', revision.version)
                                if (markdown !== baseline) {
                                  modal.confirm({
                                    maskClosable: true,
                                    title: '用历史内容替换当前草稿？',
                                    okText: '恢复为草稿',
                                    cancelText: '继续编辑',
                                    onOk: restore,
                                  })
                                } else restore()
                              }}
                              disabled={busy}
                            >
                              恢复为草稿
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>本章尚无修改记录。</p>
                  )}
                  {selectedRevision ? (
                    <section
                      className="erp-help-contribution-history-preview"
                      aria-label="历史内容预览"
                    >
                      <h4>{selectedRevision.summary}</h4>
                      <HelpSupplementMarkdown
                        source={
                          selectedRevision.markdown || '该记录的内容为空。'
                        }
                      />
                      <details>
                        <summary>与上一条记录对照</summary>
                        <div className="erp-help-contribution-diff">
                          <div>
                            <h5>修改前</h5>
                            <pre>
                              {data.history.find(
                                (item) =>
                                  item.version === selectedRevision.version - 1
                              )?.markdown || '空内容'}
                            </pre>
                          </div>
                          <div>
                            <h5>修改后</h5>
                            <pre>{selectedRevision.markdown || '空内容'}</pre>
                          </div>
                        </div>
                      </details>
                      <Button onClick={() => setSelectedRevision(null)}>
                        收起历史内容
                      </Button>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          <section
            className="erp-help-contribution-feedback"
            aria-label="反馈本章问题"
          >
            <h3>反馈本章问题</h3>
            <label className="erp-help-contribution-field">
              有问题的原文（可选）
              <Input.TextArea
                aria-label="有问题的原文"
                value={quote}
                onChange={(event) => setQuote(event.target.value)}
                autoSize={{ minRows: 2, maxRows: 5 }}
                maxLength={HelpContentPolicy.quoteMaxCharacters}
                disabled={busy}
              />
            </label>
            <label className="erp-help-contribution-field">
              问题与建议
              <Input.TextArea
                aria-label="问题与建议"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                autoSize={{ minRows: 3, maxRows: 6 }}
                maxLength={HelpContentPolicy.feedbackMaxCharacters}
                disabled={busy}
                placeholder={`请说明哪里不准确，以及建议怎样调整（至少 ${HelpContentPolicy.feedbackMinCharacters} 个字）`}
              />
            </label>
            <Button
              type="primary"
              loading={busy}
              disabled={
                [...feedback.trim()].length <
                HelpContentPolicy.feedbackMinCharacters
              }
              onClick={() =>
                run(async () => {
                  await createHelpFeedback({
                    document_id: document.id,
                    source_hash: document.source_hash,
                    published_version: publishedVersion,
                    quote,
                    message: feedback,
                    request_key: feedbackKey.current,
                  })
                  setFeedback('')
                  setQuote('')
                  feedbackKey.current = crypto.randomUUID()
                  await load(undefined, true)
                  setNotice('纠错已提交，可在下方查看处理回复。')
                })
              }
            >
              提交纠错
            </Button>
            <h4>{data.can_respond ? '本章纠错记录' : '我提交的纠错'}</h4>
            {data.feedback.length ? (
              data.feedback.map((item) => (
                <div
                  className="erp-help-contribution-feedback__item"
                  key={item.id}
                >
                  <p>
                    <strong>{item.actor_name}</strong> · {time(item.created_at)}{' '}
                    · {item.responded_at ? '已回复' : '待处理'}
                  </p>
                  {item.quote ? <blockquote>{item.quote}</blockquote> : null}
                  <p>{item.message}</p>
                  {item.responded_at ? (
                    <p className="erp-help-contribution-response">
                      {item.responded_by}：{item.response}
                      <br />
                      <small>{time(item.responded_at)}</small>
                    </p>
                  ) : data.can_respond ? (
                    <div className="erp-help-contribution-field">
                      <Input.TextArea
                        aria-label={`处理回复：${item.message}`}
                        value={response[item.id] || ''}
                        onChange={(event) =>
                          setResponse((value) => ({
                            ...value,
                            [item.id]: event.target.value,
                          }))
                        }
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        maxLength={HelpContentPolicy.responseMaxCharacters}
                        disabled={busy}
                      />
                      <Button
                        disabled={!response[item.id]?.trim() || busy}
                        onClick={() =>
                          run(async () => {
                            await respondHelpFeedback({
                              document_id: document.id,
                              feedback_id: item.id,
                              response: response[item.id],
                            })
                            setResponse((value) => ({
                              ...value,
                              [item.id]: '',
                            }))
                            await load(undefined, true)
                            setNotice('处理回复已保存。')
                          })
                        }
                      >
                        保存处理回复
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p>暂无纠错记录。</p>
            )}
          </section>
        </>
      ) : null}
    </BusinessModal>
  )
}

export default function HelpContributionPanel({
  document,
  published,
  onPublished,
  navigation,
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (!open && restoreFocus.current) {
      triggerRef.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [open])
  if (!document && !navigation) return null
  return (
    <section
      className="erp-help-contribution-panel"
      aria-label="企业补充与纠错"
    >
      {document && published?.markdown?.trim() ? (
        <div className="erp-help-published-supplement">
          <h3>企业补充</h3>
          <p>
            {published.published_by} · {time(published.published_at)}
          </p>
          <HelpSupplementMarkdown source={published.markdown} />
        </div>
      ) : null}
      <div className="erp-help-chapter-footer">
        {document ? (
          <Button
            type="text"
            icon={<CommentOutlined aria-hidden="true" />}
            ref={triggerRef}
            onClick={() => {
              restoreFocus.current = true
              setOpen(true)
            }}
          >
            {document.can_edit || document.can_publish
              ? '维护补充与纠错'
              : '反馈本章问题'}
          </Button>
        ) : null}
        {navigation}
      </div>
      {document && open ? (
        <ContributionDialog
          document={document}
          publishedVersion={published?.published_version || 0}
          onClose={() => setOpen(false)}
          onPublished={onPublished}
        />
      ) : null}
    </section>
  )
}
