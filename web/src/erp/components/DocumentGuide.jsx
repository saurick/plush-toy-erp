import React from 'react'
import './documentGuide.css'

export default function DocumentGuide({ children, parts, figureRef, caption }) {
  return (
    <div className="erp-document-guide">
      <div className="erp-document-guide__body">
        <figure className="erp-document-guide__figure" ref={figureRef}>
          {children}
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
        <ol className="erp-document-guide__parts">
          {parts.map((part, index) => (
            <li key={part.title}>
              <span className="erp-document-guide__number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h4>{part.title}</h4>
                <p>{part.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
