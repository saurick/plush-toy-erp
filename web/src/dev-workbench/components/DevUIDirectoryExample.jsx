import React, { useId, useMemo, useRef } from 'react'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import useDirectoryExpansion from '@/common/components/navigation/useDirectoryExpansion.js'
import useDirectoryReading from '../hooks/useDirectoryReading.js'

const introduction = { key: 'overview', title: '交接总览', text: '先确认采购单范围和接手人，再核对随单资料与待办。' }
const preparation = [
  { key: 'materials', title: '随单资料', text: '按采购单整理物料明细、供应商交期和变更确认记录。' },
]
const review = [
  { key: 'checklist', title: '核对清单', text: '逐项确认物料、数量和到货日期，把差异登记到对应明细。' },
  { key: 'missing', title: '缺件处理', text: '登记缺项、补齐人和承诺时间，交接时说明待办。' },
]
const submission = { key: 'submit', title: '提交与归档', text: '资料齐备后请接手人确认当前版本与待办，再归档交接记录。' }
const subsections = [
  { key: 'confirm', title: '交接确认', text: '接手人检查采购单编号，确认收到的资料和未结事项。' },
  { key: 'archive', title: '留档记录', text: '把采购单、随单资料、核对记录和交接确认归到同一份交接记录。' },
]
const sections = [introduction, ...preparation, ...review, submission, ...subsections]

export default function DevUIDirectoryExample({ variant }) {
  const hierarchical = variant !== 'flat'
  const prefix = useId()
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const ids = useMemo(() => sections.map(({ key }) => `${prefix}-${key}`), [prefix])
  const { currentId, jumpTo } = useDirectoryReading(ids, contentRef, scrollRef)
  const expansion = useDirectoryExpansion(['review', 'submit'])
  const reviewExpanded = expansion.isExpanded('review')
  const submissionExpanded = expansion.isExpanded('submit')
  const reviewCurrent = hierarchical && !reviewExpanded && review.some(({ key }) => `${prefix}-${key}` === currentId)
  const visibleId = hierarchical && !submissionExpanded && subsections.some(({ key }) => `${prefix}-${key}` === currentId)
    ? `${prefix}-${submission.key}` : currentId

  const renderLink = ({ key, title }) => {
    const id = `${prefix}-${key}`
    return (
      <DirectoryItem
        key={key}
        href={`#${id}`}
        data-directory-example-item={key}
        aria-current={!reviewCurrent && visibleId === id ? 'location' : undefined}
        onClick={(event) => {
          event.preventDefault()
          jumpTo(id)
        }}
      >
        <span>{title}</span>
      </DirectoryItem>
    )
  }

  return (
    <div className="erp-control-navigation-comparison">
      <Directory
        className="erp-directory-list"
        aria-label="目录导航样例"
        title={<strong>目录</strong>}
        allExpanded={expansion.allExpanded}
        onToggleAll={hierarchical ? expansion.toggleAll : undefined}
      >
        {hierarchical ? (
          <>
            {renderLink(introduction)}
            <section>
              <h3 className="erp-directory-group-title">交接准备</h3>
              <DirectoryBranch>{preparation.map(renderLink)}</DirectoryBranch>
            </section>
            <section>
              <DirectoryItem
                expanded={reviewExpanded}
                aria-controls={`${prefix}-review`}
                aria-current={reviewCurrent ? 'location' : undefined}
                onClick={() => expansion.toggle('review')}
              >
                <span>交接核对</span>
              </DirectoryItem>
              <DirectoryBranch id={`${prefix}-review`} hidden={!reviewExpanded}>{review.map(renderLink)}</DirectoryBranch>
            </section>
            <section>
              {renderLink(submission)}
              <DirectoryBranch hidden={!submissionExpanded}>{subsections.map(renderLink)}</DirectoryBranch>
            </section>
          </>
        ) : sections.map(renderLink)}
      </Directory>
      <section className="erp-control-directory-reader erp-control-example-result" aria-label="当前目录内容" ref={scrollRef}>
        <article ref={contentRef}>
          {sections.map(({ key, title, text }) => (
            <section key={key} className="erp-control-directory-reader__section">
              <h4 id={`${prefix}-${key}`}>{title}</h4>
              <p>{text}</p>
            </section>
          ))}
        </article>
      </section>
    </div>
  )
}
