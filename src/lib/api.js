import { preparePhotoForApi } from './image'
import {
  clearCachedRoomAnalysis,
  getCachedRoomAnalysis,
  setCachedRoomAnalysis,
} from './roomAnalysisCache'
import { summarizeCommittedPieces } from './checklistItem'
import {
  filterProductsByMaxPrice,
  getCachedShopResults,
  setCachedShopResults,
} from './shopCache'

async function postJson(url, body, { signal } = {}) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return {
      success: false,
      errorType: 'network_error',
      message:
        'Could not reach the server. Check your connection and try again.',
    }
  }

  const data = await response.json().catch(() => ({
    success: false,
    errorType: 'api_error',
    message: 'Something went wrong on our end — try again in a moment.',
  }))

  if (!response.ok && !data.errorType) {
    return {
      success: false,
      errorType: 'api_error',
      message: data.message || 'Request failed',
    }
  }

  return data
}

/**
 * Client-side progress for multi-phase plan calls. Mirrors the server
 * createStepTracker pattern: starting a stage marks the previous one done.
 */
function createStepEmitter(onStep) {
  const steps = []

  function emit(step) {
    if (typeof onStep !== 'function') return
    try {
      onStep({ ...step })
    } catch {
      // UI progress must never fail the run.
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

  return {
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
  }
}

/**
 * Objective room analysis only (Call A) — architecture, lighting, existing pieces, dimensions.
 * Clears the photo cache, then re-reads the photo. Does not regenerate recommendations.
 */
export async function analyzeRoomPhoto(room, { onStep } = {}) {
  const progress = createStepEmitter(onStep)

  if (!room.photo) {
    return {
      success: false,
      errorType: 'validation',
      message:
        'This room is missing a photo. Add a new room photo below the image to analyze it.',
    }
  }

  progress.start('photo', 'Reading your room photo')

  let photo = room.photo
  try {
    photo = await preparePhotoForApi(room.photo)
  } catch {
    progress.finish()
    return {
      success: false,
      errorType: 'photo_quality',
      message:
        'Your room photo appears damaged. Replace the photo below the image and try again.',
    }
  }

  await clearCachedRoomAnalysis(photo)
  if (photo !== room.photo) await clearCachedRoomAnalysis(room.photo)

  progress.start(
    'observe',
    'Noting layout, light, and estimating size',
  )

  const analysisResult = await postJson('/api/analyze-room', {
    name: room.name,
    photo,
  })

  if (!analysisResult.success) {
    progress.finish()
    if (photo !== room.photo) analysisResult.photoUsed = photo
    return analysisResult
  }

  const analysis = {
    ...analysisResult.analysis,
    analyzedAt: new Date().toISOString(),
  }
  await setCachedRoomAnalysis(photo, analysis)
  progress.finish()

  const data = { success: true, analysis }
  if (photo !== room.photo) data.photoUsed = photo
  return data
}

/**
 * Generate or regenerate a plan.
 * @param {object} room
 * @param {{ forceReanalyze?: boolean, onStep?: (step) => void }} [options]
 *   forceReanalyze: clear photo cache and re-run Call A + Call B
 *   default: use cached Call A when available; only re-run Call B
 *   onStep: live progress stages as each real phase starts
 */
export async function generatePlan(
  room,
  { forceReanalyze = false, onStep, signal } = {},
) {
  const progress = createStepEmitter(onStep)

  if (!room.photo) {
    return {
      success: false,
      errorType: 'validation',
      message:
        'This room is missing a photo. Add a new room photo below the image to generate a plan.',
    }
  }

  if (forceReanalyze) {
    progress.start('photo', 'Reading your room photo')
  } else {
    progress.start('review', 'Reviewing your room analysis')
  }

  let photo = room.photo
  try {
    photo = await preparePhotoForApi(room.photo)
  } catch {
    progress.finish()
    return {
      success: false,
      errorType: 'photo_quality',
      message:
        'Your room photo appears damaged. Replace the photo below the image and try again.',
    }
  }

  if (forceReanalyze) {
    await clearCachedRoomAnalysis(photo)
    if (photo !== room.photo) await clearCachedRoomAnalysis(room.photo)
  }

  let analysis = forceReanalyze ? null : await getCachedRoomAnalysis(photo)
  if (!analysis && photo !== room.photo && !forceReanalyze) {
    analysis = await getCachedRoomAnalysis(room.photo)
  }

  // Seed cache from an existing plan when regenerating recommendations
  // (covers plans created before the split, keyed by current photo).
  if (
    !analysis &&
    !forceReanalyze &&
    room.plans?.[0]?.roomAnalysis
  ) {
    analysis = {
      photoQuality: 'ok',
      roomAnalysis: room.plans[0].roomAnalysis,
      dimensions: room.dimensions ?? room.plans[0].dimensions ?? null,
      analyzedAt: room.plans[0].analyzedAt ?? room.plans[0].createdAt ?? null,
    }
    await setCachedRoomAnalysis(photo, analysis)
  }

  const ranAnalysis = !analysis

  if (!analysis) {
    progress.start('photo', 'Reading your room photo')
    progress.start(
      'observe',
      'Noting layout, light, and what you already have',
    )
    const analysisResult = await postJson(
      '/api/analyze-room',
      {
        name: room.name,
        photo,
      },
      { signal },
    )
    if (!analysisResult.success) {
      progress.finish()
      if (photo !== room.photo) analysisResult.photoUsed = photo
      return analysisResult
    }
    analysis = {
      ...analysisResult.analysis,
      analyzedAt: new Date().toISOString(),
    }
    await setCachedRoomAnalysis(photo, analysis)
  }

  // Prefer user-edited dimensions over the photo estimate for recommendations
  if (room.dimensions) {
    analysis = {
      ...analysis,
      dimensions: {
        length: room.dimensions.length ?? analysis.dimensions?.length ?? null,
        width: room.dimensions.width ?? analysis.dimensions?.width ?? null,
        confident: room.dimensions.confident ?? analysis.dimensions?.confident ?? false,
        note: room.dimensions.note ?? analysis.dimensions?.note ?? null,
      },
    }
    await setCachedRoomAnalysis(photo, analysis)
  }

  progress.start(
    'ideas',
    ranAnalysis
      ? 'Building a prioritized list of what to add'
      : 'Fitting ideas to your budget and ranking what to add',
  )

  const recsResult = await postJson(
    '/api/recommend-items',
    {
      name: room.name,
      style: room.style,
      budget: room.budget,
      analysis,
    },
    { signal },
  )

  if (!recsResult.success) {
    progress.finish()
    if (photo !== room.photo) recsResult.photoUsed = photo
    return recsResult
  }

  const plan = {
    roomAnalysis: analysis.roomAnalysis,
    styleThesis: recsResult.recommendations?.styleThesis ?? null,
    // Keep user dimensions on the plan when they've edited them
    dimensions: room.dimensions ?? analysis.dimensions,
    items: recsResult.recommendations?.items ?? [],
    // When the analysis came from cache, keep the original observation time
    analyzedAt: analysis.analyzedAt ?? null,
  }

  if (!plan.roomAnalysis || !Array.isArray(plan.items)) {
    progress.finish()
    return {
      success: false,
      errorType: 'parse_error',
      message: 'Something went wrong on our end — try again in a moment.',
    }
  }

  progress.finish()

  const data = { success: true, plan, analysis }
  if (photo !== room.photo) data.photoUsed = photo
  return data
}

export async function scrapeProductUrl(url) {
  try {
    const response = await fetch('/api/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    try {
      return await response.json()
    } catch {
      return {
        success: false,
        errorType: 'api_error',
        message:
          'Something went wrong fetching that image. Try uploading a photo.',
      }
    }
  } catch {
    return {
      success: false,
      errorType: 'network_error',
      message: 'Could not reach the server. Check your connection and try again.',
    }
  }
}

export async function searchShopProducts(query, maxPrice = null) {
  const q = String(query || '').trim()
  if (!q) {
    return { success: false, products: [] }
  }

  const ceiling =
    maxPrice != null && Number(maxPrice) > 0 ? Number(maxPrice) : null

  const cached = getCachedShopResults(q, ceiling)
  if (cached) {
    return { success: true, products: cached, cached: true }
  }

  let response
  try {
    response = await fetch('/api/shop-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, maxPrice: ceiling }),
    })
  } catch {
    return { success: false, products: [] }
  }

  const data = await response.json().catch(() => ({
    success: false,
    products: [],
  }))

  if (data.success && Array.isArray(data.products)) {
    const products = filterProductsByMaxPrice(data.products, ceiling)
    setCachedShopResults(q, products, ceiling)
    return { ...data, products }
  }

  return { success: false, products: [] }
}

function roomContextPayload(room) {
  const latestPlan = room.plans?.[0]
  return {
    name: room.name,
    style: room.style,
    budget: room.budget,
    photo: room.photo,
    dimensions: room.dimensions ?? latestPlan?.dimensions ?? null,
    roomAnalysis: latestPlan?.roomAnalysis ?? null,
    styleThesis: latestPlan?.styleThesis ?? null,
    planGaps: Array.isArray(latestPlan?.items)
      ? latestPlan.items.slice(0, 8).map((item) => ({
          category: item.category,
          priority: item.priority,
          styleName: item.styleName ?? null,
          budgetMin: item.budgetMin ?? null,
          budgetMax: item.budgetMax ?? null,
        }))
      : [],
    committedPieces: summarizeCommittedPieces(room.checklist),
  }
}

export async function checkCompatibility(room, piecePhoto, piecePrice) {
  const [compressedPiece, compressedRoomPhoto] = await Promise.all([
    compressed(piecePhoto),
    compressed(room?.photo),
  ])
  const roomPayload = roomContextPayload(room)
  if (compressedRoomPhoto) roomPayload.photo = compressedRoomPhoto

  try {
    const response = await fetch('/api/check-compatibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: roomPayload,
        piecePhoto: compressedPiece,
        piecePrice:
          piecePrice != null && Number(piecePrice) > 0
            ? Number(piecePrice)
            : null,
      }),
    })

    let data
    try {
      data = await response.json()
    } catch {
      return {
        success: false,
        errorType: 'api_error',
        message: 'Something went wrong on our end — try again in a moment.',
      }
    }

    if (!response.ok && !data.errorType) {
      return {
        success: false,
        errorType: 'api_error',
        message: data.message || 'Failed to check compatibility',
      }
    }

    return data
  } catch {
    return NETWORK_ERROR
  }
}

