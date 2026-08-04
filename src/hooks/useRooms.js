import { useCallback, useEffect, useState } from 'react'
import { compressDataUrl } from '../lib/image'
import { generateId, loadRooms, saveRooms } from '../lib/storage'
import {
  createCheckHistoryEntry,
  createChecklistItem,
  createPlanRecord,
} from '../lib/plans'

const LARGE_PHOTO_THRESHOLD = 400_000
const MAX_CHECK_HISTORY = 20
const MAX_PLANS = 10
/** Kept when a save fails on quota, to buy room for the user's latest change. */
const PRUNED_PLANS = 3
const PRUNED_CHECK_HISTORY = 8

/** Trim history that is cheap to lose, to make room for the user's latest change. */
function pruneHistory(rooms) {
  let changed = false

  const next = rooms.map((room) => {
    const plans = room.plans ?? []
    const checkHistory = room.checkHistory ?? []
    if (
      plans.length <= PRUNED_PLANS &&
      checkHistory.length <= PRUNED_CHECK_HISTORY
    ) {
      return room
    }
    changed = true
    return {
      ...room,
      plans: plans.slice(0, PRUNED_PLANS),
      checkHistory: checkHistory.slice(0, PRUNED_CHECK_HISTORY),
    }
  })

  return changed ? next : rooms
}

export function useRooms() {
  const [rooms, setRooms] = useState(loadRooms)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function compressExistingPhotos() {
      const oversized = loadRooms().filter(
        (room) => room.photo && room.photo.length > LARGE_PHOTO_THRESHOLD,
      )
      if (oversized.length === 0) return

      const compressed = new Map()
      await Promise.all(
        oversized.map(async (room) => {
          try {
            compressed.set(room.id, {
              from: room.photo,
              to: await compressDataUrl(room.photo),
            })
          } catch {
            // Leave the original in place.
          }
        }),
      )
      if (cancelled || compressed.size === 0) return

      // Merge rather than replace: edits made while compressing must survive,
      // and a photo swapped out mid-flight must not be clobbered.
      setRooms((prev) =>
        prev.map((room) => {
          const entry = compressed.get(room.id)
          return entry && room.photo === entry.from
            ? { ...room, photo: entry.to }
            : room
        }),
      )
    }

    compressExistingPhotos()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const result = saveRooms(rooms)
    if (result.ok) {
      setSaveError(null)
      return
    }

    // On quota failure the write is lost but state still holds the change, so
    // a reload would silently discard it. Free space and retry before giving up.
    if (result.quotaExceeded) {
      const pruned = pruneHistory(rooms)
      if (pruned !== rooms && saveRooms(pruned).ok) {
        setSaveError(null)
        setRooms(pruned)
        return
      }
    }

    setSaveError(result.message)
  }, [rooms])

  const addRoom = useCallback((roomData) => {
    const room = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      plans: [],
      checklist: [],
      checkHistory: [],
      dimensions: null,
      ...roomData,
    }
    setRooms((prev) => [...prev, room])
    return room
  }, [])

  const getRoom = useCallback(
    (id) => rooms.find((room) => room.id === id),
    [rooms],
  )

  const updateRoom = useCallback((id, updates) => {
    setRooms((prev) =>
      prev.map((room) => (room.id === id ? { ...room, ...updates } : room)),
    )
  }, [])

  const deleteRoom = useCallback((id) => {
    setRooms((prev) => prev.filter((room) => room.id !== id))
  }, [])

  const addPlan = useCallback((roomId, planData) => {
    const plan = createPlanRecord(planData)
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        // Only updateDimensions may clear a user-entered measurement
        const userLockedDims = room.dimensions?.source === 'user'
        return {
          ...room,
          plans: [plan, ...room.plans].slice(0, MAX_PLANS),
          dimensions: userLockedDims
            ? room.dimensions
            : (planData.dimensions ?? room.dimensions),
        }
      }),
    )
    return plan
  }, [])

  /** Patch the latest plan in place (e.g. re-analyze photo without new recommendations). */
  const updateLatestPlan = useCallback((roomId, updates) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId || !room.plans?.[0]) return room
        const [latest, ...rest] = room.plans
        const userLockedDims = room.dimensions?.source === 'user'
        const nextPlan = {
          ...latest,
          ...updates,
          ...(userLockedDims && updates.dimensions
            ? { dimensions: room.dimensions }
            : {}),
        }
        const next = {
          ...room,
          plans: [nextPlan, ...rest],
        }
        if (updates.dimensions && !userLockedDims) {
          next.dimensions = updates.dimensions
        }
        return next
      }),
    )
  }, [])

  const updateDimensions = useCallback((roomId, dimensions) => {
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? { ...room, dimensions: { ...dimensions, source: 'user' } }
          : room,
      ),
    )
  }, [])

  const addChecklistItem = useCallback((roomId, item, source = 'plan') => {
    const checklistItem = createChecklistItem(item, source)
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? { ...room, checklist: [...(room.checklist ?? []), checklistItem] }
          : room,
      ),
    )
    return checklistItem
  }, [])

  const addCheckHistory = useCallback((roomId, entry) => {
    const record = createCheckHistoryEntry(entry)
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        const history = [record, ...(room.checkHistory ?? [])].slice(
          0,
          MAX_CHECK_HISTORY,
        )
        return { ...room, checkHistory: history }
      }),
    )
    return record
  }, [])

  const deleteCheckHistory = useCallback((roomId, checkId) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        return {
          ...room,
          checkHistory: (room.checkHistory ?? []).filter(
            (item) => item.id !== checkId,
          ),
        }
      }),
    )
  }, [])

  const updateCheckHistory = useCallback((roomId, checkId, updates) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        return {
          ...room,
          checkHistory: (room.checkHistory ?? []).map((item) =>
            item.id === checkId ? { ...item, ...updates } : item,
          ),
        }
      }),
    )
  }, [])

  const updateChecklistItem = useCallback((roomId, itemId, updates) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        return {
          ...room,
          checklist: (room.checklist ?? []).map((item) =>
            item.id === itemId ? { ...item, ...updates } : item,
          ),
        }
      }),
    )
  }, [])

  const updateChecklistStatus = useCallback((roomId, itemId, status) => {
    updateChecklistItem(roomId, itemId, { status })
  }, [updateChecklistItem])

  const deleteChecklistItem = useCallback((roomId, itemId) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        return {
          ...room,
          checklist: (room.checklist ?? []).filter((item) => item.id !== itemId),
        }
      }),
    )
  }, [])

  return {
    rooms,
    saveError,
    addRoom,
    getRoom,
    updateRoom,
    deleteRoom,
    addPlan,
    updateLatestPlan,
    updateDimensions,
    addChecklistItem,
    addCheckHistory,
    updateCheckHistory,
    deleteCheckHistory,
    updateChecklistItem,
    updateChecklistStatus,
    deleteChecklistItem,
  }
}
