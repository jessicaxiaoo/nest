import {
  handleRecommendItemsRequest,
  readJsonBody,
} from './lib/generateRoomPlan.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body ?? (await readJsonBody(req))
    const { status, body: responseBody } = await handleRecommendItemsRequest(body)
    return res.status(status).json(responseBody)
  } catch {
    return res.status(500).json({
      success: false,
      errorType: 'api_error',
      message: 'Something went wrong on our end — try again in a moment.',
    })
  }
}
