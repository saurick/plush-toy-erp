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

export const SHARED_COMPONENT_SEARCH_TEXT = chapter.content

export function DevUIConsumerLink({ consumer }) {
  const origin = import.meta.env.PLUSH_STANDALONE_WORKBENCH
    ? import.meta.env.PLUSH_WORKBENCH_BUSINESS_ORIGIN
    : ''
  return (
    <a
      href={`${origin}${consumer.path}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {consumer.title}
    </a>
  )
}

export default function DevSharedComponentGuide({ topics }) {
  return (
    <section className="erp-control-library-catalog" aria-label="公共组件选用">
      <section aria-label="组件样例与真实页面">
        <h3>操作样例与真实页面</h3>
        <p>样例使用本地虚构数据；真实页面在新标签页打开，沿用业务账号权限。</p>
        <table data-table-lines="fixed">
          <thead>
            <tr>
              <th>可操作示例</th>
              <th>真实页面核对</th>
            </tr>
          </thead>
          <tbody>
            {topics
              .filter((topic) => topic.consumer)
              .map((topic) => (
                <tr key={topic.key}>
                  <td>
                    <Link
                      aria-label={`操作${topic.title}示例`}
                      to={`/__dev/ui-design?page=controls&control=${topic.key}`}
                    >
                      {topic.title}
                    </Link>
                  </td>
                  <td>
                    <DevUIConsumerLink consumer={topic.consumer} />
                    <p>{topic.consumer.task}</p>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <p>
        附件、流程进度在
        <DevUIConsumerLink consumer={getBusinessPagePresentation('sales-orders')} />
        选择记录后核对； 合同打印在
        <DevUIConsumerLink
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
      <div className="erp-control-example-row">
        <Link
          to={buildDevDocsLocation({
            path: 'docs/engineering/前端实现与交互约定.md',
            headingId,
          })}
        >
          查看完整实现约定
        </Link>
        <Link to={buildDevDocsLocation({ path: 'docs/打印模板实现原理.md' })}>
          查看打印组件与输出边界
        </Link>
      </div>
    </section>
  )
}
