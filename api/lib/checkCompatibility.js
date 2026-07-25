import {
  apiErrorResponse,
  callClaudeWithTool,
  parsePhotoData,
} from './utils.js'

const COMPATIBILITY_TOOL = {
  name: 'submit_compatibility',
  description: 'Submit the structured compatibility assessment for the furniture piece',
  input_schema: {
    type: 'object',
    properties: {
      confident: { type: 'boolean' },
      uncertaintyMessage: {
        type: 'string',
        description: 'Required if confident is false — explain what you could not assess',
      },
      pieceDescription: {
        type: 'string',
        description:
          'Short title for the piece — max 6 words (e.g. "blush lounge chair" or "oak side table"). Category first, then 1–2 traits. No long product copy.',
      },
      style: {
        type: 'object',
        properties: {
          signal: {
            type: 'string',
            enum: ['compatible', 'minor_concern', 'clashes'],
          },
          reasoning: { type: 'string' },
        },
        required: ['signal', 'reasoning'],
      },
      scale: {
        type: 'object',
        properties: {
          signal: {
            type: 'string',
            enum: ['appropriate', 'might_be_too_large', 'wrong_size'],
          },
          reasoning: { type: 'string' },
        },
        required: ['signal', 'reasoning'],
      },
      color: {
        type: 'object',
        properties: {
          signal: {
            type: 'string',
            enum: ['harmonious', 'neutral', 'clashes'],
          },
          reasoning: { type: 'string' },
        },
        required: ['signal', 'reasoning'],
      },
      budget: {
        type: 'object',
        properties: {
          signal: {
            type: 'string',
            enum: ['fits', 'stretch', 'over_budget', 'unknown'],
          },
          reasoning: { type: 'string' },
        },
        required: ['signal', 'reasoning'],
      },
      overallVerdict: {
        type: 'string',
        description: '2-3 warm sentences summarizing the compatibility assessment',
      },
      alternativeSuggestion: {
        type: 'string',
        description:
          'If any axis is concerning, describe what characteristics to look for instead. No product names or links. Omit or leave empty when the piece works well.',
      },
    },
    required: [
      'confident',
      'pieceDescription',
      'style',
      'scale',
      'color',
      'budget',
      'overallVerdict',
    ],
  },
}

const SYSTEM_PROMPT = `You are a warm, approachable interior design advisor helping someone decide whether a furniture piece will work in their room — not a stiff professional report.

You will receive a piece photo, optional room photo, and a structured room context (analysis, style direction, dimensions, plan gaps). Ground every judgment in that context, then call submit_compatibility.

Tone:
- Speak directly to them as "you" / "your" — never "the user", "the homeowner", or "they".
- Sound friendly and encouraging, like a helpful roommate with good taste.
- Keep reasoning to one short sentence per axis; warmth comes from voice, not word count.

Rules:
- Prefer the structured room analysis and style thesis over inventing new facts from the room photo. Use the room photo only to verify visual details (color, finish, how busy the space looks).
- Account for existingPieces — do not ignore furniture they already own when judging style, scale, and color.
- If planGaps are provided, note whether this piece fills a real gap or duplicates something they already planned for.
- pieceDescription must be at most 6 words — a short title like "blush lounge chair", not a full product description.
- Budget axis: when a piece price is provided, compare it to the room's total budget and any matching planGaps budget ranges. Use "fits" if it leaves room for other priorities, "stretch" if it's a big slice but still plausible, "over_budget" if it crowds out the rest of the plan or exceeds the room budget. When no piece price is given, set budget.signal to "unknown" and say they can add a price for a budget check.
- Never name specific products or brands. No purchase links.
- Use room dimensions in scale reasoning when they are provided.
- If you cannot make a confident assessment, set confident to false rather than fabricating a verdict.
- alternativeSuggestion should be descriptive only (e.g. "look for a neutral-toned sectional under 90 inches with clean lines"). Set it to null when style, scale, color, and budget are all fine (budget unknown does not require an alternative).
- Use ASCII quotes only in all string fields.`

