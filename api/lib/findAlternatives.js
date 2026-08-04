import { fetchImageAsDataUrl, scrapeProductImage } from './scrapeUrl.js'
import { searchShopping } from './shopSearch.js'
import {
  apiErrorResponse,
  callClaudeWithTool,
  parsePhotoData,
} from './utils.js'
import {
  AXIS_PROBLEM_SIGNALS,
  axisSchema,
  axisSignal,
  budgetAxis,
  failingAxes,
  introducesNewClash,
  matchingGapCeiling,
  needsAlternatives,
  normalizeAxis,
  verdictScore,
} from './verdict.js'

/** Products requested from the shopping API. */
const SEARCH_LIMIT = 6
/** Candidate images sent to the comparison call. */
const MAX_COMPARED = 5
/** Below this many usable candidates, widen the search or work harder on photos. */
const MIN_CANDIDATES = 2
const MAX_ALTERNATIVES = 3

const PHOTO_TIMEOUT_MS = 8_000
const COMPARE_TIMEOUT_MS = 60_000

const COMPARISON_TOOL = {
  name: 'submit_alternative_ranking',
  description:
    'Submit a ranked comparison of the candidate pieces against the reference piece',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          '1-2 short sentences for the user about what you found. Speak to them as "you". Never mention candidate ids (c1, c2) or how many candidates you compared.',
      },
      candidates: {
        type: 'array',
        description: 'One entry for every candidate shown, in any order.',
        items: {
          type: 'object',
          properties: {
            candidateId: {
              type: 'string',
              description: 'The candidate label from the prompt, e.g. "c1"',
            },
            pieceDescription: {
              type: 'string',
              description:
                'Short title for this candidate — max 6 words, category first (e.g. "cream boucle accent chair")',
            },
            betterThanReference: {
              type: 'boolean',
              description:
                'True only when this candidate fixes at least one of the reference piece problems without creating a new one.',
            },
            rank: {
              type: 'number',
              description:
                '1 is best. Rank only the candidates you marked better than the reference.',
            },
            why: {
              type: 'string',
              description:
                'One short sentence to the user comparing this directly to the piece they tried (e.g. "Reads much warmer against your oak floors than the grey one you looked at"). Never include a candidate id like c1 or (c3).',
            },
            style: axisSchema('style'),
            scale: axisSchema('scale'),
            color: axisSchema('color'),
          },
          required: [
            'candidateId',
            'pieceDescription',
            'betterThanReference',
            'why',
            'style',
            'scale',
            'color',
          ],
        },
      },
    },
    required: ['summary', 'candidates'],
  },
}

const SYSTEM_PROMPT = `You are a warm, approachable interior design advisor. Someone tried a furniture piece in their room, it did not quite work, and you have pulled up real shopping options to compare against it.

You will see the room, the reference piece that missed, and several product options labeled with internal ids (c1, c2, …). Use those ids only in the candidateId field. Judge every option against the room AND against the reference piece, then call submit_alternative_ranking.

Tone:
- Speak directly to them as "you" / "your" — never "the user" or "they".
- Sound like a helpful friend with good taste, not a product listing.
- One short sentence per axis and per "why". Warmth comes from voice, not length.

Rules:
- You are comparing, not scoring in isolation. Every "why" should say how this option beats the piece they tried on the axes that missed.
- Set betterThanReference true only when an option genuinely fixes a stated problem without introducing a new clash. Being merely different is not better.
- It is completely fine to mark every option false. Say so honestly in the summary rather than pushing a weak pick.
- In summary and why: never mention internal ids (c1, c2, (c3)), never say "candidate", and never count how many options you looked at ("all five", "the three candidates"). Describe pieces by what they look like.
- Judge the product photos as product shots — ignore their studio backgrounds and staging, and picture the piece in this room instead.
- Ground style and color judgments in the room analysis, the room photo, and any committedPieces already saved for this room. Prefer options that complement those pieces rather than fighting their finishes or palette. Use room dimensions for scale when given.
- Do not comment on price. That is handled separately.
- Never invent product titles or links; describe only what you can see.
- Use ASCII quotes only in all string fields.`

