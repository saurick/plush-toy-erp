import { ToolOutlined } from '@ant-design/icons'
import { Anchor, Typography } from 'antd'
import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DevPageHeader from '../../../components/DevPageHeader.jsx'
import { CI_WORKFLOW_SECTIONS } from '../../../config/devCiWorkflow.mjs'
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

export default function ManualGuidePage() {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  const selectChapter = useCallback(
    (event, { href }) => {
      event.preventDefault()
      navigate({ pathname, search, hash: href }, { replace: true })
    },
    [navigate, pathname, search]
  )

  return (
    <div className="erp-dev-hub-page erp-dev-tool-page erp-dev-version-guide-page">
      <aside className="erp-dev-version-guide-toc">
        <Typography.Title level={2}>章节目录</Typography.Title>
        <nav aria-label="操作指引章节目录">
          <Anchor
            className="erp-dev-directory-anchor"
            affix={false}
            offsetTop={16}
            items={guideChapters}
            onClick={selectChapter}
          />
        </nav>
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
      <main className="erp-dev-version-guide-content">
        <ManualTakeoverGuide />
      </main>
    </div>
  )
}
