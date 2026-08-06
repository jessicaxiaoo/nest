const STORAGE_KEY = 'vignette-rooms'

export function loadRooms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRooms(rooms) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms))
    return { ok: true }
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22)
    return {
      ok: false,
      quotaExceeded: isQuota,
      message: isQuota
        ? 'Storage is full — try using smaller photos or removing a room.'
        : 'Failed to save your rooms.',
    }
  }
}

export function generateId() {
  return crypto.randomUUID()
}
