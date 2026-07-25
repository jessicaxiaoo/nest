import Button from './Button'

function PlusIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function RoomCard({ room, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-gray-100 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-nest focus-visible:ring-offset-2"
    >
      <div className="aspect-[4/3] overflow-hidden bg-gray-50">
        {room.photo ? (
          <img
            src={room.photo}
            alt={room.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-200">
            <PlusIcon className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <h2 className="type-card-title">{room.name}</h2>
        <p className="mt-0.5 text-sm text-gray-400">{room.style}</p>
      </div>
    </button>
  )
}

export default function Dashboard({ rooms, onAddRoom, onOpenRoom }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <h1 className="font-serif text-2xl text-nest">Nest</h1>
          <Button onClick={onAddRoom} className="flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            Add a Room
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h2 className="type-page-title">Your spaces</h2>
          <p className="mt-1 text-sm text-gray-400">
            {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onClick={() => onOpenRoom(room.id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