const STYLE_SIGNALS = new Set(['compatible', 'minor_concern', 'clashes'])
const SCALE_SIGNALS = new Set([
  'appropriate',
  'might_be_too_large',
  'wrong_size',
])
const COLOR_SIGNALS = new Set(['harmonious', 'neutral', 'clashes'])
const BUDGET_SIGNALS = new Set(['fits', 'stretch', 'over_budget', 'unknown'])

function formatDimensions(dimensions) {
  if (!dimensions?.length || !dimensions?.width) {
    return 'Room dimensions: not provided — assess scale based on visual proportions.'
  }
  const source = dimensions.source === 'user' ? 'user-corrected' : 'AI-estimated'
  return `Room dimensions (${source}): ${dimensions.length} ft × ${dimensions.width} ft`
}

function formatPiecePrice(piecePrice) {
  if (piecePrice == null || !(Number(piecePrice) > 0)) {
    return 'Piece price: not provided — set budget.signal to "unknown".'
  }
  return `Piece price (user-entered): $${Number(piecePrice)}`
}

function normalizeAxis(axis, allowed, fallbackSignal) {
  if (!axis || typeof axis !== 'object') {
    return { signal: fallbackSignal, reasoning: '' }
  }
  return {
    signal: allowed.has(axis.signal) ? axis.signal : fallbackSignal,
    reasoning: typeof axis.reasoning === 'string' ? axis.reasoning : '',
  }
}

function needsAlternative(style, scale, color, budget) {
  return (
    style.signal !== 'compatible' ||
    scale.signal !== 'appropriate' ||
    color.signal !== 'harmonious' ||
    budget.signal === 'over_budget' ||
    budget.signal === 'stretch'
  )
}

const MAX_PIECE_DESCRIPTION_WORDS = 6

function normalizePieceDescription(value) {
  const words = String(value ?? 'Furniture piece')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'Furniture piece'
  return words.slice(0, MAX_PIECE_DESCRIPTION_WORDS).join(' ')
}

function normalizeVerdict(parsed, { piecePrice } = {}) {
  const style = normalizeAxis(parsed.style, STYLE_SIGNALS, 'minor_concern')
  const scale = normalizeAxis(parsed.scale, SCALE_SIGNALS, 'might_be_too_large')
  const color = normalizeAxis(parsed.color, COLOR_SIGNALS, 'neutral')
  const hasPrice = piecePrice != null && Number(piecePrice) > 0
  const budget = normalizeAxis(
    parsed.budget,
    BUDGET_SIGNALS,
    hasPrice ? 'stretch' : 'unknown',
  )
  if (!hasPrice) {
    budget.signal = 'unknown'
    if (!budget.reasoning) {
      budget.reasoning =
        'Add a price to see how this piece fits your room budget.'
    }
  }

  let alternativeSuggestion = parsed.alternativeSuggestion ?? null
  if (typeof alternativeSuggestion === 'string') {
    alternativeSuggestion = alternativeSuggestion.trim() || null
  } else {
    alternativeSuggestion = null
  }
  if (!needsAlternative(style, scale, color, budget)) {
    alternativeSuggestion = null
  }

  return {
    pieceDescription: normalizePieceDescription(parsed.pieceDescription),
    style,
    scale,
    color,
    budget,
    piecePrice: hasPrice ? Number(piecePrice) : null,
    overallVerdict: parsed.overallVerdict ?? '',
    alternativeSuggestion,
  }
}

function buildRoomContext({ room }) {
  const latestPlan = room.plans?.[0]
  const roomAnalysis =
    room.roomAnalysis ?? latestPlan?.roomAnalysis ?? null
  const styleThesis = room.styleThesis ?? latestPlan?.styleThesis ?? null

  let planGaps = []
  if (Array.isArray(room.planGaps) && room.planGaps.length > 0) {
    planGaps = room.planGaps
  } else if (Array.isArray(latestPlan?.items)) {
    planGaps = latestPlan.items.slice(0, 8).map((item) => ({
      category: item.category,
      priority: item.priority,
      styleName: item.styleName ?? null,
      budgetMin: item.budgetMin ?? null,
      budgetMax: item.budgetMax ?? null,
    }))
  }

  return {
    roomAnalysis,
    styleThesis,
    planGaps,
    dimensions: room.dimensions ?? latestPlan?.dimensions ?? null,
  }
}

