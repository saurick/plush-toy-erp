import { Remarkable } from 'remarkable'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'

export const UI_DESIGN_TOPICS = [
  {
    key: 'layout',
    title: '页面骨架',
    group: '布局与视觉',
    description: '导航、顶栏、操作和数据怎样分工',
    views: ['specification'],
    chapters: ['高保真视觉合同'],
  },
  {
    key: 'spacing',
    title: '间距与密度',
    group: '布局与视觉',
    description: '调整留白，对比同一屏里的内容空间',
    views: ['rationale'],
    chapters: ['空间与密度：为什么这样留白'],
  },
  {
    key: 'surfaces',
    title: '平面与层次',
    group: '布局与视觉',
    description: '底色、边界、圆角与选中态',
    views: ['rationale'],
    chapters: ['平面与层次：为什么不用更多装饰'],
  },
  {
    key: 'type',
    title: '文字与对齐',
    group: '布局与视觉',
    description: '标题、正文、金额与辅助说明的阅读顺序',
    chapters: ['高保真视觉合同', '排版与阅读路径'],
  },
  {
    key: 'navigation',
    title: '查找、下钻与返回',
    group: '操作与反馈',
    description: '筛选结果、精确来源和返回时的上下文',
    chapters: ['页面结构', '信息与动作'],
  },
  {
    key: 'forms',
    title: '整页、弹窗与抽屉',
    group: '操作与反馈',
    description: '连续录入、局部选择和上下文查看',
    chapters: ['页面结构', '明细编辑', '信息与动作'],
  },
  {
    key: 'dialogs',
    title: '弹窗结构与尺寸',
    group: '操作与反馈',
    description: '解剖标题、正文和操作区，按任务选择尺寸',
    chapters: ['弹窗结构与尺寸', '弹窗布局的取舍'],
  },
  {
    key: 'feedback',
    title: 'Toast 与反馈选择',
    group: '操作与反馈',
    description: '字段错误、区域提示、Toast 与持续通知放在哪里',
    chapters: ['反馈选择', '反馈持续时间的取舍'],
  },
  {
    key: 'submission',
    title: '提交与恢复',
    group: '操作与反馈',
    description: '校验、加载、成功、失败与结果未知的可用动作',
    chapters: ['提交与恢复', '保留上下文与确认结果'],
  },
  {
    key: 'closing',
    title: '关闭与焦点',
    group: '操作与反馈',
    description: '未保存保护、Escape、遮罩、嵌套浮层与焦点返回',
    chapters: ['关闭与焦点', '关闭保护与危险确认'],
  },
  {
    key: 'states',
    title: '状态与异常恢复',
    group: '操作与反馈',
    description: '读取、空结果、失败与重试保留什么',
    chapters: ['状态与恢复', '视觉与可达性'],
  },
  {
    key: 'data',
    title: '数据与可视化',
    group: '数据与适配',
    description: '来源、权限、筛选与表格、图表的选择',
    chapters: ['业务汇总口径', '数据可视化', '可视化选择'],
  },
  {
    key: 'responsive',
    title: '窄屏与动效',
    group: '数据与适配',
    description: '重排内容、局部滚动与减少动态效果',
    chapters: ['响应式与动效', '视觉与可达性'],
  },
]

// Use the same Markdown parser and anchor contract as the existing document viewer.
export function readUIDesignChapters(source = '') {
  const lines = source.split('\n')
  const headings = extractMarkdownHeadings(source, [2])
  const tokens = new Remarkable().parse(source, {})
  const starts = tokens
    .filter((token) => token.type === 'heading_open' && token.hLevel === 2)
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
  const parts = [
    { id: 'introduction', title: '阅读入口', aliases: [], start: 0 },
    ...headings.map((heading, index) => ({
      ...heading,
      title: heading.title.split(' / ')[0],
      start: starts[index],
    })),
  ]
  return parts
    .map((part, index) => {
      const content = lines
        .slice(part.start, parts[index + 1]?.start ?? lines.length)
        .join('\n')
        .trim()
      const anchors = extractMarkdownHeadings(
        content,
        [1, 2, 3, 4, 5, 6]
      ).flatMap((heading) => [heading.id, ...heading.aliases])
      const diagrams = new Remarkable()
        .parse(content, {})
        .filter(
          (token) => token.type === 'fence' && token.params.trim() === 'mermaid'
        )
        .map((token) => token.content.trim())
      return {
        id: part.id,
        title: part.title,
        aliases: part.aliases,
        content,
        anchors,
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
  return UI_DESIGN_TOPICS.filter(
    (topic) => !topic.views || topic.views.includes(view)
  ).map((topic) => ({
    ...topic,
    references: chapters.filter((chapter) =>
      topic.chapters.includes(chapter.title)
    ),
  }))
}

export function filterUIDesignEntries(entries, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return entries.filter((entry) => {
    const text = [
      entry.title,
      entry.description,
      entry.content,
      ...(entry.references || []).map((reference) => reference.content),
    ]
      .join(' ')
      .toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
