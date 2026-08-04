import { failingAxes } from '../../api/lib/verdict.js'

const CACHE_PREFIX = 'nest:alternatives:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function simpleHash(value) {
  const data = String(value || '')
  let hash = 2166136261
  const sample =
    data.length > 8000 ? data.slice(0, 4000) + data.slice(-4000) : data
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Cache key for a find-alternatives run. Same room + same miss + same query
 * should not re-burn a multi-image Claude compare.
 */
function alternativesCacheKey({ roomId, verdict, piecePhoto }) {
  const axes = failingAxes(verdict).join(',')
  const query = String(verdict?.searchQuery ?? '')
    .trim()
    .toLowerCase()
  const piece = String(verdict?.pieceDescription ?? '')
    .trim()
    .toLowerCase()
  const price = Number(verdict?.piecePrice) > 0 ? Number(verdict.piecePrice) : ''
  const photoPart = piecePhoto ? simpleHash(piecePhoto) : 'nophoto'
  return `${CACHE_PREFIX}${roomId ?? 'room'}:${axes}:${simpleHash(`${query}|${piece}|${price}|${photoPart}`)}`
}

export function getCachedAlternatives(keyParts) {
  if (typeof window === 'undefined') return null
  try {
    const key = alternativesCacheKey(keyParts)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (
      !entry?.result ||
      !Array.isArray(entry.result.alternatives) ||
      Date.now() - entry.cachedAt > CACHE_TTL_MS
    ) {
      localStorage.removeItem(key)
      return null
    }
    return entry.result
  } catch {
    return null
  }
}

export function setCachedAlternatives(keyParts, result) {
  if (typeof window === 'undefined' || !result?.success) return
  const alternatives = result.alternatives ?? []
  // Empty runs should not lock "Search again" behind a multi-day cache hit.
  if (!Array.isArray(alternatives) || alternatives.length === 0) return
  try {
    const key = alternativesCacheKey(keyParts)
    localStorage.setItem(
      key,
      JSON.stringify({
        result: {
          success: true,
          summary: result.summary ?? '',
          alternatives,
        },
        cachedAt: Date.now(),
      }),
    )
  } catch {
    // Quota / private mode
  }
}

export function clearCachedAlternatives(keyParts) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(alternativesCacheKey(keyParts))
  } catch {
    // Ignore
  }
}
