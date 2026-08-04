import { useLayoutEffect, useRef, useState } from 'react'
import { Building2, Sofa, Sun } from 'lucide-react'
import { MINOR_ITEM_PATTERN } from '../lib/roomOccupancy'

function AnalysisBullet({ text, muted = false }) {
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)
  const ref = useRef(null)

  useLayoutEffect(() => {
    function measure() {
      const el = ref.current
      if (el && !expanded) setClampable(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [text, expanded])

  return (
    <li className={`flex gap-2 ${muted ? 'text-gray-400' : 'text-gray-600'}`}>
      <span
        className={`mt-2 h-1 w-1 shrink-0 rounded-full ${muted ? 'bg-gray-300' : 'bg-gray-400'}`}
        aria-hidden="true"
      />
      <span
        ref={ref}
        onClick={clampable ? () => setExpanded(!expanded) : undefined}
        title={clampable && !expanded ? 'Click to expand' : undefined}
        className={`${expanded ? '' : 'line-clamp-2'} ${clampable ? 'cursor-pointer' : ''}`}
      >
        {text}
      </span>
    </li>
  )
}

function AnalysisCard({ label, icon: Icon, points, splitMinorItems = false }) {
  const [showMisc, setShowMisc] = useState(false)

  let major = points
  let minor = []
  if (splitMinorItems) {
    major = points.filter((point) => !MINOR_ITEM_PATTERN.test(point))
    minor = points.filter((point) => MINOR_ITEM_PATTERN.test(point))
    if (major.length === 0) {
      major = minor
      minor = []
    }
  }

  return (
    <div className="self-start rounded-lg px-1 py-1 sm:px-2 sm:py-2">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-nest shadow-sm ring-1 ring-gray-100">
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {label}
      </p>
      <ul className="space-y-1.5 text-sm leading-relaxed">
        {major.map((point, i) => (
          <AnalysisBullet key={i} text={point} />
        ))}
      </ul>
      {minor.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMisc(!showMisc)}
            className="rounded-md px-1 py-0.5 text-xs font-medium text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600"
          >
            {showMisc ? '▾' : '▸'} Misc items ({minor.length})
          </button>
          {showMisc && (
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {minor.map((point, i) => (
                <AnalysisBullet key={i} text={point} muted />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function toPoints(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (value != null && value !== '') return [String(value)]
  return []
}

export default function RoomAnalysis({ analysis }) {
  if (!analysis) return null

  return (
    <div className="grid items-start gap-4 sm:grid-cols-3 sm:gap-2">
      <AnalysisCard
        label="Architecture"
        icon={Building2}
        points={toPoints(analysis.architecture)}
      />
      <AnalysisCard
        label="Lighting"
        icon={Sun}
        points={toPoints(analysis.lighting)}
      />
      <AnalysisCard
        label="Existing pieces"
        icon={Sofa}
        points={toPoints(analysis.existingPieces)}
        splitMinorItems
      />
    </div>
  )
}
