import { formatPrice } from './itemVisuals'
import { parseProductPrice } from './shopCache'

/**
 * Best single dollar amount for a checklist item: product price, else budget
 * max/min. Used for room totals and committed-piece prompts.
 */
export function checklistItemAmount(item) {
  const productValue = Number(item?.product?.priceValue)
  if (productValue > 0) return productValue

  const parsed = parseProductPrice(item?.product?.price)
  if (parsed > 0) return parsed

  const max = Number(item?.budgetMax)
  if (max > 0) return max

  const min = Number(item?.budgetMin)
  if (min > 0) return min

  return null
}

/** Single display price string for a checklist item. */
export function checklistPriceLabel(item) {
  if (item?.product?.price) return item.product.price
  const productValue = Number(item?.product?.priceValue)
  if (productValue > 0) return formatPrice(productValue)
  const max = Number(item?.budgetMax)
  const min = Number(item?.budgetMin)
  if (min > 0 && max > 0 && min !== max) {
    return `${formatPrice(min)} – ${formatPrice(max)}`
  }
  if (max > 0) return formatPrice(max)
  if (min > 0) return formatPrice(min)
  return null
}

/**
 * Roll up checklist dollars against the room budget.
 * `allocated` = every item with an amount; `spent` = bought items only.
 */
export function checklistBudgetSummary(checklist, roomBudget) {
  const items = Array.isArray(checklist) ? checklist : []
  let allocated = 0
  let spent = 0
  let pricedCount = 0

  for (const item of items) {
    const amount = checklistItemAmount(item)
    if (!(amount > 0)) continue
    pricedCount += 1
    allocated += amount
    if (isChecklistBought(item)) {
      spent += amount
    }
  }

  const total =
    Number(roomBudget) > 0 ? Math.round(Number(roomBudget)) : null
  const allocatedRounded = Math.round(allocated)
  const spentRounded = Math.round(spent)
  const remaining =
    total != null ? Math.max(total - allocatedRounded, 0) : null
  const overBy =
    total != null && allocatedRounded > total
      ? allocatedRounded - total
      : 0

  return {
    allocated: allocatedRounded,
    spent: spentRounded,
    remaining,
    roomBudget: total,
    overBy,
    pricedCount,
    itemCount: items.length,
  }
}

/** Bought = explicitly bought, or legacy purchased/placed. */
export function isChecklistBought(item) {
  const status = item?.status
  return status === 'bought' || status === 'purchased' || status === 'placed'
}

function normalizeChecklistStatus(status) {
  if (status === 'bought' || status === 'purchased' || status === 'placed') {
    return 'bought'
  }
  return 'saved'
}

/**
 * Persist a user-entered budget on a checklist item. Sets budgetMin/Max and
 * keeps any product card price fields in sync.
 */
export function applyChecklistBudget(item, amount) {
  const value = Number(amount)
  if (!(value > 0)) {
    return {
      budgetMin: 0,
      budgetMax: 0,
      product: item?.product
        ? {
            ...item.product,
            price: null,
            priceValue: null,
          }
        : item?.product,
    }
  }

  const rounded = Math.round(value)
  const label = formatPrice(rounded)
  return {
    budgetMin: rounded,
    budgetMax: rounded,
    product: item?.product
      ? {
          ...item.product,
          price: label,
          priceValue: rounded,
        }
      : item?.product,
  }
}

export function checklistTitle(item) {
  return (
    item?.product?.title ||
    item?.category ||
    'Saved piece'
  )
}

export function checklistSourceLabel(source) {
  if (source === 'plan') return 'From plan'
  if (source === 'compatibility') return 'From piece check'
  return 'Saved'
}

const MAX_COMMITTED_PIECES = 12

/**
 * Compact checklist snapshot for compatibility / alternatives prompts.
 * No photos or long copy — just enough for the model to judge coherence
 * and remaining budget against pieces already saved for the room.
 */
export function summarizeCommittedPieces(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) return []

  return checklist
    .slice(0, MAX_COMMITTED_PIECES)
    .map((item) => {
      const price = checklistItemAmount(item)

      const title =
        typeof item?.product?.title === 'string' && item.product.title.trim()
          ? item.product.title.trim()
          : null
      const category =
        typeof item?.category === 'string' && item.category.trim()
          ? item.category.trim()
          : title || 'Saved piece'

      const colors = Array.isArray(item?.colors)
        ? item.colors.filter((c) => typeof c === 'string').slice(0, 4)
        : []

      return {
        category,
        title: title && title !== category ? title : null,
        status: normalizeChecklistStatus(item?.status),
        price,
        styleName:
          typeof item?.styleName === 'string' && item.styleName.trim()
            ? item.styleName.trim()
            : null,
        colors: colors.length > 0 ? colors : null,
      }
    })
}

/**
 * Build a shop-card-shaped product for checklist display.
 * Works for plan saves, alternatives, and piece-check photos.
 */
export function checklistProductCard(item) {
  if (!item) return null

  if (item.product?.link || item.product?.thumbnail) {
    return {
      title: item.product.title || item.category,
      price:
        item.product.price ||
        checklistPriceLabel({ ...item, product: item.product }),
      source: item.product.source || null,
      link: item.product.link || item.productLink || null,
      thumbnail: item.product.thumbnail || item.photo || null,
    }
  }

  if (item.productLink || item.photo) {
    return {
      title: item.category,
      price: checklistPriceLabel(item),
      source: null,
      link: item.productLink || null,
      thumbnail: item.photo || null,
    }
  }

  return null
}

/**
 * Normalize fields at save-time so every source shares the same shape.
 */
export function buildChecklistPayload({
  category,
  rationale = '',
  priority = 'Medium',
  price,
  budgetMin,
  budgetMax,
  product,
  photo,
  productLink,
  sourceKey,
  ...rest
}) {
  const priceValue =
    Number(product?.priceValue) > 0
      ? Number(product.priceValue)
      : Number(price) > 0
        ? Number(price)
        : parseProductPrice(product?.price) || 0

  const priceLabel =
    product?.price || (priceValue > 0 ? formatPrice(priceValue) : null)

  const normalizedProduct =
    product || photo || productLink
      ? {
          title: product?.title || category,
          price: priceLabel,
          priceValue: priceValue > 0 ? priceValue : null,
          source: product?.source ?? null,
          link: product?.link ?? productLink ?? null,
          thumbnail: product?.thumbnail ?? photo ?? null,
        }
      : null

  const fallbackMin = Number(budgetMin) || 0
  const fallbackMax = Number(budgetMax) || fallbackMin

  return {
    ...rest,
    category,
    rationale: typeof rationale === 'string' ? rationale.trim() : '',
    priority,
    budgetMin: priceValue > 0 ? priceValue : fallbackMin,
    budgetMax: priceValue > 0 ? priceValue : fallbackMax,
    product: normalizedProduct ?? undefined,
    // The image already lives on product.thumbnail; storing the same base64
    // string twice doubles what each saved item costs in localStorage.
    photo: normalizedProduct?.thumbnail ? undefined : (photo ?? undefined),
    productLink: normalizedProduct?.link ?? productLink ?? undefined,
    sourceKey: sourceKey || normalizedProduct?.link || category,
  }
}
