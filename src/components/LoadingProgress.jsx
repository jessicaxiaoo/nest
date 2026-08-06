import { Check, LoaderCircle, X } from 'lucide-react'

export default function LoadingProgress({ title, steps }) {
  return (
    <div
      className="rounded-xl bg-white px-4 py-4 ring-1 ring-gray-200/80"
      role="status"
      aria-live="polite"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800">
        <LoaderCircle
          size={16}
          strokeWidth={2}
          className="animate-spin text-vignette"
          aria-hidden="true"
        />
        {title}
      </div>
      <ol className="space-y-2">
        {steps.map((step) => {
          const state = step.status || 'pending'
          return (
            <li
              key={step.id}
              className={`flex items-center gap-2 text-xs ${
                state === 'pending'
                  ? 'text-gray-300'
                  : state === 'error'
                    ? 'text-red-600'
                    : 'text-gray-700'
              }`}
            >
              <span
                className="flex h-3 w-3 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                {state === 'done' ? (
                  <Check size={12} strokeWidth={2.5} className="text-vignette" />
                ) : state === 'error' ? (
                  <X size={12} strokeWidth={2.5} className="text-red-500" />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      state === 'active' ? 'bg-vignette' : 'bg-gray-200'
                    }`}
                  />
                )}
              </span>
              {step.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
