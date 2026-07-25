const tips = [
  'Shoot from the doorway for the widest view',
  'Capture the full room, including any furniture you already have',
  'Make sure the room is well lit',
]

export default function PhotoGuidelines() {
  return (
    <div className="rounded-lg border border-nest/15 bg-nest-muted px-4 py-3 text-left">
      <p className="type-label mb-1 text-nest">
        Photo tips
      </p>
      <p className="mb-2 text-sm text-gray-500">
        Empty or furnished — either works
      </p>
      <ul className="space-y-1.5">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2 text-sm text-gray-600">
            <span className="text-nest" aria-hidden="true">
              ·
            </span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}
