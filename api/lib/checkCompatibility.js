import {
  apiErrorResponse,
  callClaudeWithTool,
  parsePhotoData,
} from './utils.js'
import {
  axisSchema,
  budgetAxis,
  checkBudgetCeiling,
  needsAlternatives,
  normalizeAxis,
} from './verdict.js'

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
      style: axisSchema('style'),
      scale: axisSchema('scale'),
      color: axisSchema('color'),
      overallVerdict: {
        type: 'string',
        description: '2-3 warm sentences summarizing the compatibility assessment',
      },
      alternativeSuggestion: {
        type: 'string',
        description:
          'If any axis is concerning, describe what characteristics to look for instead. No product names or links. Omit or leave empty when the piece works well.',
      },
      searchQuery: {
        type: 'string',
        description:
          'If any axis is concerning, a short shopping search query for a better piece — category plus 2-3 concrete attributes, e.g. "cream boucle accent chair 28 inch". No brand names, no price, under 10 words. Omit when the piece works well.',
      },
    },
    required: [
      'confident',
      'pieceDescription',
      'style',
      'scale',
      'color',
      'overallVerdict',
    ],
  },
}

const SYSTEM_PROMPT = `You are a warm, approachable interior design advisor helping someone decide whether a furniture piece will work in their room — not a stiff professional report.

You will receive a piece photo, optional room photo, and a structured room context (analysis, style direction, dimensions, plan gaps, and pieces already on their checklist). Ground every judgment in that context, then call submit_compatibility.

Tone:
- Speak directly to them as "you" / "your" — never "the user", "the homeowner", or "they".
- Sound friendly and encouraging, like a helpful roommate with good taste.
- Keep reasoning to one short sentence per axis; warmth comes from voice, not word count.

Rules:
- Prefer the structured room analysis and style thesis over inventing new facts from the room photo. Use the room photo only to verify visual details (color, finish, how busy the space looks).
- Account for existingPieces in the room analysis — do not ignore furniture they already own when judging style, scale, and color.
- committedPieces are items already saved or bought for this room (not necessarily visible in the photo). Fold them into style, scale, and color — flag when the new piece fights their finishes, palette, or bulk. Prefer complements over near-duplicates of the same category unless the room clearly needs multiples.
- If planGaps are provided, note whether this piece fills a real gap or duplicates something they already planned for.
- pieceDescription must be at most 6 words — a short title like "blush lounge chair", not a full product description.
- Do NOT assess budget. Price fit is computed separately from the numbers — omit any budget judgment.
- Never name specific products or brands. No purchase links. You may refer to committed pieces by category (e.g. "your walnut console").
- Use room dimensions in scale reasoning when they are provided.
- If you cannot make a confident assessment, set confident to false rather than fabricating a verdict.
- alternativeSuggestion should be descriptive only (e.g. "look for a neutral-toned sectional under 90 inches with clean lines"). Set it to null when style, scale, and color are all fine.
- Whenever you write an alternativeSuggestion, also set searchQuery to how you would actually type that into a shopping site — the same guidance compressed into a few keywords, not a sentence.
- Use ASCII quotes only in all string fields.`

function formatDimensions(dimensions) {
  if (!dimensions?.length || !dimensions?.width) {
    return 'Room dimensions: not provided — assess scale based on visual proportions.'
  }
  const source = dimensions.source === 'user' ? 'user-corrected' : 'AI-estimated'
  return `Room dimensions (${source}): ${dimensions.length} ft × ${dimensions.width} ft`
}

