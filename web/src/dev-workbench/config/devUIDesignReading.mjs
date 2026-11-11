import { Remarkable } from 'remarkable'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'
import { WORK_CENTER_DESIGN_TOPICS } from './devWorkCenterDesign.mjs'

const workCenterRules = {
  'task-cards': '任务卡片的条件差异',
  'task-handling': 'task-action-input',
  'work-progress': '1-各业务视图比较什么',
  'work-tracking': '流程跟踪',
  'work-exceptions': 'exception-follow-up',
  'work-results': '提交结果',
  'work-overview': '待办日历',
  'mobile-entry': '手机任务界面层级--mobile-task-presentation',
}

const UI_DESIGN_TOPICS = [
  ...WORK_CENTER_DESIGN_TOPICS.map(({ key, title, description }) => ({
    key, title, description, group: '工作中心', rules: { specification: workCenterRules[key] },
  })),
  {
    key: 'layout',
    title: '页面骨架',
    group: '布局与视觉',
    description: '导航、顶栏、操作和数据怎样分工',
    rules: { specification: 'page-shell-dimensions' },
  },
  {
    key: 'spacing',
    title: '间距与密度',
    group: '布局与视觉',
    description: '调整留白，对比同一屏里的内容空间',
    rules: { rationale: '2-各处留白解决什么问题' },
  },
  {
    key: 'surfaces',
    title: '平面与层次',
    group: '布局与视觉',
    description: '底色、边界、圆角与选中态',
    rules: { rationale: 'flat-and-hierarchy' },
  },
  {
    key: 'type',
    title: '文字与对齐',
    group: '布局与视觉',
    description: '标题、复合信息、金额与辅助说明的阅读顺序',
    rules: { specification: 'composite-cell-layout', rationale: 'composite-cell-layout' },
  },
  {
    key: 'navigation',
    title: '查找、下钻与返回',
    group: '操作与反馈',
    description: '筛选结果、精确来源和返回时的上下文',
    rules: { specification: '1-查找与返回的主线', rationale: '状态与上下文' },
  },
  {
    key: 'forms',
    title: '整页、弹窗与抽屉',
    group: '操作与反馈',
    description: '连续录入、局部选择和上下文查看',
    rules: { specification: '2-根据任务选择容器', rationale: '3-表单与详情保留录入和核对上下文' },
  },
  {
    key: 'dialogs',
    title: '弹窗结构与尺寸',
    group: '操作与反馈',
    description: '解剖标题、正文和操作区，按任务选择尺寸',
    rules: { specification: '弹窗结构与尺寸--dialog-anatomy', rationale: '弹窗布局的取舍--dialog-layout-tradeoffs' },
  },
  {
    key: 'feedback',
    title: 'Toast 与反馈选择',
    group: '操作与反馈',
    description: '字段错误、区域提示、Toast 与持续通知放在哪里',
    rules: { specification: '反馈选择--feedback-selection', rationale: '反馈持续时间的取舍--feedback-lifetime' },
  },
  {
    key: 'submission',
    title: '提交与恢复',
    group: '操作与反馈',
    description: '校验、加载、成功、失败与结果未知的可用动作',
    rules: { specification: '提交与恢复--submission-and-recovery', rationale: '保留上下文与确认结果--context-and-results' },
  },
  {
    key: 'closing',
    title: '关闭与焦点',
    group: '操作与反馈',
    description: '未保存保护、Escape、遮罩、嵌套浮层与焦点返回',
    rules: { specification: 'dismissal-behavior', rationale: 'dismissal-rationale' },
  },
  {
    key: 'states',
    title: '状态与异常恢复',
    group: '操作与反馈',
    description: '首次读取、刷新、空结果和读取失败时保留什么',
    rules: { specification: 'reading-and-recovery', rationale: '6-状态键盘与关闭保护' },
  },
  {
    key: 'data',
    title: '数据与可视化',
    group: '数据与适配',
    description: '来源、权限、筛选与表格、图表的选择',
    rules: { specification: '1-各业务视图比较什么', rationale: '1-业务问题与视图对应' },
  },
  {
    key: 'responsive',
    title: '窄屏与动效',
    group: '数据与适配',
    description: '重排内容、局部滚动与减少动态效果',
    rules: { specification: '响应式与动效--responsive-and-motion', rationale: '8-动效与验证各自证明什么' },
  },
]

