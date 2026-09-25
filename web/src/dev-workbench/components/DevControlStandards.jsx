import React, { useState } from 'react'
import { Button, ConfigProvider, Popover, theme } from 'antd'
import { DownOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'

export default function DevControlStandards() {
  const [mode, setMode] = useState('light')
  const [view, setView] = useState('orders')
  const [risk, setRisk] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [searchOptionsOpen, setSearchOptionsOpen] = useState(false)
  const [searchScope, setSearchScope] = useState('active')
  const [message, setMessage] = useState(
    '点击下方控件查看反馈；所有数字均为演示。'
  )
  return (
    <div className="erp-dev-control-standards">
      <p>
        当前共享组件的可运行样例。页签切换内容，筛选改变当前结果，按钮执行动作；
        同组始终使用一种中性边框色，选中只增加底色和字重，不给按钮添加勾号、深色框或粗底边。
      </p>
      <div className="erp-dev-control-standards__tools">
        <span>预览主题</span>
        <SlidingSegmented
          aria-label="控件样例主题"
          value={mode}
          onChange={setMode}
          options={[
            { label: '浅色', value: 'light' },
            { label: '深色', value: 'dark' },
          ]}
        />
      </div>
      <ConfigProvider
        theme={{
          algorithm:
            mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { colorPrimary: mode === 'dark' ? '#88cfa6' : '#237443' },
        }}
      >
        <div
          className="erp-dev-control-standards__examples"
          data-erp-theme={mode}
        >
          <section aria-label="页签样例">
            <h3>页签：切换同级内容</h3>
            <p>
              使用
              SlidingTabs。所有页签共用中性边框，选中底色和字重指向下方内容。
            </p>
            <SlidingTabs
              aria-label="订单详情样例"
              items={[
                {
                  key: 'products',
                  label: '产品明细',
                  children: '当前：产品明细。切换页签查看关联内容。',
                },
                {
                  key: 'tasks',
                  label: '关联任务',
                  children: '当前：关联任务。订单身份仍在原位置。',
                },
                { key: 'unavailable', label: '无权限', disabled: true },
              ]}
            />
          </section>
          <section aria-label="视图切换样例">
            <h3>视图切换：小范围互斥视角</h3>
            <p>
              使用
              SlidingSegmented。桌面按内容宽度排列，窄屏再均分；不把两个选项铺成整页大卡片。
            </p>
            <SlidingSegmented
              aria-label="进度视图样例"
              value={view}
              onChange={setView}
              options={[
                { label: '订单交付', value: 'orders' },
                { label: '生产执行', value: 'production' },
              ]}
            />
            <div
              className="erp-dev-control-standards__result"
              aria-live="polite"
            >
              当前查看：{view === 'orders' ? '订单交付' : '生产执行'}
            </div>
          </section>
          <section aria-label="筛选按钮样例">
            <h3>筛选：缩小同一份结果</h3>
            <p>
              使用
              FilterChip。描边表明可以点击，选中底色和字重表明已应用，数量不单独伪装成操作按钮。
            </p>
            <div
              className="erp-dev-control-standards__row"
              role="group"
              aria-label="演示风险筛选"
            >
              {[
                ['all', '全部', 93],
                ['overdue', '已逾期', 55],
                ['due', '7天内到期', 5],
                ['blocked', '任务受阻', 2],
              ].map(([key, label, count]) => (
                <FilterChip
                  key={key}
                  count={count}
                  selected={key === risk}
                  onClick={() => setRisk(key)}
                >
                  {label}
                </FilterChip>
              ))}
              <FilterChip disabled>暂不可用</FilterChip>
            </div>
          </section>
          <section
            aria-label="移动搜索筛选样例"
            className="erp-mobile-controls"
          >
            <h3>移动搜索与筛选：同高、同边界、可清除</h3>
            <p>
              进度和任务共用
              MobileSearchInput；单号、客户、产品和负责人都进入同一个主搜索，筛选层不再放第二个文本搜索。少量次级条件从按钮下方展开并覆盖内容，选择立即生效，不用底部抽屉或桌面日期输入。移动端优先减少空白和低频行，但可触区始终至少
              44px。筛选标题、互斥选项和重置动作共用居中基线；每个同级 Tab
              独立保存条件，筛选层重置当前 Tab
              的直接选择项，搜索词由输入框单独清除。连续结果列表向下滑动时自动追加下一批，不显示上一页、下一页。
            </p>
            <div className="erp-dev-control-standards__search">
              <MobileSearchInput
                aria-label="演示搜索"
                placeholder="单号、客户、产品、负责人"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onClear={() => setKeyword('')}
              />
              <Popover
                trigger="click"
                open={searchOptionsOpen}
                onOpenChange={setSearchOptionsOpen}
                placement="bottomRight"
                arrow={false}
                classNames={{
                  root: 'erp-dev-control-standards__filter-popover erp-mobile-controls',
                }}
                content={
                  <div
                    className="erp-dev-control-standards__search-options"
                    role="group"
                    aria-label="演示更多筛选"
                  >
                    <fieldset>
                      <legend>演示记录范围</legend>
                      <SlidingSegmented
                        block
                        aria-label="演示记录范围"
                        value={searchScope}
                        options={[
                          { value: 'active', label: '在执行' },
                          { value: 'all', label: '全部' },
                          { value: 'ended', label: '已结束' },
                        ]}
                        onChange={setSearchScope}
                      />
                    </fieldset>
                    <Button
                      type="text"
                      block
                      className="erp-dev-control-standards__search-reset"
                      onClick={() => setSearchScope('active')}
                    >
                      重置筛选
                    </Button>
                  </div>
                }
              >
                <button
                  type="button"
                  className="erp-control-button"
                  aria-expanded={searchOptionsOpen}
                  data-active={searchScope !== 'active'}
                >
                  <FilterOutlined aria-hidden="true" />
                  筛选
                  {searchScope !== 'active' && (
                    <span className="erp-control-count">1</span>
                  )}
                  <DownOutlined aria-hidden="true" />
                </button>
              </Popover>
            </div>
            <p role="status">
              搜索：{keyword || '未输入'}；范围：
              {
                { active: '在执行', all: '全部记录', ended: '已结束' }[
                  searchScope
                ]
              }
              。
            </p>
          </section>
          <section aria-label="操作按钮样例">
            <h3>操作：一组只突出一个主动作</h3>
            <p>
              沿用 Ant Design
              Button。主动作实心，次动作描边，辅助动作文字；图标按钮须有明确名称。
            </p>
            <div className="erp-dev-control-standards__row">
              <Button
                type="primary"
                onClick={() =>
                  setMessage('演示反馈：已保存。没有写入业务数据。')
                }
              >
                保存
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setMessage('演示反馈：已刷新。')}
              >
                刷新
              </Button>
              <Button
                type="text"
                onClick={() => setMessage('演示反馈：已取消当前操作。')}
              >
                取消
              </Button>
              <Button
                danger
                onClick={() =>
                  setMessage('演示反馈：危险操作应先说明影响，再确认执行。')
                }
              >
                作废
              </Button>
              <Button disabled>无可操作记录</Button>
              <Button loading>保存中</Button>
            </div>
            <p role="status">{message}</p>
          </section>
        </div>
      </ConfigProvider>
      <div className="erp-dev-control-standards__rules">
        <strong>复用与验收</strong>
        <ul>
          <li>
            尺寸：桌面常规 32–38px，移动可触区域至少
            44px；长标签和大数字不能被截断。
          </li>
          <li>
            键盘：Tab
            可聚焦，页签支持方向键，焦点有清晰边框；禁用项不能触发动作。
          </li>
          <li>
            样式来自 control-affordance.css，动画来自
            tabs-motion.css；页面仅安排位置与尺寸。
          </li>
          <li>
            筛选层内标题、分段选项和重置动作统一居中；同级 Tab
            分别保存搜索与筛选状态，重置筛选或清除搜索都不能改掉其他 Tab
            的条件。
          </li>
          <li>
            标准组件、真实页面都需验证浅深主题、溢出和选中状态；滑动须有中间帧并支持减少动态效果。
          </li>
        </ul>
      </div>
    </div>
  )
}
