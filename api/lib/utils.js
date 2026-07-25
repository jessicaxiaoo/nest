export const MODEL = 'claude-sonnet-4-6'
export const TIMEOUT_MS = 60_000

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

export function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()

  function parseWithRepair(json) {
    try {
      return JSON.parse(json)
    } catch (firstErr) {
      let repaired = json
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/,\s*([}\]])/g, '$1')

      try {
        return JSON.parse(repaired)
      } catch {
        const error = new Error(
          firstErr instanceof Error ? firstErr.message : 'Invalid JSON response from AI',
        )
        error.code = 'PARSE_ERROR'
        throw error
      }
    }
  }

  try {
    return parseWithRepair(cleaned)
  } catch (err) {
    if (err.code === 'PARSE_ERROR') throw err

    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return parseWithRepair(cleaned.slice(start, end + 1))
      } catch (innerErr) {
        const error = new Error(
          innerErr instanceof Error ? innerErr.message : 'Invalid JSON response from AI',
        )
        error.code = 'PARSE_ERROR'
        throw error
      }
    }

    const error = new Error('Invalid JSON response from AI')
    error.code = 'PARSE_ERROR'
    throw error
  }
}

export async function callClaudeWithTool({
  system,
  content,
  tool,
  maxTokens = 8192,
  temperature,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const payload = {
      model: MODEL,
      max_tokens: maxTokens,
      system,
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
  return JSON.parse(Buffer.concat(chunks).toString())
}

export async function callClaude({ system, content, maxTokens = 4096 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error (${response.status}): ${err}`)
    }

    const result = await response.json()
    const text = result.content?.find((block) => block.type === 'text')?.text
    if (!text) throw new Error('No response from Claude')
    return text
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
