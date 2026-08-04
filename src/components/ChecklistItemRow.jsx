import { useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import {
  applyChecklistBudget,
  checklistItemAmount,
  checklistProductCard,
  checklistPriceLabel,
  checklistSourceLabel,
  checklistTitle,
  isChecklistBought,
} from '../lib/checklistItem'
import { categoryIcon } from '../lib/itemVisuals'
import EditPenButton, { EditActions } from './EditPenButton'
import { ShopProductCard } from './ShopProductStrip'

export default function ChecklistItemRow({
  item,
  onUpdateStatus,
  onUpdateBudget,
  onDelete,
}) {
  const title = checklistTitle(item)
  const Icon = categoryIcon(item.category || title)
  const price = checklistPriceLabel(item)
  const amount = checklistItemAmount(item)
  const product = checklistProductCard(item)
  const rationale = item.rationale?.trim()
  const bought = isChecklistBought(item)

  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState(
    amount > 0 ? String(amount) : '',
  )

  useEffect(() => {
    if (!editingBudget) {
      setBudgetDraft(amount > 0 ? String(amount) : '')
    }
  }, [amount, editingBudget, item.id])

  function handleSaveBudget() {
    if (!onUpdateBudget) return
    const value = Number(budgetDraft)
    if (!(value > 0)) return
    onUpdateBudget(item.id, applyChecklistBudget(item, value))
    setEditingBudget(false)
  }

  function handleCancelBudget() {
    setBudgetDraft(amount > 0 ? String(amount) : '')
    setEditingBudget(false)
  }

  return (
    <div className="rounded-lg px-3 py-4 transition-colors hover:bg-gray-50/80 sm:px-4">
      <div className="mb-2 flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-nest-muted text-nest">
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h3
          className={`type-card-title min-w-0 truncate ${
            bought ? 'text-gray-500 line-through decoration-gray-300' : ''
          }`}
        >
          {title}
        </h3>
        {bought ? (
          <span className="shrink-0 rounded-md bg-nest-muted px-1.5 py-0.5 text-[11px] font-medium text-nest">
            Bought
          </span>
        ) : null}
      </div>

      {rationale ? (
        <p className="mb-2 line-clamp-2 text-sm text-gray-500">{rationale}</p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editingBudget ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="relative w-36">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-gray-400">
                $
              </span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                aria-label={`Budget for ${title}`}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveBudget()
                  if (e.key === 'Escape') handleCancelBudget()
                }}
                className="w-full rounded-md border border-gray-200 py-1.5 pl-6 pr-2 text-sm text-gray-900 focus:border-nest focus:outline-none focus:ring-1 focus:ring-nest"
                autoFocus
              />
            </div>
            <EditActions
              onSave={handleSaveBudget}
              onCancel={handleCancelBudget}
              disabled={!(Number(budgetDraft) > 0)}
            />
          </div>
        ) : (
          <>
            {price ? (
              <span className="text-sm font-medium text-gray-700">{price}</span>
            ) : (
              <span className="text-sm text-gray-400">No budget set</span>
            )}
            {onUpdateBudget ? (
              <EditPenButton
                onClick={() => setEditingBudget(true)}
                label={price ? 'Edit budget' : 'Add budget'}
              />
            ) : null}
            <span className="text-xs text-gray-300">
              {checklistSourceLabel(item.source)}
            </span>
          </>
        )}
      </div>

      {product ? (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <ShopProductCard product={product} />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={bought}
          onClick={() =>
            onUpdateStatus?.(item.id, bought ? 'saved' : 'bought')
          }
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            bought
              ? 'bg-nest text-white'
              : 'border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <Check size={13} strokeWidth={2} aria-hidden="true" />
          {bought ? 'Bought' : 'Mark bought'}
        </button>
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