function formatPiecePrice(piecePrice) {
  if (piecePrice == null || !(Number(piecePrice) > 0)) {
    return 'Piece price: not provided (budget is computed separately).'
  }
  return `Piece price (user-entered): $${Number(piecePrice)} (budget is computed separately — do not assess it).`
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

function trimmedOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeVerdict(parsed, { piecePrice, ceiling, roomBudget } = {}) {
  const style = normalizeAxis('style', parsed.style)
  const scale = normalizeAxis('scale', parsed.scale)
  const color = normalizeAxis('color', parsed.color)
  const hasPrice = piecePrice != null && Number(piecePrice) > 0
  const budget = budgetAxis({
    price: hasPrice ? Number(piecePrice) : null,
    ceiling,
    roomBudget,
  })
  if (!hasPrice) {
    budget.reasoning =
      'Add a price to see how this piece fits your room budget.'
  }

  const verdict = {
    pieceDescription: normalizePieceDescription(parsed.pieceDescription),
    style,
    scale,
    color,
    budget,
    piecePrice: hasPrice ? Number(piecePrice) : null,
    overallVerdict: parsed.overallVerdict ?? '',
    alternativeSuggestion: trimmedOrNull(parsed.alternativeSuggestion),
    searchQuery: trimmedOrNull(parsed.searchQuery),
  }

  if (!needsAlternatives(verdict)) {
    verdict.alternativeSuggestion = null
    verdict.searchQuery = null
  }

  return verdict
}

const MAX_COMMITTED_PIECES = 12

/** Defensive normalize of checklist snapshots sent by the client. */
function normalizeCommittedPieces(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return []

  return raw.slice(0, MAX_COMMITTED_PIECES).map((item) => {
    const price = Number(item?.price)
    const colors = Array.isArray(item?.colors)
      ? item.colors.filter((c) => typeof c === 'string').slice(0, 4)
      : []
    const category =
      typeof item?.category === 'string' && item.category.trim()
        ? item.category.trim()
        : 'Saved piece'
    const title =
      typeof item?.title === 'string' && item.title.trim()
        ? item.title.trim()
        : null

    return {
      category,
      title: title && title !== category ? title : null,
      status:
        item?.status === 'bought' ||
        item?.status === 'purchased' ||
        item?.status === 'placed'
          ? 'bought'
          : 'saved',
      price: Number.isFinite(price) && price > 0 ? price : null,
      styleName:
        typeof item?.styleName === 'string' && item.styleName.trim()
          ? item.styleName.trim()
          : null,
      colors: colors.length > 0 ? colors : null,
    }
  })
}

function committedSpend(pieces) {
  return pieces.reduce((sum, piece) => {
    const price = Number(piece?.price)
    return sum + (Number.isFinite(price) && price > 0 ? price : 0)
  }, 0)
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

  const committedPieces = normalizeCommittedPieces(
    room.committedPieces ?? room.checklist,
  )
  const spent = committedSpend(committedPieces)
  const roomBudget = Number(room.budget)
  const budgetRemaining =
    Number.isFinite(roomBudget) && roomBudget > 0
      ? Math.max(Math.round(roomBudget - spent), 0)
      : null

  return {
    roomAnalysis,
    styleThesis,
    planGaps,
    dimensions: room.dimensions ?? latestPlan?.dimensions ?? null,
    committedPieces,
    checklistSpent: spent > 0 ? Math.round(spent) : 0,
    budgetRemaining,
  }
}

async function checkCompatibility({
  room,
  piecePhoto,
  piecePrice,
  includeRoomPhoto,
  timeoutMs,
}) {
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

  const context = buildRoomContext({ room })
  const hasAnalysis = Boolean(context.roomAnalysis)
  // Structured analysis already captures the room; skip the second image unless
  // the caller forces it or there is nothing else to ground the check.
  const shouldIncludeRoomPhoto =
    includeRoomPhoto != null ? includeRoomPhoto : !hasAnalysis

  if (shouldIncludeRoomPhoto && room.photo) {
    try {
      roomPhoto = parsePhotoData(room.photo)
    } catch {
      roomPhoto = null
    }
  }

  const hasCommitted = context.committedPieces.length > 0
  const normalizedPrice =
    piecePrice != null && Number(piecePrice) > 0 ? Number(piecePrice) : null
  const roomBudget = Number(room.budget)

  const budgetLines = [
    `Total room budget: $${room.budget}`,
    hasCommitted
      ? `Already allocated on checklist: $${context.checklistSpent}`
      : null,
    context.budgetRemaining != null && hasCommitted
      ? `Remaining room budget: $${context.budgetRemaining}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const userPrompt = `Room name: ${room.name}
Style preferences: ${room.style}
${budgetLines}
${formatPiecePrice(normalizedPrice)}
${formatDimensions(context.dimensions)}

Room context (ground your assessment in this — do not invent facts not listed here):
${JSON.stringify(
  {
    roomAnalysis: context.roomAnalysis,
    styleThesis: context.styleThesis,
    planGaps: context.planGaps,
    committedPieces: context.committedPieces,
  },
  null,
  2,
)}

${hasAnalysis ? 'A structured room analysis is provided above.' : 'No structured room analysis was available — rely more carefully on the room photo if present.'}
${hasCommitted ? 'committedPieces lists furniture already saved for this room — judge the new piece against those too, not only the empty room.' : 'No checklist pieces yet for this room.'}
${roomPhoto ? 'First image is the room. Second image is the furniture piece to evaluate.' : 'The image is the furniture piece to evaluate against the room context above.'}
Assess style, scale, and color only — do not assess budget.`

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
      cacheSystem: true,
      ...(timeoutMs != null ? { timeoutMs } : {}),
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

    const pieceDescription = normalizePieceDescription(parsed.pieceDescription)
    const ceiling = checkBudgetCeiling({
      roomBudget,
      budgetRemaining: context.budgetRemaining,
      planGaps: context.planGaps,
      pieceDescription,
    })

    return {
      success: true,
      verdict: normalizeVerdict(parsed, {
        piecePrice: normalizedPrice,
        ceiling,
        roomBudget: Number.isFinite(roomBudget) && roomBudget > 0 ? roomBudget : null,
      }),
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
  const { room, piecePhoto, piecePrice } = body ?? {}

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
