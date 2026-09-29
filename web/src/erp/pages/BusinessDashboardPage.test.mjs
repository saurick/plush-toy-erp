import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const source = readFileSync(
  fileURLToPath(new URL('./BusinessDashboardPage.jsx', import.meta.url)),
  'utf8'
)
const summary = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-visualizations/BusinessProgressSummary.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const drawer = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-visualizations/BusinessProgressDrawer.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const mobileSummary = readFileSync(
  fileURLToPath(
    new URL('../mobile/components/MobileProgressSummary.jsx', import.meta.url)
  ),
  'utf8'
)
const mobilePanel = readFileSync(
  fileURLToPath(
    new URL('../mobile/components/MobileProgressPanel.jsx', import.meta.url)
  ),
  'utf8'
)
const salesDelivery = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-visualizations/SalesDeliveryProgress.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const productIdentity = readFileSync(
  fileURLToPath(
    new URL('../components/master-data/ProductIdentity.jsx', import.meta.url)
  ),
  'utf8'
)
const taskImage = readFileSync(
  fileURLToPath(
    new URL(
      '../components/workflow/WorkflowTaskProductImage.jsx',
      import.meta.url
    )
  ),
  'utf8'
)
const taskImageStyles = readFileSync(
  fileURLToPath(
    new URL('../components/workflow/workflowTaskIdentity.css', import.meta.url)
  ),
  'utf8'
)
const productIdentityStyles = readFileSync(
  fileURLToPath(
    new URL('../components/master-data/productIdentity.css', import.meta.url)
  ),
  'utf8'
)
const progressStyles = readFileSync(
  fileURLToPath(new URL('../styles/app/progress-board.css', import.meta.url)),
  'utf8'
)
const progressSummaryStyles = readFileSync(
  fileURLToPath(
    new URL(
      '../components/business-visualizations/businessProgressSummary.css',
      import.meta.url
    )
  ),
  'utf8'
)
const mobileProgressStyles = readFileSync(
  fileURLToPath(new URL('../mobile/mobileProgress.css', import.meta.url)),
  'utf8'
)
const mobileTaskStyles = readFileSync(
  fileURLToPath(new URL('../mobile/mobileRoleTasks.css', import.meta.url)),
  'utf8'
)
const materialSummaryStyles = readFileSync(
  fileURLToPath(
    new URL(
      '../components/sales-orders/EngineeringMaterialRequest.css',
      import.meta.url
    )
  ),
  'utf8'
)

test('business dashboard remains valid JSX', async () => {
  await transformWithEsbuild(source, 'BusinessDashboardPage.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
})

test('product images keep card actions separate and remain independently previewable', () => {
  assert.match(
    source,
    /<WorkflowTaskCard[\s\S]*?contentClassName="erp-progress-row-select"/u
  )
  assert.match(
    mobilePanel,
    /<WorkflowTaskCard[\s\S]*?contentClassName="mobile-progress-card-main"/u
  )
  assert.match(
    salesDelivery,
    /<WorkflowTaskCard[\s\S]*?contentClassName="erp-business-visual-list__row-content"/u
  )
  assert.doesNotMatch(
    [source, mobilePanel, salesDelivery].join('\n'),
    /preview=\{false\}/u
  )
  assert.match(
    productIdentity,
    /export function ProductThumbnail[\s\S]*?preview = true/u
  )
  assert.match(
    productIdentity,
    /renderProductOption[\s\S]*?<ProductIdentity[\s\S]*?preview=\{false\}/u
  )
  assert.match(taskImage, /aria-haspopup="dialog"/u)
  assert.match(taskImage, /onMouseDown=\{\(event\) =>/u)
  assert.match(taskImage, /closest\('\[role="option"\]'\)/u)
  assert.match(source, /erp-progress-product-count/u)
  assert.match(summary, /<ProductIdentity productId=\{row\.product_id\}/u)
  assert.match(mobileSummary, /<ProductIdentity productId=\{row\.product_id\}/u)
  assert.match(drawer, /record\.kind === 'sales_line'/u)
  assert.match(drawer, /productId=\{record\.product_id\}/u)
})

test('product image sizes remain identifiable across dense, standard, and summary contexts', () => {
  assert.match(
    taskImageStyles,
    /\.erp-task-product-image \{[\s\S]*?width: 64px;/u
  )
  assert.match(
    productIdentityStyles,
    /\.erp-product-identity \.erp-task-product-image \{[\s\S]*?width: 56px;/u
  )
  assert.match(
    productIdentityStyles,
    /\.erp-product-identity--compact \.erp-task-product-image \{[\s\S]*?width: 48px;/u
  )
  assert.match(
    progressStyles,
    /\.erp-progress-row-product-image \.erp-task-product-image \{[\s\S]*?width: 56px;/u
  )
  assert.match(
    progressSummaryStyles,
    /\.erp-progress-overview-product \.erp-task-product-image \{[\s\S]*?width: 64px;/u
  )
  assert.match(
    mobileProgressStyles,
    /\.mobile-progress-product-image \.erp-task-product-image \{[\s\S]*?width: 56px;/u
  )
  assert.match(
    mobileTaskStyles,
    /\.mobile-task-list-row__identity \.erp-task-product-image \{[\s\S]*?width: 48px;/u
  )
  assert.match(
    materialSummaryStyles,
    /\.erp-material-product \.erp-task-product-image \{[\s\S]*?width: 64px;/u
  )
})

test('mobile progress restores history details without replaying the drawer opening motion', () => {
  assert.match(
    mobilePanel,
    /const \[suppressDetailOpenMotion, setSuppressDetailOpenMotion\] = useState\(\s*Boolean\(initial\.selection\)\s*\)/u
  )
  assert.match(
    mobilePanel,
    /setSuppressDetailOpenMotion\(Boolean\(restored\.selection\)\)[\s\S]*?setSelection\(restored\.selection\)/u
  )
  assert.match(
    mobilePanel,
    /const open = \(row, section = 'lines'\) => \{[\s\S]*?setSuppressDetailOpenMotion\(false\)/u
  )
  assert.match(
    mobilePanel,
    /<BusinessProgressDrawer[\s\S]*?suppressOpenMotion=\{suppressDetailOpenMotion\}/u
  )
  assert.match(
    drawer,
    /suppressOpenMotion[\s\S]*?maskMotion: SUPPRESS_OPEN_MOTION,[\s\S]*?motion: SUPPRESS_OPEN_MOTION/u
  )
})

test('mobile progress groups business details without desktop source links', async () => {
  await transformWithEsbuild(drawer, 'BusinessProgressDrawer.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
  assert.match(
    drawer,
    /const MOBILE_GROUPS = \[[\s\S]*?产品信息[\s\S]*?生产执行[\s\S]*?关联任务/u
  )
  assert.match(drawer, /sections: \['production', 'batches', 'materials'\]/u)
  assert.match(drawer, /mobile\s*\? sectionRecords\(item\.key\)\.length > 0/u)
  assert.match(drawer, /!mobile && sourcePath && canOpen\(sourcePath\)/u)
  assert.match(drawer, /!mobile && canOpen\(path\)/u)
  assert.doesNotMatch(drawer, /mobile-progress-detail-source/u)
  assert.match(
    drawer,
    /mobile-progress-detail-group-trigger[\s\S]*?aria-expanded=\{expanded\}/u
  )
  assert.match(
    drawer,
    /sectionRecords\('tasks'\)\.length > 0[\s\S]*?查看关联任务/u
  )
  assert.match(
    mobileProgressStyles,
    /\.mobile-progress-detail-group-trigger \{[\s\S]*?min-height: 52px;/u
  )
})
