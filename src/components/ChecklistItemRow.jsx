import { Check, Home, ShoppingCart, Trash2 } from 'lucide-react'
import {
  PRIORITY_STYLES,
  categoryIcon,
  formatBudgetRange,
  formatMaterialLine,
  formatPrice,
} from '../lib/itemVisuals'
import ShopProductStrip from './ShopProductStrip'

const STATUS_OPTIONS = [
  { value: 'saved', label: 'To buy', icon: ShoppingCart },
  { value: 'purchased', label: 'Purchased', icon: Check },
  { value: 'placed', label: 'Placed', icon: Home },
]

const STATUS_ACTIVE_STYLES = {
  saved: 'bg-gray-600 text-white',
  purchased: 'bg-nest text-white',
  placed: 'bg-emerald-600 text-white',
}

export default function ChecklistItemRow({ item, onUpdateStatus, onDelete }) {
  const budget = formatBudgetRange(item.budgetMin, item.budgetMax)
  const Icon = categoryIcon(item.category)
  const materialLine = formatMaterialLine(item.material, item.texture)

  return (
    <div className="rounded-lg px-3 py-4 transition-colors hover:bg-gray-50/80 sm:px-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-nest-muted text-nest">
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h3 className="type-card-title truncate">{item.category}</h3>
        </div>
      </div>

      {(item.colors?.length > 0 || item.styleName || materialLine) && (
        <div className="mb-2 space-y-2">
          {item.colors?.length > 0 && (
            <div className="flex items-center gap-1">
              {item.colors.map((hex, i) => (
                <span
                  key={i}
                  title={hex}
                  className="h-4 w-4 rounded-full border border-gray-200"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          )}
          {item.styleName && (
            <span className="inline-flex rounded-full bg-nest-muted px-2 py-0.5 text-xs font-medium text-nest">
              {item.styleName}
            </span>
          )}
          {materialLine && (
            <p className="text-sm text-gray-600">{materialLine}</p>
          )}
        </div>
      )}

      {item.rationale && (
        <p className="mb-2 text-sm text-gray-500">{item.rationale}</p>
      )}

      {item.placement && (
        <p className="mb-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Place:</span>{' '}
          {item.placement}
        </p>
      )}

      {item.priceOptions?.length > 0 ? (
        <div className="mb-3 space-y-1">
          {item.priceOptions.map((opt) => (
            <p key={opt.tier} className="text-sm">
              <span className="font-medium text-gray-700">
                {formatPrice(opt.price)}
              </span>{' '}
              <span
                className={`type-label ${opt.tier === 'Upgrade' ? 'text-nest' : ''}`}
              >
                {opt.tier}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {item.priority && item.source === 'plan' && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[item.priority]}`}
          >
            {item.priority}
          </span>
        )}
        {budget && !item.priceOptions?.length && (
          <span className="text-sm font-medium text-gray-700">{budget}</span>
        )}
        <span className="text-xs text-gray-300">
          {item.source === 'plan' ? 'From plan' : 'From piece check'}
        </span>
      </div>

      <ShopProductStrip item={item} />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {STATUS_OPTIONS.map(({ value, label, icon: StatusIcon }) => {
            const active = item.status === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => !active && onUpdateStatus(item.id, value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? STATUS_ACTIVE_STYLES[value]
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                <StatusIcon size={13} strokeWidth={2} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          title="Delete item"
          aria-label="Delete item"
          className="rounded-md p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
