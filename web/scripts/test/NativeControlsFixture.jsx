import React, { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, theme } from 'antd'
import MobileTaskListOptions from '../../src/erp/mobile/components/MobileTaskListOptions.jsx'
import { BusinessPageHelpTrigger } from '../../src/erp/components/help/BusinessContextHelp.jsx'
import WorkflowTaskImagePreview from '../../src/erp/components/workflow/WorkflowTaskImagePreview.jsx'
import 'antd/dist/reset.css'
import '../../src/tailwind.css'
import '../../src/erp/styles/app.css'
import '../../src/erp/mobile/mobileRoleTasks.css'

const canvas = document.createElement('canvas')
canvas.width = 1000
canvas.height = 900
const context = canvas.getContext('2d')
context.fillStyle = '#d5e5d9'
context.fillRect(0, 0, 1000, 900)
context.fillStyle = '#748f80'
for (let y = 0; y < 900; y += 100) {
  for (let x = 0; x < 1000; x += 100) context.fillRect(x + 20, y + 20, 60, 60)
}
const image = canvas.toDataURL('image/png')

function Fixture() {
  const [dark, setDark] = useState(false)
  const [options, setOptions] = useState({ sortKey: 'newest', statusKey: '' })
  const [clicks, setClicks] = useState(0)
  const [preview, setPreview] = useState(false)
  const failOnce = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const load = useCallback(async () => {
    setAttempt((value) => value + 1)
    if (failOnce.current) {
      failOnce.current = false
      throw new Error('Isolated image retry fixture')
    }
    return image
  }, [])
  document.documentElement.dataset.erpTheme = dark ? 'dark' : 'light'
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <main
        className="erp-mobile-controls"
        style={{
          padding: 20,
          minHeight: '100dvh',
          background: dark ? '#141414' : '#f5f7f9',
          color: dark ? '#fff' : '#141414',
        }}
      >
        <h1>移动控件隔离测试</h1>
        <p>仅使用模拟内容，不发送业务请求。</p>
        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBlock: 24,
          }}
        >
          <Button onClick={() => setDark((value) => !value)}>
            {dark ? '切换浅色' : '切换深色'}
          </Button>
          <MobileTaskListOptions {...options} onChange={setOptions} />
          <BusinessPageHelpTrigger pageKey="production-progress" />
        </section>
        <section style={{ display: 'grid', gap: 16, marginBlock: 24 }}>
          <Button
            onClick={() => {
              failOnce.current = false
              setPreview(true)
              setAttempt(0)
            }}
          >
            查看模拟图片
          </Button>
          <Button
            onClick={() => {
              failOnce.current = true
              setPreview(true)
              setAttempt(0)
            }}
          >
            测试图片加载失败与重试
          </Button>
          <Button
            data-testid="backdrop-probe"
            onClick={() => setClicks((value) => value + 1)}
          >
            底层按钮点击次数：{clicks}
          </Button>
        </section>
        <output
          data-testid="native-control-state"
          style={{ display: 'block', overflowWrap: 'anywhere' }}
        >
          {JSON.stringify({ ...options, clicks, preview, attempt, dark })}
        </output>
        {preview ? (
          <WorkflowTaskImagePreview
            item={{
              name: '模拟格纹图片',
              code: 'NATIVE-QA',
              productID: 7,
              imageAttachmentID: 8801,
            }}
            thumbnail={image}
            load={load}
            onClose={() => setPreview(false)}
          />
        ) : null}
      </main>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
