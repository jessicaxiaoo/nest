/** Merge a progress step into a list by id (used by plan + alternatives loaders). */
export function mergeStep(steps, incoming) {
  const index = steps.findIndex((step) => step.id === incoming.id)
  if (index === -1) return [...steps, incoming]
  const next = [...steps]
  next[index] = { ...next[index], ...incoming }
  return next
}
