// 通过 Node IPC 绑定启动器寿命；即使启动器被强制结束，Vite 也会收到 disconnect。
if (process.send) {
  const close = () => {
    setTimeout(() => process.exit(1), 5000).unref()
    process.kill(process.pid, 'SIGTERM')
  }
  process.once('disconnect', close)
  process.once('SIGHUP', close)
  if (!process.connected) close()
}
