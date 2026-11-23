import { ToolOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DevPageHeader from '../../../components/DevPageHeader.jsx'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import { CI_WORKFLOW_SECTIONS } from '../../../config/devCiWorkflow.mjs'
import useDirectoryReading from '../../../hooks/useDirectoryReading.js'
import {
  MANUAL_GUIDE_CI_SECTION_PREFIX,
  ManualTakeoverGuide,
} from './shared.jsx'

const guideChapters = [
  {
    key: 'ci',
    title: 'CI/CD 流程与原理',
    href: '#dev-version-guide-ci',
    children: CI_WORKFLOW_SECTIONS.map(({ key, label }) => ({
      key,
      title: label,
      href: `#${MANUAL_GUIDE_CI_SECTION_PREFIX}${key}`,
    })),
  },
  {
    key: 'scope',
    title: '四处操作各管什么',
    href: '#dev-version-takeover-scope-title',
  },
  {
    key: 'conditions',
    title: '先判断能不能继续',
    href: '#dev-version-takeover-conditions-title',
  },
  {
    key: 'automation',
    title: '自动续办怎么交接',
    href: '#dev-version-takeover-automation-title',
  },
  {
    key: 'lock',
    title: 'Git 索引锁怎么处理',
    href: '#dev-version-takeover-lock-title',
  },
  {
    key: 'steps',
    title: '手动操作顺序',
    href: '#dev-version-takeover-steps-title',
  },
  {
    key: 'boundary',
    title: '应急边界与交接',
    href: '#dev-version-guide-boundary',
  },
]

const guideHeadingIds = guideChapters.flatMap(({ href, children = [] }) => [href, ...children.map((child) => child.href)]).map((href) => href.slice(1))

export default function ManualGuidePage() {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const contentRef = useRef(null)
  const [sectionsExpanded, setSectionsExpanded] = useState(true)
  const { currentId, jumpTo } = useDirectoryReading(guideHeadingIds, contentRef)
  useLayoutEffect(() => {
    if (hash) jumpTo(hash.slice(1))
  }, [hash, jumpTo])

  const activeHref = `#${currentId}`
  const visibleHref = sectionsExpanded ? activeHref : guideChapters.find(({ children }) =>
    children?.some(({ href }) => href === activeHref)
  )?.href || activeHref
  const renderLink = ({ title, href }) => (
    <DirectoryItem
      href={href}
      aria-current={visibleHref === href ? 'location' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        if (hash === href) jumpTo(href.slice(1))
        else navigate({ pathname, search, hash: href }, { replace: true })
      }}
    >
      <span>{title}</span>
    </DirectoryItem>
  )

  return (
    <div className="erp-dev-hub-page erp-dev-tool-page erp-dev-version-guide-page">
      <aside className="erp-dev-version-guide-toc">
        <Directory
          aria-label="操作指引章节目录"
          className="erp-directory-list"
          title={<h2>章节目录</h2>}
          allExpanded={sectionsExpanded}
          onToggleAll={() => setSectionsExpanded((expanded) => !expanded)}
        >
          {guideChapters.map((chapter) => (
            <div key={chapter.key}>
              {renderLink(chapter)}
              {sectionsExpanded && chapter.children ? (
                <DirectoryBranch>
                  {chapter.children.map((child) => <div key={child.key}>{renderLink(child)}</div>)}
                </DirectoryBranch>
              ) : null}
            </div>
          ))}
        </Directory>
      </aside>
      <DevPageHeader
        className="erp-dev-hub-header"
        title={
          <div className="erp-dev-hub-header__copy">
            <span className="erp-dev-hub-header__icon">
              <ToolOutlined aria-hidden="true" />
            </span>
            <Typography.Title level={1} className="erp-dev-hub-title">
              手动与应急发布指引
            </Typography.Title>
          </div>
        }
      />
      <main className="erp-dev-version-guide-content" ref={contentRef}>
        <ManualTakeoverGuide />
      </main>
    </div>
  )
}
