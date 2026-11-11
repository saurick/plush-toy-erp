import { useId } from 'react'
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  DownOutlined,
  ExperimentOutlined,
  LayoutOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { CustomerPackageContents } from './CustomerPackageContents.jsx'
import { PREFLIGHT_SECTION_EXTENSIONS, PREFLIGHT_SECTION_FLOW } from './navigation.mjs'

function PackageRoute({ route, expanded, onActivate, children }) {
  const id = useId()
  const { title, icon: Icon, summary, destinations, note, blocked, section } = route
  const Indicator = section ? RightOutlined : DownOutlined

  return (
    <div
      className="erp-dev-customer-package-route"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !expanded) return
        event.stopPropagation()
        onActivate()
        event.currentTarget.querySelector('button').focus()
      }}
    >
      <button
        type="button"
        className="erp-dev-customer-package-map__columns erp-dev-customer-package-route__trigger"
        aria-expanded={section ? undefined : expanded}
        aria-controls={section ? undefined : id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-summary ${id}-destination`}
        onClick={onActivate}
      >
        <span className="erp-dev-customer-package-route__source">
          <span className="erp-dev-customer-package-route__icon"><Icon aria-hidden="true" /></span>
          <span className="erp-dev-customer-package-route__copy">
            <strong id={`${id}-title`}>{title}</strong>
            <span id={`${id}-summary`}>{summary}</span>
          </span>
        </span>
        <span className="erp-dev-customer-package-route__connector" aria-hidden="true">
          <ArrowRightOutlined />
        </span>
        <span id={`${id}-destination`} className="erp-dev-customer-package-route__copy">
          <span className="erp-dev-customer-package-route__destinations" data-blocked={blocked || undefined}>
            {destinations.map((destination, index) => (
              <span key={destination}>
                {index > 0 ? <span aria-hidden="true"> → </span> : null}
                <strong>{destination}</strong>
              </span>
            ))}
          </span>
          {note ? <span>{note}</span> : null}
        </span>
        <Indicator className="erp-dev-customer-package-route__caret" aria-hidden="true" />
      </button>
      {section ? null : (
        <div id={id} hidden={!expanded}>
          {expanded ? children : null}
        </div>
      )}
    </div>
  )
}

export function CustomerPackageDiagram({ summary, menu, numbering, area, onSelectArea, onOpenSection }) {
  const extensions = summary.extensionRegistryChecks.filter((item) => item.status !== 'controlled_empty')
  const blocked = extensions.some((item) => item.status === 'blocked')
  const policyCount = summary.processPolicies.length
  const routes = [
    {
      key: 'config',
      title: '后端配置',
      icon: AppstoreOutlined,
      summary: `${summary.moduleStates.length} 个模块 · ${summary.fieldVisibilityReview.length} 列字段 · ${summary.roleProfileNames.length} 个岗位 · ${summary.printTemplateDefaults.length} 套打印默认值`,
      destinations: ['编译正式清单', '发布并激活', '目标读回'],
      note: '通过发布门禁后才能应用',
    },
    {
      key: 'display',
      title: '品牌与菜单',
      icon: LayoutOutlined,
      summary: `${menu.sectionCount} 个分组 · ${menu.itemCount} 个菜单项`,
      destinations: ['部署注入', '前端展示'],
      note: '菜单显隐不授予权限',
    },
    {
      key: 'policy',
      title: '流程策略与评审草案',
      icon: ExperimentOutlined,
      summary: `${policyCount ? `${policyCount} 条策略草案` : '暂无流程策略草案'} · ${numbering.fieldCandidateCount} 项字段 · ${numbering.numberingRuleCount} 条编号规则`,
      destinations: ['草案仅供预览'],
      note: '草案不执行流程或写入业务事实',
      section: PREFLIGHT_SECTION_FLOW,
    },
    {
      key: 'extension',
      title: '扩展登记',
      icon: BranchesOutlined,
      summary: extensions.length ? `${extensions.length} 项扩展候选` : '0 项扩展声明',
      destinations: [blocked ? '声明受阻' : extensions.length ? '待评审' : '暂无扩展登记'],
      note: extensions.length ? '当前没有运行时实现' : null,
      blocked,
      section: PREFLIGHT_SECTION_EXTENSIONS,
    },
  ]

  return (
    <div className="erp-dev-customer-package-map" role="group" aria-label="客户包组成与去向">
      <div className="erp-dev-customer-package-map__columns erp-dev-customer-package-map__legend" aria-hidden="true">
        <span>配置内容</span>
        <span>使用去向</span>
      </div>
      {routes.map((route) => (
        <PackageRoute
          key={route.key}
          route={route}
          expanded={area === route.key}
          onActivate={() => route.section
            ? onOpenSection(route.section)
            : onSelectArea(area === route.key ? null : route.key)}
        >
          {route.section ? null : <CustomerPackageContents area={route.key} summary={summary} menu={menu} />}
        </PackageRoute>
      ))}
    </div>
  )
}
