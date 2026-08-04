import { generateId } from '../lib/storage'

export function createPlanRecord(planData) {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...planData,
  }
}

export function createChecklistItem(item, source = 'plan') {
  const {
    id: _ignoredId,
    addedAt: _ignoredAddedAt,
    status: _ignoredStatus,
    source: _ignoredSource,
    ...rest
  } = item ?? {}

  return {
    ...rest,
    id: generateId(),
    addedAt: new Date().toISOString(),
    status: 'saved',
    source,
  }
}

export function createCheckHistoryEntry(entry) {
  return {
    id: generateId(),
    checkedAt: new Date().toISOString(),
    ...entry,
  }
}
