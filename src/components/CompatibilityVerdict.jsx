import { useState } from 'react'
import {
  Check,
  ChevronDown,
  Compass,
  DollarSign,
  Lightbulb,
  Palette,
  Plus,
  Scale,
  Sparkles,
  X,
} from 'lucide-react'
import { categoryIcon, formatPrice } from '../lib/itemVisuals'

const MAX_TITLE_WORDS = 6

function shortTitle(value, fallback = 'Furniture piece') {
  const words = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return fallback
  return words.slice(0, MAX_TITLE_WORDS).join(' ')
}

const SIGNAL_META = {
  style: {
    compatible: { tone: 'good', short: 'Compatible' },
    minor_concern: { tone: 'warn', short: 'Minor concern' },
    clashes: { tone: 'bad', short: 'Clashes' },
  },
  scale: {
    appropriate: { tone: 'good', short: 'Appropriate' },
    might_be_too_large: { tone: 'warn', short: 'Might be large' },
    wrong_size: { tone: 'bad', short: 'Wrong size' },
  },
  color: {
    harmonious: { tone: 'good', short: 'Harmonious' },
    neutral: { tone: 'warn', short: 'Neutral' },
    clashes: { tone: 'bad', short: 'Clashes' },
  },
  budget: {
    fits: { tone: 'good', short: 'Fits budget' },
    stretch: { tone: 'warn', short: 'Stretch' },
    over_budget: { tone: 'bad', short: 'Over budget' },
    unknown: { tone: 'neutral', short: 'No price' },
  },
}

const TONE_STYLES = {
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-800',
  bad: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
}

const TONE_ACCENT = {
  good: 'bg-emerald-200',
  warn: 'bg-amber-200',
  bad: 'bg-red-200',
  neutral: 'bg-gray-200',
}

const AXIS_ICONS = {
  style: Sparkles,
  scale: Scale,
  color: Palette,
  budget: DollarSign,
}

const AXIS_LABELS = {
  style: 'Style',
  scale: 'Scale',
  color: 'Color',
  budget: 'Budget',
}

function summarizeVerdict(verdict) {
  const styleOk = verdict.style?.signal === 'compatible'
  const scaleOk = verdict.scale?.signal === 'appropriate'
  const colorOk =
    verdict.color?.signal === 'harmonious' ||
    verdict.color?.signal === 'neutral'
  const budgetOk =
    !verdict.budget ||
    verdict.budget.signal === 'fits' ||
    verdict.budget.signal === 'unknown'
  const hardClash =
    verdict.style?.signal === 'clashes' ||
    verdict.scale?.signal === 'wrong_size' ||
    verdict.color?.signal === 'clashes' ||
    verdict.budget?.signal === 'over_budget'

  if (hardClash) return { label: 'Likely skip', tone: 'bad' }
  if (styleOk && scaleOk && colorOk && budgetOk) {
    return { label: 'Looks good', tone: 'good' }
  }
  return { label: 'Mixed', tone: 'warn' }
}

function PropRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-gray-400">
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{label}: </span>
        <span className="text-gray-600">{children}</span>
      </div>
    </div>
  )
}

function AxisRow({ axis, data }) {
  const meta = SIGNAL_META[axis]?.[data?.signal]
  if (!meta || !data) return null
  const Icon = AXIS_ICONS[axis]

  return (
    <PropRow icon={Icon} label={AXIS_LABELS[axis]}>
      <span
        className={`mr-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${TONE_STYLES[meta.tone]}`}
      >
        {meta.short}
      </span>
      <span className="text-gray-600">{data.reasoning}</span>
    </PropRow>
  )
}

export default function CompatibilityVerdict({
  verdict,
  photo,
  saved = false,
  onSave,
  onRemove,
  footer,
}) {
  const [expanded, setExpanded] = useState(true)
  const summary = summarizeVerdict(verdict)
  const title = shortTitle(verdict.pieceDescription)
  const Icon = categoryIcon(title)
  const needsAlternative =
    verdict.alternativeSuggestion &&
    (verdict.style.signal !== 'compatible' ||
      verdict.scale.signal !== 'appropriate' ||
      verdict.color.signal !== 'harmonious' ||
      verdict.budget?.signal === 'over_budget' ||
      verdict.budget?.signal === 'stretch')

  return (
    <article className="relative overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-gray-200/80">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${TONE_ACCENT[summary.tone]}`}
        aria-hidden="true"
      />

      <div className="pl-4 pr-3 py-3.5 sm:pl-5 sm:pr-4">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {photo ? (
              <img
                src={photo}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200/80"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-nest-muted text-nest">
                <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <h4
                className="type-card-title truncate"
                title={verdict.pieceDescription || title}
              >
                {title}
              </h4>
              {verdict.piecePrice > 0 && (
                <p className="mt-0.5 text-xs text-gray-400">
                  {formatPrice(verdict.piecePrice)}
                </p>
              )}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES[summary.tone]}`}
          >
            {summary.label}
          </span>
        </div>

        <div className="mb-2 rounded-lg bg-nest-muted/60 px-3 py-2.5 space-y-2 sm:ml-12">
          <AxisRow axis="style" data={verdict.style} />
          <AxisRow axis="scale" data={verdict.scale} />
          <AxisRow axis="color" data={verdict.color} />
          <AxisRow axis="budget" data={verdict.budget} />
        </div>

        {verdict.overallVerdict && (
          <div className="mb-1 sm:ml-12">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
              {expanded ? 'Hide details' : 'Details'}
            </button>

            {expanded && (
              <div className="mt-2 space-y-3">
                <div className="flex gap-3 rounded-xl bg-nest-muted/50 px-3.5 py-3 ring-1 ring-nest/10">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-nest text-white">
                    <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="type-label mb-1 text-nest/50">Overall</p>
                    <p className="text-sm leading-relaxed text-gray-700">
                      {verdict.overallVerdict}
                    </p>
                  </div>
                </div>

                {needsAlternative && (
                  <div className="flex gap-3 rounded-xl bg-amber-50/80 px-3.5 py-3 ring-1 ring-amber-100">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                      <Lightbulb size={15} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="type-label mb-1 text-amber-700/70">
                        What to look for instead
                      </p>
                      <p className="text-sm leading-relaxed text-amber-900/80">
                        {verdict.alternativeSuggestion}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(onSave || onRemove || footer) && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-gray-50 pt-2.5 sm:ml-12">
            {footer}
            {saved && onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                title="Remove from checklist"
                className="group inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-nest transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-1"
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="group-hover:hidden"
                />
                <X
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="hidden group-hover:inline"
                />
                <span className="group-hover:hidden">Saved</span>
                <span className="hidden group-hover:inline">Undo</span>
              </button>
            ) : onSave ? (
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-nest transition-colors hover:bg-nest-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-1"
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                Save to checklist
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}

export { summarizeVerdict, TONE_STYLES, TONE_ACCENT }
