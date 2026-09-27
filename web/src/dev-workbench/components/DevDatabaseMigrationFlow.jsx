import React, { useState } from 'react'
import { BranchesOutlined } from '@ant-design/icons'
import { MermaidDiagram } from '@/common/components/markdown'

const UPGRADE_FLOW = `flowchart TB
  candidate("固定候选版本<br/>在演练库升级并验证")
  maintenance("确认后暂停相关写入<br/>复核状态，准备最新恢复点")
  transaction("原库的数据库事务<br/>BEGIN → 迁移 SQL → COMMIT")
  verify("启动新版本<br/>验证登录与关键业务")
  rollback("回滚本次事务<br/>核实后恢复匹配的日常版本")
  activate("切换日常版本<br/>恢复正常使用")
  recovery("保持维护状态<br/>修复启动或按成套恢复方案处理")

  candidate --> maintenance --> transaction
  transaction -->|提交成功| verify
  transaction -->|事务内失败，未提交| rollback
  verify -->|验证通过| activate
  verify -->|提交后验证失败| recovery

  classDef transactionBoundary stroke-width:2px,stroke-dasharray:5 4
  class transaction transactionBoundary
`

export default function DevDatabaseMigrationFlow() {
  const [open, setOpen] = useState(false)

  return (
    <details
      className="erp-dev-static-guidance erp-dev-database-migration-guide"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <BranchesOutlined aria-hidden="true" />
        <span>完整升级流程</span>
        <small>查看事务边界与失败处理</small>
      </summary>
      {open ? (
        <div className="erp-dev-database-migration-guide__content">
          <figure className="erp-dev-database-migration-guide__diagram">
            <figcaption>
              虚线框标出原库数据库事务的边界。此图说明执行顺序，实际进展以上方状态条与操作记录为准；无待执行迁移时跳过事务节点。
            </figcaption>
            <MermaidDiagram
              chart={UPGRADE_FLOW}
              label="数据库完整升级流程图"
              showSourceOnError={false}
              flowchartHtmlLabels={false}
            />
          </figure>
          <div className="erp-dev-database-migration-guide__notes">
            <p>
              <strong>提交前失败：</strong>
              未执行迁移时原库不变；事务内失败会回滚本次事务，核实后才恢复与原库匹配的日常版本。
            </p>
            <p>
              <strong>提交后验证失败：</strong>
              已提交的迁移不能再用 ROLLBACK
              撤销。先修复已验证版本的启动；确需退回时，按成套恢复方案处理数据库、附件、配置和程序版本。
            </p>
            <p>
              <strong>提交结果不明：</strong>
              保持相关写入暂停，先只读核对迁移记录和实际状态，不自动重试，也不假定已经回滚。
            </p>
          </div>
        </div>
      ) : null}
    </details>
  )
}
