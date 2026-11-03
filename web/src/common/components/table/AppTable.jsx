import React, { useImperativeHandle, useMemo, useRef } from 'react'
import { Table } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { normalizeTableColumns, tableColumnsMinimumWidth } from './tableColumns.mjs'
import TableScrollControls from './TableScrollControls.jsx'
import { useAppPagination } from '../pagination/AppPagination'
import './app-table.css'

export const TABLE_SELECTION_COLUMN_WIDTH = 52

function MeasuredHeaderTable({ style, ...props }) {
  // Ant measures the body columns. Keep those widths when content grows beyond
  // scroll.x instead of letting the separate header redistribute them.
  return <table data-table-lines="fixed" {...props} style={{ ...style, tableLayout: 'fixed' }} />
}

const AppTable = React.forwardRef(
  (
    { columns, className = '', locale, components, rowSelection, style, widthMode = 'container', scrollToolbar = false, scrollControlsOnEmpty = false, ...props },
    ref
  ) => {
    const tableRef = useRef(null)
    const loading = typeof props.loading === 'object' ? props.loading?.spinning === true : Boolean(props.loading)
    const pagination = useAppPagination(props.pagination)
    const hasRowSelection = Boolean(rowSelection)
    useImperativeHandle(ref, () => tableRef.current)
    const alignedColumns = useMemo(
      () => normalizeTableColumns(columns, { hasRowSelection }),
      [columns, hasRowSelection]
    )
    const scroll = useMemo(() => {
      const columnsWidth = hasRowSelection ? tableColumnsMinimumWidth(columns) : null
      if (columnsWidth === null || typeof props.scroll?.x === 'string') return props.scroll
      // 固定布局不采用列 minWidth，必须保留原有列宽预算，避免伸缩列被挤为零。
      const minimumWidth = columnsWidth + TABLE_SELECTION_COLUMN_WIDTH + (props.expandable?.columnWidth || 0)
      return { ...props.scroll, x: Math.max(Number(props.scroll?.x) || 0, minimumWidth) }
    }, [columns, hasRowSelection, props.scroll, props.expandable?.columnWidth])
    const budgetWidth = widthMode === 'columns' && props.tableLayout === 'fixed' && Number.isFinite(scroll?.x) ? scroll.x : undefined
    const selection = useMemo(
      () => rowSelection && { ...rowSelection, columnWidth: TABLE_SELECTION_COLUMN_WIDTH },
      [rowSelection]
    )
    const tableComponents = useMemo(() => ({
      ...components,
      header: { table: MeasuredHeaderTable, ...components?.header },
    }), [components])
    const scrollRevision = useMemo(
      () => [
        alignedColumns,
        props.dataSource,
        props.loading,
        scroll,
        props.pagination,
        props.tableLayout,
        widthMode,
      ],
      [
        alignedColumns,
        props.dataSource,
        props.loading,
        scroll,
        props.pagination,
        props.tableLayout,
        widthMode,
      ]
    )
    return (
      <>
        <Table
          {...props}
          pagination={pagination}
          ref={tableRef}
          className={`app-table ${className}`.trim()}
          columns={alignedColumns}
          rowSelection={selection}
          scroll={scroll}
          style={{ width: budgetWidth, maxWidth: budgetWidth === undefined ? undefined : '100%', ...style, '--app-table-selection-column-width': `${TABLE_SELECTION_COLUMN_WIDTH}px` }}
          components={tableComponents}
          locale={{
            ...locale,
            emptyText: loading ? null : typeof locale?.emptyText === 'string'
              ? <Empty description={locale.emptyText} />
              : locale?.emptyText === undefined ? <Empty /> : locale.emptyText,
          }}
        />
        <TableScrollControls
          tableRef={tableRef}
          revision={scrollRevision}
          loading={props.loading}
          useToolbar={scrollToolbar}
          allowEmpty={scrollControlsOnEmpty}
        />
      </>
    )
  }
)

AppTable.displayName = 'AppTable'
AppTable.Summary = Table.Summary

export default AppTable
