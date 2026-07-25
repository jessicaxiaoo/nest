import ChecklistItemRow from './ChecklistItemRow'

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length
}

export default function ChecklistView({
  room,
  onBack,
  onUpdateStatus,
  onDeleteItem,
}) {
  const { checklist } = room
  const purchased = countByStatus(checklist, 'purchased')
  const placed = countByStatus(checklist, 'placed')
  const toBuy = countByStatus(checklist, 'saved')

  const sorted = [...checklist].sort((a, b) => {
    const order = { saved: 0, purchased: 1, placed: 2 }
    return order[a.status] - order[b.status]
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
        <h1 className="type-page-title mb-2">Checklist</h1>
        <p className="mb-8 text-sm text-gray-400">
          Track what you've saved, bought, and placed in your room
        </p>

        {checklist.length > 0 && (
          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-medium text-gray-900">{toBuy}</p>
              <p className="text-xs text-gray-400">To buy</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-medium text-nest">{purchased}</p>
              <p className="text-xs text-gray-400">Purchased</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-medium text-emerald-600">{placed}</p>
              <p className="text-xs text-gray-400">Placed</p>
            </div>
          </div>
        )}

        {checklist.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="mb-1 font-medium text-gray-700">No items yet</p>
            <p className="text-sm text-gray-400">
              Save items from your design plan or piece compatibility checks
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDeleteItem}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
