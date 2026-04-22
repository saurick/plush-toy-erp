import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import HelpCenterDocLinks from '../components/HelpCenterDocLinks'
import PageHero from '../components/PageHero'
import { phaseFlow } from '../config/seedData.mjs'

const NEWCOMER_FLOW_STEPS = [
  {
    key: 'project-order',
    title: '客户 / 款式立项',
    description: '先收客户、编号层级、交期和资料齐套状态。',
  },
  {
    key: 'material-bom',
    title: '材料 BOM',
    description: '先确认主料明细、损耗、色卡和作业指导书。',
  },
  {
    key: 'accessories',
    title: '辅材 / 包材采购',
    description: '包装材料和辅材走独立采购支线，不并回主料真源。',
  },
  {
    key: 'processing-contract',
    title: '加工合同 / 委外',
    description: '合同头、合同行、条款和附件都按正式快照理解。',
  },
  {
    key: 'production',
    title: '生产排单 / 跟进',
    description: '先盯齐套、排产、延期、返工和异常。',
  },
  {
    key: 'warehouse',
    title: '仓库收发 / 成品入库',
    description: '材料到仓、IQC、成品回仓和待出货都在这层收口。',
  },
  {
    key: 'settlement',
    title: '对账 / 结算',
    description: '先做待对账、待付款和异常费用提醒，不抢跑完整账务模型。',
  },
]

const SOURCE_FLOW_CHAINS = [
  {
    key: 'main-flow',
    title: '正式主链',
    tags: ['真实资料已确认', '当前帮助中心主线'],
    note: '客户 / 款式立项、材料、加工合同、生产、仓库、结算是当前唯一正式主链，不回退到 trade-erp 的报价、外销、出运、结汇主线。',
  },
  {
    key: 'purchase-branch',
    title: '辅包材支线',
    tags: ['独立采购支线', '不反写主料真源'],
    note: '辅材 / 包材采购来自独立采购表，和主料 BOM、加工合同并列存在，不能混成一张“万能采购表”。',
  },
  {
    key: 'print-chain',
    title: '打印快照支线',
    tags: ['模板打印中心', '合同快照'],
    note: '采购合同、加工合同、材料 / 加工汇总、生产总表统一走打印中心；帮助中心只解释口径，不替代正式模板快照。',
  },
]

const FLOW_READING_RULES = [
  '先看阶段和责任角色，再看字段和计算规则；不要一开始就按旧项目名词套当前流程。',
  '看到编号、数量、金额、日期不一致时，先问字段语义和快照层级，而不是马上补 fallback。',
  '帮助中心只收口当前正式口径；扩展硬件链路、PDA、条码枪、图片识别继续视为 deferred。',
]

const CURRENT_BOUNDARIES = [
  '流程页和帮助中心已经可以作为正式入口使用。',
  '合同打印、导入映射和字段真源已经收口到对应页面，但当前仍不假装业务保存链路已落完。',
  '正式数据库 schema 仍要等编号体系、结算样本和附件主键关系继续收稳后再推进。',
  '扩展硬件链路、PDA、条码枪和图片识别继续 deferred，不进入当前主路径。',
]

export default function OperationFlowPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="流程总览"
        title="基于真实 PDF / Excel / 截图重做主流程"
        description="trade-erp 的业务主线是报价、外销、出运和结汇；毛绒 ERP 这轮改成客户 / 款式、材料、加工合同、生产、仓库和结算这条链。每个阶段都明确引用了当前真实资料来源，不再靠上一轮 seedData 脑补。"
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/docs/operation-guide">
              查看 ERP 操作教程
            </Link>
            <Link
              className="erp-secondary-button"
              to="/erp/docs/field-linkage-guide"
            >
              查看 ERP 字段联动口径
            </Link>
          </>
        }
      />

      <HelpCenterDocLinks currentPath="/erp/docs/operation-flow-overview" />

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              新同事先按这条线理解系统
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              先把系统理解成“接单立项、整理资料、下采购和加工、跟进生产、完成入库和出货、最后做结算”的制造链路，再回到字段口径和打印模板里看细节。
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {NEWCOMER_FLOW_STEPS.map((step, index) => (
              <div
                key={step.key}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  步骤 {index + 1}
                </div>
                <div className="mt-3 text-base font-semibold text-slate-900">
                  {step.title}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      <div className="grid gap-4 xl:grid-cols-3">
        {SOURCE_FLOW_CHAINS.map((chain) => (
          <SurfacePanel key={chain.key} className="p-5">
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {chain.title}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {chain.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-sm leading-6 text-slate-600">
                {chain.note}
              </div>
            </div>
          </SurfacePanel>
        ))}
      </div>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-900">阅读规则</div>
          <div className="grid gap-3 md:grid-cols-3">
            {FLOW_READING_RULES.map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>

      <div className="grid gap-4">
        {phaseFlow.map((phase, index) => (
          <SurfacePanel key={phase.key} className="p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-700">
                  阶段 {index + 1}
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {phase.title}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    责任角色：{phase.owner}
                  </div>
                </div>
                <div className="text-sm leading-7 text-slate-600">
                  {phase.summary}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    当前引用资料
                  </div>
                  <div className="mt-3 space-y-2">
                    {phase.sources.map((item) => (
                      <div
                        key={item}
                        className="text-sm leading-6 text-slate-600"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    阶段产出
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {phase.outputs.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    移动端首批动作
                  </div>
                  <div className="mt-3 space-y-2">
                    {phase.mobileActions.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SurfacePanel>
        ))}
      </div>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-900">
            本轮流程边界
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {CURRENT_BOUNDARIES.map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
