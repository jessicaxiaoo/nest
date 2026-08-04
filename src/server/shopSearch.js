import { apiErrorResponse } from './utils.js'

const SERPER_URL = 'https://google.serper.dev/shopping'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_COUNT = 10
const MAX_RESULTS = 3
const SEARCH_TIMEOUT_MS = 10_000

/** In-memory cache keyed by normalized query + maxPrice. */
const queryCache = new Map()

function cacheKey(query, maxPrice) {
  return maxPrice != null ? `${query}::max${maxPrice}` : query
}

function getCached(query, maxPrice) {
  const entry = queryCache.get(cacheKey(query, maxPrice))
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    queryCache.delete(cacheKey(query, maxPrice))
    return null
  }
  return entry.products
}

function setCache(query, products, maxPrice) {
  queryCache.set(cacheKey(query, maxPrice), {
    products,
    cachedAt: Date.now(),
  })
}

function parseProductPrice(price) {
  if (price == null) return null
  if (typeof price === 'number' && Number.isFinite(price)) return price
  const cleaned = String(price).replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function normalizeProduct(item) {
  const link = item.link || item.productLink || item.url
  if (!link) return null

  const thumbnail = item.imageUrl || item.thumbnail || item.image || null
  const price =
    typeof item.price === 'string'
      ? item.price
      : item.price != null
        ? String(item.price)
        : null

  return {
    title: item.title || 'Product',
    price,
    priceValue: parseProductPrice(price),
    source: item.source || item.merchant || item.seller || null,
    link,
    thumbnail,
  }
}

function filterByMaxPrice(products, maxPrice) {
  if (maxPrice == null || !(maxPrice > 0)) return products
  return products.filter((product) => {
    if (product.priceValue == null) return false
    return product.priceValue <= maxPrice
  })
}

export async function searchShopping(query, maxPrice = null, options = {}) {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return {
      success: false,
      errorType: 'config',
      message: 'Shopping search is not configured.',
      products: [],
    }
  }

  const q = String(query || '').trim()
  if (!q) {
    return {
      success: false,
      errorType: 'validation',
      message: 'Missing search query.',
      products: [],
    }
  }

  const ceiling =
    maxPrice != null && Number(maxPrice) > 0 ? Number(maxPrice) : null
  const limit = Math.min(
    Math.max(Number(options.limit) || MAX_RESULTS, 1),
    FETCH_COUNT,
  )

  // The cache holds the full fetched page, so any limit up to FETCH_COUNT can be served from it.
  const cached = getCached(q, ceiling)
  if (cached) {
    return { success: true, products: cached.slice(0, limit), cached: true }
  }

  let response
  try {
    response = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, num: FETCH_COUNT }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[shopSearch] Serper request failed', err?.name || err)
    return {
      success: false,
      errorType: 'api_error',
      message: 'Shopping search failed.',
      products: [],
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('[shopSearch] Serper error', response.status, errText)
    return {
      success: false,
      errorType: 'api_error',
      message: 'Shopping search failed.',
      products: [],
    }
  }

  const data = await response.json().catch(() => null)
  if (!data) {
    return {
      success: false,
      errorType: 'api_error',
      message: 'Shopping search failed.',
      products: [],
    }
  }

  const products = filterByMaxPrice(
    (data.shopping ?? []).map(normalizeProduct).filter(Boolean),
    ceiling,
  )

  setCache(q, products, ceiling)

  return {
    success: true,
    products: products.slice(0, limit),
    cached: false,
  }
}

export async function handleShopSearchRequest(body) {
  const { query, maxPrice } = body ?? {}

  try {
    const result = await searchShopping(query, maxPrice)
    const status = result.success ? 200 : result.errorType === 'validation' ? 400 : 422
    return { status, body: result }
  } catch (err) {
    console.error('[handleShopSearchRequest]', err)
    return apiErrorResponse()
  }
}
