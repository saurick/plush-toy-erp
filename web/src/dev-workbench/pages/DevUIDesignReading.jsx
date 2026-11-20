import React from 'react'
import DevUIDesignDocument from '../components/DevUIDesignDocument.jsx'
import specification from '../../../../docs/product/ui-design/交互设计说明.md?raw'
import rationale from '../../../../docs/product/ui-design/设计依据.md?raw'

export default function DevUIDesignReading({ view }) {
  return (
    <DevUIDesignDocument
      view={view}
      specification={specification}
      source={view === 'specification' ? specification : rationale}
    />
  )
}