const QUERY_STOPWORDS = new Set([
  'about', 'also', 'and', 'are', 'around', 'avoid', 'better', 'but', 'choose',
  'consider', 'could', 'feel', 'feels', 'for', 'from', 'has', 'have', 'instead',
  'into', 'its', 'keep', 'keeping', 'less', 'look', 'looking', 'more', 'one',
  'opt', 'over', 'piece', 'room', 'similar', 'size', 'sized', 'something',
  'still', 'than', 'that', 'the', 'this', 'try', 'under', 'well', 'with',
  'work', 'works', 'would', 'your',
])

/**
 * Newer verdicts carry a searchQuery straight from the compatibility check.
 * Older saved checks predate that field, so rebuild something shoppable from
 * the piece title plus a few concrete words out of the written guidance.
 */
function resolveSearchQuery(verdict) {
  const given = String(verdict?.searchQuery ?? '').trim()
  if (given) return given

  const base = String(verdict?.pieceDescription ?? '').trim()
  const baseWords = new Set(base.toLowerCase().split(/\s+/))
  const extra = String(verdict?.alternativeSuggestion ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3 && !QUERY_STOPWORDS.has(word) && !baseWords.has(word),
    )
    .slice(0, 3)

  return [base, ...extra].filter(Boolean).join(' ').trim() || 'furniture'
}

/** Shorter, unpriced version of a query, for when the first pass comes back thin. */
function broadenQuery(query) {
  const words = query.split(/\s+/).filter(Boolean)
  return words.length > 3 ? words.slice(-3).join(' ') : query
}

/**
 * Ordered progress log. Each stage is announced when its work starts so a
 * streaming client can show it live, then flipped to done as the run advances.
 */
function createStepTracker(onStep) {
  const steps = []

  function emit(step) {
    if (typeof onStep !== 'function') return
    try {
      onStep({ ...step })
    } catch {
      // A broken client stream must never fail the run itself.
    }
  }

  function completeActive() {
    for (const step of steps) {
      if (step.status === 'active') {
        step.status = 'done'
        emit(step)
      }
    }
  }

  function failActive() {
    for (const step of steps) {
      if (step.status === 'active') {
        step.status = 'error'
        emit(step)
      }
    }
  }

  return {
    steps,
    start(id, label) {
      completeActive()
      const existing = steps.find((step) => step.id === id)
      if (existing) {
        existing.label = label
        existing.status = 'active'
        emit(existing)
        return
      }
      const step = { id, label, status: 'active' }
      steps.push(step)
      emit(step)
    },
    finish: completeActive,
    fail: failActive,
  }
}

function productPublicView(product) {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    priceValue: product.priceValue ?? null,
    source: product.source,
    link: product.link,
    thumbnail: product.thumbnail,
  }
}

function buildRoomPayload(room) {
  const latestPlan = room.plans?.[0]
  const committedPieces = Array.isArray(room.committedPieces)
    ? room.committedPieces.slice(0, 12)
    : []
  return {
    name: room.name,
    style: room.style,
    budget: room.budget,
    photo: room.photo,
    dimensions: room.dimensions ?? latestPlan?.dimensions ?? null,
    roomAnalysis: room.roomAnalysis ?? latestPlan?.roomAnalysis ?? null,
    styleThesis: room.styleThesis ?? latestPlan?.styleThesis ?? null,
    planGaps: Array.isArray(room.planGaps)
      ? room.planGaps
      : Array.isArray(latestPlan?.items)
        ? latestPlan.items.slice(0, 8).map((item) => ({
            category: item.category,
            priority: item.priority,
            styleName: item.styleName ?? null,
            budgetMin: item.budgetMin ?? null,
            budgetMax: item.budgetMax ?? null,
          }))
        : [],
    committedPieces,
  }
}

