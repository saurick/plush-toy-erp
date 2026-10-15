import React, { useMemo, useRef, useState } from 'react'
import { RightOutlined } from '@ant-design/icons'
import { Empty } from 'antd'
import SearchInput from '@/common/components/SearchInput'
import BusinessModal from './business-list/BusinessModal.jsx'
import '../styles/app/module-catalog.css'

export default function ModuleCatalogModal({
  open,
  sections,
  currentPath,
  onClose,
  onNavigate,
}) {
  const [query, setQuery] = useState('')
  const contentRef = useRef(null)
  const filteredSections = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${section.title} ${item.label}`.toLocaleLowerCase().includes(keyword)
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [query, sections])

  return (
    <BusinessModal
      title="全部模块"
      open={open}
      onCancel={onClose}
      footer={null}
      className="erp-module-catalog"
      destroyOnHidden
      afterClose={() => setQuery('')}
      afterOpenChange={(isOpen) => {
        if (isOpen) contentRef.current?.querySelector('input')?.focus()
      }}
    >
      <div className="erp-module-catalog__content" ref={contentRef}>
        <SearchInput
          autoFocus
          allowClear
          placeholder="搜索功能或分组"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="erp-module-catalog__results">
          {filteredSections.length > 0 ? (
            filteredSections.map((section) => (
              <section key={section.key || section.title}>
                <h3 className="erp-module-catalog__group-title">
                  {section.title}
                </h3>
                <div className="erp-module-catalog__grid">
                  {section.items.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className="erp-module-catalog__entry"
                      aria-label={item.label}
                      aria-current={
                        item.path === currentPath ? 'page' : undefined
                      }
                      onClick={() => onNavigate(item.path)}
                    >
                      <span>{item.label}</span>
                      {item.path === currentPath ? (
                        <small>当前页</small>
                      ) : (
                        <RightOutlined aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                query.trim()
                  ? '没有匹配的功能，请换个关键词'
                  : '当前账号暂无可用功能'
              }
            />
          )}
        </div>
      </div>
    </BusinessModal>
  )
}
