import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import PageHero from '../components/PageHero'
import StatusPill from '../components/StatusPill'

function TagList({ items, tone = 'default' }) {
  const toneClassName =
    tone === 'warning'
      ? 'border-amber-300/20 bg-amber-300/8 text-slate-200'
      : 'border-white/10 bg-black/20 text-slate-200'

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full border px-3 py-1 text-sm ${toneClassName}`}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function DetailList({ items, tone = 'default' }) {
  const toneClassName =
    tone === 'warning'
      ? 'border-amber-300/20 bg-amber-300/8 text-slate-200'
      : 'border-white/10 bg-white/[0.03] text-slate-200'

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item}
          className={`rounded-3xl border px-4 py-3 text-sm leading-6 ${toneClassName}`}
        >
          {item}
        </div>
      ))}
    </div>
  )
}

export default function BusinessModulePage({ moduleItem }) {
  const heroActions = moduleItem.relatedLinks.slice(0, 3)

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={`${moduleItem.sectionTitle} · 业务页`}
        title={moduleItem.title}
        description={moduleItem.description}
        actions={
          <>
            {heroActions.map((link, index) => (
              <Link
                key={link.path}
                className={
                  index === 0 ? 'erp-primary-button' : 'erp-secondary-button'
                }
                to={link.path}
              >
                {link.label}
              </Link>
            ))}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-50">
                  当前定位
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  {moduleItem.summary}
                </div>
              </div>
              <StatusPill status={moduleItem.status} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  负责人
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-50">
                  {moduleItem.owner}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  页面路径
                </div>
                <div className="mt-2 break-all text-sm font-semibold text-slate-50">
                  {moduleItem.path}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  所属分组
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-50">
                  {moduleItem.sectionTitle}
                </div>
              </div>
            </div>

            <div className="bg-cyan-300/8 rounded-3xl border border-cyan-300/20 p-4">
              <div className="text-sm font-semibold text-cyan-50">
                对 trade-erp 的复用方式
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                {moduleItem.tradeErpAdaptation}
              </div>
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">链路位置</div>

            <div>
              <div className="text-sm font-semibold text-slate-50">
                上游输入
              </div>
              <div className="mt-3">
                <TagList items={moduleItem.upstream} />
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-50">
                下游去向
              </div>
              <div className="mt-3">
                <TagList items={moduleItem.downstream} />
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-50">
                移动端协同
              </div>
              <div className="mt-3">
                <TagList items={moduleItem.mobileFocus} />
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              本页先覆盖
            </div>
            <DetailList items={moduleItem.currentScope} />
          </div>
        </SurfacePanel>

        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              关键字段 / 口径
            </div>
            <DetailList items={moduleItem.keyFields} />
          </div>
        </SurfacePanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SurfacePanel className="p-5">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-50">
              当前真实来源
            </div>
            <DetailList items={moduleItem.sourceRefs} />
          </div>
        </SurfacePanel>

        <div className="grid gap-4">
          <SurfacePanel className="p-5">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                当前边界
              </div>
              <DetailList items={moduleItem.boundaries} tone="warning" />
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-5">
            <div className="space-y-4">
              <div className="text-lg font-semibold text-slate-50">
                相关入口
              </div>
              <div className="grid gap-3">
                {moduleItem.relatedLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="hover:bg-cyan-300/8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40"
                  >
                    <div className="text-base font-semibold text-slate-50">
                      {link.label}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      {link.path}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </SurfacePanel>
        </div>
      </div>
    </div>
  )
}
