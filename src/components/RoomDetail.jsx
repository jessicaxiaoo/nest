import { useEffect, useState } from 'react'
import { CheckSquare, RefreshCw, ScanSearch, Wallet } from 'lucide-react'
import Button from './Button'
import EditPenButton, { EditActions } from './EditPenButton'
import PhotoUpload from './PhotoUpload'
import RoomPlan from './RoomPlan'
import { generatePlan } from '../lib/api'
import { clearCachedRoomAnalysis } from '../lib/roomAnalysisCache'

function formatBudget(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function RoomDetail({
  room,
  onBack,
  onDelete,
  onUpdateRoom,
  onCheckPiece,
  onViewChecklist,
  onPlanGenerated,
  onUpdateDimensions,
  onSaveToChecklist,
  onRemoveFromChecklist,
  isInChecklist,
}) {
  const [editingName, setEditingName] = useState(false)
  const [editingStyle, setEditingStyle] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [photoDraft, setPhotoDraft] = useState(room.photo)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeError, setReanalyzeError] = useState(null)
  const [refreshingForBudget, setRefreshingForBudget] = useState(false)

  const [name, setName] = useState(room.name)
  const [style, setStyle] = useState(room.style)
  const [budget, setBudget] = useState(String(room.budget))

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
    setRefreshingForBudget(false)
  }, [room.id])

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

  function handleSaveStyle() {
    const trimmed = style.trim()
    if (!trimmed) {
      setStyle(room.style)
      setEditingStyle(false)
      return
    }
    onUpdateRoom({ style: trimmed })
    setEditingStyle(false)
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

    if (!room.plans?.length || !room.photo) return

    setRefreshingForBudget(true)
    setReanalyzeError(null)

    try {
      const result = await generatePlan(
        { ...room, budget: value },
        { forceReanalyze: false },
      )

      if (!result?.success) {
        setReanalyzeError({
          type: result?.errorType || 'api_error',
          message:
            result?.message ||
            'Budget saved, but refreshing recommendations failed. Try Refresh ideas.',
        })
        return
      }

      if (!result.plan?.roomAnalysis || !Array.isArray(result.plan?.items)) {
        setReanalyzeError({
          type: 'parse_error',
          message:
            'Budget saved, but refreshing recommendations failed. Try Refresh ideas.',
        })
        return
      }

      onPlanGenerated(result.plan)
      if (result.photoUsed) {
        onUpdateRoom({ photo: result.photoUsed })
      }
    } catch (err) {
      setReanalyzeError({
        type: 'api_error',
        message:
          err.message ||
          'Budget saved, but refreshing recommendations failed. Try Refresh ideas.',
      })
    } finally {
      setRefreshingForBudget(false)
    }
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

    try {
      const result = await generatePlan(room, { forceReanalyze: true })

      if (!result?.success) {
        setReanalyzeError({
          type: result?.errorType || 'api_error',
          message:
            result?.message ||
            'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      if (!result.plan?.roomAnalysis || !Array.isArray(result.plan?.items)) {
        setReanalyzeError({
          type: 'parse_error',
          message: 'Something went wrong on our end — try again in a moment.',
        })
        return
      }

      onPlanGenerated(result.plan)
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
            <div className="relative">
              {room.photo ? (
                <div className="overflow-hidden rounded-xl">
                  <img
                    src={room.photo}
                    alt={room.name}
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
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
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleReanalyzePhoto}
                    disabled={reanalyzing}
                    title="Re-read architecture, lighting, and existing pieces from the photo"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      strokeWidth={2}
                      className={reanalyzing ? 'animate-spin' : ''}
                      aria-hidden="true"
                    />
                    {reanalyzing ? 'Re-analyzing…' : 'Re-analyze photo'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-3">
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
                className="type-page-title w-full border-b-2 border-nest bg-transparent py-1 focus:outline-none"
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
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="type-page-title">{room.name}</h1>
              <EditPenButton
                onClick={() => startEditing('name')}
                label="Edit room name"
              />
            </div>
          )}
        </div>

        <div className="mb-8">
          {editingStyle ? (
            <div className="space-y-3">
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
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-gray-700 focus:border-nest focus:outline-none focus:ring-1 focus:ring-nest"
              />
              <EditActions
                onSave={handleSaveStyle}
                onCancel={() => {
                  setStyle(room.style)
                  setEditingStyle(false)
                }}
                disabled={!style.trim()}
              />
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-gray-500">{room.style}</p>
              <EditPenButton
                onClick={() => startEditing('style')}
                label="Edit style"
              />
            </div>
          )}
        </div>

        <div className="mb-10 space-y-1">
          <div className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50 sm:px-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
              <Wallet size={15} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-400">Budget</p>
                {!editingBudget && (
                  <EditPenButton
                    onClick={() => startEditing('budget')}
                    label="Edit budget"
                  />
                )}
              </div>
              {editingBudget ? (
                <div className="mt-1 space-y-3">
                  <label htmlFor="room-budget-edit" className="sr-only">
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
                      className="w-full rounded-md border border-gray-200 py-2 pl-7 pr-3 text-lg focus:border-nest focus:outline-none focus:ring-1 focus:ring-nest"
                    />
                  </div>
                  <EditActions
                    onSave={handleSaveBudget}
                    onCancel={() => {
                      setBudget(String(room.budget))
                      setEditingBudget(false)
                    }}
                    disabled={!budget || Number(budget) <= 0 || refreshingForBudget}
                  />
                  <p className="text-xs text-gray-400">
                    Saving will refresh recommendations to fit this budget.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-base font-medium text-gray-900">
                    {formatBudget(room.budget)}
                  </p>
                  {refreshingForBudget && (
                    <p className="mt-1 text-xs text-gray-400">
                      Updating recommendations…
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 px-2 sm:px-3">
            <button
              type="button"
              onClick={onCheckPiece}
              className="group flex flex-col items-start gap-2 rounded-xl bg-nest-muted/50 px-3.5 py-3.5 text-left ring-1 ring-nest/10 transition-colors hover:bg-nest-muted hover:ring-nest/20"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-nest text-white">
                <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Check a piece</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {(room.checkHistory ?? []).length > 0
                    ? `${room.checkHistory.length} checked`
                    : 'Before you buy'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onViewChecklist}
              className="group flex flex-col items-start gap-2 rounded-xl bg-white px-3.5 py-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-gray-200/80 transition-colors hover:bg-gray-50 hover:ring-gray-300/80"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-nest-muted text-nest">
                <CheckSquare size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Checklist</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {room.checklist.length} items
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <RoomPlan
            room={room}
            onPlanGenerated={onPlanGenerated}
            onUpdateDimensions={onUpdateDimensions}
            onUpdatePhoto={(photo) => onUpdateRoom({ photo })}
            onSaveToChecklist={onSaveToChecklist}
            onRemoveFromChecklist={onRemoveFromChecklist}
            isInChecklist={isInChecklist}
            externalLoading={reanalyzing || refreshingForBudget}
            externalError={reanalyzeError}
            onClearExternalError={() => setReanalyzeError(null)}
          />

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onCheckPiece}>
              Check a piece
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onViewChecklist}>
              View checklist
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
