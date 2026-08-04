/**
 * Shared vocabulary for the four compatibility axes. Both the single-piece
 * check and the alternatives comparison speak this language, so a verdict from
 * either one renders and scores identically.
 */

const AXES = ['style', 'scale', 'color', 'budget']

const AXIS_SIGNALS = {
  style: ['compatible', 'minor_concern', 'clashes'],
  scale: ['appropriate', 'might_be_too_large', 'wrong_size'],
  color: ['harmonious', 'neutral', 'clashes'],
  budget: ['fits', 'stretch', 'over_budget', 'unknown'],
}

const AXIS_FALLBACK_SIGNAL = {
  style: 'minor_concern',
  scale: 'might_be_too_large',
  color: 'neutral',
  budget: 'unknown',
}

const AXIS_SIGNAL_SETS = Object.fromEntries(
  AXES.map((axis) => [axis, new Set(AXIS_SIGNALS[axis])]),
)

const AXIS_SCORES = {
  style: { compatible: 2, minor_concern: 1, clashes: 0 },
  scale: { appropriate: 2, might_be_too_large: 1, wrong_size: 0 },
  color: { harmonious: 2, neutral: 1, clashes: 0 },
  budget: { fits: 2, unknown: 1, stretch: 1, over_budget: 0 },
}

const HARD_CLASH_SIGNAL = {
  style: 'clashes',
  scale: 'wrong_size',
  color: 'clashes',
  budget: 'over_budget',
}

/**
 * Signals that count as a real reason to go shopping for a replacement. A
 * merely neutral color or an unpriced piece is not a problem worth solving.
 * Frontend imports needsAlternatives from this module — do not reimplement.
 */
export const AXIS_PROBLEM_SIGNALS = {
  style: new Set(['minor_concern', 'clashes']),
  scale: new Set(['might_be_too_large', 'wrong_size']),
  color: new Set(['clashes']),
  budget: new Set(['stretch', 'over_budget']),
}

/** JSON-schema fragment for one axis, for use inside a Claude tool schema. */
export function axisSchema(axis, reasoningDescription) {
  return {
    type: 'object',
    properties: {
      signal: { type: 'string', enum: AXIS_SIGNALS[axis] },
      reasoning: reasoningDescription
        ? { type: 'string', description: reasoningDescription }
        : { type: 'string' },
    },
    required: ['signal', 'reasoning'],
  }
}

export function normalizeAxis(axis, value) {
  const fallback = AXIS_FALLBACK_SIGNAL[axis]
  if (!value || typeof value !== 'object') {
    return { signal: fallback, reasoning: '' }
  }
  return {
    signal: AXIS_SIGNAL_SETS[axis].has(value.signal) ? value.signal : fallback,
    reasoning: typeof value.reasoning === 'string' ? value.reasoning : '',
  }
}

export function axisSignal(verdict, axis) {
  return verdict?.[axis]?.signal
}

function axisScore(verdict, axis) {
  return AXIS_SCORES[axis][axisSignal(verdict, axis)] ?? 0
}

export function verdictScore(verdict) {
  if (!verdict) return 0
  return AXES.reduce((total, axis) => total + axisScore(verdict, axis), 0)
}

function isHardClash(verdict, axis) {
  return axisSignal(verdict, axis) === HARD_CLASH_SIGNAL[axis]
}

export function failingAxes(verdict) {
  return AXES.filter((axis) =>
    AXIS_PROBLEM_SIGNALS[axis].has(axisSignal(verdict, axis)),
  )
}

export function needsAlternatives(verdict) {
  if (!verdict) return false
  return failingAxes(verdict).length > 0
}

/**
 * True when a candidate clashes on an axis the reference piece handled fine.
 * The only hard veto when picking alternatives: everything else is a judgment
 * call the model makes with both pieces in front of it.
 */
export function introducesNewClash(referenceVerdict, candidateVerdict) {
  return AXES.some(
    (axis) =>
      isHardClash(candidateVerdict, axis) &&
      !isHardClash(referenceVerdict, axis),
  )
}

const STRETCH_HEADROOM = 1.25
const ROOM_BUDGET_SHARE = 0.4

const CATEGORY_STOPWORDS = new Set([
  'and',
  'for',
  'from',
  'into',
  'piece',
  'room',
  'style',
  'that',
  'the',
  'this',
  'with',
  'your',
])

function categoryTokens(value) {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 3 && !CATEGORY_STOPWORDS.has(word)),
  )
}

/** Budget ceiling from the plan gap whose category overlaps the piece. */
export function matchingGapCeiling(planGaps, pieceDescription) {
  const pieceTokens = categoryTokens(pieceDescription)
  if (pieceTokens.size === 0) return null

  for (const gap of planGaps ?? []) {
    const max = Number(gap?.budgetMax)
    if (!Number.isFinite(max) || max <= 0) continue
    const overlaps = [...categoryTokens(gap?.category)].some((token) =>
      pieceTokens.has(token),
    )
    if (overlaps) return Math.round(max)
  }
  return null
}

/**
 * Per-piece price ceiling for a compatibility check: matching plan gap,
 * else remaining room budget (including $0), else a slice of the total room
 * budget when remaining was never computed.
 */
export function checkBudgetCeiling({
  roomBudget,
  budgetRemaining,
  planGaps,
  pieceDescription,
}) {
  const gapCeiling = matchingGapCeiling(planGaps, pieceDescription)
  if (gapCeiling != null) return gapCeiling

  if (budgetRemaining != null && Number.isFinite(Number(budgetRemaining))) {
    return Math.max(Math.round(Number(budgetRemaining)), 0)
  }

  const roomCap = Number(roomBudget)
  if (Number.isFinite(roomCap) && roomCap > 0) {
    return Math.round(roomCap * ROOM_BUDGET_SHARE)
  }
  return null
}

/**
 * Price fit, computed rather than asked. The numbers are known exactly, so
 * there is nothing for a vision model to add here.
 */
export function budgetAxis({ price, ceiling, roomBudget }) {
  if (!(Number(price) > 0)) {
    return {
      signal: 'unknown',
      reasoning: 'This listing did not include a price we could read.',
    }
  }

  const value = Number(price)
  // $0 remaining is a real ceiling — do not treat it as "no ceiling".
  const rawCap = Number(ceiling)
  const cap =
    ceiling != null && Number.isFinite(rawCap) && rawCap >= 0 ? rawCap : null
  const total = Number(roomBudget) > 0 ? Number(roomBudget) : null

  if (cap == null) {
    if (total == null) {
      return {
        signal: 'unknown',
        reasoning: 'No room budget was set, so I could not score this price.',
      }
    }
    if (value > total) {
      return {
        signal: 'over_budget',
        reasoning: `At $${Math.round(value)} this costs more than your whole $${Math.round(total)} room budget.`,
      }
    }
    return {
      signal: 'fits',
      reasoning: `$${Math.round(value)} sits within your room budget.`,
    }
  }

  if (value <= cap) {
    return {
      signal: 'fits',
      reasoning: `$${Math.round(value)} comes in under the $${Math.round(cap)} you have for this piece.`,
    }
  }
  if (value <= cap * STRETCH_HEADROOM) {
    return {
      signal: 'stretch',
      reasoning: `$${Math.round(value)} is a bit over the $${Math.round(cap)} you have for this piece, but not wildly.`,
    }
  }
  return {
    signal: 'over_budget',
    reasoning: `$${Math.round(value)} is well past the $${Math.round(cap)} that leaves room for the rest of your plan.`,
  }
}
