import { useMemo, useRef, useState } from 'react'
import { Button, Typography } from 'antd'
import SearchInput from '@/common/components/SearchInput'
import AppPagination from '@/common/components/pagination/AppPagination'
import FilterSelect from '@/common/components/select/FilterSelect'
import { WorkbenchEmpty, WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import { useCustomerConfigCompactTable } from './useCustomerConfigCompactTable.mjs'

const { Text } = Typography
const PAGE_SIZE = 20

export default function CustomerConfigDeclarationTable({
  sources, rows, locatedRow, onLocate, disabled,
}) {
  const tableStart = useRef(null)
  const [keyword, setKeyword] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [page, setPage] = useState(1)
  const compact = useCustomerConfigCompactTable()
  const filtered = useMemo(() => {
    const terms = keyword.toLowerCase().split(/\s+/u).filter(Boolean)
    return rows.filter((row) => {
      if (sourcePath && row.sourcePath !== sourcePath) return false
      if (!terms.length) return true
      const searchable = [
        row.sourcePath, row.path, row.label, row.value, row.description, ...row.conditions,
      ].join(' ').toLowerCase()
      return terms.every((term) => searchable.includes(term))
    })
  }, [rows, keyword, sourcePath])
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groups = sources
    .map((path) => ({ path, rows: pageRows.filter((row) => row.sourcePath === path) }))
    .filter((group) => group.rows.length > 0)

  return (
    <>
      <WorkbenchToolbar
        tools={<Text type="secondary" role="status">共 {filtered.length} 项声明</Text>}
      >
        <SearchInput
          className="erp-dev-customer-declaration-search"
          allowClear
          aria-label="搜索配置声明"
          placeholder="搜索配置声明"
          searchHint="可搜索字段、路径、记录条件、声明值和说明"
          disabled={disabled}
          value={keyword}
          onSearch={(value) => {
            setKeyword(value)
            setPage(1)
          }}
        />
        {sources.length > 1 ? (
          <FilterSelect
            className="erp-dev-customer-declaration-source"
            label="来源"
            aria-label="配置来源"
            placeholder="全部源文件"
            allowClear
            virtual={false}
            disabled={disabled}
            value={sourcePath}
            options={sources.map((path) => ({ value: path, label: path.split('/').at(-1) }))}
            onChange={(path) => {
              setSourcePath(path)
              setPage(1)
            }}
          />
        ) : null}
      </WorkbenchToolbar>

      {groups.length ? (
        <>
          <div ref={tableStart} className="erp-dev-tool-table-wrap">
            <table
              role="table"
              className="erp-dev-tool-table erp-dev-customer-review-table erp-dev-customer-declaration-table"
              data-table-lines="appearance"
              data-layout={compact ? 'compact' : undefined}
              aria-label="客户包声明"
            >
              <colgroup><col /><col /><col /><col /><col /></colgroup>
              <thead>
                <tr role="row">
                  <th role="columnheader" scope="col">配置字段</th>
                  <th role="columnheader" scope="col">记录条件</th>
                  <th role="columnheader" scope="col">声明值</th>
                  <th role="columnheader" scope="col">字段含义</th>
                  <th role="columnheader" scope="col">原文</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.path}>
                  <tr role="row" className="erp-dev-customer-declaration-source-row">
                    <th scope="rowgroup" colSpan={5}><code>{group.path}</code></th>
                  </tr>
                  {group.rows.map((row) => {
                    const located = row.lineIndex === locatedRow?.lineIndex
                    return (
                      <tr role="row" key={row.lineIndex} aria-current={located ? 'location' : undefined}>
                        <th role="rowheader" scope="row">
                          {row.label ? <span>{row.label}</span> : null}
                          <code className={row.label ? 'erp-dev-customer-field-value erp-dev-customer-field-ref' : undefined}>{row.path}</code>
                        </th>
                        <td data-customer-value-label="记录条件">
                          {row.conditions.length ? row.conditions.map((condition) => (
                            <code className="erp-dev-customer-field-value" key={condition}>{condition}</code>
                          )) : '—'}
                        </td>
                        <td data-customer-value-label="声明值">
                          <code className="erp-dev-customer-field-value">{row.value}</code>
                        </td>
                        <td className="erp-dev-customer-declaration-description" data-customer-value-label="字段含义">
                          {row.description || '—'}
                        </td>
                        <td>
                          <Button
                            type="link"
                            size="small"
                            aria-label={`定位 JSONC：${row.path}`}
                            disabled={disabled}
                            onClick={() => onLocate(row)}
                          >
                            定位
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <AppPagination
            aria-label="声明表格分页"
            className="erp-dev-customer-declaration-pagination"
            current={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            disabled={disabled}
            hideOnSinglePage
            onChange={(nextPage) => {
              setPage(nextPage)
              tableStart.current?.scrollIntoView({ block: 'start' })
            }}
          />
        </>
      ) : (
        <WorkbenchEmpty
          title="没有匹配的配置字段"
          action={keyword || sourcePath ? (
            <Button
              disabled={disabled}
              onClick={() => {
                setKeyword('')
                setSourcePath('')
                setPage(1)
              }}
            >
              清除筛选
            </Button>
          ) : null}
        />
      )}
    </>
  )
}
