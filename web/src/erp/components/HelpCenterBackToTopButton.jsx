import React, { useEffect, useState } from 'react'
import { VerticalAlignTopOutlined } from '@ant-design/icons'
import { Button } from 'antd'

const readScrollTop = (target) => {
  if (target === window) {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    )
  }

  return target.scrollTop || 0
}

const resolveScrollTarget = (containerSelector) => {
  if (typeof document === 'undefined') {
    return window
  }

  const container = document.querySelector(containerSelector)
  return container instanceof HTMLElement ? container : window
}

const scrollToTop = (target) => {
  if (typeof target.scrollTo === 'function') {
    target.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  if (target === window) {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    return
  }

  target.scrollTop = 0
}

export default function HelpCenterBackToTopButton({
  containerSelector = '.erp-admin-content',
  threshold = 600,
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = resolveScrollTarget(containerSelector)
    const syncVisible = () => {
      setVisible(readScrollTop(target) > threshold)
    }

    syncVisible()
    target.addEventListener('scroll', syncVisible, { passive: true })

    return () => {
      target.removeEventListener('scroll', syncVisible)
    }
  }, [containerSelector, threshold])

  if (!visible) {
    return null
  }

  return (
    <Button
      className="erp-help-doc-backtop"
      icon={<VerticalAlignTopOutlined />}
      onClick={() => scrollToTop(resolveScrollTarget(containerSelector))}
      shape="round"
      size="large"
    >
      回顶部
    </Button>
  )
}