function locateHeadings(source, lines, tokens, levels) {
  const starts = tokens
    .filter((token) => token.type === 'heading_open' && token.level === 0 && levels.includes(token.hLevel))
    .map((token) => {
      let start = token.lines[0]
      while (
        start > 0 &&
        (!lines[start - 1].trim() ||
          /^\s*<a (?:id|name)=/u.test(lines[start - 1]))
      ) {
        start -= 1
      }
      return start
    })
  return extractMarkdownHeadings(source, levels).map((heading, index) => ({
    ...heading,
    start: starts[index],
  }))
}

// Share the viewer's heading and anchor identities; each excerpt stops at its next peer.
export function readUIDesignChapters(source = '') {
  const lines = source.split('\n')
  const parser = new Remarkable()
  const headings = locateHeadings(source, lines, parser.parse(source, {}), [2])
  const parts = [
    { id: 'introduction', title: '阅读入口', aliases: [], start: 0 },
    ...headings,
  ]
  return parts
    .map((part, index) => {
      const content = lines
        .slice(part.start, parts[index + 1]?.start ?? lines.length)
        .join('\n')
        .trim()
      const contentLines = content.split('\n')
      const tokens = parser.parse(content, {})
      const headingsInChapter = locateHeadings(content, contentLines, tokens, [1, 2, 3, 4, 5, 6])
      const anchors = headingsInChapter.flatMap((heading) => [heading.id, ...heading.aliases])
      const sections = headingsInChapter.flatMap((heading, index) => {
        if (heading.level <= 2) return []
        const end = headingsInChapter.slice(index + 1).find(({ level }) => level <= heading.level)?.start
        return [{
          id: heading.id,
          aliases: heading.aliases,
          chapterId: part.id,
          title: heading.title.split(' / ')[0].replace(/^\d+\.\s+/u, ''),
          content: contentLines.slice(heading.start, end).join('\n').trim(),
        }]
      })
      const diagrams = tokens
        .filter(
          (token) => token.type === 'fence' && token.params.trim() === 'mermaid'
        )
        .map((token) => token.content.trim())
      return {
        id: part.id,
        title: part.title.split(' / ')[0],
        aliases: part.aliases,
        content,
        anchors,
        sections,
        diagrams,
      }
    })
    .filter((part) => part.content)
}

export function findUIDesignChapter(chapters, value) {
  return chapters.find(
    (chapter) => chapter.id === value || chapter.anchors.includes(value)
  )
}

export function getUIDesignTopics(view, chapters) {
  return UI_DESIGN_TOPICS.filter(({ rules }) => view in rules).map(({ rules, ...topic }) => ({
    ...topic,
    rule: findUIDesignRule(chapters, rules[view]),
  }))
}

export function findUIDesignRule(chapters, value) {
  const chapter = findUIDesignChapter(chapters, value)
  return chapter?.sections.find(({ id, aliases }) => id === value || aliases.includes(value)) || chapter
}

export function resolveUIDesignReading(chapters, topics, params, hash) {
  const chapterParam = params.get('read') !== 'guide' ? params.get('chapter') : null
  const anchorRule = findUIDesignRule(chapters, hash)
  const linkedRule = anchorRule || findUIDesignRule(chapters, chapterParam)
  const linkedChapterId = linkedRule?.chapterId || linkedRule?.id
  const requestedTopic = topics.find(({ key }) => key === params.get('topic'))
  const topic = requestedTopic ||
    topics.find(({ rule }) => rule && rule === linkedRule) ||
    topics.find(({ rule }) => rule && (rule.chapterId || rule.id) === linkedChapterId) ||
    topics.find(({ key }) => key === (params.get('page') === 'task-handling' ? 'task-handling' : 'task-cards')) ||
    topics[0]

  // Bookmarks from the former chapter switch can still select the focused rule of that topic.
  const scopedRule = linkedRule && !anchorRule && requestedTopic?.rule?.chapterId === linkedRule.id
    ? requestedTopic.rule
    : linkedRule
  const defaultRule = params.get('read') === 'reference' && !chapterParam && !hash ? topic.rule : undefined
  return { topic, rule: scopedRule || defaultRule }
}

export function filterUIDesignTopics(topics, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return topics.filter((topic) => {
    const text = [
      topic.title,
      topic.description,
      topic.rule?.content,
    ]
      .join(' ')
      .toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
