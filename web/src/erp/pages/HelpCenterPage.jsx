import React, { useEffect, useMemo } from 'react'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MobileOutlined,
  QuestionCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import {
  getEnabledMobileRoleKeys,
  getEntryConfig,
} from '../config/entryConfig.mjs'
import {
  filterRoleHelpPriorities,
  getRoleHelpGuidesForProfile,
} from '../config/roleHelpContent.mjs'
import { getAllowedMobileRoleKeys } from '../utils/mobileRolePermissions.mjs'

const { Paragraph, Text, Title } = Typography

export default function HelpCenterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { adminProfile = null, allowedMenuPaths = [] } =
    useOutletContext() || {}
  const guides = useMemo(
    () => getRoleHelpGuidesForProfile(adminProfile || {}),
    [adminProfile]
  )
  const requestedRoleKey = String(searchParams.get('role') || '').trim()
  const selectedGuide =
    guides.find((guide) => guide.key === requestedRoleKey) || guides[0]

  useEffect(() => {
    if (!selectedGuide || requestedRoleKey === selectedGuide.key) {
      return
    }
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('role', selectedGuide.key)
    setSearchParams(nextSearchParams, { replace: true })
  }, [requestedRoleKey, searchParams, selectedGuide, setSearchParams])

  const priorities = useMemo(
    () =>
      filterRoleHelpPriorities(selectedGuide, {
        allowedMenuPaths,
        isSuperAdmin: adminProfile?.is_super_admin === true,
      }).filter((priority) => priority.available),
    [adminProfile?.is_super_admin, allowedMenuPaths, selectedGuide]
  )
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
  const mobileEntryAvailable = allowedMobileRoleKeys.has(selectedGuide?.key)
  const hiddenPriorityCount = Math.max(
    0,
    (selectedGuide?.priorities?.length || 0) - priorities.length
  )

  const handleRoleChange = (roleKey) => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('role', roleKey)
    setSearchParams(nextSearchParams)
  }

  if (!selectedGuide) {
    return null
  }

  return (
    <div
      className="erp-help-center-page"
      data-role-help-key={selectedGuide.key}
    >
      <Card className="erp-page-card erp-help-center-hero" variant="borderless">
        <div className="erp-help-center-hero__main">
          <div>
            <Space size={8} wrap>
              <Tag color="green">岗位使用帮助</Tag>
              <Tag>{selectedGuide.label}</Tag>
            </Space>
            <Title level={2} className="erp-help-center-hero__title">
              {selectedGuide.headline}
            </Title>
            <Paragraph className="erp-help-center-hero__summary">
              {selectedGuide.summary}
            </Paragraph>
          </div>

          {guides.length > 1 ? (
            <div className="erp-help-center-role-picker">
              <label htmlFor="erp-help-center-role-select">
                <Text type="secondary">切换岗位帮助</Text>
              </label>
              <Select
                id="erp-help-center-role-select"
                value={selectedGuide.key}
                options={guides.map((guide) => ({
                  value: guide.key,
                  label: guide.label,
                }))}
                onChange={handleRoleChange}
                suffixIcon={<SwapOutlined aria-hidden="true" />}
              />
            </div>
          ) : null}
        </div>

        <div className="erp-help-center-hero__actions">
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => navigate('/erp/dashboard')}
          >
            返回工作台
          </Button>
          {mobileEntryAvailable ? (
            <Button
              type="primary"
              icon={<MobileOutlined />}
              onClick={() => navigate(`/m/${selectedGuide.key}/tasks`)}
            >
              打开{selectedGuide.label}手机待办
            </Button>
          ) : null}
        </div>
      </Card>

      {guides.length > 1 ? (
        <Alert
          type="info"
          showIcon
          message="当前账号有多个岗位"
          description={`现在显示“${selectedGuide.label}”的办理说明。开始工作前请先选择本次实际办理岗位，采购和财务等职责不要混在同一张单据里操作。`}
        />
      ) : null}

      <section aria-labelledby="help-priorities-title">
        <div className="erp-help-center-section-head">
          <div>
            <Title level={4} id="help-priorities-title">
              今天先做什么
            </Title>
            <Text type="secondary">只显示当前账号已经开放的常用入口。</Text>
          </div>
          {hiddenPriorityCount > 0 ? (
            <Tag>{hiddenPriorityCount} 个入口未开放</Tag>
          ) : null}
        </div>

        {priorities.length > 0 ? (
          <div className="erp-help-center-priority-grid">
            {priorities.map((priority, index) => (
              <Card
                key={priority.path}
                className="erp-page-card erp-help-center-priority-card"
                variant="borderless"
              >
                <span className="erp-help-center-priority-card__index">
                  {index + 1}
                </span>
                <Title level={5}>{priority.title}</Title>
                <Paragraph>{priority.description}</Paragraph>
                <Button type="link" onClick={() => navigate(priority.path)}>
                  {priority.actionLabel}
                  <ArrowRightOutlined aria-hidden="true" />
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Alert
            type="info"
            showIcon
            message="当前没有可直接打开的常用入口"
            description="请从左侧当前可见页面开始工作；如页面与实际职责不符，请联系系统管理员核对岗位设置。"
          />
        )}
      </section>

      <div className="erp-help-center-detail-grid">
        <Card
          className="erp-page-card erp-help-center-detail-card"
          variant="borderless"
        >
          <div className="erp-help-center-card-heading">
            <CheckCircleOutlined aria-hidden="true" />
            <Title level={4}>正常办理案例</Title>
          </div>
          <ol className="erp-help-center-workflow">
            {selectedGuide.workflow.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <Text>{step}</Text>
              </li>
            ))}
          </ol>
          <div className="erp-help-center-result">
            <Text type="secondary">完成标准</Text>
            <strong>{selectedGuide.completion}</strong>
          </div>
          <div className="erp-help-center-result">
            <Text type="secondary">交接给谁</Text>
            <strong>{selectedGuide.handoff}</strong>
          </div>
        </Card>

        <Card
          className="erp-page-card erp-help-center-detail-card"
          variant="borderless"
        >
          <div className="erp-help-center-card-heading erp-help-center-card-heading--warning">
            <ExclamationCircleOutlined aria-hidden="true" />
            <Title level={4}>遇到异常怎么办</Title>
          </div>
          <Title level={5} className="erp-help-center-exception-title">
            {selectedGuide.exception.title}
          </Title>
          <Paragraph className="erp-help-center-handoff">
            <Text strong>什么时候停下来：</Text>
            {selectedGuide.exception.trigger}
          </Paragraph>
          <ol className="erp-help-center-workflow erp-help-center-workflow--compact">
            {selectedGuide.exception.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <Text>{step}</Text>
              </li>
            ))}
          </ol>
          <div className="erp-help-center-result">
            <Text type="secondary">退回对象</Text>
            <strong>{selectedGuide.exception.returnTo}</strong>
          </div>
          <div className="erp-help-center-result">
            <Text type="secondary">异常完成标准</Text>
            <strong>{selectedGuide.exception.doneWhen}</strong>
          </div>
          <div className="erp-help-center-card-heading erp-help-center-card-heading--secondary">
            <ExclamationCircleOutlined aria-hidden="true" />
            <Title level={4}>操作时要注意</Title>
          </div>
          <ul className="erp-help-center-cautions">
            {selectedGuide.cautions.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="erp-page-card erp-help-center-faq" variant="borderless">
        <div className="erp-help-center-card-heading">
          <QuestionCircleOutlined aria-hidden="true" />
          <Title level={4}>常见问题</Title>
        </div>
        <Collapse
          ghost
          items={selectedGuide.questions.map((item, index) => ({
            key: `${selectedGuide.key}-${index}`,
            label: item.question,
            children: <Paragraph>{item.answer}</Paragraph>,
          }))}
        />
      </Card>
    </div>
  )
}
