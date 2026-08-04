import {
  apiErrorResponse,
  callClaudeWithTool,
  MODEL_TEXT,
  parsePhotoData,
} from './utils.js'

const ROOM_ANALYSIS_TOOL = {
  name: 'submit_room_analysis',
  description: 'Submit the structured room observation from the photo',
  input_schema: {
    type: 'object',
    properties: {
      photoQuality: { type: 'string', enum: ['ok', 'poor'] },
      photoQualityMessage: { type: 'string' },
      roomAnalysis: {
        type: 'object',
        properties: {
          architecture: { type: 'array', items: { type: 'string' } },
          lighting: { type: 'array', items: { type: 'string' } },
          existingPieces: { type: 'array', items: { type: 'string' } },
        },
        required: ['architecture', 'lighting', 'existingPieces'],
      },
      dimensions: {
        type: 'object',
        properties: {
          lengthFt: { type: 'number' },
          widthFt: { type: 'number' },
          confident: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['confident'],
      },
    },
    required: ['photoQuality', 'roomAnalysis', 'dimensions'],
  },
}

const RECOMMENDATIONS_TOOL = {
  name: 'submit_recommendations',
  description: 'Submit the style thesis and prioritized furnishing recommendations',
  input_schema: {
    type: 'object',
    properties: {
      styleThesis: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
            rationale: { type: 'string' },
            styleName: { type: 'string' },
            material: { type: 'string' },
            texture: { type: 'string' },
            colors: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 hex color values for the suggested item palette',
            },
            estimatedDimensions: { type: 'string' },
            placement: {
              type: 'string',
              description:
                'Where to place this item in the room, grounded in the room analysis',
            },
            searchQuery: {
              type: 'string',
              description:
                'Short shopping search query for this item — category plus 2-3 concrete attributes, e.g. "cream boucle accent chair 28 inch". No brand names, no price, under 10 words.',
            },
            budgetMin: { type: 'number' },
            budgetMax: { type: 'number' },
            priceOptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tier: { type: 'string', enum: ['Budget', 'Upgrade'] },
                  price: { type: 'number' },
                  differentiator: { type: 'string' },
                },
                required: ['tier', 'price', 'differentiator'],
              },
            },
          },
          required: [
            'category',
            'priority',
            'rationale',
            'styleName',
            'material',
            'texture',
            'placement',
            'searchQuery',
            'budgetMin',
            'budgetMax',
          ],
        },
      },
    },
    required: ['styleThesis', 'items'],
  },
}

const ANALYSIS_SYSTEM_PROMPT = `You are an interior design advisor helping everyday homeowners (not professionals) observe their rooms.

Analyze the room photo, then call submit_room_analysis with your observation only — do not recommend products or a style thesis.

Rules:
- The room may be empty, partially furnished, or fully furnished — analyze whatever is visible in the photo.
- Identify existing furniture and decor in existingPieces; do not treat furnished rooms as empty.
- For architecture, lighting, and existingPieces, provide 2-4 short bullet points each (under 10 words per point, not full sentences).
- For architecture, lighting, and existingPieces bullet points, use consistent, literal, categorical descriptions of what is physically visible (e.g. flooring material, wall finish, light source type). Avoid subjective or stylistic adjectives in these three sections — save creative/aesthetic language for recommendation fields only.
- In existingPieces, list major furniture (bed, desk, wardrobe, sofa) before minor items (bins, baskets, clutter).
- If the photo is too dark, blurry, or doesn't show enough of the room, set photoQuality to "poor" and provide photoQualityMessage.
- If you cannot estimate room dimensions confidently, omit lengthFt and widthFt and set confident to false with a note explaining why.
- When you provide lengthFt and widthFt, always include a note explaining what visual reference you used (e.g. bed size, door width, floor tiles) and remind the user to measure before buying large furniture.
- Be honest about uncertainty rather than guessing.
- Use ASCII quotes only in all string fields.`

