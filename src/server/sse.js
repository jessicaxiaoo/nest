/**
 * Minimal server-sent events writer over a Node/Vercel response.
 * Writes stop silently once the client disconnects so a closed browser tab
 * cannot turn into an unhandled stream error mid-run.
 */
export function createSseStream(req, res) {
  let closed = false

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // Tell any intermediate proxy not to buffer, which would defeat streaming.
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  req.on?.('close', () => {
    closed = true
  })

  return {
    get closed() {
      return closed
    },
    emit(event, data) {
      if (closed || res.writableEnded) return
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch {
        closed = true
      }
    },
    close() {
      if (closed || res.writableEnded) return
      try {
        res.end()
      } catch {
        closed = true
      }
    },
  }
}

export function wantsEventStream(req) {
  return Boolean(req.headers?.accept?.includes('text/event-stream'))
}
