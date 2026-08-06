import { Plus } from 'lucide-react'

export default function EmptyState({ onAddRoom }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f9f8]">
      {/* Quiet atmosphere: soft green wash + faint warm lift */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(44, 95, 93, 0.14), transparent 55%),
            radial-gradient(ellipse 60% 40% at 80% 90%, rgba(44, 95, 93, 0.06), transparent 50%),
            linear-gradient(180deg, #f7f9f8 0%, #eef3f2 100%)
          `,
        }}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 sm:py-16">
        <div className="flex w-full max-w-lg flex-col items-center text-center">
          <h1 className="mx-auto">
            <img src="/vignette.png" alt="" className="h-20 sm:h-24" />
            <span className="sr-only">Vignette</span>
          </h1>
          <p className="type-label mb-3 mt-5 text-vignette sm:mt-6">Get started</p>
          <h2 className="mb-8 max-w-sm font-serif text-xl leading-snug text-gray-600 sm:mb-10 sm:max-w-md sm:text-2xl sm:leading-snug">
            Your spaces, reimagined with intention.
          </h2>

          {/* Photo-plane frame — echoes room photo cards without imagery */}
          <div className="relative w-full max-w-sm sm:max-w-md">
            <div
              className="pointer-events-none absolute -inset-x-4 -inset-y-6 rounded-2xl bg-white/40 shadow-[0_1px_0_rgba(44,95,93,0.06)] ring-1 ring-vignette/10 backdrop-blur-[2px] md:-inset-x-8"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-x-2 top-1/2 aspect-[16/9] -translate-y-1/2 rounded-xl bg-gradient-to-br from-vignette-muted/80 to-transparent ring-1 ring-inset ring-vignette/10 md:inset-x-6"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={onAddRoom}
              className="group relative z-10 mx-auto flex flex-col items-center gap-2.5 rounded-xl px-6 py-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-vignette focus-visible:ring-offset-2 sm:gap-3 sm:py-10"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-vignette text-white shadow-sm transition-colors group-hover:bg-vignette-light group-active:scale-[0.98] sm:h-16 sm:w-16">
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-vignette">
                Add your first room
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
