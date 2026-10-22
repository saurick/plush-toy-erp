import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Space, Spin, Tag, Typography } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_PROJECT_SKILLS_ROUTE } from '../config/devRoutes.mjs'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import { buildDevDocsLocation } from './devDocsNavigation.mjs'
import {
  DEV_PROJECT_SKILLS_API,
  buildProjectSkillDiagram,
  filterProjectSkills,
} from '../config/devProjectSkills.mjs'
import '../styles/dev-project-skills.css'

const { Title, Text } = Typography
const SOURCE_PATH = '.agents/skills/README.md'

export default function DevProjectSkillsPage() {
  const [params, setParams] = useSearchParams()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [graphOpen, setGraphOpen] = useState(false)
  const keyword = params.get('q') || ''
  const selectedName = params.get('skill') || ''

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setSnapshot(null)
    fetch(DEV_PROJECT_SKILLS_API, {
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Project skills unavailable')
        return response.json()
      })
      .then((data) => {
        if (
          !Array.isArray(data.skills) ||
          !Array.isArray(data.health?.errors)
        ) {
          throw new Error('Invalid project skills')
        }
        if (!controller.signal.aborted) setSnapshot(data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  const skills = snapshot?.skills || []
  const filtered = useMemo(
    () => filterProjectSkills(snapshot?.skills || [], keyword),
    [snapshot, keyword]
  )
  const selected = selectedName
    ? filtered.find((skill) => skill.name === selectedName)
    : filtered[0]
  const chart = useMemo(
    () => buildProjectSkillDiagram(selected, snapshot?.skills || []),
    [selected, snapshot]
  )
  const updateQuery = (values) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(values).forEach(([key, value]) => {
          if (value) next.set(key, value)
          else next.delete(key)
        })
        return next
      },
      { replace: true }
    )
  }
  const copySkill = async () => {
    try {
      await copyTextToClipboard(`$${selected.name}`)
      message.success('Skill 调用名称已复制')
    } catch {
      message.error('复制失败，请展开“关联与引用”后手动复制调用名称')
    }
  }

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page erp-dev-skills">
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-skills__header">
        <Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_PROJECT_SKILLS_ROUTE]}</Title>
        {snapshot ? (
          <div className="erp-dev-skills__health" role="status">
            <Tag color={snapshot.health.status === 'ok' ? 'success' : 'error'}>
              {snapshot.health.status === 'ok'
                ? '结构检查通过'
                : '结构检查需处理'}
            </Tag>
          </div>
        ) : null}
        <Button
          aria-label="刷新与检查"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          刷新与检查
        </Button>
      </header>
      {loading ? (
        <div className="erp-dev-skills__state">
          <Spin tip="正在读取项目 Skill 与结构检查结果">
            <div />
          </Spin>
        </div>
      ) : null}
      {error ? (
        <Alert
          type="error"
          showIcon
          message="项目 Skill 暂时无法读取"
          description="请检查工作区文件或开发服务后重试。"
          action={
            <Button onClick={() => setReload((value) => value + 1)}>
              重新读取
            </Button>
          }
        />
      ) : null}
      {snapshot ? (
        <>
          {snapshot.health.errors.length ? (
            <Alert
              type="warning"
              showIcon
              message="Skill 结构或引用存在问题"
              description={
                <ul>
                  {snapshot.health.errors.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              }
            />
          ) : null}
          <div className="erp-dev-skills__workspace">
            <aside
              className="erp-dev-skills__catalog"
              aria-label="项目 Skill 目录"
            >
              <SearchInput
                aria-label="搜索任务或 Skill"
                placeholder="搜索任务或 Skill"
                value={keyword}
                onChange={(event) =>
                  updateQuery({ q: event.target.value, skill: '' })
                }
              />
              <Text type="secondary">
                {filtered.length} / {skills.length} 项
              </Text>
              <div className="erp-dev-skills__list">
                {filtered.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    className="erp-dev-skills__item"
                    title={skill.summary || skill.scope}
                    aria-pressed={selected?.name === skill.name}
                    onClick={() => updateQuery({ skill: skill.name })}
                  >
                    <strong>{skill.title}</strong>
                    {skill.issues.length ? (
                      <Tag color="warning">需处理</Tag>
                    ) : null}
                  </button>
                ))}
              </div>
              {!filtered.length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    skills.length
                      ? '没有匹配的 Skill'
                      : '项目尚无可读取的 Skill'
                  }
                >
                  {keyword ? (
                    <Button onClick={() => updateQuery({ q: '', skill: '' })}>
                      清除搜索
                    </Button>
                  ) : null}
                </Empty>
              ) : null}
            </aside>
            <main className="erp-dev-skills__detail">
              {selected ? (
                <>
                  <div className="erp-dev-skills__detail-head">
                    <Title level={2}>{selected.title}</Title>
                    <Space wrap>
                      <Link
                        className="ant-btn ant-btn-default"
                        to={buildDevDocsLocation({ path: selected.sourcePath })}
                      >
                        查看原文
                      </Link>
                      <Button
                        aria-label="复制调用名称"
                        icon={<CopyOutlined />}
                        onClick={copySkill}
                      >
                        复制调用名称
                      </Button>
                    </Space>
                  </div>
                  <p>{selected.scope || '适用范围尚未登记，请查看原文。'}</p>
                  <details
                    className="erp-dev-skills__disclosure"
                    open={graphOpen}
                    onToggle={(event) => setGraphOpen(event.currentTarget.open)}
                  >
                    <summary>关联与引用</summary>
                    <div className="erp-dev-skills__sources">
                      <code className="erp-dev-skills__name">${selected.name}</code>
                      {selected.relatedSkills.length ? (
                        <section>
                          <Title level={3}>相关 Skill</Title>
                          <Text type="secondary">按原文中的条件选用，不代表固定执行顺序。</Text>
                          <div className="erp-dev-skills__related">
                            {selected.relatedSkills.map((name) => (
                              <Button key={name} size="small" onClick={() => updateQuery({ skill: name, q: '' })}>
                                {skills.find((skill) => skill.name === name)?.title || name}
                              </Button>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      {selected.references.length ? (
                        <section>
                          <Title level={3}>引用文档</Title>
                          <ul className="erp-dev-skills__references">
                            {selected.references.map((reference) => (
                              <li key={`${reference.path}#${reference.headingId}`}>
                                <Link to={buildDevDocsLocation({ path: reference.path, headingId: reference.headingId })}>
                                  {reference.path}{reference.headingId ? ` #${reference.headingId}` : ''}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      {graphOpen ? (
                        <MermaidDiagram
                          chart={chart}
                          label={`${selected.title}职责与引用关系图`}
                          initialZoom="fit"
                          flowchartHtmlLabels={false}
                          showSourceOnError={false}
                        />
                      ) : null}
                      <Text type="secondary" className="erp-dev-skills__boundary">
                        来源：{selected.sourcePath}。结构检查只核对文件、metadata、索引与引用；执行和验收以任务证据为准。
                        <DevTimestamp value={snapshot.checkedAt} action="检查于" />
                      </Text>
                    </div>
                  </details>
                </>
              ) : filtered.length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="所选 Skill 已不存在或不符合当前搜索"
                >
                  <Button onClick={() => updateQuery({ skill: '' })}>
                    返回当前结果
                  </Button>
                </Empty>
              ) : null}
            </main>
          </div>
        </>
      ) : null}
    </div>
  )
}
