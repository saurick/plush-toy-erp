import React, { useState } from 'react'
import { Alert, Button, Form, Input, Select, Slider } from 'antd'
import { Link } from 'react-router-dom'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { MermaidDiagram } from '@/common/components/markdown'
import { ERP_MODAL_WIDTHS } from '@/erp/utils/modalSizes.mjs'
import {
  MESSAGE_CONFIG,
  NOTIFICATION_CONFIG,
} from '@/common/utils/feedbackConfig.mjs'
import DevUIFeedbackExamples from './DevUIFeedbackExamples.jsx'
import '../styles/dev-ui-feedback.css'

const SIZE_LABELS = {
  confirm: '单步确认',
  localAction: '局部表单',
  recordDetails: '记录详情',
  lineItems: '宽明细',
  columnOrder: '列设置',
}
const PARTS = {
  title: [
    '标题区',
    '先说明在处理哪个对象，再给出必要背景。标题和关闭入口固定，长内容不会让对象身份消失。',
  ],
  body: [
    '内容区',
    '字段按任务分组；只有正文滚动。24px 桌面侧边距来自当前业务弹窗样式，窄屏收为 16px。',
  ],
  actions: [
    '操作区',
    '次动作在前，主动作在后；使用“保存说明”“作废草稿”等动作名称。固定操作区缩短长表单里的往返距离。',
  ],
}

function Anatomy({ rationale, size, onSize }) {
  const [part, setPart] = useState('body')
  const [padding, setPadding] = useState(24)
  return (
    <>
      <div className="erp-feedback-guide-tools">
        <label htmlFor="feedback-modal-size">任务尺寸</label>
        <Select
          id="feedback-modal-size"
          value={size}
          onChange={onSize}
          options={Object.keys(ERP_MODAL_WIDTHS).map((value) => ({
            value,
            label: SIZE_LABELS[value],
          }))}
        />
        <code>
          {String(ERP_MODAL_WIDTHS[size])}
          {typeof ERP_MODAL_WIDTHS[size] === 'number' ? 'px' : ''}
        </code>
      </div>
      <div className="erp-feedback-anatomy-grid">
        <figure
          className="erp-feedback-anatomy"
          data-size={size}
          style={{ '--demo-padding': `${padding}px` }}
        >
          <figcaption>结构示意 · 下方可打开实际尺寸</figcaption>
          <div className="erp-feedback-modal-sketch">
            <button
              type="button"
              className="erp-feedback-sketch-title"
              aria-pressed={part === 'title'}
              onClick={() => setPart('title')}
            >
              <span className="erp-feedback-marker">A</span>
              <strong>补充采购说明</strong>
              <span>×</span>
            </button>
            <button
              type="button"
              className="erp-feedback-sketch-body"
              aria-pressed={part === 'body'}
              onClick={() => setPart('body')}
            >
              <span className="erp-feedback-ruler">← {padding}px 留白 →</span>
              <span className="erp-feedback-marker">B</span>
              <span className="erp-feedback-sketch-field">
                说明标题 <i />
              </span>
              <span className="erp-feedback-sketch-field">
                事项 <i />
              </span>
              <span className="erp-feedback-sketch-field">
                补充内容 <i className="is-tall" />
              </span>
              <span className="erp-feedback-scroll-note">↕ 正文内部滚动</span>
            </button>
            <button
              type="button"
              className="erp-feedback-sketch-actions"
              aria-pressed={part === 'actions'}
              onClick={() => setPart('actions')}
            >
              <span className="erp-feedback-marker">C</span>
              <span>取消</span>
              <b>保存说明</b>
            </button>
          </div>
        </figure>
        <aside className="erp-feedback-explanation" aria-live="polite">
          <Segmented
            aria-label="弹窗解剖区域"
            value={part}
            onChange={setPart}
            options={Object.entries(PARTS).map(([value, [label]]) => ({
              value,
              label,
            }))}
          />
          <h3>
            {PARTS[part][0]}
            {rationale ? '为什么这样安排' : '如何表现'}
          </h3>
          <p>{PARTS[part][1]}</p>
          <dl>
            <div>
              <dt>尺寸来源</dt>
              <dd>modalSizes，按任务选档</dd>
            </div>
            <div>
              <dt>留白来源</dt>
              <dd>business-modals / business-responsive</dd>
            </div>
            <div>
              <dt>最大高度</dt>
              <dd>视口减 64px；窄屏减 28px</dd>
            </div>
          </dl>
          {rationale ? (
            <>
              <label htmlFor="feedback-padding">
                讲解：调整正文留白（{padding}px）
              </label>
              <Slider
                id="feedback-padding"
                ariaLabelForHandle="讲解正文留白"
                min={8}
                max={40}
                step={4}
                value={padding}
                onChange={setPadding}
              />
              <Button onClick={() => setPadding(24)}>恢复当前桌面值</Button>
              <p className="erp-feedback-note">
                只调整图示。小留白增加空间，也压缩分组边界；大留白更松，但长表单更早滚动。这些是当前布局取舍，不是研究得出的最佳数值。
              </p>
            </>
          ) : (
            <p className="erp-feedback-note">
              选择窄档检查长标题，选择宽明细检查横向内容；下方使用真实共享弹窗，宽度仍受视口约束。
            </p>
          )}
        </aside>
      </div>
    </>
  )
}

