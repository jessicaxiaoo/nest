import { useEffect, useRef, useState } from 'react'
import { Compass, ListOrdered, RefreshCw, ScanSearch } from 'lucide-react'
import { generatePlan } from '../lib/api'
import { buildChecklistPayload } from '../lib/checklistItem'
import { mergeStep } from '../lib/progressSteps'
import { parseProductPrice } from '../lib/shopCache'
import Button from './Button'
import DimensionsEditor from './DimensionsEditor'
import LoadingProgress from './LoadingProgress'
import PlanItem from './PlanItem'
import RoomAnalysis from './RoomAnalysis'

const FIRST_STEP = {
  analyze: {
    id: 'photo',
    label: 'Reading your room photo',
    status: 'active',
  },
  reanalyze: {
    id: 'photo',
    label: 'Reading your room photo',
    status: 'active',
  },
  refresh: {
    id: 'review',
    label: 'Reviewing your room analysis',
    status: 'active',
  },
}

function productSourceKey(product) {
  return product?.link || null
}

function findChecklistMatch(checklist, product) {
  const key = productSourceKey(product)
  if (!key) return null
  return (
    (checklist ?? []).find(
      (entry) => entry.sourceKey === key || entry.productLink === key,
    ) ?? null
  )
}

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
  viewingPlanId = null,
  onViewPlan,
  onPlanGenerated,
  onUpdateDimensions,
  onUpdatePhoto,
  onSaveToChecklist,
  onRemoveFromChecklist,
  hideDirection = false,
  setupFraming = false,
  externalLoading = false,
  externalLoadingMode = 'refresh',
  externalSteps = null,
  externalError = null,
  onClearExternalError,
  onRetryExternalError,
}) {
  const [loading, setLoading] = useState(false)
  const [loadingMode, setLoadingMode] = useState(null) // 'analyze' | 'refresh'
  const [steps, setSteps] = useState([])
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const inFlightRef = useRef(false)
  const runIdRef = useRef(0)

  const latestPlan = room.plans[0] ?? null
  const viewingPlan =
    viewingPlanId != null
      ? (room.plans.find((entry) => entry.id === viewingPlanId) ?? null)
      : null
  const plan = viewingPlan ?? latestPlan
  const viewingHistory = Boolean(
    plan && latestPlan && plan.id !== latestPlan.id,
  )
  const busy = loading || externalLoading
  const activeMode = loading
    ? loadingMode
    : externalLoading
      ? externalLoadingMode
      : null
  const progressSteps =
    externalLoading && Array.isArray(externalSteps) && externalSteps.length > 0
      ? externalSteps
      : steps
  const analysisBusy = busy && activeMode === 'reanalyze' && !viewingHistory
  const recommendationsBusy =
    busy && activeMode !== 'reanalyze' && !viewingHistory
  const displayError = viewingHistory ? null : error || externalError

  useEffect(() => {
    setError(null)
    setLoading(false)
    setLoadingMode(null)
    setSteps([])
    setShowHistory(false)
  }, [room.id])

  useEffect(() => {
    if (viewingHistory) setShowHistory(true)
  }, [viewingHistory])

  function beginSteps(mode) {
    setSteps([FIRST_STEP[mode] ?? FIRST_STEP.refresh])
  }

  async function runRecommendations(roomSnapshot = room) {
    if (inFlightRef.current) return false
    inFlightRef.current = true
    const runId = ++runIdRef.current

    setLoadingMode('refresh')
    setLoading(true)
    setError(null)
    onClearExternalError?.()
    beginSteps('refresh')

    try {
      const result = await generatePlan(roomSnapshot, {
        forceReanalyze: false,
        onStep: (step) => {
          if (runIdRef.current === runId) {
            setSteps((current) => mergeStep(current, step))
          }
        },
      })

      if (runIdRef.current !== runId) return false

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
      if (runIdRef.current !== runId) return false
      setError({
        type: 'api_error',
        message: err.message || 'Something went wrong on our end — try again in a moment.',
      })
      return false
    } finally {
      if (runIdRef.current === runId) {
        inFlightRef.current = false
        setLoading(false)
        setLoadingMode(null)
        setSteps([])
      }
    }
  }

  async function analyzeRoom() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const runId = ++runIdRef.current

    setLoadingMode('analyze')
    setLoading(true)
    setError(null)
    onClearExternalError?.()
    beginSteps('analyze')

    try {
      const result = await generatePlan(room, {
        forceReanalyze: true,
        onStep: (step) => {
          if (runIdRef.current === runId) {
            setSteps((current) => mergeStep(current, step))
          }
        },
      })

      if (runIdRef.current !== runId) return

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
      if (runIdRef.current !== runId) return
      setError({
        type: 'api_error',
        message: err.message || 'Something went wrong on our end — try again in a moment.',
      })
    } finally {
      if (runIdRef.current === runId) {
        inFlightRef.current = false
        setLoading(false)
        setLoadingMode(null)
        setSteps([])
      }
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
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-vignette-muted text-vignette">
          <ScanSearch size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="mb-1 font-serif text-2xl font-medium text-gray-900">
          {setupFraming ? 'Set up this room' : 'Current room analysis'}
        </p>
        <p className="mb-5 text-sm text-gray-400">
          {setupFraming
            ? 'Analyze your photo once — then you can check pieces against this room before you buy'
            : 'Analyze your photo, then get a prioritized list of what to add'}
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

        {busy ? (
          <div className="mx-auto max-w-md text-left">
            <LoadingProgress
              title="Analyzing your room…"
              steps={
                progressSteps.length > 0
                  ? progressSteps
                  : [FIRST_STEP.analyze]
              }
            />
          </div>
        ) : (
          <Button onClick={analyzeRoom} disabled={busy}>
            Analyze room
          </Button>
        )}
      </div>
    )
  }

  if (!plan) {
    return null
  }

  const analysisSection = (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3
            className={`flex items-center gap-2.5 font-serif font-medium text-gray-900 ${
              hideDirection ? 'text-xl' : 'text-2xl'
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
              <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Current room analysis
          </h3>
          <p className="mt-1 pl-10 text-xs text-gray-400">
            Updated {formatDate(plan.analyzedAt ?? plan.createdAt)}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-vignette-muted/40 px-3 py-4 sm:px-4">
        {analysisBusy ? (
          <LoadingProgress
            title="Re-analyzing your photo…"
            steps={
              progressSteps.length > 0
                ? progressSteps
                : [FIRST_STEP.reanalyze]
            }
          />
        ) : (
          <>
            <RoomAnalysis analysis={plan.roomAnalysis} />

            <div className="mt-3">
              <DimensionsEditor
                dimensions={
                  room.dimensions?.source === 'user'
                    ? room.dimensions
                    : (plan.dimensions ?? room.dimensions)
                }
                onSave={handleDimensionsSave}
                regenerating={loading || viewingHistory}
                readOnly={viewingHistory}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )

  const recommendationsSection = (
    <div>
      <div className="mb-5 flex items-center justify-between gap-2">
        <h4
          className={`flex items-center gap-2.5 font-serif font-medium text-gray-900 ${
            hideDirection ? 'text-xl' : 'text-2xl'
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
            <ListOrdered size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Recommendations for your room, by priority
        </h4>
        {!viewingHistory ? (
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
        ) : null}
      </div>
      {recommendationsBusy ? (
        <LoadingProgress
          title={
            activeMode === 'analyze'
              ? 'Analyzing your room…'
              : 'Refreshing ideas…'
          }
          steps={
            progressSteps.length > 0
              ? progressSteps
              : [FIRST_STEP[activeMode] ?? FIRST_STEP.refresh]
          }
        />
      ) : (
        <div className="space-y-3">
          {(plan.items ?? []).map((item, index) => (
            <PlanItem
              key={item.id}
              item={item}
              index={index}
              isProductSaved={(product) =>
                Boolean(findChecklistMatch(room.checklist, product))
              }
              onSaveProduct={(product) => {
                if (
                  !onSaveToChecklist ||
                  findChecklistMatch(room.checklist, product)
                ) {
                  return
                }
                const priceValue = parseProductPrice(product.price)
                onSaveToChecklist(
                  buildChecklistPayload({
                    category: item.category,
                    rationale: item.rationale,
                    priority: item.priority,
                    price: priceValue,
                    budgetMin: item.budgetMin,
                    budgetMax: item.budgetMax,
                    product: {
                      title: product.title,
                      price: product.price,
                      priceValue,
                      source: product.source,
                      link: product.link,
                      thumbnail: product.thumbnail,
                    },
                    sourceKey: productSourceKey(product),
                    planItemId: item.id,
                  }),
                )
              }}
              onRemoveProduct={
                onRemoveFromChecklist
                  ? (product) => {
                      const match = findChecklistMatch(
                        room.checklist,
                        product,
                      )
                      if (match) onRemoveFromChecklist(match)
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-8">
      {viewingHistory && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50/80 px-4 py-3 ring-1 ring-amber-100">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-950">
              Viewing earlier plan
            </p>
            <p className="mt-0.5 text-xs text-amber-900/70">
              {formatDate(plan.createdAt)} · {(plan.items ?? []).length}{' '}
              recommendation{(plan.items ?? []).length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onViewPlan?.(null)}
            className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200/80 transition-colors hover:bg-amber-50"
          >
            Back to current
          </button>
        </div>
      )}

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
            onClick={() => {
              if (externalError && onRetryExternalError) {
                onRetryExternalError()
              } else {
                runRecommendations()
              }
            }}
            className="mt-2 text-xs font-medium text-red-600 underline"
          >
            Try again
          </button>
        </div>
      )}

      {analysisSection}

      {plan.styleThesis && !hideDirection && (
        <div className="flex gap-3 rounded-xl bg-vignette-muted/50 px-4 py-3.5 ring-1 ring-vignette/10">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vignette text-white">
            <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="type-label mb-1 text-vignette/50">Direction</p>
            <p className="font-serif text-xl leading-snug text-gray-900 line-clamp-2">
              {plan.styleThesis}
            </p>
          </div>
        </div>
      )}

      {recommendationsSection}

      {room.plans.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-md px-1.5 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            {showHistory ? '▾' : '▸'} Plan history ({room.plans.length - 1}{' '}
            previous)
          </button>

          {showHistory && (
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => onViewPlan?.(null)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  !viewingHistory
                    ? 'bg-vignette-muted/60 font-medium text-vignette'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <span>Current plan</span>
                <span className="text-xs text-gray-400">
                  {formatDate(latestPlan.createdAt)}
                </span>
              </button>
              {room.plans.slice(1).map((oldPlan) => {
                const selected = viewingPlanId === oldPlan.id
                return (
                  <button
                    key={oldPlan.id}
                    type="button"
                    onClick={() => onViewPlan?.(oldPlan.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-amber-50 font-medium text-amber-950 ring-1 ring-amber-100'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    }`}
                  >
                    <span>
                      {formatDate(oldPlan.createdAt)} —{' '}
                      {(oldPlan.items ?? []).length} items
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {selected ? 'Viewing' : 'View'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