const RECOMMENDATIONS_SYSTEM_PROMPT = `You are a warm, approachable interior design advisor helping someone plan their room — not a stiff professional report.

You will receive a structured room analysis (not a photo). Ground every recommendation in that analysis and their style preferences, then call submit_recommendations.

Tone (especially styleThesis / Direction, rationale / Details, and placement):
- Speak directly to them as "you" / "your" — never "the user", "the homeowner", or "they".
- Sound friendly and encouraging, like a helpful roommate with good taste. Avoid corporate or clinical phrasing.
- Keep it short and clear; warmth comes from voice, not word count.

Rules:
- Recommended items should complement what's already in the room analysis — suggest gaps and finishing pieces, not duplicates of what they own.
- Never name specific products or brands. No purchase links.
- Items must be in recommended purchase order (highest priority first).
- Set styleThesis to a short named direction only — under 12 words, no run-on clauses. Prefer a style name plus 1–2 concrete cues from the room, written for them (e.g. "Warm Japandi that plays off your beige plaster and oak floors"). Do not write a paragraph or list every material and accent color.
- For each item, fill styleName with a named aesthetic style (e.g. "Japandi", "warm Scandinavian minimal", "mid-century modern").
- For material and texture, keep each very short — under 4 words, like a shop filter chip (e.g. material "oak veneer", texture "matte"). Prefer feel words (matte, glossy, nubby) over long sentences. Never use vague fillers like "soft", "neutral", or "cozy" alone. If texture would only repeat the material, omit texture or leave it empty.
- In each item's rationale, write 1–3 warm sentences that explain why this piece works for you. Explicitly reference 1-2 existing elements from the room analysis (wall color, flooring, existing furniture tone). Example vibe: "This would sit nicely with your oak floors and pull the room together without fighting the beige walls."
- For each item, set colors to 2-3 hex values (e.g. ["#E8E2D6", "#C4B8A8", "#9B8B7A"]) representing the item's suggested palette. Colors must be realistic for the material and style described (a jute rug gets warm tan/beige tones, not arbitrary colors) and must complement the room's existing palette described in the analysis.
- Where possible, give each item two priceOptions — tier "Budget" and tier "Upgrade" — each with a price and a one-line differentiator explaining what the extra money buys. Prices must fall within the item's budgetMin-budgetMax range or close to it. Omit priceOptions only when a meaningful budget/upgrade split doesn't exist.
- For each item, set estimatedDimensions as plain text (e.g. "8 ft x 10 ft" or "72-84 in wide"). Use ASCII quotes only in all string fields.
- For each item, set placement to 1 short sentence (or under ~20 words) telling you where to put it. Ground placement in the room analysis (e.g. existing furniture, windows, doors, wall orientation, traffic paths). Be concrete and friendly (e.g. "Try centering it under your window on the long wall, with a clear path to the door") — not vague ("somewhere in the room").
- For each item, set searchQuery to how you would actually type this into a shopping site — category plus 2–3 concrete shoppable attributes (color/material, form, size cue when useful). Examples: "ivory linen sheer curtains 84 inch", "light oak round coffee table 36 inch", "nubby cream boucle accent chair". No brand names, no price, no full sentences — under 10 words. Do not paste styleName jargon alone (e.g. avoid bare "Japandi"); prefer words a store listing would use.
- Budget ranges should fit within their total room budget, allocated across all items.
- Use the room dimensions from the analysis when sizing items (estimatedDimensions). If dimensions are provided, treat them as the working room size.
- Be honest about uncertainty rather than guessing.`

function normalizeEstimatedDimensions(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return Object.values(value)
      .filter((part) => part != null && part !== '')
      .map(String)
      .join(' × ')
  }
  return String(value)
}

function normalizePriceOptions(options) {
  if (!Array.isArray(options)) return []
  return options
    .filter((opt) => opt && Number(opt.price) > 0)
    .map((opt) => ({
      tier: opt.tier === 'Upgrade' ? 'Upgrade' : 'Budget',
      price: Number(opt.price),
      differentiator: opt.differentiator ?? '',
    }))
    .slice(0, 2)
}

