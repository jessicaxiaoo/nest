import { Plus } from 'lucide-react'
import Button from './Button'

function RoomCard({ room, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-gray-100 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-vignette focus-visible:ring-offset-2"
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
            <Plus className="h-10 w-10" strokeWidth={2} aria-hidden="true" />
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
          <div className="flex items-center">
            <img src="/vignette.png" alt="Vignette" className="h-12 sm:h-16" />
          </div>
          <Button onClick={onAddRoom} className="flex items-center gap-2">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
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