export async function checkCompatibility({ room, piecePhoto, piecePrice }) {
  let roomPhoto
  let piece

  try {
    piece = parsePhotoData(piecePhoto)
  } catch {
    return {
      success: false,
      errorType: 'photo_quality',
      message:
        'The piece photo could not be processed. Try uploading a clearer image.',
    }
  }

  if (room.photo) {
    try {
      roomPhoto = parsePhotoData(room.photo)
    } catch {
      roomPhoto = null
    }
  }

  const context = buildRoomContext({ room })
  const hasAnalysis = Boolean(context.roomAnalysis)
  const normalizedPrice =
    piecePrice != null && Number(piecePrice) > 0 ? Number(piecePrice) : null

  const userPrompt = `Room name: ${room.name}
Style preferences: ${room.style}
Total room budget: $${room.budget}
${formatPiecePrice(normalizedPrice)}
${formatDimensions(context.dimensions)}

Room context (ground your assessment in this — do not invent facts not listed here):
${JSON.stringify(
  {
    roomAnalysis: context.roomAnalysis,
    styleThesis: context.styleThesis,
    planGaps: context.planGaps,
  },
  null,
  2,
)}

${hasAnalysis ? 'A structured room analysis is provided above.' : 'No structured room analysis was available — rely more carefully on the room photo if present.'}
${roomPhoto ? 'First image is the room. Second image is the furniture piece to evaluate.' : 'The image is the furniture piece to evaluate against the room context above.'}
Assess whether this piece works in this room — including budget fit when a piece price is provided.`

  const content = []
  if (roomPhoto) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: roomPhoto.mediaType,
        data: roomPhoto.data,
      },
    })
  }
  content.push(
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: piece.mediaType,
        data: piece.data,
      },
    },
    { type: 'text', text: userPrompt },
  )

  try {
    const parsed = await callClaudeWithTool({
      system: SYSTEM_PROMPT,
      tool: COMPATIBILITY_TOOL,
      maxTokens: 2048,
      temperature: 0.3,
      content,
    })

    if (!parsed.confident) {
      return {
        success: false,
        errorType: 'low_confidence',
        message:
          parsed.uncertaintyMessage ||
          "We couldn't make a confident assessment from these images. Try a clearer photo of the piece.",
      }
    }

    return {
      success: true,
      verdict: normalizeVerdict(parsed, { piecePrice: normalizedPrice }),
    }
  } catch (err) {
    if (err.code === 'TIMEOUT') {
      return {
        success: false,
        errorType: 'timeout',
        message: 'Something went wrong on our end — try again in a moment.',
      }
    }
    if (err.message?.includes('Claude API error') || err.message?.includes('ANTHROPIC_API_KEY')) {
      console.error('[checkCompatibility]', err.message)
      return {
        success: false,
        errorType: 'api_error',
        message: 'Something went wrong on our end — try again in a moment.',
      }
    }
    console.error('[checkCompatibility]', err)
    throw err
  }
}

export async function handleCheckCompatibilityRequest(body) {
  const { room, piecePhoto, piecePrice } = body

  const hasRoomContext =
    Boolean(room?.photo) ||
    Boolean(room?.roomAnalysis) ||
    Boolean(room?.plans?.[0]?.roomAnalysis)

  if (!piecePhoto || !hasRoomContext) {
    return {
      status: 400,
      body: {
        success: false,
        errorType: 'validation',
        message: 'Room photo (or analysis) and piece photo are required',
      },
    }
  }

  try {
    const result = await checkCompatibility({ room, piecePhoto, piecePrice })
    return { status: result.success ? 200 : 422, body: result }
  } catch {
    return apiErrorResponse()
  }
}