function normalizeColors(colors) {
  if (!Array.isArray(colors)) return []
  return colors
    .filter((c) => typeof c === 'string')
    .map((c) => (c.startsWith('#') ? c : `#${c}`))
    .filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c))
    .slice(0, 3)
}

function normalizeSearchQuery(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  // Keep shop queries short; Serper degrades on long prose.
  return cleaned.split(/\s+/).slice(0, 12).join(' ')
}

function normalizePlanItem(item) {
  return {
    id: crypto.randomUUID(),
    category: item.category ?? 'Item',
    priority: item.priority ?? 'Medium',
    rationale: item.rationale ?? '',
    styleName: item.styleName ?? null,
    material: item.material ?? null,
    texture: item.texture ?? null,
    colors: normalizeColors(item.colors),
    estimatedDimensions: normalizeEstimatedDimensions(item.estimatedDimensions),
    placement:
      typeof item.placement === 'string' && item.placement.trim()
        ? item.placement.trim()
        : null,
    searchQuery: normalizeSearchQuery(item.searchQuery),
    budgetMin: Number(item.budgetMin) || 0,
    budgetMax: Number(item.budgetMax) || 0,
    priceOptions: normalizePriceOptions(item.priceOptions),
  }
}

function normalizeAnalysisSection(value) {
  if (Array.isArray(value)) {
    const points = value.filter((point) => point != null && point !== '').map(String)
    if (points.length > 0) return points
  } else if (typeof value === 'string' && value !== '') {
    return [value]
  }
  return ['Not available']
}

function normalizeRoomAnalysis(analysis = {}) {
  return {
    architecture: normalizeAnalysisSection(analysis.architecture),
    lighting: normalizeAnalysisSection(analysis.lighting),
    existingPieces: normalizeAnalysisSection(analysis.existingPieces),
  }
}

function normalizeDimensions(dimensions = {}) {
  return {
    length: dimensions.lengthFt ?? dimensions.length ?? null,
    width: dimensions.widthFt ?? dimensions.width ?? null,
    confident: dimensions.confident ?? false,
    note: dimensions.note ?? null,
  }
}

function mapClaudeError(err, label) {
  if (err.code === 'TIMEOUT') {
    return {
      success: false,
      errorType: 'timeout',
      message: 'Something went wrong on our end — try again in a moment.',
    }
  }
  if (err.code === 'PARSE_ERROR' || err instanceof SyntaxError) {
    return {
      success: false,
      errorType: 'parse_error',
      message: 'Something went wrong on our end — try again in a moment.',
    }
  }
  if (err.message?.includes('Could not process image')) {
    return {
      success: false,
      errorType: 'photo_quality',
      message:
        'Your room photo could not be processed. Try re-uploading a clearer photo of the room.',
    }
  }
  if (err.message?.includes('Claude API error') || err.message?.includes('ANTHROPIC_API_KEY')) {
    console.error(`[${label}]`, err.message)
    return {
      success: false,
      errorType: 'api_error',
      message: 'Something went wrong on our end — try again in a moment.',
    }
  }
  console.error(`[${label}]`, err)
  throw err
}

