import React from 'react'
import { Link } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import source from '../../../../docs/engineering/前端实现与交互约定.md?raw'
import {
  findUIDesignChapter,
  readUIDesignChapters,
} from '../config/devUIDesignReading.mjs'
import { buildDevDocsLocation } from '../pages/devDocsNavigation.mjs'

const headingId = '组件复用与使用入口--shared-component-entrypoints'
const chapter = findUIDesignChapter(readUIDesignChapters(source), headingId)

export const SHARED_COMPONENT_SEARCH_TEXT = chapter.content

export default function DevSharedComponentGuide() {
  return (
    <section className="erp-control-library-catalog" aria-label="公共组件选用">
      <div className="erp-control-example-row">
        <Link to="/__dev/ui-design?page=controls&control=pagination">
          操作列表与分页示例
        </Link>
      </div>
      <Markdown source={chapter.content.replace(/^##[^\n]*\n/u, '')} />
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
