const CACHE_PREFIX = 'nest:shop:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function cacheKey(query, maxPrice) {
  const pricePart = maxPrice != null ? `:max${maxPrice}` : ''
  return `${CACHE_PREFIX}${query.trim().toLowerCase()}${pricePart}`
}

export function getCachedShopResults(query, maxPrice) {
  if (!query || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(cacheKey(query, maxPrice))
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry?.products || Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(query, maxPrice))
      return null
    }
    return entry.products
  } catch {
    return null
  }
}

export function setCachedShopResults(query, products, maxPrice) {
  if (!query || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      cacheKey(query, maxPrice),
      JSON.stringify({ products, cachedAt: Date.now() }),
    )
  } catch {
    // Quota exceeded or private mode — ignore
  }
}

/** Highest allowed price: upgrade tier if present, else budgetMax. */
export function getItemMaxPrice(item) {
  if (!item) return null
  const candidates = []
  if (Number(item.budgetMax) > 0) candidates.push(Number(item.budgetMax))
  for (const opt of item.priceOptions ?? []) {
    if (Number(opt.price) > 0) candidates.push(Number(opt.price))
  }
  if (candidates.length === 0) return null
  return Math.max(...candidates)
}

/** Parse a Serper price string like "$1,299.00" or "80" into a number. */
export function parseProductPrice(price) {
  if (price == null) return null
  if (typeof price === 'number' && Number.isFinite(price)) return price
  const cleaned = String(price).replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

export function filterProductsByMaxPrice(products, maxPrice) {
  if (maxPrice == null || !(maxPrice > 0)) return products ?? []
  return (products ?? []).filter((product) => {
    const amount = parseProductPrice(product.price)
    // Keep unpriced results only if we have no better filter signal —
    // prefer dropping them so we don't show unknown over-budget items.
    if (amount == null) return false
    return amount <= maxPrice
  })
}

/**
 * Build a shopping query from a plan / checklist item.
 * Prefer the model-authored searchQuery (written for store search);
 * fall back to concatenating recommendation chips for older plans.
 * Price stays out of the query — callers pass maxPrice to Serper separately.
 */
export function buildShopQuery(item) {
  if (!item) return ''

  const authored =
    typeof item.searchQuery === 'string' ? item.searchQuery.trim() : ''
  if (authored) {
    return authored.replace(/\s+/g, ' ')
  }

  const parts = [
    item.material,
    item.category,
    item.estimatedDimensions,
    item.styleName,
  ].filter((part) => part != null && String(part).trim() !== '')

  const maxPrice = getItemMaxPrice(item)
  if (maxPrice != null) {
    parts.push(`under $${Math.round(maxPrice)}`)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
