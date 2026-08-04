/** Minor clutter — not enough to treat the room as furnished. */
export const MINOR_ITEM_PATTERN =
  /\b(bins?|baskets?|hampers?|box(?:es)?\b(?!\s+springs?)|clutter|laundry|cords?|cables?|piles?|trash|wastebasket|garbage|misc(ellaneous)?|toys)\b/i

/** Phrases the model uses when the room has no real furniture. */
const EMPTY_SIGNAL_PATTERN =
  /\b(empty|unfurnished|no furniture|none|bare|vacant|not available|n\/a)\b/i

function toPoints(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (value != null && value !== '') return [String(value)]
  return []
}

/**
 * True when analysis shows no major furniture — empty or clutter-only.
 * Used to prioritize the room plan over the piece checker.
 */
export function isEffectivelyEmptyRoom(analysis) {
  const pieces = toPoints(analysis?.existingPieces)
  if (pieces.length === 0) return true

  const major = pieces.filter(
    (point) =>
      !MINOR_ITEM_PATTERN.test(point) && !EMPTY_SIGNAL_PATTERN.test(point),
  )
  return major.length === 0
}
