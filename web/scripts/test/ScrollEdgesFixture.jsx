import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, Drawer, Input, Modal, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import ScrollEdges from '../../src/common/components/scroll/ScrollEdges'
import HorizontalScroll from '../../src/common/components/scroll/HorizontalScroll'
import AppTable from '../../src/common/components/table/AppTable'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'

const dark = new URLSearchParams(location.search).get('theme') === 'dark'
document.documentElement.dataset.erpTheme = dark ? 'dark' : 'light'
const scrollStyle = {
  width: 700,
  height: 200,
  overflow: 'auto',
  maxWidth: '100%',
  background: 'var(--erp-surface-bg)',
}
const rows = Array.from({ length: 25 }, (_, i) => ({
  key: i,
  no: `DEMO-${i}`,
  name: '滚动验证模拟产品',
  quantity: i * 120,
  remark: '用于检查长文本、数字、固定列与滚动边缘的模拟内容。'.repeat(2),
}))
const columns = [
  { title: '产品编号', dataIndex: 'no', fixed: 'left', width: 140 },
  { title: '产品名称', dataIndex: 'name', width: 230 },
  { title: '数量', dataIndex: 'quantity', width: 160, align: 'right' },
  { title: '备注', dataIndex: 'remark', width: 500 },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 100,
    render: () => <Button>查看</Button>,
  },
]

function Fixture() {
  const [active, setActive] = useState(true)
  const [wide, setWide] = useState(false)
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      {active && <ScrollEdges />}
      <main
        style={{
          padding: 16,
          display: 'grid',
          gridAutoRows: 'max-content',
          alignContent: 'start',
          gap: 20,
          color: 'var(--erp-text)',
          height: '100dvh',
          overflow: 'auto',
          background: 'var(--erp-page-bg)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => setActive(!active)}>开关滚动增强</Button>
          <Button onClick={() => setWide(!wide)}>切换内容宽度</Button>
          <Button onClick={() => setModal(true)}>打开弹窗</Button>
          <Button onClick={() => setDrawer(true)}>打开抽屉</Button>
        </div>
        <section id="fixture-table" style={{ width: 820, maxWidth: '100%' }}>
          <AppTable
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1130, y: 210 }}
          />
        </section>
        <HorizontalScroll
          id="fixture-filters"
          style={{ maxWidth: 310, display: 'flex', gap: 8 }}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <Button key={i}>待处理筛选 {i + 1}</Button>
          ))}
        </HorizontalScroll>
        <div id="fixture-dynamic" style={scrollStyle}>
          <div
            style={{ width: wide ? 1800 : '100%', minHeight: wide ? 450 : 40 }}
          >
            内容按实际尺寸决定是否提示
          </div>
        </div>
        <div
          style={{
            transform: 'translateX(8px) scale(.92)',
            transformOrigin: 'top left',
            overflow: 'hidden',
          }}
        >
          <div id="fixture-transformed" style={{ ...scrollStyle, width: 700 }}>
            <div style={{ width: 1300, height: 500 }}>
              带位移和缩放的滚动容器
            </div>
          </div>
        </div>
        <div id="fixture-rtl" dir="rtl" style={scrollStyle}>
          <div style={{ width: 1800, height: 400 }}>双向布局</div>
        </div>
        <div id="fixture-excluded" data-scroll-edges="off" style={scrollStyle}>
          <div style={{ width: 1800, height: 450 }}>细节预览保持清楚</div>
        </div>
        <Input.TextArea
          aria-label="多行编辑"
          style={scrollStyle}
          defaultValue={'可编辑文字\n'.repeat(30)}
        />
      </main>
      <Modal
        open={modal}
        title="滚动弹窗"
        onCancel={() => setModal(false)}
        onOk={() => setModal(false)}
      >
        <div id="fixture-modal-scroll" style={scrollStyle}>
          <div style={{ width: 1000, height: 800 }}>弹窗正文</div>
        </div>
      </Modal>
      <Drawer open={drawer} title="滚动抽屉" onClose={() => setDrawer(false)}>
        <div style={{ minHeight: 1600 }}>抽屉正文</div>
      </Drawer>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Fixture />
  </StrictMode>
)
