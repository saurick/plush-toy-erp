import fs from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

export function createDevLogFile(root, port, {
  maxBytes = 10 * 1024 * 1024,
  warn = () => process.stderr.write('[start-web] 无法写入本地前端日志，终端输出继续显示\n'),
} = {}) {
  if (!/^\d{1,5}$/u.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('前端日志需要有效的监听端口')
  }
  const directory = path.join(root, 'output/dev-workbench/web-logs')
  const file = path.join(directory, `vite-${port}.log`)
  let fd, size = 0, disabled = false
  const close = () => {
    if (fd !== undefined) { fs.closeSync(fd); fd = undefined }
  }
  const fail = () => {
    disabled = true
    try { close() } catch { /* 日志故障不阻断开发服务。 */ }
    warn()
  }
  const open = () => {
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) throw new Error('日志路径不是普通文件')
    size = stat.size
  }
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    open()
  } catch { fail() }
  return {
    file,
    write(chunk) {
      if (disabled) return
      const bytes = Buffer.from(stripVTControlCharacters(String(chunk)))
      const data = bytes.subarray(Math.max(0, bytes.length - maxBytes))
      try {
        if (size + data.length > maxBytes) {
          close()
          for (const suffix of ['', '.1', '.2']) {
            const candidate = file + suffix
            if (fs.existsSync(candidate) && !fs.lstatSync(candidate).isFile()) throw new Error('日志轮转路径不是普通文件')
          }
          fs.rmSync(`${file}.2`, { force: true })
          if (fs.existsSync(`${file}.1`)) fs.renameSync(`${file}.1`, `${file}.2`)
          fs.renameSync(file, `${file}.1`)
          open()
        }
        fs.writeSync(fd, data)
        size += data.length
      } catch { fail() }
    },
    close() { disabled = true; close() },
  }
}

export function attachDevLogFile(child, root, port, { stdout = process.stdout, stderr = process.stderr, ...options } = {}) {
  const log = createDevLogFile(root, port, options)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.pipe(stdout, { end: false })
  child.stderr.pipe(stderr, { end: false })
  child.stdout.on('data', (chunk) => log.write(chunk))
  child.stderr.on('data', (chunk) => log.write(chunk))
  child.once('close', () => log.close())
  child.once('error', () => log.close())
  return log
}
