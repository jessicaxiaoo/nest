import { useEffect, useRef, useState } from 'react'
import {
  CheckSquare,
  Compass,
  RefreshCw,
  ScanSearch,
  Wallet,
} from 'lucide-react'
import EditPenButton, { EditActions } from './EditPenButton'
import PhotoUpload from './PhotoUpload'
import RoomPlan from './RoomPlan'
import { analyzeRoomPhoto, generatePlan } from '../lib/api'
import { checklistBudgetSummary } from '../lib/checklistItem'
import { formatPrice } from '../lib/itemVisuals'
import { mergeStep } from '../lib/progressSteps'
import { isEffectivelyEmptyRoom } from '../lib/roomOccupancy'
import { clearCachedRoomAnalysis } from '../lib/roomAnalysisCache'

export default function RoomDetail({
  room,
  onBack,
  onDelete,
  onUpdateRoom,
  onCheckPiece,
  onViewChecklist,
  onPlanGenerated,
  onUpdateAnalysis,
  onUpdateDimensions,
  onSaveToChecklist,
  onRemoveFromChecklist,
}) {
  const [editingName, setEditingName] = useState(false)
  const [editingStyle, setEditingStyle] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [photoDraft, setPhotoDraft] = useState(room.photo)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeError, setReanalyzeError] = useState(null)
  const [refreshingField, setRefreshingField] = useState(null) // 'budget' | 'style'
  const [progressSteps, setProgressSteps] = useState([])

  const [name, setName] = useState(room.name)
  const [style, setStyle] = useState(room.style)
  const [budget, setBudget] = useState(String(room.budget))
  const [viewingPlanId, setViewingPlanId] = useState(null)
  const latestPlan = room.plans[0] ?? null
  const hasPlan = Boolean(latestPlan)
  const viewingPlan =
    viewingPlanId != null
      ? (room.plans.find((plan) => plan.id === viewingPlanId) ?? null)
      : null
  const displayPlan = viewingPlan ?? latestPlan
  const viewingHistory = Boolean(viewingPlan && viewingPlan.id !== latestPlan?.id)
  const checkCount = (room.checkHistory ?? []).length
  const isEmptyRoom = isEffectivelyEmptyRoom(latestPlan?.roomAnalysis)
  // Empty rooms need the plan first; checker becomes hero once furnished
  // or after they've started checking candidates.
  const checkerAsHero = hasPlan && (!isEmptyRoom || checkCount > 0)
  const refreshAbortRef = useRef(null)

  const checklistLabel = (() => {
    const count = room.checklist.length
    if (count === 0) return 'Saved pieces'
    const summary = checklistBudgetSummary(room.checklist, room.budget)
    if (summary.allocated > 0) {
      return `Saved pieces · ${count} · ${formatPrice(summary.allocated)}`
    }
    return `Saved pieces · ${count}`
  })()

  useEffect(() => {
    if (!editingName) setName(room.name)
  }, [room.name, editingName])

  useEffect(() => {
    if (!editingStyle) setStyle(room.style)
  }, [room.style, editingStyle])

  useEffect(() => {
    if (!editingBudget) setBudget(String(room.budget))
  }, [room.budget, editingBudget])

  useEffect(() => {
    if (!editingPhoto) setPhotoDraft(room.photo)
  }, [room.photo, editingPhoto])

  useEffect(() => {
    setReanalyzeError(null)
    setReanalyzing(false)
    setRefreshingField(null)
    setViewingPlanId(null)
  }, [room.id])

  useEffect(() => {
    if (
      viewingPlanId != null &&
      !room.plans.some((plan) => plan.id === viewingPlanId)
    ) {
      setViewingPlanId(null)
    }
  }, [room.plans, viewingPlanId])

  useEffect(() => {
    // A newly generated plan becomes current — exit history view.
    setViewingPlanId(null)
  }, [latestPlan?.id])

  useEffect(
    () => () => {
      refreshAbortRef.current?.abort()
      refreshAbortRef.current = null
    },
    [],
  )

  function closeAllEditors() {
    setEditingName(false)
    setEditingStyle(false)
    setEditingBudget(false)
    setEditingPhoto(false)
  }

  function startEditing(field) {
    closeAllEditors()
    if (field === 'name') {
      setName(room.name)
      setEditingName(true)
    } else if (field === 'style') {
      setStyle(room.style)
      setEditingStyle(true)
    } else {
      setBudget(String(room.budget))
      setEditingBudget(true)
    }
  }

  function handleSaveName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(room.name)
      setEditingName(false)
      return
    }
    onUpdateRoom({ name: trimmed })
    setEditingName(false)
  }

  /**
   * Regenerate recommendations after an edit that changes their inputs.
   * `overrides` carries the new value, since `room` still holds the old one.
   * Aborts any in-flight refresh so rapid style/budget edits only pay for the
   * latest request.
   */
  async function refreshRecommendations(overrides, field, label) {
    if (!room.plans?.length || !room.photo) return

    refreshAbortRef.current?.abort()
    const controller = new AbortController()
    refreshAbortRef.current = controller
    const isCurrent = () => refreshAbortRef.current === controller

    const fallback = `${label} saved, but refreshing recommendations failed. Try Refresh ideas.`
    setRefreshingField(field)
    setReanalyzeError(null)
    setProgressSteps([
      {
        id: 'review',
        label: 'Reviewing your room analysis',
        status: 'active',
      },
    ])

    try {
      const result = await generatePlan(
        { ...room, ...overrides },
        {
          forceReanalyze: false,
          signal: controller.signal,
          onStep: (step) => {
            if (isCurrent()) {
              setProgressSteps((current) => mergeStep(current, step))
            }
          },
        },
      )

      if (!isCurrent()) return

      if (!result?.success) {
        setReanalyzeError({
          type: result?.errorType || 'api_error',
          message: result?.message || fallback,
        })
        return
      }

      if (!result.plan?.roomAnalysis || !Array.isArray(result.plan?.items)) {
        setReanalyzeError({ type: 'parse_error', message: fallback })
        return
      }

      onPlanGenerated(result.plan)
      if (result.photoUsed) {
        onUpdateRoom({ photo: result.photoUsed })
      }
    } catch (err) {
      if (err?.name === 'AbortError' || !isCurrent()) return
      setReanalyzeError({ type: 'api_error', message: err.message || fallback })
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null
        setRefreshingField(null)
        setProgressSteps([])
      }
    }
  }

  async function handleSaveStyle() {
    const trimmed = style.trim()
    if (!trimmed) {
      setStyle(room.style)
      setEditingStyle(false)
      return
    }
    if (trimmed === room.style) {
      setEditingStyle(false)
      return
    }

    onUpdateRoom({ style: trimmed })
    setEditingStyle(false)

    await refreshRecommendations({ style: trimmed }, 'style', 'Style')
  }

  async function handleSaveBudget() {
    const value = Number(budget)
    if (!budget || value <= 0) return
    if (value === room.budget) {
      setEditingBudget(false)
      return
    }

    onUpdateRoom({ budget: value })
    setEditingBudget(false)

    await refreshRecommendations({ budget: value }, 'budget', 'Budget')
  }

  function handleSavePhoto() {
    if (!photoDraft) return
    if (room.photo && room.photo !== photoDraft) {
      clearCachedRoomAnalysis(room.photo)
    }
    clearCachedRoomAnalysis(photoDraft)
    onUpdateRoom({ photo: photoDraft })
    setEditingPhoto(false)
  }

  async function handleReanalyzePhoto() {
    if (!room.photo || reanalyzing) return
    setReanalyzing(true)
    setReanalyzeError(null)
    setProgressSteps([
      {
        id: 'photo',
        label: 'Reading your room photo',
        status: 'active',
      },
    ])

    try {
      const result = await analyzeRoomPhoto(room, {
        onStep: (step) =>
          setProgressSteps((current) => mergeStep(current, step)),
      })

      if (!result?.success) {
        setReanalyzeError({
          type: result?.errorType || 'api_error',
          message:
            result?.message ||
            'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      if (!result.analysis?.roomAnalysis) {
        setReanalyzeError({
          type: 'parse_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      onUpdateAnalysis?.({
        roomAnalysis: result.analysis.roomAnalysis,
        dimensions: result.analysis.dimensions ?? null,
        analyzedAt: result.analysis.analyzedAt ?? new Date().toISOString(),
      })
      if (result.photoUsed) {
        onUpdateRoom({ photo: result.photoUsed })
      }
    } catch (err) {
      setReanalyzeError({
        type: 'api_error',
        message:
          err.message || 'Something went wrong on our end — try again in a moment.',
      })
    } finally {
      setReanalyzing(false)
      setProgressSteps([])
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
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
            All rooms
          </button>
          <button
            type="button"
            onClick={() => onDelete(room.id)}
            className="text-sm text-gray-400 transition-colors hover:text-red-500"
          >
            Delete
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          {editingPhoto ? (
            <div className="space-y-3">
              <PhotoUpload
                photo={photoDraft}
                onPhotoChange={setPhotoDraft}
                label="Drop your room photo here, or click to browse"
                hint="JPEG or PNG · empty or furnished rooms"
              />
              <EditActions
                onSave={handleSavePhoto}
                onCancel={() => {
                  setPhotoDraft(room.photo)
                  setEditingPhoto(false)
                }}
                disabled={!photoDraft}
              />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl">
              {room.photo ? (
                <img
                  src={room.photo}
                  alt={room.name}
                  className="aspect-[16/9] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                  No photo — tap the pen icon to add one
                </div>
              )}
              <div className="absolute right-3 top-3 rounded-md bg-white/90 shadow-sm backdrop-blur-sm">
                <EditPenButton
                  onClick={() => {
                    closeAllEditors()
                    setPhotoDraft(room.photo)
                    setEditingPhoto(true)
                  }}
                  label="Edit room photo"
                />
              </div>
              {room.photo && room.plans.length > 0 && (
                <div className="absolute bottom-3 right-3">
                  <button
                    type="button"
                    onClick={handleReanalyzePhoto}
                    disabled={reanalyzing}
                    title="Re-read architecture, lighting, and existing pieces from the photo"
                    className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1.5 text-xs text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-gray-700 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      strokeWidth={2}
                      className={reanalyzing ? 'animate-spin' : ''}
                      aria-hidden="true"
                    />
                    {reanalyzing ? 'Re-analyzing…' : 'Reanalyze room photo'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-8">
          {editingName ? (
            <div className="space-y-3">
              <label htmlFor="room-name-edit" className="sr-only">
                Room name
              </label>
              <input
                id="room-name-edit"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') {
                    setName(room.name)
                    setEditingName(false)
                  }
                }}
                autoFocus
                className="type-page-title w-full border-b-2 border-vignette bg-transparent py-1 focus:outline-none"
              />
              <EditActions
                onSave={handleSaveName}
                onCancel={() => {
                  setName(room.name)
                  setEditingName(false)
                }}
                disabled={!name.trim()}
              />
            </div>
          ) : editingStyle ? (
            <div className="space-y-3">
              <h1 className="type-page-title">{room.name}</h1>
              <label htmlFor="room-style-edit" className="sr-only">
                Style preferences
              </label>
              <textarea
                id="room-style-edit"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setStyle(room.style)
                    setEditingStyle(false)
                  }
                }}
                rows={3}
                autoFocus
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-gray-700 focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
              />
              <EditActions
                onSave={handleSaveStyle}
                onCancel={() => {
                  setStyle(room.style)
                  setEditingStyle(false)
                }}
                disabled={!style.trim() || refreshingField !== null}
              />
              <p className="text-xs text-gray-400">
                Saving will refresh recommendations to match this style.
              </p>
            </div>
          ) : editingBudget ? (
            <div className="space-y-3">
              <h1 className="type-page-title">{room.name}</h1>
              <p className="text-gray-500 line-clamp-2">{room.style}</p>
              <div className="space-y-3 rounded-lg bg-gray-50/80 px-3 py-3 ring-1 ring-gray-100">
                <label htmlFor="room-budget-edit" className="text-xs font-medium text-gray-400">
                  Budget
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    $
                  </span>
                  <input
                    id="room-budget-edit"
                    type="number"
                    min="1"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveBudget()
                      if (e.key === 'Escape') {
                        setBudget(String(room.budget))
                        setEditingBudget(false)
                      }
                    }}
                    autoFocus
                    className="w-full rounded-md border border-gray-200 bg-white py-2 pl-7 pr-3 text-lg focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
                  />
                </div>
                <EditActions
                  onSave={handleSaveBudget}
                  onCancel={() => {
                    setBudget(String(room.budget))
                    setEditingBudget(false)
                  }}
                  disabled={!budget || Number(budget) <= 0 || refreshingField !== null}
                />
                <p className="text-xs text-gray-400">
                  Saving will refresh recommendations to fit this budget.
                </p>
              </div>
            </div>
          ) : (
            <div className="group">
              <div className="flex items-start justify-between gap-3">
                <h1 className="type-page-title min-w-0">{room.name}</h1>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <EditPenButton
                    onClick={() => startEditing('name')}
                    label="Edit room name"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-start justify-between gap-3">
                <p className="min-w-0 text-[15px] leading-relaxed text-gray-500 line-clamp-2">
                  {room.style}
                </p>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <EditPenButton
                    onClick={() => startEditing('style')}
                    label="Edit style"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => startEditing('budget')}
                  className="inline-flex items-center gap-1.5 rounded-md text-sm text-gray-500 transition-colors hover:text-gray-800"
                >
                  <Wallet size={14} strokeWidth={1.75} className="text-gray-400" aria-hidden="true" />
                  <span className="font-medium tabular-nums text-gray-700">
                    {formatPrice(room.budget)}
                  </span>
                  <span className="text-gray-400">budget</span>
                </button>
                {refreshingField === 'style' || refreshingField === 'budget' ? (
                  <span className="text-xs text-gray-400">Updating recommendations…</span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {hasPlan && displayPlan?.styleThesis && (
          <div className="mb-6 flex gap-3 rounded-xl bg-vignette-muted/50 px-4 py-3.5 ring-1 ring-vignette/10">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vignette text-white">
              <Compass size={15} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="type-label mb-1 text-vignette/50">
                {viewingHistory ? 'Direction (earlier plan)' : 'Direction'}
              </p>
              <p className="font-serif text-xl leading-snug text-gray-900">
                {displayPlan.styleThesis}
              </p>
            </div>
          </div>
        )}

        {hasPlan && checkerAsHero ? (
          <section className="mb-10">
            <button
              type="button"
              onClick={onCheckPiece}
              className="group flex w-full items-start gap-4 rounded-2xl bg-vignette px-5 py-5 text-left text-white shadow-[0_8px_24px_rgba(44,95,93,0.18)] transition-colors hover:bg-vignette-light"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <ScanSearch size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-2xl font-medium leading-tight">
                  Before you buy
                </p>
                <p className="mt-1 text-sm text-white/75">
                  Check a piece against this room’s direction, scale, and budget
                </p>
                {checkCount > 0 && (
                  <p className="mt-2 text-xs text-white/55">
                    {checkCount} piece{checkCount === 1 ? '' : 's'} checked
                  </p>
                )}
              </div>
              <span
                className="mt-1 text-white/50 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                →
              </span>
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
              <button
                type="button"
                onClick={onViewChecklist}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
              >
                <CheckSquare size={14} strokeWidth={1.75} aria-hidden="true" />
                {checklistLabel}
              </button>
            </div>
          </section>
        ) : null}

        {hasPlan && !checkerAsHero ? (
          <section className="mb-8">
            <p className="mb-3 text-sm text-gray-400">
              This room is starting empty — use the plan below, then check
              candidates before you buy
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={onCheckPiece}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-vignette transition-colors hover:text-vignette-light"
              >
                <ScanSearch size={14} strokeWidth={1.75} aria-hidden="true" />
                Before you buy
              </button>
              <button
                type="button"
                onClick={onViewChecklist}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
              >
                <CheckSquare size={14} strokeWidth={1.75} aria-hidden="true" />
                {checklistLabel}
              </button>
            </div>
          </section>
        ) : null}

        <div className="space-y-6">
          <RoomPlan
            room={room}
            viewingPlanId={viewingPlanId}
            onViewPlan={setViewingPlanId}
            onPlanGenerated={onPlanGenerated}
            onUpdateDimensions={onUpdateDimensions}
            onUpdatePhoto={(photo) => onUpdateRoom({ photo })}
            onSaveToChecklist={onSaveToChecklist}
            onRemoveFromChecklist={onRemoveFromChecklist}
            hideDirection={hasPlan}
            setupFraming={!hasPlan}
            externalLoading={reanalyzing || refreshingField !== null}
            externalLoadingMode={reanalyzing ? 'reanalyze' : 'refresh'}
            externalSteps={progressSteps}
            externalError={reanalyzeError}
            onClearExternalError={() => setReanalyzeError(null)}
            onRetryExternalError={
              reanalyzeError ? handleReanalyzePhoto : undefined
            }
          />
        </div>
      </main>
    </div>
  )
}