const ROOM_BUDGET_SHARE = 0.4
const PRICE_HEADROOM = 1.25

/**
 * Per-item price ceiling. Prefer the matching plan gap when the rejected price
 * was the problem; otherwise allow modest headroom above the piece price while
 * still respecting the gap and a slice of the room budget.
 */
function resolveBudgetCeiling(room, rejectedVerdict, planGaps) {
  const roomBudget = Number(room.budget)
  const roomCap =
    Number.isFinite(roomBudget) && roomBudget > 0 ? Math.round(roomBudget) : null
  const roomShare =
    roomCap != null ? Math.round(roomCap * ROOM_BUDGET_SHARE) : null
  const gap = matchingGapCeiling(planGaps, rejectedVerdict?.pieceDescription)

  const price = Number(rejectedVerdict?.piecePrice)
  const hasPrice = Number.isFinite(price) && price > 0
  const priceWasAProblem =
    hasPrice &&
    AXIS_PROBLEM_SIGNALS.budget.has(axisSignal(rejectedVerdict, 'budget'))

  let ceiling = null

  if (hasPrice && priceWasAProblem) {
    // The failing price cannot be the ceiling — undercut it, prefer plan gap.
    ceiling = gap ?? Math.round(price * 0.8)
    if (roomShare != null) ceiling = Math.min(ceiling, roomShare)
  } else if (hasPrice) {
    ceiling = Math.round(price * PRICE_HEADROOM)
    if (gap != null) ceiling = Math.min(ceiling, gap)
  } else if (gap != null) {
    ceiling = gap
  } else if (roomShare != null) {
    ceiling = roomShare
  }

  if (ceiling != null && roomCap != null) {
    ceiling = Math.min(ceiling, roomCap)
  }

  return ceiling
}

function dedupeByLink(products) {
  const seen = new Set()
  const unique = []
  for (const product of products) {
    const key = product.link || product.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(product)
  }
  return unique
}

/**
 * One shopping pass, widened once if it comes back thin. The ceiling is dropped
 * on the retry because an over-tight price filter is the usual reason for it.
 */
async function gatherProducts(query, ceiling) {
  const first = await searchShopping(query, ceiling, { limit: SEARCH_LIMIT })
  let products = first.success ? (first.products ?? []) : []

  if (products.length >= MIN_CANDIDATES) {
    return { products, error: null }
  }

  const wider = broadenQuery(query)
  const second = await searchShopping(wider, null, { limit: SEARCH_LIMIT })
  if (second.success) {
    products = dedupeByLink([...products, ...(second.products ?? [])])
  }

  const error =
    products.length === 0 ? first.message || second.message || null : null
  return { products, error }
}

async function thumbnailPhoto(product) {
  if (!product.thumbnail) return null
  try {
    const result = await fetchImageAsDataUrl(product.thumbnail, {
      referer: product.link,
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    })
    return result.success ? (result.photo ?? null) : null
  } catch {
    return null
  }
}

async function scrapedPhoto(product) {
  if (!product.link) return null
  try {
    const result = await scrapeProductImage(product.link)
    return result.success ? (result.photo ?? null) : null
  } catch {
    return null
  }
}

/**
 * Search thumbnails are fast and almost always present, so try those together
 * first. Only when too few survive is it worth paying for full page scrapes,
 * which are slow and frequently blocked by retailers.
 */
async function loadCandidatePhotos(products) {
  const attempted = await Promise.all(
    products.map(async (product) => ({
      product,
      photo: await thumbnailPhoto(product),
    })),
  )

  const loaded = attempted.filter((entry) => entry.photo)
  if (loaded.length >= MIN_CANDIDATES) return loaded

  const rescued = await Promise.all(
    attempted
      .filter((entry) => !entry.photo)
      .slice(0, MAX_COMPARED)
      .map(async (entry) => ({
        product: entry.product,
        photo: await scrapedPhoto(entry.product),
      })),
  )

  return [...loaded, ...rescued.filter((entry) => entry.photo)]
}

