import {
  handleFindAlternativesRequest,
  streamFindAlternativesRequest,
} from './lib/findAlternatives.js'
import { createSseStream, wantsEventStream } from './lib/sse.js'
import { readJsonBody } from './lib/utils.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body ?? (await readJsonBody(req))

    if (wantsEventStream(req)) {
      const stream = createSseStream(req, res)
      await streamFindAlternativesRequest(body, (event, data) =>
        stream.emit(event, data),
      )
      return stream.close()
    }

    const { status, body: responseBody } =
      await handleFindAlternativesRequest(body)
    return res.status(status).json(responseBody)
  } catch {
    if (res.headersSent) return res.end()
    return res.status(500).json({
      success: false,
      errorType: 'api_error',
      message: 'Something went wrong on our end — try again in a moment.',
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 90,
}
