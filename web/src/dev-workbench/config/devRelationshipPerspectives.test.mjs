import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_PRODUCT_ENGINEERING_DEFAULT_VIEW,
  DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY,
  DEV_PRODUCT_ENGINEERING_VIEW,
  DEV_PRODUCT_ENGINEERING_VIEW_ITEMS,
  DEV_RELATIONSHIP_PERSPECTIVES,
  buildDevProductEngineeringSearch,
  parseDevProductEngineeringSearch,
} from './devRelationshipPerspectives.mjs'

const workbenchAreaPageSource = readFileSync(
  new URL('../pages/DevWorkbenchAreaPage.jsx', import.meta.url),
  'utf8'
)
const workflowStyles = readFileSync(
  new URL('../styles/dev-product-engineering-workflow.css', import.meta.url),
  'utf8'
)

const allowedRoutePaths = new Set([
  '/__dev/status-flows',
  '/__dev/permission-relationships',
  '/__dev/product-core',
  '/__dev/governance',
  '/__dev/docs',
  '/__dev/quality-gates',
  '/__dev/version-center',
  '/__dev/database-migration',
  '/__dev/drill-recovery',
])

test('product engineering exposes two canonical URL-backed views', () => {
  assert.equal(
    DEV_PRODUCT_ENGINEERING_DEFAULT_VIEW,
    DEV_PRODUCT_ENGINEERING_VIEW.QUESTIONS
  )
  assert.deepEqual(
    DEV_PRODUCT_ENGINEERING_VIEW_ITEMS.map(({ value, label }) => ({
      value,
      label,
    })),
    [
      { value: 'questions', label: '按问题找入口' },
      { value: 'relationships', label: '项目图视角' },
    ]
  )
  assert.deepEqual(parseDevProductEngineeringSearch(''), {
    view: 'questions',
    canonical: false,
  })
  assert.deepEqual(parseDevProductEngineeringSearch('?view=questions'), {
    view: 'questions',
    canonical: true,
  })
  assert.deepEqual(parseDevProductEngineeringSearch('?view=relationships'), {
    view: 'relationships',
    canonical: true,
  })
  assert.deepEqual(parseDevProductEngineeringSearch('?view=unknown'), {
    view: 'questions',
    canonical: false,
  })
  assert.deepEqual(
    parseDevProductEngineeringSearch(
      '?view=relationships&view=questions&legacy=1'
    ),
    { view: 'questions', canonical: false }
  )
  assert.deepEqual(
    parseDevProductEngineeringSearch('?view=relationships&legacy=1'),
    { view: 'relationships', canonical: false }
  )
  assert.equal(
    buildDevProductEngineeringSearch('relationships'),
    '?view=relationships'
  )
  assert.throws(
    () => buildDevProductEngineeringSearch('unknown'),
    /产品工程查看方式无效/u
  )
})

test('relationship perspectives classify six distinct project views', () => {
  assert.deepEqual(
    DEV_RELATIONSHIP_PERSPECTIVES.map((item) => item.key),
    [
      'business-facts',
      'state-workflow',
      'access-responsibility',
      'structure-governance',
      'quality-ci',
      'delivery-evidence',
    ]
  )
  assert.equal(
    new Set(DEV_RELATIONSHIP_PERSPECTIVES.map((item) => item.key)).size,
    DEV_RELATIONSHIP_PERSPECTIVES.length
  )

  for (const perspective of DEV_RELATIONSHIP_PERSPECTIVES) {
    assert.ok(perspective.title)
    assert.ok(perspective.shape)
    assert.ok(perspective.question)
    assert.ok(perspective.relationship)
    assert.ok(perspective.boundary)
    assert.ok(perspective.destinations.length > 0)
    assert.match(perspective.shape, /图|树|森林|DAG|链/u)

    for (const destination of perspective.destinations) {
      assert.ok(destination.label)
      assert.ok(
        allowedRoutePaths.has(destination.route.split('?')[0]),
        `unexpected relationship destination: ${destination.route}`
      )
    }
  }

  assert.equal(
    DEV_RELATIONSHIP_PERSPECTIVES.find((item) => item.key === 'state-workflow')
      ?.shape,
    '有向有环图'
  )
  assert.equal(
    DEV_RELATIONSHIP_PERSPECTIVES.find((item) => item.key === 'quality-ci')
      ?.shape,
    'DAG（有向无环图）'
  )
})

test('graph view copy explains the model with positive evidence-led wording', () => {
  const graphViewCopy = [
    ...Object.values(DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY),
    ...DEV_PRODUCT_ENGINEERING_VIEW_ITEMS.filter(
      (item) => item.value === DEV_PRODUCT_ENGINEERING_VIEW.RELATIONSHIPS
    ).flatMap((item) => [item.label, item.description]),
    ...DEV_RELATIONSHIP_PERSPECTIVES.flatMap((item) => [
      item.title,
      item.shape,
      item.question,
      item.relationship,
      item.boundary,
    ]),
  ].join('\n')

  assert.match(DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY.description, /节点/u)
  assert.match(DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY.description, /连线/u)
  assert.doesNotMatch(
    graphViewCopy,
    /不要|不要求|不能|不是|不等于|不修改|不表示|不自行|不创建|不替代/u
  )
})

test('product engineering renders two accessible read-only tab views', () => {
  assert.match(
    workbenchAreaPageSource,
    /DEV_RELATIONSHIP_PERSPECTIVES,[\s\S]*from '\.\.\/config\/devRelationshipPerspectives\.mjs'/u
  )
  assert.match(workbenchAreaPageSource, /useSearchParams/u)
  assert.match(workbenchAreaPageSource, /<DevTaskNav/u)
  assert.match(workbenchAreaPageSource, /role="tabpanel"/u)
  assert.match(
    workbenchAreaPageSource,
    /DEV_PRODUCT_ENGINEERING_VIEW\.QUESTIONS/u
  )
  assert.match(
    workbenchAreaPageSource,
    /DEV_PRODUCT_ENGINEERING_GRAPH_VIEW_COPY\.title/u
  )
  assert.match(
    workbenchAreaPageSource,
    /DEV_RELATIONSHIP_PERSPECTIVES\.map\(\(perspective\) =>/u
  )
  assert.match(
    workbenchAreaPageSource,
    /className="erp-dev-relationship-guide"/u
  )
  assert.doesNotMatch(workbenchAreaPageSource, /MermaidDiagram/u)
  assert.doesNotMatch(
    workbenchAreaPageSource,
    /<details[^>]+erp-dev-relationship/u
  )
})

test('relationship guide keeps the desktop view switcher and visible focus', () => {
  assert.match(
    workbenchAreaPageSource,
    /className="erp-dev-product-view-switcher"[\s\S]*<DevTaskNav[\s\S]*className="erp-dev-product-view-switcher__copy"/u
  )
  assert.match(workflowStyles, /\.erp-dev-product-view-switcher/u)
  assert.match(workflowStyles, /\.erp-dev-product-view-tabs\.erp-dev-task-nav/u)
  assert.match(
    workflowStyles,
    /\.erp-dev-relationship-item__link:focus-visible/u
  )
})
