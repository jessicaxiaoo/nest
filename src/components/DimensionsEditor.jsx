import { useEffect, useState } from 'react'
import { Ruler } from 'lucide-react'
import Button from './Button'

export default function DimensionsEditor({
  dimensions,
  onSave,
  regenerating = false,
  readOnly = false,
}) {
  const [length, setLength] = useState(dimensions?.length ?? '')
  const [width, setWidth] = useState(dimensions?.width ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setLength(dimensions?.length ?? '')
    setWidth(dimensions?.width ?? '')
    if (readOnly) setEditing(false)
  }, [dimensions?.length, dimensions?.width, readOnly])

  function handleSave() {
    onSave({
      length: length ? Number(length) : null,
      width: width ? Number(width) : null,
      confident: dimensions?.confident ?? false,
      note: dimensions?.note ?? null,
    })
    setEditing(false)
  }

  const displayNote =
    dimensions?.note ??
    (length && width
      ? 'Estimated from your room photo — measure the room before purchasing large furniture.'
      : null)

  return (
    <div className="rounded-lg bg-white/70 px-3 py-3 ring-1 ring-gray-100/80 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-vignette-muted text-vignette">
            <Ruler size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Room dimensions
        </p>
        {!editing && !readOnly && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={regenerating}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-vignette transition-colors hover:bg-vignette-muted disabled:opacity-50"
          >
            Edit
          </button>
        )}
      </div>

      {!editing && displayNote && (
        <p className="mb-2 text-sm leading-relaxed text-gray-500">
          {displayNote}
        </p>
      )}

      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label htmlFor="dim-length" className="mb-1 block text-xs text-gray-400">
                Length (ft)
              </label>
              <input
                id="dim-length"
                type="number"
                min="1"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="12"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
              />
            </div>
            <span className="mt-5 text-gray-300">×</span>
            <div className="flex-1">
              <label htmlFor="dim-width" className="mb-1 block text-xs text-gray-400">
                Width (ft)
              </label>
              <input
                id="dim-width"
                type="number"
                min="1"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="14"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Saving will refresh recommendations to fit these dimensions.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="px-4 py-2 text-xs">
              Save & refresh ideas
            </Button>
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-base font-medium text-gray-900">
            {length && width
              ? `${length} ft × ${width} ft`
              : 'Dimensions not set — tap Edit to add'}
          </p>
          {regenerating && (
            <p className="mt-2 text-xs text-gray-400">Updating recommendations…</p>
          )}
        </>
      )}
    </div>
  )
}