const NETWORK_ERROR = {
  success: false,
  errorType: 'network_error',
  message: 'Could not reach the server. Check your connection and try again.',
}

const STREAM_ERROR = {
  success: false,
  errorType: 'api_error',
  message: 'Something went wrong on our end — try again in a moment.',
}

/** Split an SSE buffer into complete `event:`/`data:` frames. */
function drainSseFrames(buffer, onFrame) {
  let rest = buffer
  let boundary = rest.indexOf('\n\n')

  while (boundary !== -1) {
    const frame = rest.slice(0, boundary)
    rest = rest.slice(boundary + 2)
    boundary = rest.indexOf('\n\n')

    let event = 'message'
    const dataLines = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length === 0) continue

    try {
      onFrame(event, JSON.parse(dataLines.join('\n')))
    } catch {
      // Ignore malformed frames rather than failing the whole run.
    }
  }

  return rest
}

async function compressed(photo) {
  if (!photo) return null
  try {
    return await preparePhotoForApi(photo)
  } catch {
    // Keep the original; the server falls back to whatever context it has.
    return photo
  }
}

/**
 * Streams progress from /api/find-alternatives, calling onStep as each stage
 * begins, and resolves with the final result payload. Falls back to a plain
 * JSON response if the server did not stream. Aborting rejects with AbortError.
 *
 * Candidates are judged side by side against the room and against the piece
 * that missed, so both photos go up with the request.
 */
export async function findAlternatives(
  room,
  rejectedVerdict,
  { piecePhoto = null, onStep, signal } = {},
) {
  const payload = roomContextPayload(room)
  const [roomPhoto, referencePhoto] = await Promise.all([
    compressed(payload.photo),
    compressed(piecePhoto),
  ])
  payload.photo = roomPhoto

  let response
  try {
    response = await fetch('/api/find-alternatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        room: payload,
        rejectedVerdict,
        piecePhoto: referencePhoto,
      }),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return NETWORK_ERROR
  }

  const isStream = response.headers
    .get('content-type')
    ?.includes('text/event-stream')

  if (!isStream || !response.body) {
    const data = await response.json().catch(() => STREAM_ERROR)
    if (!response.ok && !data.errorType) {
      return { ...STREAM_ERROR, message: data.message || 'Request failed' }
    }
    return data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = drainSseFrames(buffer, (event, data) => {
        if (event === 'step') onStep?.(data)
        else if (event === 'result') result = data
      })
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return result ?? NETWORK_ERROR
  } finally {
    reader.cancel().catch(() => {})
  }

  return result ?? STREAM_ERROR
}
