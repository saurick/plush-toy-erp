import React from 'react'

export default function HelpManualDirectory({
  chapters,
  selectedReference,
  onChange,
  grouped,
}) {
  const selectedSection =
    selectedReference?.sectionTitle || selectedReference?.page?.sectionTitle
  const chapterButton = (chapter) => (
    <button
      type="button"
      key={chapter.id}
      className="erp-help-topic"
      aria-current={
        selectedReference?.id === chapter.id ||
        selectedReference?.page?.key === chapter.id
          ? 'page'
          : undefined
      }
      onClick={() => onChange(chapter.id)}
    >
      {chapter.kind === 'page' ? chapter.page.title : chapter.title}
    </button>
  )
  return (
    <nav className="erp-help-topics" aria-label="参考目录">
      {grouped
        ? [
            ...new Set(
              chapters.map(
                (chapter) => chapter.sectionTitle || chapter.page.sectionTitle
              )
            ),
          ].map((section) => (
            <details
              key={`${section}:${selectedSection}`}
              open={section === selectedSection}
            >
              <summary>{section}</summary>
              {chapters
                .filter(
                  (chapter) =>
                    (chapter.sectionTitle || chapter.page.sectionTitle) ===
                    section
                )
                .map(chapterButton)}
            </details>
          ))
        : chapters.map(chapterButton)}
    </nav>
  )
}