const MAX_PIECE_DESCRIPTION_WORDS = 6

function shortDescription(value, fallback) {
  const words = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return fallback
  return words.slice(0, MAX_PIECE_DESCRIPTION_WORDS).join(' ')
}

function labelFor(index, verdict) {
  if (index === 0) return 'Best fit'
  return failingAxes(verdict).length > 0 ? 'Stretch' : 'Close'
}

/**
 * summary / why are shown to the user. The model sometimes leaks internal
 * labels (c3) or process talk ("all five candidates") — strip those.
 */
function scrubUserFacingText(text) {
  if (typeof text !== 'string') return ''
  const count = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)`
  return text
    .replace(/\s*\(\s*c\d+\s*\)/gi, '')
    .replace(/\bcandidates?\s+c?\d+\b/gi, 'this option')
    .replace(/\bc\d+\b/gi, '')
    .replace(
      new RegExp(
        String.raw`\bnone of (?:the|these|all)\s+${count}\s+(?:candidates?|options?|pieces?)\b`,
        'gi',
      ),
      'none of these options',
    )
    .replace(
      new RegExp(
        String.raw`\b(?:all|these|the)\s+${count}\s+(?:candidates?|options?|pieces?)\b`,
        'gi',
      ),
      'these options',
    )
    .replace(
      new RegExp(String.raw`\b${count}\s+candidates?\b`, 'gi'),
      'a few options',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

/**
 * Turn the model's comparison into alternatives, keeping only candidates it
 * called better and vetoing any that clash where the reference piece did not.
 */
function finalizeAlternatives({
  parsed,
  candidates,
  rejectedVerdict,
  room,
  ceiling,
}) {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]))
  const judged = Array.isArray(parsed?.candidates) ? parsed.candidates : []

  const accepted = []
  for (const judgement of judged) {
    const entry = byId.get(String(judgement?.candidateId ?? '').trim())
    if (!entry || !judgement?.betterThanReference) continue

    const why =
      scrubUserFacingText(judgement.why) ||
      'Improves on the piece you checked.'

    const verdict = {
      pieceDescription: shortDescription(
        judgement.pieceDescription,
        entry.product.title,
      ),
      style: normalizeAxis('style', judgement.style),
      scale: normalizeAxis('scale', judgement.scale),
      color: normalizeAxis('color', judgement.color),
      budget: budgetAxis({
        price: entry.product.priceValue,
        ceiling,
        roomBudget: room.budget,
      }),
      piecePrice: entry.product.priceValue ?? null,
      overallVerdict: why,
      alternativeSuggestion: null,
      searchQuery: null,
    }

    if (introducesNewClash(rejectedVerdict, verdict)) continue

    accepted.push({
      productId: entry.id,
      rank: Number(judgement.rank) || Number.MAX_SAFE_INTEGER,
      why,
      product: productPublicView(entry.product),
      verdict,
      score: verdictScore(verdict),
    })
  }

  accepted.sort((a, b) => a.rank - b.rank || b.score - a.score)

  const alternatives = accepted
    .slice(0, MAX_ALTERNATIVES)
    .map((alternative, index) => ({
      ...alternative,
      rank: index + 1,
      label: labelFor(index, alternative.verdict),
    }))

  const summary =
    scrubUserFacingText(parsed?.summary) ||
    'Here is what I found that may work better in your room.'

  return {
    summary:
      alternatives.length > 0
        ? summary
        : 'I looked through a few real options, but none of them clearly beat the piece you tried. You could adjust the brief or check another piece.',
    alternatives,
  }
}

function imageBlock(photo) {
  try {
    const { mediaType, data } = parsePhotoData(photo)
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    }
  } catch {
    return null
  }
}

function buildComparisonContent({
  roomPayload,
  piecePhoto,
  candidates,
  rejectedVerdict,
  ceiling,
}) {
  const content = []

  const roomImage = roomPayload.photo ? imageBlock(roomPayload.photo) : null
  if (roomImage) {
    content.push({ type: 'text', text: 'The room:' }, roomImage)
  }

  const referenceImage = piecePhoto ? imageBlock(piecePhoto) : null
  if (referenceImage) {
    content.push(
      {
        type: 'text',
        text: `Reference piece — the one that did not work (${rejectedVerdict.pieceDescription}):`,
      },
      referenceImage,
    )
  }

  for (const entry of candidates) {
    content.push(
      {
        type: 'text',
        text: `Candidate ${entry.id} — ${entry.product.title}${
          entry.product.price ? ` (${entry.product.price})` : ''
        }:`,
      },
      entry.image,
    )
  }

  const failed = failingAxes(rejectedVerdict)
    .map((axis) => `${axis}: ${axisSignal(rejectedVerdict, axis)}`)
    .join('; ')

  content.push({
    type: 'text',
    text: `Room name: ${roomPayload.name}
