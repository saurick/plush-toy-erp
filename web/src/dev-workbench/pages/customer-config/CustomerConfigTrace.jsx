import { Typography } from 'antd'

const { Text } = Typography
const manifestFile = 'customer-config-runtime-manifest.json'

const artifactLabels = Object.freeze({
  manifest: '发布 JSON',
  evidence: '发布 JSON · 仅评审',
  frontend: '前端部署 JS',
  source: '不进入发布清单',
})

export function CustomerConfigTrace({ sourcePath, fieldPath, trace, declaration }) {
  const artifactFile = trace.kind === 'frontend' ? 'customer-config.js' : manifestFile
  return (
    <section className="erp-dev-customer-trace" aria-label="配置来源与使用位置">
      <dl>
        <div>
          <dt>源码声明</dt>
          <dd>
            {trace.generated ? '由编译器生成，无手填字段' : (
              <><code>{sourcePath}</code><br /><code>{fieldPath}</code></>
            )}
          </dd>
        </div>
        <div>
          <dt>产物位置</dt>
          <dd>
            <Text strong>{artifactLabels[trace.kind]}</Text>
            {trace.path ? <><br /><code>{artifactFile}</code><br /><code>{trace.path}</code></> : null}
          </dd>
        </div>
        <div>
          <dt>谁读取</dt>
          <dd>{trace.use}</dd>
        </div>
      </dl>
      {declaration !== undefined ? (
        <div>
          <Text type="secondary">当前声明片段（以 JSON 展示）</Text>
          <pre><code>{JSON.stringify(declaration, null, 2)}</code></pre>
        </div>
      ) : null}
    </section>
  )
}
