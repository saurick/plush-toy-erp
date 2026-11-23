import React from 'react'
import { Link } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import source from '../../../../docs/engineering/前端实现与交互约定.md?raw'
import {
  findUIDesignChapter,
  readUIDesignChapters,
} from '../config/devUIDesignReading.mjs'
import {
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
} from '../pages/devDocsNavigation.mjs'
import { getBusinessPagePresentation } from '@/erp/config/businessUsabilityCatalog.mjs'

const headingId = '组件复用与使用入口--shared-component-entrypoints'
const chapter = findUIDesignChapter(readUIDesignChapters(source), headingId)
const DATE_SAMPLE_KEYS = new Set(['date', 'date-time', 'date-range'])

export const SHARED_COMPONENT_SEARCH_TEXT = chapter.content

export function DevUIConsumerName({ consumer }) {
  return <span>{consumer.title}</span>
}

function SampleLink({ topic }) {
  return (
    <span className="erp-control-library-catalog-links">
      <Link aria-label={`操作${topic.title}示例`} to={`/__dev/ui-design?page=controls&control=${topic.key}`}>{topic.title}</Link>
      <Link aria-label={`查看${topic.title}用法要求`} to={`/__dev/ui-design?page=controls&control=${topic.key}&controlSection=usage`}>用法要求</Link>
    </span>
  )
}

export default function DevSharedComponentGuide({ topics, labelledBy }) {
  const dateTopics = topics.filter(({ key }) => DATE_SAMPLE_KEYS.has(key))
  return (
    <section className="erp-control-library-catalog" aria-labelledby={labelledBy}>
      <section aria-label="日期控件选用">
        <h3>日期控件选用</h3>
        <table data-table-lines="fixed">
          <thead>
            <tr>
              <th>什么时候用</th>
              <th>何时生效</th>
              <th>可操作样例</th>
            </tr>
          </thead>
          <tbody>
            {dateTopics.map((topic) => {
              const [scenario, , behavior] = topic.usageRules[0]
              return (
                <tr key={topic.key}>
                  <td>{scenario}</td>
                  <td>{behavior}</td>
                  <td><SampleLink topic={topic} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <section aria-label="组件样例与真实页面">
        <h3>操作样例与真实页面</h3>
        <p>样例使用本地虚构数据；真实页面核对沿用业务账号权限。</p>
        <table data-table-lines="fixed">
          <thead>
            <tr>
              <th>可操作示例</th>
              <th>真实页面核对</th>
            </tr>
          </thead>
          <tbody>
            {topics
              .filter((topic) => topic.consumer && !DATE_SAMPLE_KEYS.has(topic.key))
              .map((topic) => (
                <tr key={topic.key}>
                  <td>
                    <SampleLink topic={topic} />
                  </td>
                  <td>
                    <DevUIConsumerName consumer={topic.consumer} />
                    <p>{topic.consumer.task}</p>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <p>
        附件、流程进度在
        <DevUIConsumerName consumer={getBusinessPagePresentation('sales-orders')} />
        选择记录后核对； 合同打印在
        <DevUIConsumerName
          consumer={getBusinessPagePresentation('accessories-purchase')}
        />
        选择记录后进入。 这些组件依赖实际权限与单据，不在样例中模拟业务写入。
      </p>
      <div
        className="erp-control-library-reference"
        ref={(element) => {
          element?.querySelectorAll('a[href]').forEach((link) => {
            const target = resolveDevDocsMarkdownHref(
              link.getAttribute('href'),
              'docs/engineering/前端实现与交互约定.md'
            )
            if (!target) return
            const next = buildDevDocsLocation(target)
            link.setAttribute(
              'href',
              `${next.pathname}${next.search}${next.hash}`
            )
          })
        }}
      >
        <Markdown source={chapter.content.replace(/^##[^\n]*\n/u, '')} />
      </div>
    </section>
  )
}
