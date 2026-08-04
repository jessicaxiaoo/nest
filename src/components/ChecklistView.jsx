import ChecklistItemRow from './ChecklistItemRow'
import {
  checklistBudgetSummary,
  isChecklistBought,
} from '../lib/checklistItem'
import { formatPrice } from '../lib/itemVisuals'

function BudgetSummary({ room }) {
  const summary = checklistBudgetSummary(room.checklist, room.budget)
  if (!summary.roomBudget && summary.allocated === 0) return null

  const progress =
    summary.roomBudget > 0
      ? Math.min((summary.allocated / summary.roomBudget) * 100, 100)
      : 0
  const over = summary.overBy > 0

  return (
    <div className="mb-6 rounded-lg border border-gray-100 px-3 py-2.5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium text-gray-900">
          {formatPrice(summary.allocated)}
          {summary.roomBudget != null ? (
            <span className="font-normal text-gray-400">
              {' '}
              of {formatPrice(summary.roomBudget)}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-gray-500">
          {over ? (
            <span className="font-medium text-red-600">
              {formatPrice(summary.overBy)} over
            </span>
          ) : summary.remaining != null ? (
            <span>{formatPrice(summary.remaining)} left</span>
          ) : null}
          {summary.spent > 0 ? (
            <span className="text-gray-400">
              {over || summary.remaining != null ? ' · ' : ''}
              {formatPrice(summary.spent)} spent
            </span>
          ) : null}
        </p>
      </div>

      {summary.roomBudget != null ? (
        <div
          className="h-1 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Saved pieces budget used"
        >
          <div
            className={`h-full rounded-full transition-[width] ${
              over ? 'bg-red-500' : 'bg-nest'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {summary.pricedCount < summary.itemCount ? (
        <p className="mt-1.5 text-[11px] text-gray-400">
          {summary.itemCount - summary.pricedCount} still need a budget
        </p>
      ) : null}
    </div>
  )
}

export default function ChecklistView({
  room,
  onBack,
  onUpdateStatus,
  onUpdateBudget,
  onDeleteItem,
}) {
  const { checklist } = room

  const sorted = [...checklist].sort((a, b) => {
    const aBought = isChecklistBought(a) ? 1 : 0
    const bBought = isChecklistBought(b) ? 1 : 0
    if (aBought !== bBought) return aBought - bBought
    return 0
  })

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-5">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
            {room.name}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="type-page-title mb-2">Saved pieces</h1>
        <p className="mb-8 text-sm text-gray-400">
          Pieces you're considering for this room
        </p>

        {checklist.length > 0 ? <BudgetSummary room={room} /> : null}

        {checklist.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="mb-1 font-medium text-gray-700">No pieces yet</p>
            <p className="text-sm text-gray-400">
              Save from your recommendations or when you check a piece
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                onUpdateStatus={onUpdateStatus}
                onUpdateBudget={onUpdateBudget}
                onDelete={onDeleteItem}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
