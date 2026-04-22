import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import {
  TASK_STATUS,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  buildDashboardTaskRows,
  buildDashboardTaskSummary,
} from '../config/dashboardTasks.mjs'

function DashboardMetricCard({ label, value, note, tone = 'slate' }) {
  const toneClassMap = {
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
  }

  return (
    <SurfacePanel className="h-full p-5">
      <div className="space-y-2">
        <div className="text-sm text-slate-500">{label}</div>
        <div
          className={`text-4xl font-semibold tracking-tight ${
            toneClassMap[tone] || toneClassMap.slate
          }`}
        >
          {value}
        </div>
        <div className="text-sm leading-6 text-slate-500">{note}</div>
      </div>
    </SurfacePanel>
  )
}

export default function DashboardPage() {
  const moduleRows = buildDashboardTaskRows()
  const summary = buildDashboardTaskSummary(moduleRows)

  return (
    <div className="space-y-6">
      <SurfacePanel className="p-6 sm:p-7">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            毛绒 ERP 任务看板
          </h1>
          <p className="max-w-5xl text-sm leading-7 text-slate-500 sm:text-base">
            覆盖桌面后台当前模块任务推进、资料缺口、入口落地、待确认项与风险阻塞。
          </p>
        </div>
      </SurfacePanel>

      <div className="grid gap-4 xl:grid-cols-4">
        <DashboardMetricCard
          label="任务总数"
          value={summary.totalTasks}
          note="按模块推进口径统计当前桌面后台范围内的任务。"
        />
        <DashboardMetricCard
          label="待处理（待处理 + 风险阻塞）"
          value={summary.attentionCount}
          note={`${summary.statusCount[TASK_STATUS.TODO]} 项待处理，${summary.statusCount[TASK_STATUS.BLOCKED]} 项风险阻塞。`}
          tone="amber"
        />
        <DashboardMetricCard
          label="进行中"
          value={summary.statusCount[TASK_STATUS.IN_PROGRESS]}
          note={`${summary.statusCount[TASK_STATUS.REVIEW]} 项仍待确认，当前主路径继续按真源推进。`}
          tone="sky"
        />
        <DashboardMetricCard
          label="已完成"
          value={`${summary.completionRatio}%`}
          note={`${summary.statusCount[TASK_STATUS.DONE]} 项已按真源收口或已落正式入口。`}
          tone="emerald"
        />
      </div>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">
              任务状态分布
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              百分比按当前任务总数计算
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {TASK_STATUS_ORDER.map((status) => {
              const meta = TASK_STATUS_META[status]
              const count = summary.statusCount[status]
              const percent = summary.totalTasks
                ? Math.round((count / summary.totalTasks) * 100)
                : 0

              return (
                <div
                  key={status}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta.pillClass}`}
                    >
                      {status}
                    </div>
                    <div className={`text-sm font-semibold ${meta.valueClass}`}>
                      {count} 项
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: meta.barColor,
                      }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-500">
                    <span>{meta.summary}</span>
                    <span>{percent}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">
              模块进度明细
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              模块标题可跳到当前最相关页面
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="rounded-l-2xl px-4 py-3 font-semibold">
                    模块
                  </th>
                  <th className="px-4 py-3 font-semibold">任务数</th>
                  {TASK_STATUS_ORDER.map((status, index) => (
                    <th
                      key={status}
                      className={`px-4 py-3 text-center font-semibold ${
                        index === TASK_STATUS_ORDER.length - 1
                          ? 'rounded-r-2xl'
                          : ''
                      }`}
                    >
                      {status}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {moduleRows.map((row) => (
                  <tr key={row.key} className="align-top">
                    <td className="border-b border-slate-100 px-4 py-4">
                      <div className="space-y-2">
                        {row.path ? (
                          <Link
                            className="text-base font-semibold text-emerald-700 hover:text-emerald-800"
                            to={row.path}
                          >
                            {row.title}
                          </Link>
                        ) : (
                          <div className="text-base font-semibold text-slate-900">
                            {row.title}
                          </div>
                        )}
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          {row.owner}
                        </div>
                        <div className="max-w-xl text-sm leading-6 text-slate-500">
                          {row.summary}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-base font-semibold text-slate-900">
                      {row.total}
                    </td>
                    {TASK_STATUS_ORDER.map((status) => {
                      const value = row.statusCount[status]
                      const meta = TASK_STATUS_META[status]

                      return (
                        <td
                          key={status}
                          className="border-b border-slate-100 px-4 py-4 text-center"
                        >
                          <span
                            className={`text-base font-semibold ${
                              value > 0 ? meta.valueClass : 'text-slate-300'
                            }`}
                          >
                            {value}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
