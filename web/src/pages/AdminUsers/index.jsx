import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

const PAGE_SIZE = 30

function fmtTs(ts) {
  if (!ts) return '-'
  const d = new Date(Number(ts) * 1000)
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString()
}

function clampInt(v, fallback = 0) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

function clampInt64(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const userRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'user',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchName, setSearchName] = useState('')

  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  const fetchList = async (targetPage = page, keyword = searchName) => {
    setErrMsg('')
    setLoading(true)
    try {
      const safePage = Math.max(1, clampInt(targetPage, 1))
      const offset = (safePage - 1) * PAGE_SIZE
      const trimmedKeyword = (keyword || '').trim()

      // 当前后台账号页先只保留搜索、查看和账号启停，后续业务字段按真实需求再扩展。
      const result = await userRpc.call('list', {
        limit: PAGE_SIZE,
        offset,
        search: trimmedKeyword,
      })

      const data = result?.data || result?.result?.data || {}
      const list = Array.isArray(data?.users) ? data.users : []
      const nextTotal = clampInt64(data?.total, 0)

      setItems(list)
      setTotal(nextTotal)

      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
      if (safePage > nextTotalPages) {
        setPage(nextTotalPages)
      }
    } catch (e) {
      setErrMsg(getActionErrorMessage(e, '获取用户列表'))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList(page, searchName)
  }, [page, searchName])

  const onSearch = (e) => {
    e.preventDefault()
    const keyword = (searchInput || '').trim()
    setPage(1)
    setSearchName(keyword)
    if (page === 1 && keyword === searchName) {
      fetchList(1, keyword)
    }
  }

  const onClearSearch = () => {
    setSearchInput('')
    setSearchName('')
    setPage(1)
    if (page === 1 && !searchName) {
      fetchList(1, '')
    }
  }

  const setDisabled = async (userId, disabled) => {
    setErrMsg('')
    try {
      await userRpc.call('set_disabled', {
        user_id: userId,
        disabled: !!disabled,
      })
      await fetchList(page, searchName)
    } catch (e) {
      setErrMsg(getActionErrorMessage(e, '更新用户状态'))
    }
  }

  return (
    <AppShell className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100">
              账号管理
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              账号目录
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              当前版本先提供账号搜索、查看和启用/禁用，后续再按 ERP
              业务补充字段和操作。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin-menu')}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08]"
            >
              返回控制台
            </button>
            <button
              type="button"
              onClick={() => fetchList(page, searchName)}
              disabled={loading}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-300/20 disabled:text-slate-400"
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>

        {errMsg ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errMsg}
          </div>
        ) : null}

        <SurfacePanel className="p-5 sm:p-6">
          <div className="space-y-5">
            <div className="bg-cyan-300/8 rounded-2xl border border-cyan-300/20 px-4 py-3 text-sm leading-6 text-cyan-100/90">
              当前页面已可直接用于查看和管理基础账号状态；如果后续需要更多业务字段，可在项目里继续补充。
            </div>

            <form
              onSubmit={onSearch}
              className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
            >
              <div className="flex-1">
                <label className="mb-2 block text-sm text-slate-200/90">
                  按用户名搜索
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                    placeholder="输入用户名关键字"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-300/20 disabled:text-slate-400"
                  >
                    搜索
                  </button>
                  <button
                    type="button"
                    onClick={onClearSearch}
                    disabled={loading}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="text-sm text-slate-300">
                本页 {items.length} 条 · 共 {total} 条
                {searchName ? `（搜索：${searchName}）` : ''}
              </div>
            </form>

            <div className="overflow-hidden rounded-3xl border border-white/10">
              <div className="overflow-auto">
                <table className="min-w-[820px] text-left text-sm text-slate-100">
                  <thead className="bg-white/[0.04] text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">ID</th>
                      <th className="px-4 py-3 font-medium">用户名</th>
                      <th className="px-4 py-3 font-medium">状态</th>
                      <th className="px-4 py-3 font-medium">创建时间</th>
                      <th className="px-4 py-3 font-medium">最近登录</th>
                      <th className="px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-white/8 divide-y bg-black/10">
                    {items.length > 0 ? (
                      items.map((user) => {
                        const disabled = !!user.disabled
                        return (
                          <tr key={String(user.id)} className="align-top">
                            <td className="px-4 py-4 font-mono text-cyan-100">
                              {user.id}
                            </td>
                            <td className="px-4 py-4 font-medium text-slate-50">
                              {user.username}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                  disabled
                                    ? 'bg-zinc-500/15 text-zinc-200'
                                    : 'bg-emerald-500/15 text-emerald-200'
                                }`}
                              >
                                {disabled ? '已禁用' : '已启用'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {fmtTs(user.created_at)}
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {fmtTs(user.last_login_at)}
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => setDisabled(user.id, !disabled)}
                                disabled={loading}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  disabled
                                    ? 'bg-emerald-300 text-slate-950 hover:bg-emerald-200'
                                    : 'bg-rose-300 text-slate-950 hover:bg-rose-200'
                                }`}
                              >
                                {disabled ? '启用账号' : '禁用账号'}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-slate-400"
                        >
                          {loading ? '加载中…' : '暂无账号数据'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300">
                第 {page} / {totalPages} 页
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={!hasPrev || loading}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  首页
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPrev || loading}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={!hasNext || loading}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  下一页
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={!hasNext || loading}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  末页
                </button>
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </AppShell>
  )
}
