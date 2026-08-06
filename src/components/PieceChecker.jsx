import { useState } from 'react'
import { History, RefreshCw, ScanSearch } from 'lucide-react'
import { checkCompatibility, scrapeProductUrl } from '../lib/api'
import { createThumbnail } from '../lib/image'
import { buildChecklistPayload } from '../lib/checklistItem'
import { categoryIcon, formatPrice, shortTitle } from '../lib/itemVisuals'
import Button from './Button'
import CompatibilityVerdict, {
  summarizeVerdict,
  TONE_ACCENT,
  TONE_STYLES,
} from './CompatibilityVerdict'
import FindAlternatives from './FindAlternatives'
import PhotoUpload from './PhotoUpload'
import { needsAlternatives } from '../server/verdict.js'

function formatCheckedAt(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function PieceChecker({
  room,
  onBack,
  onSaveToChecklist,
  onRemoveFromChecklist,
  onSaveCheck,
  onUpdateCheck,
  onDeleteCheck,
}) {
  const history = room.checkHistory ?? []
  const [inputMode, setInputMode] = useState('photo')
  const [piecePhoto, setPiecePhoto] = useState(null)
  const [piecePrice, setPiecePrice] = useState('')
  const [url, setUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeFailed, setScrapeFailed] = useState(false)
  const [scrapeMessage, setScrapeMessage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [activeCheckId, setActiveCheckId] = useState(null)
  const [saved, setSaved] = useState(false)

  const parsedPiecePrice =
    piecePrice !== '' && Number(piecePrice) > 0 ? Number(piecePrice) : null

  // Saves store the shortened title as the category, so match on that.
  const findChecklistMatch = (checkId, description) => {
    const title = shortTitle(description)
    return (room.checklist ?? []).find(
      (item) =>
        (checkId != null && item.checkHistoryId === checkId) ||
        (item.source === 'compatibility' && item.category === title),
    )
  }

  const isInChecklist = (checkId, description) =>
    Boolean(findChecklistMatch(checkId, description))

  async function handleScrapeUrl() {
    if (!url.trim()) return

    setScraping(true)
    setScrapeFailed(false)
    setScrapeMessage(null)
    setError(null)
    setVerdict(null)
    setActiveCheckId(null)
    setSaved(false)

    try {
      const result = await scrapeProductUrl(url.trim())

      if (result.success && result.photo) {
        setPiecePhoto(result.photo)
        setInputMode('photo')
        setScrapeFailed(false)
        setScrapeMessage(null)
      } else {
        setScrapeFailed(true)
        setScrapeMessage(
          result.message ||
            "We couldn't pull an image from that link — upload a photo of the piece instead.",
        )
        // Keep URL mode for blocked stores so they can paste a direct image link
        if (result.errorType !== 'blocked') {
          setInputMode('photo')
        }
      }
    } catch {
      setScrapeFailed(true)
      setScrapeMessage(
        "We couldn't pull an image from that link — upload a photo of the piece instead.",
      )
      setInputMode('photo')
    } finally {
      setScraping(false)
    }
  }

  async function persistCheck(photo, nextVerdict) {
    if (!onSaveCheck) return null

    let photoForHistory = null
    try {
      photoForHistory = await createThumbnail(photo)
    } catch {
      photoForHistory = null
    }

    const title = shortTitle(nextVerdict.pieceDescription)
    return onSaveCheck({
      photo: photoForHistory,
      verdict: { ...nextVerdict, pieceDescription: title },
      pieceDescription: title,
      piecePrice: nextVerdict.piecePrice ?? parsedPiecePrice,
    })
  }

  async function handleCheck() {
    if (!piecePhoto) {
      setError('Please add a photo of the piece first')
      return
    }

    setLoading(true)
    setError(null)
    setVerdict(null)
    setActiveCheckId(null)
    setSaved(false)

    try {
      const result = await checkCompatibility(
        room,
        piecePhoto,
        parsedPiecePrice,
      )

      if (!result.success) {
        setError({ type: result.errorType, message: result.message })
        return
      }

      const nextVerdict = {
        ...result.verdict,
        pieceDescription: shortTitle(result.verdict.pieceDescription),
        piecePrice: result.verdict.piecePrice ?? parsedPiecePrice,
      }
      setVerdict(nextVerdict)
      const record = await persistCheck(piecePhoto, nextVerdict)
      if (record?.id) {
        setActiveCheckId(record.id)
        setSaved(isInChecklist(record.id, nextVerdict.pieceDescription))
      }
    } catch {
      setError({
        type: 'api_error',
        message: 'Something went wrong on our end — try again in a moment.',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSave() {
    if (!verdict) return

    const title = shortTitle(verdict.pieceDescription)
    const price = verdict.piecePrice > 0 ? verdict.piecePrice : 0
    onSaveToChecklist(
      buildChecklistPayload({
        category: title,
        rationale: verdict.overallVerdict,
        price,
        photo: piecePhoto ?? undefined,
        sourceKey: activeCheckId || title,
        verdict: { ...verdict, pieceDescription: title },
        checkHistoryId: activeCheckId ?? undefined,
      }),
    )
    setSaved(true)
  }

  function handleRemove() {
    if (!verdict) return
    const match = findChecklistMatch(activeCheckId, verdict.pieceDescription)
    if (match) onRemoveFromChecklist?.(match)
    setSaved(false)
  }

  function handleDismiss() {
    setVerdict(null)
    setPiecePhoto(null)
    setPiecePrice('')
    setUrl('')
    setScrapeFailed(false)
    setScrapeMessage(null)
    setError(null)
    setSaved(false)
    setActiveCheckId(null)
  }

  function handleResetInput() {
    setPiecePhoto(null)
    setPiecePrice('')
    setUrl('')
    setScrapeFailed(false)
    setScrapeMessage(null)
    setError(null)
    setVerdict(null)
    setSaved(false)
    setActiveCheckId(null)
  }

  function openHistoryEntry(entry) {
    setPiecePhoto(entry.photo ?? null)
    const price = entry.piecePrice ?? entry.verdict?.piecePrice
    setPiecePrice(price > 0 ? String(price) : '')
    setVerdict(entry.verdict)
    setActiveCheckId(entry.id)
    setSaved(
      isInChecklist(
        entry.id,
        entry.pieceDescription ?? entry.verdict?.pieceDescription,
      ),
    )
    setError(null)
    setScrapeFailed(false)
    setScrapeMessage(null)
    setUrl('')
  }

  function handleDeleteHistory(checkId) {
    onDeleteCheck?.(checkId)
    if (activeCheckId === checkId) {
      handleDismiss()
    }
  }

  function alternativeKey(alternative) {
    return (
      alternative?.product?.link ||
      alternative?.productId ||
      alternative?.verdict?.pieceDescription
    )
  }

  function handleSaveAlternative(alternative) {
    if (!onSaveToChecklist || !alternative?.verdict) return
    const title = shortTitle(
      alternative.verdict.pieceDescription || alternative.product?.title,
    )
    const price =
      alternative.verdict.piecePrice > 0
        ? alternative.verdict.piecePrice
        : alternative.product?.priceValue > 0
          ? alternative.product.priceValue
          : 0
    onSaveToChecklist(
      buildChecklistPayload({
        category: title,
        rationale: alternative.why || alternative.verdict.overallVerdict,
        price,
        product: alternative.product
          ? {
              title: alternative.product.title || title,
              price: alternative.product.price,
              priceValue: alternative.product.priceValue,
              source: alternative.product.source,
              link: alternative.product.link,
              thumbnail: alternative.product.thumbnail,
            }
          : null,
        sourceKey: alternativeKey(alternative),
        verdict: { ...alternative.verdict, pieceDescription: title },
      }),
    )
  }

  function handleRemoveAlternative(alternative) {
    if (!onRemoveFromChecklist || !alternative?.verdict) return
    const title = shortTitle(
      alternative.verdict.pieceDescription || alternative.product?.title,
    )
    const match = (room.checklist ?? []).find(
      (item) =>
        item.sourceKey === alternativeKey(alternative) ||
        (item.source === 'compatibility' && item.category === title),
    )
    if (match) onRemoveFromChecklist(match)
    else onRemoveFromChecklist({ category: title })
  }

  function isAlternativeSaved(alternative) {
    const title = shortTitle(
      alternative?.verdict?.pieceDescription || alternative?.product?.title,
    )
    return (room.checklist ?? []).some(
      (item) =>
        item.sourceKey === alternativeKey(alternative) ||
        (item.source === 'compatibility' && item.category === title),
    )
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
            {room.name}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <h1 className="type-page-title mb-2">Before you buy</h1>
          <p className="text-sm text-gray-400">
            Check a piece against your {room.name.toLowerCase()} — style, scale,
            color, and budget
          </p>
        </div>

        {(room.photo || room.plans?.[0]?.styleThesis) && (
          <div className="flex gap-3 rounded-xl bg-vignette-muted/40 px-3.5 py-3 ring-1 ring-vignette/10">
            {room.photo ? (
              <img
                src={room.photo}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-gray-200/60"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="type-label mb-0.5 text-vignette/50">Checking against</p>
              <p className="text-sm font-medium text-gray-900">{room.name}</p>
              {room.plans?.[0]?.styleThesis ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">
                  {room.plans[0].styleThesis}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-gray-400">
                  Your room photo and style preferences
                </p>
              )}
            </div>
          </div>
        )}

        {!verdict && (
          <>
            <section>
              <div className="mb-5">
                <h3 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
                    <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  Add a piece
                </h3>
                <p className="mt-1 pl-10 text-xs text-gray-400">
                  Upload a photo or paste a product link
                </p>
              </div>

              <div className="rounded-xl bg-vignette-muted/40 px-3 py-4 sm:px-4">
                <div className="mb-4 flex gap-1 rounded-lg bg-white/70 p-1 ring-1 ring-gray-200/60">
                  <button
                    type="button"
                onClick={() => {
                  setInputMode('photo')
                  setScrapeFailed(false)
                  setScrapeMessage(null)
                }}
                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                      inputMode === 'photo'
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Photo upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('url')}
                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                      inputMode === 'url'
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Product URL
                  </button>
                </div>

                {inputMode === 'url' && !piecePhoto && (
                  <div className="mb-4 space-y-3">
                    <label htmlFor="product-url" className="sr-only">
                      Product URL
                    </label>
                    <input
                      id="product-url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Product page or direct image link"
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
                    />
                    <p className="text-xs text-gray-400">
                      If a store blocks the product page, paste a direct image
                      link instead (right-click photo → Copy image address).
                    </p>
                    <Button
                      onClick={handleScrapeUrl}
                      disabled={!url.trim() || scraping}
                      variant="secondary"
                      className="w-full"
                    >
                      {scraping ? 'Fetching product image…' : 'Get product image'}
                    </Button>
                    {scrapeFailed && scrapeMessage && (
                      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900/80 ring-1 ring-amber-100">
                        {scrapeMessage}
                      </div>
                    )}
                  </div>
                )}

                {scrapeFailed && inputMode === 'photo' && (
                  <div className="mb-4 rounded-lg bg-white/80 px-4 py-3 text-sm text-gray-600 ring-1 ring-gray-200/60">
                    {scrapeMessage ||
                      "We couldn't pull an image from that link — upload a photo of the piece instead."}
                  </div>
                )}

                {(inputMode === 'photo' || piecePhoto) && (
                  <div className="mb-4">
                    <PhotoUpload
                      photo={piecePhoto}
                      onPhotoChange={(photo) => {
                        setPiecePhoto(photo)
                        setError(null)
                        setScrapeFailed(false)
                      }}
                      showGuidelines={false}
                      label="Drop a photo of the piece here, or click to browse"
                      error={typeof error === 'string' ? error : null}
                    />
                  </div>
                )}

                <div className="mb-4">
                  <label
                    htmlFor="piece-price"
                    className="mb-1.5 block text-xs font-medium text-gray-500"
                  >
                    Piece price{' '}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      id="piece-price"
                      type="number"
                      min="1"
                      step="1"
                      value={piecePrice}
                      onChange={(e) => setPiecePrice(e.target.value)}
                      placeholder="e.g. 450"
                      className="w-full rounded-lg border border-gray-200 bg-white py-3 pl-7 pr-4 text-sm text-gray-900 placeholder:text-gray-300 focus:border-vignette focus:outline-none focus:ring-1 focus:ring-vignette"
                    />
                  </div>
                  {room.budget > 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      Compared against your {formatPrice(room.budget)} room
                      budget
                    </p>
                  )}
                </div>

                {error && typeof error === 'object' && (
                  <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p>{error.message}</p>
                    {error.type === 'api_error' && (
                      <button
                        type="button"
                        onClick={handleCheck}
                        className="mt-2 text-xs font-medium text-red-600 underline"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleCheck}
                  disabled={!piecePhoto || loading}
                  className="inline-flex w-full items-center justify-center gap-2"
                >
                  {loading && (
                    <RefreshCw
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {loading ? 'Checking…' : 'Check this piece'}
                </Button>

                {loading && (
                  <p className="mt-3 text-center text-xs text-gray-400">
                    Against your room’s direction, scale, and budget
                  </p>
                )}
              </div>
            </section>

            {history.length > 0 && (
              <section>
                <div className="mb-5">
                  <h3 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
                      <History size={16} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    Check history
                  </h3>
                  <p className="mt-1 pl-10 text-xs text-gray-400">
                    Tap a past check to reopen the full verdict
                  </p>
                </div>

                <div className="space-y-3">
                  {history.map((entry) => {
                    const summary = summarizeVerdict(entry.verdict)
                    const title = shortTitle(
                      entry.pieceDescription ||
                        entry.verdict?.pieceDescription,
                    )
                    const Icon = categoryIcon(title)

                    return (
                      <article
                        key={entry.id}
                        className="relative overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-gray-200/80 transition-shadow hover:shadow-sm hover:ring-gray-300/80"
                      >
                        <div
                          className={`absolute inset-y-0 left-0 w-1 ${TONE_ACCENT[summary.tone]}`}
                          aria-hidden="true"
                        />
                        <div className="flex items-center gap-3 pl-4 pr-3 py-3.5 sm:pl-5 sm:pr-4">
                          <button
                            type="button"
                            onClick={() => openHistoryEntry(entry)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            {entry.photo ? (
                              <img
                                src={entry.photo}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200/80"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vignette-muted text-vignette">
                                <Icon
                                  size={17}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="type-card-title truncate">
                                {title}
                              </h4>
                              <p className="mt-0.5 text-xs text-gray-400">
                                {formatCheckedAt(entry.checkedAt)}
                                {(entry.piecePrice ?? entry.verdict?.piecePrice) >
                                  0 &&
                                  ` · ${formatPrice(entry.piecePrice ?? entry.verdict.piecePrice)}`}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${TONE_STYLES[summary.tone]}`}
                            >
                              {summary.label}
                            </span>
                          </button>
                          {onDeleteCheck && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHistory(entry.id)}
                              className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                              aria-label="Remove from history"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {verdict && (
          <section className="space-y-5">
            <div>
              <h3 className="flex items-center gap-2.5 font-serif text-2xl font-medium text-gray-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vignette-muted text-vignette">
                  <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                Compatibility result
              </h3>
              <p className="mt-1 pl-10 text-xs text-gray-400">
                Grounded in your room analysis and style direction
              </p>
            </div>

            <CompatibilityVerdict
              verdict={verdict}
              photo={piecePhoto}
              saved={saved}
              onSave={handleSave}
              onRemove={onRemoveFromChecklist ? handleRemove : undefined}
              footer={
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                >
                  Check another
                </button>
              }
            />

            <FindAlternatives
              room={room}
              verdict={verdict}
              piecePhoto={piecePhoto}
              checkId={activeCheckId}
              initialResult={
                history.find((entry) => entry.id === activeCheckId)
                  ?.alternativesResult
              }
              enabled={needsAlternatives(verdict)}
              onPersistResult={
                activeCheckId && onUpdateCheck
                  ? (result) =>
                      onUpdateCheck(activeCheckId, {
                        alternativesResult: result,
                      })
                  : undefined
              }
              onSaveAlternative={
                onSaveToChecklist ? handleSaveAlternative : undefined
              }
              onRemoveAlternative={
                onRemoveFromChecklist ? handleRemoveAlternative : undefined
              }
              isAlternativeSaved={isAlternativeSaved}
            />

            <button
              type="button"
              onClick={handleResetInput}
              className="w-full text-center text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              Start over with different input
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
