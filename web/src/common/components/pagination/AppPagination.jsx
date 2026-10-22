import React from 'react'
import { Grid, Pagination } from 'antd'
import { resolveAppPagination } from '../../utils/pagination.mjs'
import './app-pagination.css'

export function useAppPagination(pagination) {
  const screens = Grid.useBreakpoint()
  return resolveAppPagination(pagination, screens.sm === false)
}

export default function AppPagination({ showSizeChanger = false, ...props }) {
  const pagination = useAppPagination({ showSizeChanger, ...props })
  return <Pagination {...pagination} />
}
