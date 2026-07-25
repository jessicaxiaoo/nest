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

export function useRooms() {
  const [rooms, setRooms] = useState(loadRooms)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function compressExistingPhotos() {
      const current = loadRooms()
      const needsCompression = current.some(
        (room) => room.photo && room.photo.length > LARGE_PHOTO_THRESHOLD,
      )
      if (!needsCompression) return

      const updated = await Promise.all(
        current.map(async (room) => {
          if (!room.photo || room.photo.length <= LARGE_PHOTO_THRESHOLD) {
            return room
          }
          try {
            return { ...room, photo: await compressDataUrl(room.photo) }
          } catch {
            return room
          }
        }),
      )

      if (!cancelled) setRooms(updated)
    }

    compressExistingPhotos()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const result = saveRooms(rooms)
    if (!result.ok) {
      setSaveError(result.message)
    } else {
      setSaveError(null)
    }
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
        return {
          ...room,
          plans: [plan, ...room.plans],
          dimensions: planData.dimensions ?? room.dimensions,
        }
      }),
    )
    return plan
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

  const removeChecklistItemByCategory = useCallback((roomId, category) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room
        return {
          ...room,
          checklist: (room.checklist ?? []).filter(
            (item) => item.category !== category,
          ),
        }
      }),
    )
  }, [])

  const isInChecklist = useCallback(
    (roomId, category) => {
      const room = rooms.find((r) => r.id === roomId)
      return (
        room?.checklist?.some((item) => item.category === category) ?? false
      )
    },
    [rooms],
  )

  return {
    rooms,
    saveError,
    addRoom,
    getRoom,
    updateRoom,
    deleteRoom,
    addPlan,
    updateDimensions,
    addChecklistItem,
    addCheckHistory,
    deleteCheckHistory,
    updateChecklistItem,
    updateChecklistStatus,
    deleteChecklistItem,
    removeChecklistItemByCategory,
    isInChecklist,
  }
}
