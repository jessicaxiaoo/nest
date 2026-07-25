import { useState } from 'react'
import {
  Check,
  ChevronDown,
  DollarSign,
  MapPin,
  Plus,
  Ruler,
  Sparkles,
  X,
} from 'lucide-react'
import {
  PRIORITY_ACCENT,
  PRIORITY_STYLES,
  categoryIcon,
  formatBudgetRange,
  formatMaterialLine,
  formatPrice,
} from '../lib/itemVisuals'
import ShopProductStrip from './ShopProductStrip'

function formatDimensions(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return Object.values(value)
      .filter(Boolean)
      .map(String)
      .join(' × ')
  }
  return String(value)
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

function SaveButton({ saved, onSave, onRemove, item }) {
  if (saved) {
    return (
      <button
        type="button"
        onClick={() => onRemove(item)}
        title="Remove from checklist"
        className="group inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-nest transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-1 sm:w-auto"
      >
        <Check size={14} strokeWidth={2} aria-hidden="true" className="group-hover:hidden" />
        <X size={14} strokeWidth={2} aria-hidden="true" className="hidden group-hover:inline" />
        <span className="group-hover:hidden">Saved</span>
        <span className="hidden group-hover:inline">Undo</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSave(item)}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-nest transition-colors hover:bg-nest-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-1 sm:w-auto"
    >
      <Plus size={14} strokeWidth={2} aria-hidden="true" />
      Save to checklist
    </button>
  )
}

export default function PlanItem({ item, index, saved, onSave, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const dimensions = formatDimensions(item.estimatedDimensions)
  const Icon = categoryIcon(item.category)
  const materialLine = formatMaterialLine(item.material, item.texture)

  const accent =
    PRIORITY_ACCENT[item.priority] ?? PRIORITY_ACCENT.Medium

  return (
    <article className="relative overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-gray-200/80 transition-shadow hover:shadow-sm hover:ring-gray-300/80">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${accent}`}
        aria-hidden="true"
      />

      <div className="pl-4 pr-3 py-3.5 sm:pl-5 sm:pr-4">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nest text-xs font-semibold tabular-nums text-white">
              {index + 1}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-nest-muted text-nest">
              <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h4 className="type-card-title truncate">{item.category}</h4>
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.Medium}`}
          >
            {item.priority}
          </span>
        </div>

        {(item.colors?.length > 0 || item.styleName || materialLine) && (
          <div className="mb-2.5 flex flex-wrap items-center gap-2 sm:pl-[4.75rem]">
            {item.colors?.length > 0 && (
              <div className="flex items-center gap-1">
                {item.colors.map((hex, i) => (
                  <span
                    key={i}
                    title={hex}
                    className="h-3.5 w-3.5 rounded-full border border-gray-200/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            )}
            {item.styleName && (
              <span className="inline-flex items-center gap-1 rounded bg-nest-muted px-1.5 py-0.5 text-xs font-medium text-nest">
                <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                {item.styleName}
              </span>
            )}
            {materialLine && (
              <span className="text-sm text-gray-500">{materialLine}</span>
            )}
          </div>
        )}

        {(item.priceOptions?.length > 0 ||
          formatBudgetRange(item.budgetMin, item.budgetMax) ||
          dimensions ||
          item.placement) && (
          <div className="mb-2 rounded-lg bg-nest-muted/60 px-3 py-2.5 space-y-1.5 sm:ml-[4.75rem]">
            {item.priceOptions?.length > 0 ? (
              item.priceOptions.map((opt) => (
                <PropRow key={opt.tier} icon={DollarSign} label={opt.tier}>
                  <span className="font-medium text-gray-800">
                    {formatPrice(opt.price)}
                  </span>{' '}
                  <span
                    className={`text-xs ${opt.tier === 'Upgrade' ? 'text-nest' : 'text-gray-400'}`}
                  >
                    {opt.tier}
                  </span>
                </PropRow>
              ))
            ) : formatBudgetRange(item.budgetMin, item.budgetMax) ? (
              <PropRow icon={DollarSign} label="Budget">
                <span className="font-medium text-gray-800">
                  {formatBudgetRange(item.budgetMin, item.budgetMax)}
                </span>
              </PropRow>
            ) : null}

            {dimensions && (
              <PropRow icon={Ruler} label="Size">
                {dimensions}
              </PropRow>
            )}

            {item.placement && (
              <PropRow icon={MapPin} label="Positioning">
                {item.placement}
              </PropRow>
            )}
          </div>
        )}

        {item.rationale && (
          <div className="mb-1 sm:pl-[4.75rem]">
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
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                {item.rationale}
              </p>
            )}
          </div>
        )}

        <div className="sm:pl-[4.75rem]">
          <ShopProductStrip item={item} />

          <div className="mt-2 flex justify-end border-t border-gray-50 pt-2.5">
            <SaveButton saved={saved} onSave={onSave} onRemove={onRemove} item={item} />
          </div>
        </div>
      </div>
    </article>
  )
}
