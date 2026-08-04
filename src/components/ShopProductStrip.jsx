import { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, Plus, X } from 'lucide-react'
import { searchShopProducts } from '../lib/api'
import { buildShopQuery, getItemMaxPrice } from '../lib/shopCache'

function ProductThumb({ src, alt }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div
        className="h-20 w-full rounded-md bg-gray-100 sm:h-24"
        aria-hidden="true"
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-20 w-full rounded-md object-cover sm:h-24"
      onError={() => setFailed(true)}
    />
  )
}

export function ShopProductCard({ product, badge }) {
  const body = (
    <>
      <div className="relative">
        <ProductThumb src={product.thumbnail} alt={product.title || 'Product'} />
        {badge ? (
          <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-nest">
            {badge}
          </span>
        ) : null}
        {product.link ? (
          <ExternalLink
            size={11}
            strokeWidth={1.75}
            className="absolute right-1 top-1 rounded bg-white/90 p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-nest"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug text-gray-900">
        {product.title || product.source}
      </p>
      {product.source && product.title && (
        <p className="mt-0.5 truncate text-[10px] text-gray-400">
          {product.source}
        </p>
      )}
      {product.price && (
        <p className="mt-1 text-xs font-semibold text-gray-900">{product.price}</p>
      )}
    </>
  )

  const className =
    'group flex min-w-0 flex-1 flex-col rounded-md bg-white p-1.5 ring-1 ring-gray-100 transition-colors hover:bg-gray-50 hover:ring-gray-200'

  if (!product.link) {
    return <div className={className}>{body}</div>
  }

  return (
    <a
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {body}
    </a>
  )
}

export function ProductSaveButton({ saved, onSave, onRemove }) {
  if (saved && onRemove) {
    return (
      <button
        type="button"
        onClick={onRemove}
        title="Remove from saved pieces"
        className="group inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-nest transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Check
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          className="group-hover:hidden"
        />
        <X
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          className="hidden group-hover:inline"
        />
        <span className="group-hover:hidden">Saved</span>
        <span className="hidden group-hover:inline">Undo</span>
      </button>
    )
  }

  if (saved) {
    return (
      <span className="inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-nest">
        <Check size={12} strokeWidth={2} aria-hidden="true" />
        Saved
      </span>
    )
  }

  if (!onSave) return null

  return (
    <button
      type="button"
      onClick={onSave}
      className="inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-nest transition-colors hover:bg-nest-muted"
    >
      <Plus size={12} strokeWidth={2} aria-hidden="true" />
      Save
    </button>
  )
}

function ShopSkeleton() {
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="mb-1.5 h-2.5 w-32 animate-pulse rounded bg-gray-200" />
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-md bg-gray-50/80 p-1.5 ring-1 ring-dashed ring-gray-200"
          >
            <div className="h-20 w-full animate-pulse rounded-md bg-gray-200 sm:h-24" />
            <div className="mt-1.5 h-2.5 w-full animate-pulse rounded bg-gray-200" />
            <div className="mt-1 h-2.5 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="mt-1.5 h-3 w-10 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Shoppable product cards — top Serper hits side by side.
 * (chips = design vision; these = real products to buy).
 */
export default function ShopProductStrip({
  item,
  isProductSaved,
  onSaveProduct,
  onRemoveProduct,
}) {
  const [status, setStatus] = useState('idle') // idle | loading | ready | empty
  const [products, setProducts] = useState([])

  const query = useMemo(() => buildShopQuery(item), [item])
  const maxPrice = useMemo(() => getItemMaxPrice(item), [item])

  useEffect(() => {
    if (!query) {
      setStatus('empty')
      setProducts([])
      return
    }

    let cancelled = false
    setStatus('loading')
    setProducts([])

    searchShopProducts(query, maxPrice).then((result) => {
      if (cancelled) return
      const list = (result.products ?? []).filter((p) => p?.link).slice(0, 3)
      if (result.success && list.length > 0) {
        setProducts(list)
        setStatus('ready')
      } else {
        setProducts([])
        setStatus('empty')
      }
    })

    return () => {
      cancelled = true
    }
  }, [query, maxPrice])

  if (status === 'loading') return <ShopSkeleton />
  if (status !== 'ready' || products.length === 0) return null

  const canSave = Boolean(onSaveProduct)

  return (
    <div className="mt-3">
      <p className="type-label mb-1.5 text-gray-400">Try something like this!</p>
      <div className="flex gap-1.5">
        {products.map((product) => (
          <div key={product.link} className="flex min-w-0 flex-1 flex-col">
            <ShopProductCard product={product} />
            {canSave ? (
              <div className="mt-1.5">
                <ProductSaveButton
                  saved={Boolean(isProductSaved?.(product))}
                  onSave={() => onSaveProduct(product)}
                  onRemove={
                    onRemoveProduct
                      ? () => onRemoveProduct(product)
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
