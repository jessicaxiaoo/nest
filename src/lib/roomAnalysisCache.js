const CACHE_PREFIX = 'nest:room-analysis:'

async function hashPhoto(photo) {
  const data = String(photo || '')
  // Prefer a short stable key; fall back if SubtleCrypto unavailable
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(data.slice(0, 64_000))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
  }
  // FNV-1a-ish fallback
  let hash = 2166136261
  const sample = data.length > 8000 ? data.slice(0, 4000) + data.slice(-4000) : data
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv${(hash >>> 0).toString(16)}`
}

async function photoCacheKey(photo) {
  const hash = await hashPhoto(photo)
  return `${CACHE_PREFIX}${hash}`
}

export async function getCachedRoomAnalysis(photo) {
  if (!photo || typeof window === 'undefined') return null
  try {
    const key = await photoCacheKey(photo)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry?.analysis?.roomAnalysis) {
      localStorage.removeItem(key)
      return null
    }
    return entry.analysis
  } catch {
    return null
  }
}

export async function setCachedRoomAnalysis(photo, analysis) {
  if (!photo || !analysis || typeof window === 'undefined') return
  try {
    const key = await photoCacheKey(photo)
    localStorage.setItem(
      key,
      JSON.stringify({ analysis, cachedAt: Date.now() }),
    )
  } catch {
    // Quota / private mode
  }
}

export async function clearCachedRoomAnalysis(photo) {
  if (!photo || typeof window === 'undefined') return
  try {
    const key = await photoCacheKey(photo)
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
