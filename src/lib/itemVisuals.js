import {
  Archive,
  Armchair,
  BedDouble,
  Blinds,
  Flower2,
  Image,
  Lamp,
  Lightbulb,
  Package,
  RectangleHorizontal,
  Sofa,
  Table,
} from 'lucide-react'

export const PRIORITY_STYLES = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-sky-50 text-sky-700',
  Low: 'bg-gray-100 text-gray-500',
}

/** Left edge accent for recommendation cards */
export const PRIORITY_ACCENT = {
  High: 'bg-red-200',
  Medium: 'bg-sky-200',
  Low: 'bg-gray-200',
}

const CATEGORY_ICONS = [
  [/rug|carpet/i, RectangleHorizontal],
  [/curtain|drape|blind|shade/i, Blinds],
  [/lamp|light|sconce|pendant|chandelier/i, Lamp],
  [/bulb/i, Lightbulb],
  [/sofa|couch|sectional|loveseat/i, Sofa],
  [/chair|stool|bench|ottoman|seat/i, Armchair],
  [/bed|mattress|headboard/i, BedDouble],
  [/table|desk|console|nightstand/i, Table],
  [/art|frame|mirror|print|wall|photo|picture/i, Image],
  [/plant|greenery|flower|vase/i, Flower2],
  [/shelf|shelving|storage|cabinet|dresser|bookcase/i, Archive],
]

export function categoryIcon(category) {
  const match = CATEGORY_ICONS.find(([pattern]) => pattern.test(category))
  return match ? match[1] : Package
}

export function formatPrice(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

/** Short display title — category-first, capped word count. */
export function shortTitle(value, fallback = 'Furniture piece', maxWords = 6) {
  const words = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return fallback
  return words.slice(0, maxWords).join(' ')
}

export function formatBudgetRange(min, max) {
  if (!min && !max) return null
  if (min && max) return `${formatPrice(min)} – ${formatPrice(max)}`
  return formatPrice(min || max)
}

/** Hide finish/texture when it mostly repeats the material. */
function resolveFinish(material, texture) {
  const finish = typeof texture === 'string' ? texture.trim() : ''
  if (!finish) return null
  const mat = typeof material === 'string' ? material.trim().toLowerCase() : ''
  const fin = finish.toLowerCase()
  if (!mat) return finish
  if (mat.includes(fin) || fin.includes(mat)) return null
  const matWords = mat.split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const finWords = new Set(fin.split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  const overlap = matWords.filter((w) => finWords.has(w)).length
  if (overlap >= 2) return null
  return finish
}

function shortenPhrase(text, maxWords = 4) {
  if (!text) return null
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ')
}

/** Single short display line for material + texture (no separate labels). */
export function formatMaterialLine(material, texture) {
  const mat = shortenPhrase(
    typeof material === 'string' ? material.trim() : '',
    4,
  )
  const finish = shortenPhrase(resolveFinish(material, texture), 3)
  if (mat && finish) return `${mat}, ${finish}`
  return mat || finish || null
}
