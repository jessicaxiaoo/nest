import { useState } from 'react'
import Button from './Button'
import PhotoUpload from './PhotoUpload'

const STEPS = ['name', 'photo', 'style', 'budget']
const STEP_LABELS = ['Name', 'Photo', 'Style', 'Budget']

export default function RoomSetup({ onComplete, onCancel }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState(null)
  const [style, setStyle] = useState('')
  const [budget, setBudget] = useState('')
  const [photoError, setPhotoError] = useState('')

  const stepId = STEPS[step]

  function goNext() {
    if (stepId === 'photo' && !photo) {
      setPhotoError('Please upload a photo of your room')
      return
    }
    setPhotoError('')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setPhotoError('')
    if (step === 0) {
      onCancel()
    } else {
      setStep((s) => s - 1)
    }
  }

  function handleSubmit() {
    if (!budget || Number(budget) <= 0) return

    onComplete({
      name: name.trim(),
      photo,
      style: style.trim(),
      budget: Number(budget),
    })
  }

  const canContinue =
    (stepId === 'name' && name.trim().length > 0) ||
    (stepId === 'photo' && photo !== null) ||
    (stepId === 'style' && style.trim().length > 0) ||
    stepId === 'budget'

  const isLastStep = step === STEPS.length - 1

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-12">
      <button
        type="button"
        onClick={goBack}
        className="mb-6 flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
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
        Back
      </button>

      {/* Progress sits at the top so you see where you are before the step content */}
      <div className="mb-8">
        <p className="type-label mb-2 text-nest">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-nest' : 'bg-gray-100'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mb-10">
        <h1 className="type-page-title">
          {stepId === 'name' && 'Name your room'}
          {stepId === 'photo' && 'Add a room photo'}
          {stepId === 'style' && 'Describe your style'}
          {stepId === 'budget' && 'Set your budget'}
        </h1>
        {stepId === 'name' && (
          <p className="mt-2 text-sm text-gray-500">
            Use the room type in the name so recommendations fit — bedroom, living
            room, office, etc.
          </p>
        )}
        {stepId === 'photo' && (
          <p className="mt-2 text-sm text-gray-500">
            Empty or already furnished — upload whatever your room looks like today
          </p>
        )}
        {stepId === 'style' && (
          <p className="mt-2 text-sm text-gray-500">
            Be specific: name a style, materials or colors you want, and anything
            to avoid. Vague words like “cozy” alone are less helpful.
          </p>
        )}
      </div>

      <div className="mb-12">
        {stepId === 'name' && (
          <div>
            <label htmlFor="room-name" className="sr-only">
              Room name
            </label>
            <input
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Primary bedroom, Living room, Home office"
              autoFocus
              className="w-full border-b-2 border-gray-200 bg-transparent py-3 text-lg text-gray-900 placeholder:text-gray-300 focus:border-nest focus:outline-none"
            />
          </div>
        )}

        {stepId === 'photo' && (
          <PhotoUpload
            photo={photo}
            onPhotoChange={(p) => {
              setPhoto(p)
              setPhotoError('')
            }}
            error={photoError}
            label="Drop your room photo here, or click to browse"
            hint="JPEG or PNG · empty or furnished rooms"
          />
        )}

        {stepId === 'style' && (
          <div>
            <label htmlFor="room-style" className="sr-only">
              Style preferences
            </label>
            <textarea
              id="room-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder='e.g. "Warm, cozy, Japandi-inspired with natural wood tones"'
              rows={4}
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-gray-900 placeholder:text-gray-300 focus:border-nest focus:outline-none focus:ring-1 focus:ring-nest"
            />
          </div>
        )}

        {stepId === 'budget' && (
          <div>
            <label htmlFor="room-budget" className="mb-2 block text-sm text-gray-500">
              Total budget for this room
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                $
              </span>
              <input
                id="room-budget"
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="3,000"
                autoFocus
                className="w-full rounded-lg border border-gray-200 py-3 pl-8 pr-4 text-lg text-gray-900 placeholder:text-gray-300 focus:border-nest focus:outline-none focus:ring-1 focus:ring-nest"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        {isLastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={!budget || Number(budget) <= 0}
          >
            Create room
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canContinue}>
            Continue
          </Button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        Step {step + 1}: {STEP_LABELS[step]}
      </p>
    </main>
  )
}