/** Call A — observe the photo only. */
async function analyzeRoom({ name, photo }) {
  let mediaType
  let data

  try {
    ;({ mediaType, data } = parsePhotoData(photo))
  } catch {
    return {
      success: false,
      errorType: 'photo_quality',
      message:
        'Your room photo appears damaged or missing. Try re-uploading a photo of the room.',
    }
  }

  const userPrompt = `Room name: ${name || 'Untitled'}

Observe this room photo. Return only architecture, lighting, existing pieces, photo quality, and dimension estimates. Do not recommend furniture.`

  try {
    const parsed = await callClaudeWithTool({
      system: ANALYSIS_SYSTEM_PROMPT,
      tool: ROOM_ANALYSIS_TOOL,
      model: MODEL_TEXT,
      maxTokens: 4096,
      temperature: 0.2,
      cacheSystem: true,
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data },
        },
        { type: 'text', text: userPrompt },
      ],
    })

    if (parsed.photoQuality === 'poor') {
      return {
        success: false,
        errorType: 'photo_quality',
        message:
          parsed.photoQualityMessage ||
          'The photo is too unclear for analysis. Try a brighter, wider-angle shot from the doorway.',
      }
    }

    const analysis = {
      photoQuality: 'ok',
      photoQualityMessage: parsed.photoQualityMessage ?? null,
      roomAnalysis: normalizeRoomAnalysis(parsed.roomAnalysis),
      dimensions: normalizeDimensions(parsed.dimensions),
    }

    return { success: true, analysis }
  } catch (err) {
    return mapClaudeError(err, 'analyzeRoom')
  }
}

/** Call B — recommend from cached analysis JSON (no photo). */
async function generateRecommendations({
  name,
  style,
  budget,
  analysis,
}) {
  if (!analysis?.roomAnalysis) {
    return {
      success: false,
      errorType: 'validation',
      message: 'Missing room analysis. Re-analyze the photo first.',
    }
  }

  const userPrompt = `Room name: ${name}
Style preferences: ${style}
Total budget: $${budget}

Room analysis (ground your recommendations in this — do not invent facts not listed here):
${JSON.stringify(
  {
    roomAnalysis: analysis.roomAnalysis,
    dimensions: analysis.dimensions,
  },
  null,
  2,
)}

Create a prioritized furnishing plan that complements what is already in the room analysis. Fit item budgets within the $${budget} total, and size pieces for the room dimensions above.`

  try {
    const parsed = await callClaudeWithTool({
      system: RECOMMENDATIONS_SYSTEM_PROMPT,
      tool: RECOMMENDATIONS_TOOL,
      model: MODEL_TEXT,
      maxTokens: 8192,
      temperature: 0.6,
      cacheSystem: true,
      content: [{ type: 'text', text: userPrompt }],
    })

    const items = (parsed.items ?? []).map(normalizePlanItem)
    if (items.length === 0) {
      return {
        success: false,
        errorType: 'parse_error',
        message: 'Something went wrong on our end — try again in a moment.',
      }
    }

    return {
      success: true,
      recommendations: {
        styleThesis: parsed.styleThesis ?? null,
        items,
      },
    }
  } catch (err) {
    return mapClaudeError(err, 'generateRecommendations')
  }
}

export async function handleAnalyzeRoomRequest(body) {
  const { name, photo } = body ?? {}

  if (!photo) {
    return {
      status: 400,
      body: {
        success: false,
        errorType: 'validation',
        message: 'Missing room photo.',
      },
    }
  }

  try {
    const result = await analyzeRoom({
      name: name?.trim() || 'Untitled',
      photo,
    })
    return { status: result.success ? 200 : 422, body: result }
  } catch (err) {
    console.error('[handleAnalyzeRoomRequest]', err)
    return apiErrorResponse()
  }
}

export async function handleRecommendItemsRequest(body) {
  const { name, style, budget, analysis } = body ?? {}
  const budgetNum = Number(budget)

  if (
    !name?.trim() ||
    !style?.trim() ||
    !Number.isFinite(budgetNum) ||
    budgetNum < 0 ||
    !analysis
  ) {
    return {
      status: 400,
      body: {
        success: false,
        errorType: 'validation',
        message:
          'Missing details. Need room name, style, budget, and a cached room analysis.',
      },
    }
  }

  try {
    const result = await generateRecommendations({
      name: name.trim(),
      style: style.trim(),
      budget: budgetNum,
      analysis,
    })
    return { status: result.success ? 200 : 422, body: result }
  } catch (err) {
    console.error('[handleRecommendItemsRequest]', err)
    return apiErrorResponse()
  }
}