function ContainerChoice({ rationale }) {
  const [selected, setSelected] = useState('modal')
  const options = [
    {
      key: 'page',
      title: '整页',
      task: '完整新建 / 编辑',
      parts: ['单据身份', '分组字段与明细', '返回列表 · 保存'],
      reason: '连续录入获得主内容宽度，返回时恢复列表。',
    },
    {
      key: 'modal',
      title: '弹窗',
      task: '局部选择 / 确认',
      parts: ['当前列表', '局部任务', '取消 · 确认选择'],
      reason: '暂时聚焦一个动作，关闭后回到原对象。',
    },
    {
      key: 'drawer',
      title: '抽屉',
      task: '任务 / 上下文摘要',
      parts: ['当前列表', '摘要与关联任务', '当前可用动作'],
      reason: '侧边展开上下文；复杂编辑仍返回正式入口。',
    },
  ]
  return (
    <>
      <p>同样从采购列表出发，容器由当前任务决定。</p>
      <div className="erp-feedback-container-choices">
        {options.map((item) => (
          <button
            key={item.key}
            type="button"
            className="erp-feedback-container-choice"
            aria-pressed={selected === item.key}
            onClick={() => setSelected(item.key)}
          >
            <strong>
              {item.title} · {item.task}
            </strong>
            <span className={`erp-feedback-container-picture is-${item.key}`}>
              <span>{item.parts[0]}</span>
              <b>{item.parts[1]}</b>
              <small>{item.parts[2]}</small>
            </span>
          </button>
        ))}
      </div>
      <p role="status">
        {options.find((item) => item.key === selected).reason}
      </p>
      {rationale ? (
        <table className="erp-feedback-comparison">
          <thead>
            <tr>
              <th>同一任务</th>
              <th>内容塞进小弹窗</th>
              <th>按任务选择容器</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>完整采购录入</th>
              <td>频繁滚动，明细比较空间不足</td>
              <td>整页连续输入，保存与返回保持可达</td>
            </tr>
            <tr>
              <th>补充一条说明</th>
              <td>适量字段可以在当前上下文完成</td>
              <td>局部弹窗，关闭后回到原入口</td>
            </tr>
          </tbody>
        </table>
      ) : null}
    </>
  )
}

const FEEDBACK_CHOICES = {
  field: [
    '字段错误',
    '能定位到输入',
    '与字段一起保留，修正后消失；提交时定位首个错误。',
  ],
  region: [
    '区域提示',
    '影响当前区域',
    '加载失败、缺少权限或结果未知留在原处，保留可用恢复入口。',
  ],
  toast: [
    'Toast',
    '短暂且无后续动作',
    '已完成的轻量反馈自动消失，减少长期遮挡。',
  ],
  notification: [
    '持续通知',
    '稍后仍需处理',
    '较长说明或操作入口需要留到用户处理或手动关闭。',
  ],
}

