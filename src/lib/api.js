import { preparePhotoForApi } from './image'
import {
  clearCachedRoomAnalysis,
  getCachedRoomAnalysis,
  setCachedRoomAnalysis,
} from './roomAnalysisCache'
import {
  filterProductsByMaxPrice,
  getCachedShopResults,
  setCachedShopResults,
} from './shopCache'

async function postJson(url, body) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
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
 * Generate or regenerate a plan.
 * @param {object} room
 * @param {{ forceReanalyze?: boolean }} [options]
 *   forceReanalyze: clear photo cache and re-run Call A + Call B
 *   default: use cached Call A when available; only re-run Call B
 */
export async function generatePlan(room, { forceReanalyze = false } = {}) {
  if (!room.photo) {
    return {
      success: false,
      errorType: 'validation',
      message:
        'This room is missing a photo. Add a new room photo below the image to generate a plan.',
    }
  }

  let photo = room.photo
  try {
    photo = await preparePhotoForApi(room.photo)
  } catch {
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
    }
    await setCachedRoomAnalysis(photo, analysis)
  }

  if (!analysis) {
    const analysisResult = await postJson('/api/analyze-room', {
      name: room.name,
      photo,
    })
    if (!analysisResult.success) {
      if (photo !== room.photo) analysisResult.photoUsed = photo
      return analysisResult
    }
    analysis = analysisResult.analysis
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

  const recsResult = await postJson('/api/recommend-items', {
    name: room.name,
    style: room.style,
    budget: room.budget,
    analysis,
  })

  if (!recsResult.success) {
    if (photo !== room.photo) recsResult.photoUsed = photo
    return recsResult
  }

  const plan = {
    roomAnalysis: analysis.roomAnalysis,
    styleThesis: recsResult.recommendations?.styleThesis ?? null,
    // Keep user dimensions on the plan when they've edited them
    dimensions: room.dimensions ?? analysis.dimensions,
    items: recsResult.recommendations?.items ?? [],
  }

  if (!plan.roomAnalysis || !Array.isArray(plan.items)) {
    return {
      success: false,
      errorType: 'parse_error',
      message: 'Something went wrong on our end — try again in a moment.',
    }
  }

  const data = { success: true, plan, analysis }
  if (photo !== room.photo) data.photoUsed = photo
  return data
}

export async function scrapeProductUrl(url) {
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
      message: 'Something went wrong fetching that image. Try uploading a photo.',
    }
  }
}

/** Set to true to resume Serper shopping lookups. */
const SHOP_SEARCH_ENABLED = true

export async function searchShopProducts(query, maxPrice = null) {
  if (!SHOP_SEARCH_ENABLED) {
    return { success: false, products: [] }
  }

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

export async function checkCompatibility(room, piecePhoto, piecePrice) {
  const latestPlan = room.plans?.[0]
  const response = await fetch('/api/check-compatibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: {
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
      },
      piecePhoto,
      piecePrice:
        piecePrice != null && Number(piecePrice) > 0
          ? Number(piecePrice)
          : null,
    }),
  })

  const data = await response.json()

  if (!response.ok && !data.errorType) {
    throw new Error(data.message || 'Failed to check compatibility')
  }

  return data
}