Style preferences: ${roomPayload.style}
Total room budget: $${roomPayload.budget}
${ceiling != null ? `Sensible price for this one piece: about $${ceiling}` : 'No per-item price ceiling.'}
${
  roomPayload.dimensions?.length && roomPayload.dimensions?.width
    ? `Room dimensions: ${roomPayload.dimensions.length} ft x ${roomPayload.dimensions.width} ft`
    : 'Room dimensions: not provided — judge scale from visual proportions.'
}

What missed on the reference piece (${failed || 'see the notes below'}):
${JSON.stringify(
  {
    style: rejectedVerdict.style,
    scale: rejectedVerdict.scale,
    color: rejectedVerdict.color,
    budget: rejectedVerdict.budget,
    whatToLookForInstead: rejectedVerdict.alternativeSuggestion ?? null,
  },
  null,
  2,
)}

Room context (ground your judgments in this — do not invent facts not listed here):
${JSON.stringify(
  {
    roomAnalysis: roomPayload.roomAnalysis,
    styleThesis: roomPayload.styleThesis,
    planGaps: roomPayload.planGaps,
    committedPieces: roomPayload.committedPieces ?? [],
  },
  null,
  2,
)}

Compare every option above against the reference piece and this room, then call submit_alternative_ranking with one entry per option. Put ids like c1 only in candidateId — never in summary or why.`,
  })

  return content
}

async function findAlternatives({
  room,
  rejectedVerdict,
  piecePhoto,
  onStep,
}) {
  const progress = createStepTracker(onStep)
  const steps = progress.steps

  const roomPayload = buildRoomPayload(room)
  const ceiling = resolveBudgetCeiling(
    room,
    rejectedVerdict,
    roomPayload.planGaps,
  )

  progress.start('read', 'Reading what missed on this piece')
  const query = resolveSearchQuery(rejectedVerdict)

  progress.start('search', 'Searching for better options')
  const { products, error: searchError } = await gatherProducts(query, ceiling)

  if (products.length === 0) {
    progress.fail()
    return {
      success: false,
      errorType: searchError ? 'api_error' : 'no_results',
      message:
        searchError ||
        'I could not find any listings to compare for this piece. Try again in a moment.',
      steps,
    }
  }

  const withPhotos = await loadCandidatePhotos(products.slice(0, SEARCH_LIMIT))
  const candidates = withPhotos.slice(0, MAX_COMPARED).map((entry, index) => ({
    id: `c${index + 1}`,
    product: { ...entry.product, id: `c${index + 1}` },
    image: imageBlock(entry.photo),
  }))
  const usable = candidates.filter((entry) => entry.image)

  if (usable.length === 0) {
    progress.fail()
    return {
      success: false,
      errorType: 'no_results',
      message:
        'I found some listings but could not load their product images. Try again in a moment.',
      steps,
    }
  }

  progress.start(
    'compare',
    usable.length === 1
      ? 'Comparing a candidate against your room'
      : `Comparing ${usable.length} candidates against your room`,
  )

  let parsed
  try {
    parsed = await callClaudeWithTool({
      system: SYSTEM_PROMPT,
      tool: COMPARISON_TOOL,
      maxTokens: 4096,
      temperature: 0.3,
      timeoutMs: COMPARE_TIMEOUT_MS,
      cacheSystem: true,
      content: buildComparisonContent({
        roomPayload,
        piecePhoto,
        candidates: usable,
        rejectedVerdict,
        ceiling,
      }),
    })
  } catch (err) {
    progress.fail()
    if (err.code === 'TIMEOUT') {
      return {
        success: false,
        errorType: 'timeout',
        message: 'Finding alternatives took too long — try again in a moment.',
        steps,
      }
    }
    if (
      err.message?.includes('Claude API error') ||
      err.message?.includes('ANTHROPIC_API_KEY')
    ) {
      console.error('[findAlternatives]', err.message)
      return {
        success: false,
        errorType: 'api_error',
        message: 'Something went wrong on our end — try again in a moment.',
        steps,
      }
    }
    console.error('[findAlternatives]', err)
    throw err
  }

  const finalized = finalizeAlternatives({
    parsed,
    candidates: usable,
    rejectedVerdict,
    room: roomPayload,
    ceiling,
  })

  progress.finish()

  return {
    success: true,
    summary: finalized.summary,
    alternatives: finalized.alternatives,
    steps,
    meta: {
      query,
      found: products.length,
      compared: usable.length,
    },
  }
}

/** Returns a { status, body } rejection, or null when the request is runnable. */
function rejectRequest(body) {
  const { room, rejectedVerdict } = body ?? {}

  const hasRoomContext =
    Boolean(room?.photo) ||
    Boolean(room?.roomAnalysis) ||
    Boolean(room?.plans?.[0]?.roomAnalysis)

  if (!room || !hasRoomContext) {
    return {
      status: 400,
      body: {
        success: false,
        errorType: 'validation',
        message: 'Room context is required to find alternatives.',
      },
    }
  }

  if (!rejectedVerdict || !needsAlternatives(rejectedVerdict)) {
    return {
      status: 400,
      body: {
        success: false,
        errorType: 'validation',
        message:
          'Find alternatives is only available when a piece has compatibility concerns.',
      },
    }
  }

  if (!process.env.SERPER_API_KEY) {
    return {
      status: 422,
      body: {
        success: false,
        errorType: 'config',
        message:
          'Shopping search is not configured, so alternatives cannot be found yet.',
      },
    }
  }

  return null
}

export async function handleFindAlternativesRequest(body) {
  const rejection = rejectRequest(body)
  if (rejection) return rejection

  try {
    const result = await findAlternatives({
      room: body.room,
      rejectedVerdict: body.rejectedVerdict,
      piecePhoto: body.piecePhoto ?? null,
    })
    return { status: result.success ? 200 : 422, body: result }
  } catch {
    return apiErrorResponse()
  }
}

/**
 * Same work as handleFindAlternativesRequest, but reports each stage through
 * `emit(event, data)` as it starts so the client can show live progress.
 * Always resolves; failures arrive as a "result" event with success: false.
 */
export async function streamFindAlternativesRequest(body, emit) {
  const rejection = rejectRequest(body)
  if (rejection) {
    emit('result', rejection.body)
    return
  }

  try {
    const result = await findAlternatives({
      room: body.room,
      rejectedVerdict: body.rejectedVerdict,
      piecePhoto: body.piecePhoto ?? null,
      onStep: (step) => emit('step', step),
    })
    emit('result', result)
  } catch {
    emit('result', apiErrorResponse().body)
  }
}
