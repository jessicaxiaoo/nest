import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { findAlternatives } from '../lib/api'
import {
  getCachedAlternatives,
  setCachedAlternatives,
  clearCachedAlternatives,
} from '../lib/alternativesCache'
import { formatPrice } from '../lib/itemVisuals'
import { mergeStep } from '../lib/progressSteps'
import { needsAlternatives } from '../server/verdict.js'
import LoadingProgress from './LoadingProgress'
import { ProductSaveButton, ShopProductCard } from './ShopProductStrip'

/** Shown until the server's own first step arrives; same id, so it merges. */
const FIRST_STEP = {
  id: 'read',
  label: 'Reading what missed on this piece',
  status: 'active',
}

function productForStrip(alternative) {
  const product = alternative?.product ?? {}
  const price =
    product.price ||
    (product.priceValue > 0 ? formatPrice(product.priceValue) : null)
  return {
    ...product,
    title:
      alternative?.verdict?.pieceDescription ||
      product.title ||
      'Alternative',
    price,
  }
}

function AlternativeStrip({
  alternatives,
  isAlternativeSaved,
  onSaveAlternative,
  onRemoveAlternative,
}) {
  return (
    <div>
      <p className="type-label mb-1.5 text-gray-400">Try something like this!</p>
      <div className="flex gap-1.5">
        {alternatives.map((alternative) => {
          const key =
            alternative.product?.link ||
            alternative.productId ||
            String(alternative.rank)
          const saved = Boolean(isAlternativeSaved?.(alternative))
          const product = productForStrip(alternative)

          return (
            <div key={key} className="flex min-w-0 flex-1 flex-col">
              <ShopProductCard
                product={product}
                badge={alternative.label || undefined}
              />
              {alternative.why ? (
                <p className="mt-1.5 line-clamp-2 px-0.5 text-[10px] leading-snug text-gray-500">
                  {alternative.why}
                </p>
              ) : null}
              <div className="mt-1.5">
                <ProductSaveButton
                  saved={saved}
                  onSave={
                    onSaveAlternative
                      ? () => onSaveAlternative(alternative)
                      : undefined
                  }
                  onRemove={
                    onRemoveAlternative
                      ? () => onRemoveAlternative(alternative)
                      : undefined
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function statusFromResult(result) {
  if (!result) return 'idle'
  const list = Array.isArray(result.alternatives) ? result.alternatives : null
  if (!list) return 'idle'
  return list.length > 0 ? 'ready' : 'empty'
}

export default function FindAlternatives({
  room,
  verdict,
  piecePhoto,
  checkId,
  initialResult,
  enabled = needsAlternatives(verdict),
  onPersistResult,
  onSaveAlternative,
  onRemoveAlternative,
  isAlternativeSaved,
}) {
  const [status, setStatus] = useState(() => statusFromResult(initialResult))
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(() => initialResult?.summary ?? '')
  const [alternatives, setAlternatives] = useState(
    () => initialResult?.alternatives ?? [],
  )
  const [steps, setSteps] = useState([])
  const abortRef = useRef(null)

  useEffect(() => {
    const nextStatus = statusFromResult(initialResult)
    setStatus(nextStatus)
    setError(null)
    setSummary(initialResult?.summary ?? '')
    setAlternatives(
      nextStatus === 'idle' ? [] : (initialResult?.alternatives ?? []),
    )
    setSteps([])
  }, [verdict, room?.id, checkId, initialResult?.foundAt])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  function handleCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus(statusFromResult(initialResult))
    setSteps([])
  }

  async function handleFind({ forceRefresh = false } = {}) {
    if (!enabled || status === 'loading') return

    const cacheKey = {
      roomId: room?.id,
      verdict,
      piecePhoto,
    }

    if (forceRefresh) {
      clearCachedAlternatives(cacheKey)
    } else {
      const cached = getCachedAlternatives(cacheKey)
      if (cached) {
        const list = Array.isArray(cached.alternatives) ? cached.alternatives : []
        const nextSummary = cached.summary ?? ''
        setError(null)
        setSummary(nextSummary)
        setAlternatives(list)
        setStatus(list.length > 0 ? 'ready' : 'empty')
        setSteps([])
        onPersistResult?.({
          summary: nextSummary,
          alternatives: list,
          foundAt: new Date().toISOString(),
          fromCache: true,
        })
        return
      }
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('loading')
    setError(null)
    setSummary('')
    setAlternatives([])
    setSteps([FIRST_STEP])

    // A cancel or a newer search replaces abortRef; anything from this run is
    // then stale and must not touch the UI or overwrite the saved result.
    const isCurrent = () => abortRef.current === controller

    try {
      const result = await findAlternatives(room, verdict, {
        piecePhoto,
        signal: controller.signal,
        onStep: (step) => {
          if (isCurrent()) setSteps((current) => mergeStep(current, step))
        },
      })

      if (!isCurrent()) return

      if (!result.success) {
        setStatus('error')
        setError(
          result.message ||
            'Could not find alternatives right now. Try again in a moment.',
        )
        return
      }

      const list = Array.isArray(result.alternatives) ? result.alternatives : []
      const nextSummary = result.summary ?? ''
      setCachedAlternatives(cacheKey, {
        success: true,
        summary: nextSummary,
        alternatives: list,
      })
      setSummary(nextSummary)
      setAlternatives(list)
      setStatus(list.length > 0 ? 'ready' : 'empty')
      onPersistResult?.({
        summary: nextSummary,
        alternatives: list,
        foundAt: new Date().toISOString(),
      })
    } catch (err) {
      // A cancel or unmount already settled the UI.
      if (err?.name === 'AbortError' || !isCurrent()) return
      setStatus('error')
      setError('Something went wrong on our end — try again in a moment.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  if (!enabled) return null

  return (
    <section className="space-y-4" aria-busy={status === 'loading'}>
      {status === 'idle' && (
        <button
          type="button"
          onClick={handleFind}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-vignette px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-vignette-light focus:outline-none focus-visible:ring-2 focus-visible:ring-vignette focus-visible:ring-offset-2 sm:w-auto"
        >
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
          Find alternatives
        </button>
      )}

      {status === 'loading' && (
        <div className="space-y-2">
          <LoadingProgress title="Finding better options…" steps={steps} />
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {(status === 'ready' || status === 'empty' || status === 'error') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
                <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Alternatives
            </h3>
            <button
              type="button"
              onClick={() => handleFind({ forceRefresh: true })}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            >
              Search again
            </button>
          </div>

          {status === 'error' && (
            <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          )}

          {(status === 'ready' || status === 'empty') && summary && (
            <p className="text-sm leading-relaxed text-gray-600">{summary}</p>
          )}

          {status === 'ready' && (
            <AlternativeStrip
              alternatives={alternatives}
              isAlternativeSaved={isAlternativeSaved}
              onSaveAlternative={onSaveAlternative}
              onRemoveAlternative={onRemoveAlternative}
            />
          )}
        </div>
      )}
    </section>
  )
}