function FeedbackChoice({ rationale }) {
  const [selected, setSelected] = useState('toast')
  const choice = FEEDBACK_CHOICES[selected]
  return (
    <>
      <div
        className="erp-feedback-choice-path"
        role="group"
        aria-label="反馈选择关系"
      >
        {Object.entries(FEEDBACK_CHOICES).map(([key, [title, condition]]) => (
          <button
            key={key}
            type="button"
            aria-pressed={selected === key}
            onClick={() => setSelected(key)}
          >
            <small>{condition}</small>
            <span>↓</span>
            <strong>{title}</strong>
          </button>
        ))}
      </div>
      <div className={`erp-feedback-placement is-${selected}`}>
        <div className="erp-feedback-placement-page">
          <strong>当前采购说明</strong>
          <Form layout="vertical">
            <Form.Item
              label="说明标题"
              validateStatus={selected === 'field' ? 'error' : undefined}
              help={selected === 'field' ? '请填写说明标题' : undefined}
            >
              <Input readOnly placeholder="填写内容" />
            </Form.Item>
          </Form>
          {selected === 'region' ? (
            <Alert
              showIcon
              type="error"
              message="读取失败，当前输入已保留"
              description="恢复入口与发生问题的区域放在一起。"
            />
          ) : (
            <div className="erp-feedback-sketch-lines">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        {selected === 'toast' ? (
          <div className="erp-feedback-placement-toast">✓ 样例已保存</div>
        ) : null}
        {selected === 'notification' ? (
          <div className="erp-feedback-placement-notification">
            <strong>导出未完成 ×</strong>
            <p>当前条件已保留</p>
            <span>查看恢复入口 →</span>
          </div>
        ) : null}
      </div>
      <p>
        <strong>{choice[0]}：</strong>
        {choice[2]}
      </p>
      <dl className="erp-feedback-parameters">
        <div>
          <dt>Toast</dt>
          <dd>
            顶部居中 {MESSAGE_CONFIG.top}px · 默认 {MESSAGE_CONFIG.duration} 秒
            · 最多 {MESSAGE_CONFIG.maxCount} 条
          </dd>
        </div>
        <div>
          <dt>长消息</dt>
          <dd>最大 480px，窄屏保留两侧 16px 并换行</dd>
        </div>
        <div>
          <dt>持续通知</dt>
          <dd>
            右上 {NOTIFICATION_CONFIG.top}px · duration=
            {NOTIFICATION_CONFIG.duration} · 手动关闭
          </dd>
        </div>
      </dl>
      {rationale ? (
        <table className="erp-feedback-comparison">
          <thead>
            <tr>
              <th>内容</th>
              <th>自动消失的影响</th>
              <th>当前选择</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>已保存的短反馈</th>
              <td>结果已留在页面，无需持续占位</td>
              <td>Toast，焦点保持原处</td>
            </tr>
            <tr>
              <th>保存失败 / 结果未知</th>
              <td>用户可能没读完，也会丢失恢复入口</td>
              <td>区域提示，保留输入和查询动作</td>
            </tr>
            <tr>
              <th>必填字段缺失</th>
              <td>重复弹消息无法指明修改位置</td>
              <td>字段就地显示并定位</td>
            </tr>
          </tbody>
        </table>
      ) : null}
    </>
  )
}

function StateGuide({ topic, chapters, rationale }) {
  const closing = topic.key === 'closing'
  const chapter = chapters.find(
    (item) => item.title === (closing ? '关闭与焦点' : '提交与恢复')
  )
  return (
    <>
      {chapter?.diagrams[0] ? (
        <MermaidDiagram chart={chapter.diagrams[0]} />
      ) : null}
      <div className="erp-feedback-rule-cards">
        {(closing
          ? [
              ['普通查看', 'Escape、遮罩、关闭按钮均可退出，焦点回到入口。'],
              [
                '有未保存内容',
                '先询问放弃或继续；确认层的 Escape / 遮罩只返回编辑。',
              ],
              [
                '正在提交',
                '临时禁用提交和关闭；下拉框等内层浮层先处理自己的 Escape。',
              ],
            ]
          : [
              [
                '首次读取 / 刷新',
                '首次给占位，刷新保留原结果与条件；只锁相关区域。',
              ],
              ['明确失败', '输入保留，校验定位字段；可重试失败的操作。'],
              ['结果未知', '先按已有能力查询结果；不能把网络失败当成未执行。'],
            ]
        ).map(([title, text], index) => (
          <div key={title}>
            <b>{index + 1}</b>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        ))}
      </div>
      {rationale ? (
        <p className="erp-feedback-note">
          {closing
            ? '关闭保护只在可能丢失输入或打断办理时出现。危险操作先说明对象、后果和可逆性，默认焦点停在保留动作，降低误按 Enter 的风险。'
            : '保留上下文可减少重填；确认真实结果才能给成功提示。查询与重试的选择由业务已有能力决定，组件不推测业务是否执行。'}
        </p>
      ) : null}
    </>
  )
}

export default function DevUIFeedbackGuide({ topic, chapters, view }) {
  const rationale = view === 'rationale'
  const [size, setSize] = useState('localAction')
  return (
    <section
      className="erp-design-guide-section erp-feedback-guide"
      aria-label={`${topic.title}图解`}
    >
      <header className="erp-design-guide-heading">
        <div>
          <h2>{topic.title}</h2>
          <p>{topic.description}</p>
        </div>
      </header>
      {topic.key === 'dialogs' ? (
        <Anatomy rationale={rationale} size={size} onSize={setSize} />
      ) : topic.key === 'forms' ? (
        <ContainerChoice rationale={rationale} />
      ) : topic.key === 'feedback' ? (
        <FeedbackChoice rationale={rationale} />
      ) : (
        <StateGuide topic={topic} chapters={chapters} rationale={rationale} />
      )}
      <DevUIFeedbackExamples topic={topic.key} size={size} />
      <nav className="erp-feedback-crosslinks" aria-label="对应说明与示例">
        <Link
          to={`/__dev/ui-design?view=${rationale ? 'specification' : 'rationale'}&topic=${topic.key}`}
        >
          {rationale ? '查看使用说明' : '查看设计依据'}
        </Link>
        <Link
          to="/__dev/ui-design?page=controls&control=feedback"
        >
          打开控件设计
        </Link>
      </nav>
    </section>
  )
}
