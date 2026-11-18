import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Typography } from 'antd'
import source from '../../../../docs/engineering/可视化表达规范.md?raw'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import { WorkbenchNotice, WorkbenchReading, WorkbenchSection } from '../components/WorkbenchPattern.jsx'
import { VisualizationExamples, VISUALIZATION_EXAMPLES } from '../components/DevVisualizationExamples.jsx'
import { readVisualizationChoices, resolveVisualizationChoice } from '../config/devVisualization.mjs'
import { DEV_DOCS_ROUTE, DEV_PAGE_TITLE_BY_ROUTE, DEV_VISUALIZATION_ROUTE } from '../config/devRoutes.mjs'
import '../styles/dev-visualization.css'

const { Title, Text } = Typography
const choices = readVisualizationChoices(source)
const catalogReady = choices.length === Object.keys(VISUALIZATION_EXAMPLES).length &&
  choices.every((choice) => Object.hasOwn(VISUALIZATION_EXAMPLES, choice.value))
const exampleCount = Object.values(VISUALIZATION_EXAMPLES).reduce((count, examples) => count + examples.length, 0)
const sourceRoute = `${DEV_DOCS_ROUTE}?${new URLSearchParams({ path: 'docs/engineering/可视化表达规范.md' })}#visualization-choices`

export default function DevVisualizationPage() {
  const [params, setParams] = useSearchParams()
  const current = resolveVisualizationChoice(choices, params.get('type'))
  const value = current?.value
  const [visited, setVisited] = useState(() => new Set(value ? [value] : []))

  useEffect(() => {
    if (!value) return
    setVisited((previous) => previous.has(value) ? previous : new Set(previous).add(value))
  }, [value])

  const choose = (nextValue) => {
    if (nextValue === value) return
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('type', nextValue)
      return next
    })
  }

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page erp-dev-visualization">
      <DevPageNav />
      <DevPageHeader
        title={<Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_VISUALIZATION_ROUTE]}</Title>}
        tools={<Link to={sourceRoute}>规则源文档</Link>}
      />
      <main>
        {catalogReady ? (
          <WorkbenchSection
            title="项目图例"
            tools={<Text type="secondary">{choices.length} 类 · {exampleCount} 个图例</Text>}
          >
            <WorkbenchReading
              label="图例类别"
              detailLabel="当前类别图例"
              items={choices}
              value={value}
              onChange={choose}
            >
              {choices.filter((choice) => visited.has(choice.value) || choice.value === value).map((choice) => (
                <section key={choice.value} hidden={choice.value !== value} aria-label={choice.label}>
                  <WorkbenchSection
                    flat
                    title={choice.label}
                    headingLevel={3}
                    description={`${choice.question} · ${choice.forms}`}
                    footer={<p className="erp-dev-visualization__rule"><strong>选用边界：</strong>{choice.rule}</p>}
                  >
                    <VisualizationExamples type={choice.value} />
                  </WorkbenchSection>
                </section>
              ))}
            </WorkbenchReading>
          </WorkbenchSection>
        ) : (
          <WorkbenchNotice tone="error" title="图例目录暂不可用" description="选用规则与图例登记需要核对。" />
        )}
      </main>
    </div>
  )
}
