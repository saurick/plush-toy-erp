import React from 'react'
import { Button, Input, Popover, Select } from 'antd'
import {
  normalizeTaskSavedViews,
  taskSavedViewsKey,
} from '../../utils/workflowTaskSavedViews.mjs'
import { normalizeTaskDiscoveryFilters } from '../../utils/workflowTaskDiscovery.mjs'

export default function WorkflowTaskSavedViews({ profile, value, onChange }) {
  const key = taskSavedViewsKey(profile?.id)
  const [state, setState] = React.useState(null)
  const [name, setName] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    setOpen(false)
    setName('')
    setError('')
    try {
      setState({
        key,
        items: normalizeTaskSavedViews(
          JSON.parse(localStorage.getItem(key) || '[]')
        ),
      })
    } catch {
      setState({ key, items: [] })
      setError('本机无法保存常用筛选')
    }
  }, [key])
  const items = state?.key === key ? state.items : []
  const save = (next) => {
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setState({ key, items: next })
      setError('')
      setOpen(false)
      setName('')
    } catch {
      setError('常用筛选保存失败，请检查浏览器存储设置')
    }
  }
  if (!key) return null
  return (
    <div className="workflow-task-saved-views">
      <Select
        aria-label="本机常用筛选"
        placeholder="本机常用筛选"
        value={undefined}
        options={items.map((item, index) => ({
          label: item.name,
          value: index,
        }))}
        onChange={(index) =>
          onChange({
            ...value,
            moduleKey: '',
            chainKey: '',
            stageKey: '',
            assignee: '',
            ...items[index].filters,
          })
        }
      />
      <Popover
        title="保存为本机常用筛选"
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        content={
          <div className="workflow-task-saved-views__editor">
            <Input
              aria-label="常用筛选名称"
              placeholder="例如：裁片质检待办"
              maxLength={30}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="primary"
              disabled={
                !name.trim() ||
                (items.length >= 8 &&
                  !items.some((item) => item.name === name.trim()))
              }
              onClick={() =>
                save(
                  normalizeTaskSavedViews([
                    ...items.filter((item) => item.name !== name.trim()),
                    {
                      name: name.trim(),
                      filters: normalizeTaskDiscoveryFilters(value),
                    },
                  ])
                )
              }
            >
              保存筛选
            </Button>
            {items.map((item, index) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <Button
                  type="link"
                  onClick={() =>
                    save(items.filter((_, position) => position !== index))
                  }
                >
                  移除
                </Button>
              </div>
            ))}
            <small>
              仅保存当前账号在本浏览器的模块、链路、环节和办理人条件，最多 8
              项。
            </small>
          </div>
        }
      >
        <Button>保存筛选</Button>
      </Popover>
      {error ? <small role="status">{error}</small> : null}
    </div>
  )
}
