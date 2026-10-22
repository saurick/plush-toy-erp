import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEV_DEVELOPMENT_RESOURCES_VIEWS,
  DEV_PROJECT_GRAPH_EXAMPLES,
  DEV_PROJECT_GRAPH_GROUPS,
  DEV_PROJECT_GRAPH_MODELS,
} from './devRelationshipPerspectives.mjs'
import { DEV_SECONDARY_NAV_ITEMS } from './devRoutes.mjs'

test('project graph catalogue distinguishes direction and hierarchy and assigns every example once', () => {
  assert.deepEqual(DEV_DEVELOPMENT_RESOURCES_VIEWS, [
    { value: 'tools', label: '工具清单' },
    { value: 'relationships', label: '项目图视角' },
  ])
  assert.deepEqual(DEV_PROJECT_GRAPH_GROUPS.map(({ label, models }) => [label, models]), [
    ['有向图', ['dag', 'cycle']], ['无向图', ['undirected']], ['层级结构', ['tree']],
  ])
  const examples = Object.values(DEV_PROJECT_GRAPH_MODELS).flatMap((model) => model.examples)
  assert.equal(new Set(examples).size, examples.length)
  assert.deepEqual(examples.toSorted(), Object.keys(DEV_PROJECT_GRAPH_EXAMPLES).toSorted())
  assert.match(DEV_PROJECT_GRAPH_MODELS.tree.definition, /DAG 的特例/u)
})

test('project graph examples keep stable nodes, valid links and bounded topology', () => {
  const routes = new Set(DEV_SECONDARY_NAV_ITEMS.map(({ route }) => route))
  for (const example of Object.values(DEV_PROJECT_GRAPH_EXAMPLES)) {
    const ids = new Set(example.nodes.map(({ id }) => id))
    assert.equal(ids.size, example.nodes.length)
    assert(example.nodes.length > 0 && example.nodes.length <= 12)
    assert(example.edges.length + Number(Boolean(example.referenceEdge)) <= 18)
    for (const node of example.nodes) {
      assert.match(node.id, /^[A-Za-z][A-Za-z0-9_]*$/u)
      assert(node.label && node.description)
    }
    for (const edge of [...example.edges, ...example.referenceEdge ? [example.referenceEdge] : []]) {
      assert(ids.has(edge.from) && ids.has(edge.to))
    }
    for (const destination of example.destinations) {
      const url = new URL(destination.route, 'https://workbench.local')
      assert(routes.has(url.pathname), destination.route)
      const path = url.searchParams.get('path')
      if (path) assert(existsSync(new URL(`../../../../${path}`, import.meta.url)), path)
    }
  }
})

test('project graph examples keep workflow, permission and evidence boundaries visible', () => {
  const description = (key) => DEV_PROJECT_GRAPH_EXAMPLES[key].nodes.map((node) => node.description).join('\n')
  assert.match(description('business'), /任务 done 不等于事实 posted/u)
  assert.match(description('access'), /后端权限与单据状态/u)
  assert.match(DEV_PROJECT_GRAPH_EXAMPLES.ci.caption, /以当前流水线为准/u)
  assert.match(DEV_PROJECT_GRAPH_EXAMPLES.delivery.caption, /不表示.*部署或验收/u)
  assert.match(DEV_PROJECT_GRAPH_EXAMPLES.association.caption, /不据此推断先后或后端授权/u)
  assert.match(DEV_PROJECT_GRAPH_EXAMPLES.integration.caption, /尚未开放.*不代表测试通过/u)
  assert.match(description('integration'), /actor 取已验证身份/u)
  assert.match(description('integration'), /request_id 不作为幂等凭据/u)
})

test('project graph design preview uses the same catalogue, examples and registered node identities', () => {
  const source = readFileSync(new URL('../../../../docs/product/ui-design/index.html', import.meta.url), 'utf8')
  const snapshot = (name) => {
    const match = source.match(new RegExp(`const ${name} = ([^\\n]+);\\n`, 'u'))
    assert(match, `设计稿缺少 ${name}`)
    return JSON.parse(match[1])
  }
  assert.deepEqual(snapshot('devProjectGraphModels'), DEV_PROJECT_GRAPH_MODELS)
  assert.deepEqual(snapshot('devProjectGraphExamples'), DEV_PROJECT_GRAPH_EXAMPLES)
  assert.deepEqual(snapshot('devProjectGraphGroups'), DEV_PROJECT_GRAPH_GROUPS)
  const positions = snapshot('devProjectGraphPositions')
  for (const [key, example] of Object.entries(DEV_PROJECT_GRAPH_EXAMPLES)) {
    assert.deepEqual(Object.keys(positions[key]).toSorted(), example.nodes.map(({ id }) => id).toSorted())
    assert(Object.values(positions[key]).every((point) => point.length === 4 && point.every((coordinate) => coordinate >= 0 && coordinate <= 1)))
  }
  assert.match(source, /aria-label="图模型分类"/u)
  assert.match(source, /data-dev-project-example/u)
  assert.match(source, /data-action="dev-project-graph-node"/u)
  assert.match(source, /\.dev-project-models \{ display:grid; grid-template-columns:200px minmax\(0,1fr\)/u)
})
