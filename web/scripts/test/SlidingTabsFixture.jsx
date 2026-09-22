import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, theme } from 'antd'
import SlidingSegmented from '../../src/common/components/navigation/SlidingSegmented'
import SlidingTabList from '../../src/common/components/navigation/SlidingTabList'
import Tabs from '../../src/common/components/navigation/SlidingTabs'
import DevTaskNav from '../../src/dev-workbench/components/DevTaskNav'
import { TaskNav as GovernanceTaskNav } from '../../src/dev-workbench/pages/DevGovernancePage'
import { SelectionActionBar } from '../../src/erp/components/business-list/BusinessListLayout'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'
import '../../src/dev-workbench/styles/index.css'
import '../../src/erp/components/sales-orders/EngineeringMaterialRequest.css'

const options = ['逐项查看', '整张汇总表对照', '订单信息']

function Segment({ id, wrapper = '', className = '', ...props }) {
  return (
    <section
      id={id}
      className={wrapper}
      style={{ minWidth: 0, overflowX: 'auto' }}
    >
      <SlidingSegmented
        aria-label={id}
        className={className}
        options={options}
        {...props}
      />
    </section>
  )
}

function CustomTabs({ id, className, itemClass = '', disabledLast = false }) {
  const [value, setValue] = useState(0)
  return (
    <section id={id}>
      <SlidingTabList className={className} aria-label={id}>
        {options.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={value === index}
            className={itemClass}
            disabled={disabledLast && index === 2}
            onClick={() => setValue(index)}
          >
            {label}
          </button>
        ))}
      </SlidingTabList>
    </section>
  )
}

function ActionBarMountFixture() {
  const [generation, setGeneration] = useState(0)
  return (
    <section id="action-remount">
      <button
        id="remount-action-bar"
        type="button"
        onClick={() => setGeneration((value) => value + 1)}
      >
        重新挂载操作条
      </button>
      <SelectionActionBar key={generation} embedded selectedCount={0}>
        {Array.from({ length: 6 }, (_, index) => (
          <Button key={index} size="small">
            操作 {index + 1}
          </Button>
        ))}
      </SelectionActionBar>
    </section>
  )
}

function Fixture() {
  const [value, setValue] = useState(options[0])
  const [journeyValue, setJourneyValue] = useState(options[0])
  const [governanceValue, setGovernanceValue] = useState(options[0])
  const [visible, setVisible] = useState(true)
  const [dark, setDark] = useState(false)
  const [calls, setCalls] = useState(0)
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 28,
          padding: 24,
          maxWidth: 1000,
          color: 'var(--erp-text, #17231c)',
        }}
      >
        <div>
          <button
            id="toggle-theme"
            type="button"
            onClick={() => {
              document.documentElement.dataset.erpTheme = dark
                ? 'light'
                : 'dark'
              document.body.style.background = dark ? '#fff' : '#111827'
              setDark(!dark)
            }}
          >
            切换主题
          </button>
          <button
            id="toggle-visible"
            type="button"
            onClick={() => setVisible(!visible)}
          >
            开关面板
          </button>
          <output id="change-count">{calls}</output>
        </div>
        <Segment id="unequal" onChange={() => setCalls((count) => count + 1)} />
        <Segment id="equal" block defaultValue={options[1]} />
        <Segment id="vertical" vertical />
        <Segment
          id="material"
          wrapper="erp-material-summary-modal--mobile"
          className="erp-material-view-switch"
          block
        />
        <Segment id="scope" wrapper="erp-task-board-scope-filter" />
        <Segment id="theme" className="erp-theme-toggle" />
        <Segment id="dev-segment" className="erp-dev-customer-view-switch" />
        <Segment id="dev-reader" wrapper="erp-dev-testing-reader__toolbar" />
        <Segment
          id="disabled"
          options={[
            options[0],
            { value: 'disabled', label: '不可选', disabled: true },
          ]}
        />
        <Segment
          id="controlled"
          value={options[0]}
          onChange={() => setCalls((count) => count + 1)}
        />
        {visible ? (
          <Segment id="conditional" defaultValue={options[1]} block />
        ) : null}
        <section id="dev-nav">
          <DevTaskNav
            ariaLabel="开发工作台"
            value={value}
            onChange={setValue}
            items={options.map((label) => ({
              label,
              value: label,
              description: '各项业务说明',
            }))}
          />
        </section>
        <section
          id="dev-journey"
          className="erp-dev-customer-workspace"
          style={{ minWidth: 0, width: '100%' }}
        >
          <DevTaskNav
            ariaLabel="客户配置步骤"
            value={journeyValue}
            onChange={setJourneyValue}
            className="erp-dev-customer-journey"
            level="primary"
            items={options.map((label) => ({
              label,
              value: label,
              description: '配置说明',
            }))}
          />
        </section>
        <CustomTabs
          id="collaboration"
          className="erp-business-collaboration-task-panel__tabs"
          itemClass="erp-business-collaboration-task-panel__tab"
        />
        <section id="governance">
          <GovernanceTaskNav
            tasks={options.map((task) => ({ task, key: task }))}
            selectedKey={governanceValue}
            onSelect={setGovernanceValue}
          />
        </section>
        <CustomTabs
          id="workflow"
          className="erp-task-action-drawer__guide-steps"
          itemClass="erp-task-action-drawer__step"
          disabledLast
        />
        <div className="erp-work-instruction-annotation-modal">
          <CustomTabs
            id="images"
            className="erp-work-instruction-annotation-modal__image-tabs"
          />
        </div>
        <section id="ant-tabs">
          <Tabs
            items={options.map((label) => ({
              key: label,
              label,
              children: label,
            }))}
          />
        </section>
        <ActionBarMountFixture />
      </main>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
