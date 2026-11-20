import React from 'react'
import { Tooltip, Typography } from 'antd'
import './dev-source-references.css'

const SOURCE_KINDS = [
  [/(?:_test\.go|\.test\.[cm]?[jt]sx?)(?::\d+)?$/u, '测试用例'],
  [/\.md(?:#.*)?$/u, '文档'],
  [/^server\/internal\/biz\//u, '业务规则'],
  [/^server\/internal\/data\/model\//u, '数据结构'],
  [/^server\/internal\/data\//u, '数据访问'],
  [/^scripts\//u, '脚本'],
  [/^(?:config\/|\.gitlab-ci\.yml$)/u, '配置'],
]

export function sourceReferenceName(path, withDirectory = false) {
  const parts = path.split('/')
  const file = parts.at(-1)
  return withDirectory || /^(?:README|SKILL|index|main)\./u.test(file)
    ? parts.slice(-2).join('/')
    : file
}

export function DevSourceReference({ path, label }) {
  if (typeof path !== 'string' || !path.trim()) return null
  const name = label || sourceReferenceName(path)
  const kind = SOURCE_KINDS.find(([pattern]) => pattern.test(path))?.[1] || '实现'
  return (
    <span className="erp-dev-source-reference" data-source-reference={path}>
      <span className="erp-dev-source-reference__kind">{kind}</span>
      <Tooltip title={path} trigger={['hover', 'focus']}>
        <Typography.Text
          tabIndex={0}
          className="erp-dev-source-reference__file"
          copyable={{ text: path, tooltips: ['复制完整路径', '已复制'] }}
        >
          <code>{name}</code>
        </Typography.Text>
      </Tooltip>
    </span>
  )
}

export default function DevSourceReferences({ references = [] }) {
  const paths = [...new Set(references.filter((path) => typeof path === 'string' && path.trim()))]
  if (!paths.length) return null
  const names = paths.map((path) => sourceReferenceName(path))
  return (
    <ul className="erp-dev-source-references" aria-label="来源文件">
      {paths.map((path, index) => (
        <li key={path}>
          <DevSourceReference
            path={path}
            label={sourceReferenceName(path, names.indexOf(names[index]) !== names.lastIndexOf(names[index]))}
          />
        </li>
      ))}
    </ul>
  )
}
