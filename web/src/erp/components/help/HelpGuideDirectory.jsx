import React from 'react'
import { helpScenarioTitle } from '../../config/helpManualCatalog.mjs'

export default function HelpGuideDirectory({
  sections,
  selectedScenario,
  home,
  onHome,
  onChange,
}) {
  const currentSection = sections.find((section) =>
    section.scenarios.some((scenario) => scenario.key === selectedScenario?.key)
  )?.title

  return (
    <nav className="erp-help-topics" aria-label="办事场景">
      <button
        type="button"
        className="erp-help-topic"
        aria-current={home ? 'page' : undefined}
        onClick={onHome}
      >
        按岗位推荐
      </button>
      {sections.map((section) => (
        <details
          key={`${section.title}:${currentSection}`}
          open={section.title === currentSection}
        >
          <summary>{section.title}</summary>
          {section.scenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.key}
              className="erp-help-topic"
              aria-current={
                !home && scenario.key === selectedScenario?.key
                  ? 'page'
                  : undefined
              }
              onClick={() => onChange(scenario.key)}
            >
              {helpScenarioTitle(scenario)}
            </button>
          ))}
        </details>
      ))}
    </nav>
  )
}
