/** Vision + multi-image judgment (piece check, alternatives). */
const MODEL = 'claude-sonnet-4-6'
/** Text / structured tasks (room analysis, recommendations). ~3× cheaper input than Sonnet. */
export const MODEL_TEXT = 'claude-haiku-4-5'
const TIMEOUT_MS = 60_000

export function parsePhotoData(photo) {
  if (!photo || typeof photo !== 'string') {
    throw new Error('Invalid photo format')
  }

  const match = photo.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/)
  if (!match) throw new Error('Invalid photo format')

  let mediaType = match[1].toLowerCase()
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg'

  const data = match[2].replace(/\s/g, '')
  if (!data || data.length < 100) {
    throw new Error('Corrupted photo data')
  }

  return { mediaType, data }
}

export async function callClaudeWithTool({
  system,
  content,
  tool,
  maxTokens = 8192,
  temperature,
  timeoutMs = TIMEOUT_MS,
  model = MODEL,
  cacheSystem = false,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const systemPayload =
      cacheSystem && typeof system === 'string'
        ? [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ]
        : system

    const payload = {
      model,
      max_tokens: maxTokens,
      system: systemPayload,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }],
    }
    if (typeof temperature === 'number') {
      payload.temperature = temperature
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error (${response.status}): ${err}`)
    }

    const result = await response.json()
    const toolUse = result.content?.find(
      (block) => block.type === 'tool_use' && block.name === tool.name,
    )
    if (!toolUse?.input) throw new Error('No tool response from Claude')
    return toolUse.input
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('Request timed out')
      error.code = 'TIMEOUT'
      throw error
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString().trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const err = new Error('Invalid JSON body')
    err.code = 'PARSE_ERROR'
    throw err
  }
}

export function apiErrorResponse(errorType = 'api_error') {
  return {
    status: 500,
    body: {
      success: false,
      errorType,
      message: 'Something went wrong on our end — try again in a moment.',
    },
  }
}
