import React from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE } from '../config/devRoutes.mjs'
import '../styles/dev-product-engineering.css'

const GROUPS = [
  { title: '产品与流程', keys: ['product-core', 'permission-relationships', 'status-flows'] },
  { title: '界面与接入', keys: ['ui-design', 'integration'] },
  { title: '规范与文档', keys: ['project-skills', 'docs'] },
]

export default function DevProductEngineeringTools({ items }) {
  return (
    <section className="erp-dev-product-tools" aria-label="产品工程工具">
      {GROUPS.map((group) => (
        <section className="erp-dev-product-tools__group" key={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {group.keys.flatMap((key) => items.filter((item) => item.key === key)).map((item) => {
              const title = DEV_PAGE_TITLE_BY_ROUTE[item.route] || item.title
              return (
                <li key={item.key}>
                  <Link to={item.route} title={item.description}>
                    <span>{title}</span>
                    <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </section>
  )
}
