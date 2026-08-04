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

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <p className="type-label mb-3 text-nest">Get started</p>
          <h2 className="type-page-title mb-10">Your spaces, designed with intention</h2>

          {/* Photo-plane frame — echoes room photo cards without imagery */}
          <div className="relative w-full">
            <div
              className="pointer-events-none absolute -inset-x-4 -inset-y-6 rounded-2xl bg-white/40 shadow-[0_1px_0_rgba(44,95,93,0.06)] ring-1 ring-nest/10 backdrop-blur-[2px] md:-inset-x-8"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-x-2 top-1/2 aspect-[16/9] -translate-y-1/2 rounded-xl bg-gradient-to-br from-nest-muted/80 to-transparent ring-1 ring-inset ring-nest/10 md:inset-x-6"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={onAddRoom}
              className="group relative z-10 mx-auto flex flex-col items-center gap-3 rounded-xl px-6 py-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-2"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-nest text-white shadow-sm transition-colors group-hover:bg-nest-light group-active:scale-[0.98]">
                <Plus className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-nest">
                Add your first room
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
