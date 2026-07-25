import { generateId } from '../lib/storage'

export function createPlanRecord(planData) {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...planData,
  }
}

export function createChecklistItem(item, source = 'plan') {
  return {
    id: generateId(),
    addedAt: new Date().toISOString(),
    status: 'saved',
    source,
    ...item,
  }
}

export function createCheckHistoryEntry(entry) {
  return {
    id: generateId(),
    checkedAt: new Date().toISOString(),
    ...entry,
  }
}
