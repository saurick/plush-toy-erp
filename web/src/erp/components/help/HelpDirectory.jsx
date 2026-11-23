import React, { useId, useState } from 'react'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import useDirectoryExpansion from '@/common/components/navigation/useDirectoryExpansion.js'
import { helpScenarioTitle } from '../../config/helpManualCatalog.mjs'

function HelpDirectory({ label, title, actions, entries, groups, currentKey, onChange }) {
  const prefix = useId()
  const expansion = useDirectoryExpansion(groups.map(({ title }) => title))
  const [previousKey, setPreviousKey] = useState(currentKey)
  const activeGroup = groups.find(({ entries }) => entries.some(({ key }) => key === currentKey))
  if (previousKey !== currentKey) {
    setPreviousKey(currentKey)
    if (activeGroup && !expansion.isExpanded(activeGroup.title)) expansion.expand(activeGroup.title)
  }

  const renderEntry = ({ key, title, onSelect }) => (
    <DirectoryItem key={key} aria-current={currentKey === key ? 'page' : undefined} onClick={onSelect || (() => onChange(key))}>
      <span>{title}</span>
    </DirectoryItem>
  )

  return (
    <Directory
      aria-label={label}
      title={<h2>{title}</h2>}
      headerClassName="erp-help-directory-heading"
      actions={actions}
      allExpanded={expansion.allExpanded}
      onToggleAll={groups.length ? expansion.toggleAll : undefined}
      className="erp-directory-list"
    >
      {entries.map(renderEntry)}
      {groups.map((group, index) => {
        const expanded = expansion.isExpanded(group.title)
        const branchId = `${prefix}-${index}`
        return (
          <div key={group.title}>
            <DirectoryItem
              expanded={expanded}
              aria-controls={branchId}
              aria-current={!expanded && group === activeGroup ? 'location' : undefined}
              onClick={() => expansion.toggle(group.title)}
            >
              <span>{group.title}</span>
            </DirectoryItem>
            <DirectoryBranch id={branchId} hidden={!expanded}>{group.entries.map(renderEntry)}</DirectoryBranch>
          </div>
        )
      })}
    </Directory>
  )
}

export function HelpGuideDirectory({ sections, selectedScenario, home, onHome, onChange, ...props }) {
  return (
    <HelpDirectory
      {...props}
      label="办事场景"
      groups={sections.map(({ title, scenarios }) => ({
        title,
        entries: scenarios.map((scenario) => ({ key: scenario.key, title: helpScenarioTitle(scenario) })),
      }))}
      entries={[{ key: 'home', title: '按岗位推荐', onSelect: onHome }]}
      currentKey={home ? 'home' : selectedScenario?.key}
      onChange={onChange}
    />
  )
}

export function HelpManualDirectory({ chapters, selectedReference, onChange, grouped, ...props }) {
  const groups = new Map()
  const entries = chapters.map((chapter) => {
    const entry = { key: chapter.id, title: chapter.kind === 'page' ? chapter.page.title : chapter.title }
    if (grouped) {
      const title = chapter.sectionTitle || chapter.page.sectionTitle
      if (!groups.has(title)) groups.set(title, { title, entries: [] })
      groups.get(title).entries.push(entry)
    }
    return entry
  })
  const currentKey = entries.find(({ key }) => key === selectedReference?.id || key === selectedReference?.page?.key)?.key

  return (
    <HelpDirectory
      {...props}
      label="参考目录"
      entries={grouped ? [] : entries}
      groups={[...groups.values()]}
      currentKey={currentKey}
      onChange={onChange}
    />
  )
}
