import React, { useEffect, useMemo } from 'react'
import { ArrowRightOutlined, MobileOutlined } from '@ant-design/icons'
import { Button, Select, Typography } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import {
  getEnabledMobileRoleKeys,
  getEntryConfig,
} from '../config/entryConfig.mjs'
import { getRoleHelpGuidesForProfile } from '../config/roleHelpContent.mjs'
import {
  getRoleHelpScenarios,
  resolveHelpScenario,
} from '../config/helpScenarios.mjs'
import { getAllowedMobileRoleKeys } from '../utils/mobileRolePermissions.mjs'
import { HELP_VISUAL_EXAMPLES } from '../config/helpScenarioPresentation.mjs'
import HelpScenarioContent from '../components/help/HelpScenarioContent'

const { Text, Title } = Typography
const scenarioTitle = (scenario) =>
  HELP_VISUAL_EXAMPLES[scenario.key]?.title || scenario.title

export default function HelpCenterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { adminProfile = null, visibleMenuPaths = [] } =
    useOutletContext() || {}
  const guides = useMemo(
    () => getRoleHelpGuidesForProfile(adminProfile || {}),
    [adminProfile]
  )
  const requestedRoleKey = String(searchParams.get('role') || '').trim()
  const selectedGuide =
    guides.find((guide) => guide.key === requestedRoleKey) || guides[0]
  const scenarios = useMemo(
    () =>
      getRoleHelpScenarios(selectedGuide, {
        allowedMenuPaths: visibleMenuPaths,
      }),
    [visibleMenuPaths, selectedGuide]
  )
  const selectedScenario = resolveHelpScenario(
    scenarios,
    searchParams.get('scene')
  )

  useEffect(() => {
    if (!selectedGuide || !selectedScenario) return
    if (
      searchParams.getAll('role').length === 1 &&
      searchParams.get('role') === selectedGuide.key &&
      searchParams.getAll('scene').length === 1 &&
      searchParams.get('scene') === selectedScenario.key
    ) {
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('role', selectedGuide.key)
    next.set('scene', selectedScenario.key)
    setSearchParams(next, { replace: true })
  }, [searchParams, selectedGuide, selectedScenario, setSearchParams])

  const allowedMobileRoleKeys = useMemo(
    () =>
      new Set(
        getAllowedMobileRoleKeys(
          adminProfile,
          getEnabledMobileRoleKeys(getEntryConfig())
        )
      ),
    [adminProfile]
  )

  const handleRoleChange = (roleKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('role', roleKey)
    next.delete('scene')
    setSearchParams(next)
  }
  const handleScenarioChange = (scenarioKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('scene', scenarioKey)
    setSearchParams(next)
  }

  if (!selectedGuide || !selectedScenario) return null

  return (
    <div
      className="erp-help-center-page"
      data-role-help-key={selectedGuide.key}
    >
      <div className="erp-help-center-workspace">
        <aside className="erp-help-sidebar" aria-label="岗位与场景">
          <div
            className={
              guides.length > 1
                ? 'erp-help-center-role-picker'
                : 'erp-help-current-role'
            }
          >
            {guides.length > 1 ? (
              <>
                <label htmlFor="erp-help-center-role-select">查看岗位</label>
                <Select
                  id="erp-help-center-role-select"
                  value={selectedGuide.key}
                  options={guides.map((guide) => ({
                    value: guide.key,
                    label: guide.label,
                  }))}
                  onChange={handleRoleChange}
                  virtual={false}
                />
              </>
            ) : (
              <>
                <span className="erp-help-sidebar__label">帮助中心</span>
                <strong>{selectedGuide.label}</strong>
              </>
            )}
          </div>
          <div className="erp-help-mobile-picker">
            <label htmlFor="erp-help-scene-select">我要办什么</label>
            <Select
              id="erp-help-scene-select"
              value={selectedScenario.key}
              options={scenarios.map((scenario) => ({
                value: scenario.key,
                label: scenarioTitle(scenario),
              }))}
              onChange={handleScenarioChange}
              virtual={false}
            />
          </div>
          <nav className="erp-help-topics" aria-label="办事场景">
            <h2>我要办什么</h2>
            {scenarios.map((scenario) => (
              <button
                key={scenario.key}
                type="button"
                className="erp-help-topic"
                aria-current={
                  scenario.key === selectedScenario.key ? 'page' : undefined
                }
                onClick={() => handleScenarioChange(scenario.key)}
              >
                <span className="erp-help-topic__label">
                  {scenarioTitle(scenario)}
                </span>
                <ArrowRightOutlined aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="erp-help-sidebar__footer">
            {guides.length > 1 ? (
              <p>切换这里只查看说明，不改变岗位或权限。</p>
            ) : null}
            {visibleMenuPaths.includes('/erp/dashboard') ? (
              <Button block onClick={() => navigate('/erp/dashboard')}>
                返回工作台
              </Button>
            ) : null}
            {allowedMobileRoleKeys.has(selectedGuide.key) ? (
              <Button
                block
                icon={<MobileOutlined />}
                onClick={() => navigate(`/m/${selectedGuide.key}/tasks`)}
              >
                打开{selectedGuide.label}手机待办
              </Button>
            ) : null}
          </div>
        </aside>
        <article
          className="erp-help-article"
          data-help-scenario={selectedScenario.key}
        >
          <header className="erp-help-article__heading">
            <div>
              <Title level={3}>{scenarioTitle(selectedScenario)}</Title>
              <Text type="secondary">
                {HELP_VISUAL_EXAMPLES[selectedScenario.key]?.description ||
                  selectedScenario.description}
              </Text>
            </div>
            {selectedScenario.available ? (
              <Button
                type="primary"
                onClick={() => navigate(selectedScenario.path)}
              >
                {selectedScenario.actionLabel}
                <ArrowRightOutlined aria-hidden="true" />
              </Button>
            ) : selectedScenario.path ? (
              <Text type="secondary">
                当前账号未开放此页面，可查看办理说明。
              </Text>
            ) : null}
          </header>
          <HelpScenarioContent
            key={`${selectedGuide.key}:${selectedScenario.key}`}
            scenario={selectedScenario}
            roleKey={selectedGuide.key}
          />
          <details className="erp-help-role-context">
            <summary>了解岗位交接与提醒</summary>
            <p>{selectedGuide.handoff}</p>
            <p>{selectedGuide.caution}</p>
          </details>
        </article>
      </div>
    </div>
  )
}
