# 前端依赖补丁

补丁由 `package.json` 的 `pnpm.patchedDependencies` 和 `pnpm-lock.yaml` 绑定，安装与镜像构建使用同一份文件。修改后运行对应测试及真实页面回归；升级依赖时先确认补丁是否仍适用。

| 依赖 | 修正范围 | 依据与验证 | 退出条件 |
| --- | --- | --- | --- |
| `rc-resize-observer@1.4.3` | render prop 已提供显式 DOM ref，暂未挂载或移除后返回空节点，避免向隐式包装器调用弃用的 `ReactDOM.findDOMNode`；ESM / CJS 同步 | [上游实现](https://github.com/react-component/resize-observer/blob/v1.4.3/src/SingleObserver/index.tsx)、[`resizeObserverRef.test.mjs`](../src/common/components/select/resizeObserverRef.test.mjs)、开发模式 `business-split-overlays-light` 严格控制台回归 | 上游版本正确处理空的显式 ref 后，删除补丁与登记，重新安装并复验 |
| `antd@5.29.3` | Splitter 的 lazy 预览按逻辑面板尺寸计算边界，反向排列时先转换指针方向、再转换回物理偏移；ESM / CJS 及内部类型同步 | [上游预览计算](https://github.com/ant-design/ant-design/blob/5.29.3/components/splitter/SplitBar.tsx)、[`BusinessSplitWorkspace.test.mjs`](../src/erp/components/BusinessSplitWorkspace.test.mjs)、`business-split-layout` 的双向边界与 `business-split-performance` 的前后采样 | 上游正确处理 RTL lazy 边界后删除补丁登记，重新安装并复验普通、反向和竖排分隔器 |

观察器补丁保留普通 React child 的既有节点解析方式，不更改尺寸计算、监听、批处理、弹层动效或业务选择器行为。
