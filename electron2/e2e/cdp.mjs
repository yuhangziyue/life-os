// 极简 CDP 驱动：连 Electron 渲染进程，做真实点击 / 取截图 / 收控制台错误
import WebSocket from 'ws'
import fs from 'node:fs'

const PORT = process.env.CDP_PORT || 9333

export async function attach({ urlMatch = process.env.CDP_URL_MATCH || 'localhost:5173' } = {}) {
  // 必须用 127.0.0.1：Node 18 的 fetch 会把 localhost 解析成 ::1，而 CDP 只监听 IPv4
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const target = list.find(t => t.type === 'page' && t.url.includes(urlMatch))
  if (!target) throw new Error(`未找到目标页面，现有: ${list.map(t => t.url).join(', ')}`)

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 })
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })

  let id = 0
  const pending = new Map()
  const consoleLogs = []
  const pageErrors = []

  ws.on('message', raw => {
    const msg = JSON.parse(raw)
    if (msg.id != null) {
      const p = pending.get(msg.id); pending.delete(msg.id)
      if (!p) return
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result)
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map(a => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ')
      consoleLogs.push({ type: msg.params.type, text })
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      pageErrors.push(d.exception?.description || d.text)
    }
  })

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error(`CDP 超时: ${method}`)) } }, 20000)
  })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('DOM.enable')

  const api = {
    send, consoleLogs, pageErrors,
    async eval(expr) {
      const r = await send('Runtime.evaluate', {
        expression: `(async()=>{${expr}})()`,
        awaitPromise: true, returnByValue: true,
      })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    },
    async shot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path, Buffer.from(r.data, 'base64'))
      return path
    },
    async close() { ws.close() },
  }
  return api
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))
