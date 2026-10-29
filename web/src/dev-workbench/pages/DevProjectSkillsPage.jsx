import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Space, Spin, Tag, Typography } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_PROJECT_SKILLS_ROUTE } from '../config/devRoutes.mjs'
import SearchInput from '@/common/components/SearchInput'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { message } from '@/common/utils/antdApp'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import { WorkbenchNotice } from '../components/WorkbenchPattern.jsx'
import { requestWorkbenchJson } from '../config/devWorkbenchRequest.mjs'

import {
  DEV_PROJECT_SKILLS_API,
  filterProjectSkills,
} from '../config/devProjectSkills.mjs'
import '../styles/dev-project-skills.css'

const { Title, Text } = Typography

export default function DevProjectSkillsPage() {
  const [params, setParams] = useSearchParams()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)

  const keyword = params.get('q') || ''
  const selectedName = params.get('skill') || ''

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    requestWorkbenchJson(globalThis.fetch, DEV_PROJECT_SKILLS_API, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
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
      message.error('复制失败，请手动复制页面中的调用名称')
    }
  }

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page erp-dev-skills">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-skills__header"
        title={
          <Title level={1}>
            {DEV_PAGE_TITLE_BY_ROUTE[DEV_PROJECT_SKILLS_ROUTE]}
          </Title>
        }
        tools={
          <Button
            className="erp-dev-workbench-tools"
            aria-label="刷新与检查"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            刷新与检查
          </Button>
        }
      >
        {snapshot ? (
          <div className="erp-dev-skills__health" role="status">
            <Tag
              color={
                loading || error
                  ? 'default'
                  : snapshot.health.status === 'ok'
                    ? 'success'
                    : 'error'
              }
            >
              {loading || error
                ? '上次检查 · 待核实'
                : snapshot.health.status === 'ok'
                  ? '结构检查通过'
                  : '结构检查需处理'}
            </Tag>
          </div>
        ) : null}
      </DevPageHeader>
      {loading && snapshot ? <WorkbenchNotice tone="loading" title="正在刷新；以下为上次读取的项目 Skill。" /> : null}
      {loading && !snapshot ? (
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
          description={snapshot ? '以下为上次读取，当前文件状态尚未核实；请重新读取。' : '请检查工作区文件或开发服务后重试。'}
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
                allowClear
                aria-label="搜索任务或 Skill"
                placeholder="搜索任务或 Skill"
                value={keyword}
                onSearch={(value) =>
                  updateQuery({ q: value, skill: '' })
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
                    className="erp-dev-directory-item erp-dev-skills__item"
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
                  <code className="erp-dev-skills__name">${selected.name}</code>
                  {selected.relatedSkills.length ? (
                    <section>
                      <Title level={3}>相关 Skill</Title>
                      <div className="erp-dev-skills__related">
                        {selected.relatedSkills.map((name) => (
                          <Button key={name} size="small" onClick={() => updateQuery({ skill: name, q: '' })}>
                            {skills.find((skill) => skill.name === name)?.title || name}
                          </Button>
                        ))}
                      </div>
                    </section>
                  ) : null}
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
