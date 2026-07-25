import { useEffect, useState } from 'react'
import { Compass, ListOrdered, RefreshCw, ScanSearch } from 'lucide-react'
import { generatePlan } from '../lib/api'
import Button from './Button'
import DimensionsEditor from './DimensionsEditor'
import PlanItem from './PlanItem'
import RoomAnalysis from './RoomAnalysis'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function RoomPlan({
  room,
  onPlanGenerated,
  onUpdateDimensions,
  onUpdatePhoto,
  onSaveToChecklist,
  onRemoveFromChecklist,
  isInChecklist,
  externalLoading = false,
  externalError = null,
  onClearExternalError,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const latestPlan = room.plans[0] ?? null
  const busy = loading || externalLoading
  const displayError = error || externalError

  useEffect(() => {
    setError(null)
    setLoading(false)
    setShowHistory(false)
  }, [room.id])

  async function runRecommendations(roomSnapshot = room) {
    setLoading(true)
    setError(null)
    onClearExternalError?.()

    try {
      const result = await generatePlan(roomSnapshot, { forceReanalyze: false })

      if (!result || typeof result !== 'object') {
        setError({
          type: 'api_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return false
      }

      if (!result.success) {
        setError({ type: result.errorType, message: result.message })
        return false
      }

      if (!result.plan?.roomAnalysis || !Array.isArray(result.plan?.items)) {
        setError({
          type: 'parse_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return false
      }

      onPlanGenerated(result.plan)

      if (result.photoUsed) {
        onUpdatePhoto?.(result.photoUsed)
      }
      return true
    } catch (err) {
      setError({
        type: 'api_error',
        message: err.message || 'Something went wrong on our end — try again in a moment.',
      })
      return false
    } finally {
      setLoading(false)
    }
  }

  async function analyzeRoom() {
    setLoading(true)
    setError(null)
    onClearExternalError?.()

    try {
      const result = await generatePlan(room, { forceReanalyze: true })

      if (!result || typeof result !== 'object') {
        setError({
          type: 'api_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      if (!result.success) {
        setError({ type: result.errorType, message: result.message })
        return
      }

      if (!result.plan?.roomAnalysis || !Array.isArray(result.plan?.items)) {
        setError({
          type: 'parse_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      onPlanGenerated(result.plan)

      if (result.photoUsed) {
        onUpdatePhoto?.(result.photoUsed)
      }
    } catch (err) {
      setError({
        type: 'api_error',
        message: err.message || 'Something went wrong on our end — try again in a moment.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleDimensionsSave(dims) {
    onUpdateDimensions(dims)
    if (!latestPlan) return
    await runRecommendations({ ...room, dimensions: dims })
  }

  if (!latestPlan) {
    return (
      <div className="rounded-xl bg-gray-50/80 px-6 py-10 text-center ring-1 ring-gray-100">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-nest-muted text-nest">
          <ScanSearch size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="mb-1 font-serif text-2xl font-medium text-gray-900">
          Current room analysis
        </p>
        <p className="mb-5 text-sm text-gray-400">
          Analyze your photo, then get a prioritized list of what to add
        </p>

        {displayError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-700">
            <p>{displayError.message}</p>
            {(displayError.type === 'photo_quality' ||
              displayError.type === 'validation') && (
              <p className="mt-1 text-red-500">
                Use the pen icon on the room photo above to replace it, then try again.
              </p>
            )}
          </div>
        )}

        <Button onClick={analyzeRoom} disabled={busy}>
          {busy ? 'Analyzing your room…' : 'Analyze room'}
        </Button>

        {busy && (
          <p className="mt-3 text-xs text-gray-400">
            This usually takes 15–30 seconds
          </p>
        )}
      </div>
    )
  }

  const plan = latestPlan

  return (
    <div className="space-y-8">
      {displayError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{displayError.message}</p>
          {(displayError.type === 'photo_quality' ||
            displayError.type === 'validation') && (
            <p className="mt-1 text-red-500">
              Use the pen icon on the room photo above to replace it, then try again.
            </p>
          )}
          <button
            type="button"
            onClick={() => runRecommendations()}
            className="mt-2 text-xs font-medium text-red-600 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Facts about the room — quieter surface, separate from recommendations */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-nest-muted text-nest">
                <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Current room analysis
            </h3>
            <p className="mt-1 pl-10 text-xs text-gray-400">
              Updated {formatDate(plan.createdAt)}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-nest-muted/40 px-3 py-4 sm:px-4">
          <RoomAnalysis analysis={plan.roomAnalysis} />

          <div className="mt-3">
            <DimensionsEditor
              dimensions={room.dimensions}
              onSave={handleDimensionsSave}
              regenerating={loading}
            />
          </div>
        </div>
      </section>

      {plan.styleThesis && (
        <div className="flex gap-3 rounded-xl bg-nest-muted/50 px-4 py-3.5 ring-1 ring-nest/10">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-nest text-white">
            <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="type-label mb-1 text-nest/50">Direction</p>
            <p className="font-serif text-xl leading-snug text-gray-900 line-clamp-2">
              {plan.styleThesis}
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="mb-5 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-nest-muted text-nest">
              <ListOrdered size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            What to add, in order
          </h4>
          <button
            type="button"
            onClick={() => runRecommendations()}
            disabled={busy}
            title="Refresh recommendations only (keeps room analysis)"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={loading ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {loading ? 'Refreshing…' : 'Refresh ideas'}
          </button>
        </div>
        <div className="space-y-3">
          {plan.items.map((item, index) => (
            <PlanItem
              key={item.id}
              item={item}
              index={index}
              saved={isInChecklist(item.category)}
              onSave={onSaveToChecklist}
              onRemove={onRemoveFromChecklist}
            />
          ))}
        </div>
      </div>

      {room.plans.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-md px-1.5 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            {showHistory ? '▾' : '▸'} Plan history ({room.plans.length - 1} previous)
          </button>

          {showHistory && (
            <div className="mt-2 space-y-1">
              {room.plans.slice(1).map((oldPlan) => (
                <div
                  key={oldPlan.id}
                  className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                >
                  {formatDate(oldPlan.createdAt)} — {oldPlan.items.length} items
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
