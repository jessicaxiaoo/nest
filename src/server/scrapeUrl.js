import { lookup } from 'node:dns/promises'
import net from 'node:net'

const TIMEOUT_MS = 12_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const PAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Hosts that serve product images directly (not HTML product pages). */
const IMAGE_CDN_HOSTS = [
  'wfcdn.com',
  'scene7.com',
  'cloudinary.com',
  'imgix.net',
  'shopify.com',
  'shopifycdn.com',
]

function resolveUrl(imageUrl, pageUrl) {
  try {
    return new URL(imageUrl, pageUrl).href
  } catch {
    return imageUrl
  }
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractMetaContent(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`,
      'i',
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeHtmlEntities(match[1])
  }
  return null
}

function extractJsonLdImage(html) {
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptPattern.exec(html))) {
    try {
      const data = JSON.parse(match[1])
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        const candidates = [
          node,
          ...(Array.isArray(node?.['@graph']) ? node['@graph'] : []),
        ]
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== 'object') continue
          const type = candidate['@type']
          const types = Array.isArray(type) ? type : [type]
          if (!types.some((t) => /Product/i.test(String(t ?? '')))) continue

          const image = candidate.image
          if (typeof image === 'string' && image) {
            return decodeHtmlEntities(image)
          }
          if (Array.isArray(image) && image[0]) {
            const first = image[0]
            if (typeof first === 'string') return decodeHtmlEntities(first)
            if (first?.url) return decodeHtmlEntities(first.url)
          }
          if (image?.url) return decodeHtmlEntities(image.url)
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return null
}

function isDirectImageUrl(url) {
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url.pathname)) return true
  const host = url.hostname.toLowerCase()
  return IMAGE_CDN_HOSTS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`))
}

function isBlockedResponse(status, html) {
  if (status === 401 || status === 403 || status === 429) return true
  const head = html.slice(0, 4000).toLowerCase()
  return (
    head.includes('access to this page has been denied') ||
    head.includes('px-captcha') ||
    head.includes('sorry, you have been blocked') ||
    head.includes('<title>access denied</title>') ||
    head.includes('<title>attention required')
  )
}

function storeLabel(hostname) {
  const host = hostname.toLowerCase()
  if (host.includes('wayfair') || host.includes('wfcdn')) return 'Wayfair'
  if (host.includes('ikea')) return 'IKEA'
  if (host.includes('amazon')) return 'Amazon'
  return null
}

function fail(errorType, message) {
  return { success: false, errorType, message }
}

function ipv4ToInt(ip) {
  return ip
    .split('.')
    .reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0
}

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip)
  const inBlock = (base, bits) =>
    value >>> (32 - bits) === ipv4ToInt(base) >>> (32 - bits)

  return (
    inBlock('0.0.0.0', 8) ||
    inBlock('10.0.0.0', 8) ||
    inBlock('100.64.0.0', 10) || // carrier-grade NAT
    inBlock('127.0.0.0', 8) ||
    inBlock('169.254.0.0', 16) || // link-local, incl. cloud metadata
    inBlock('172.16.0.0', 12) ||
    inBlock('192.0.0.0', 24) ||
    inBlock('192.168.0.0', 16) ||
    inBlock('198.18.0.0', 15) ||
    inBlock('224.0.0.0', 4) || // multicast
    inBlock('240.0.0.0', 4) // reserved
  )
}

function isPrivateIpv6(ip) {
  const addr = ip.toLowerCase().split('%')[0]
  if (addr === '::' || addr === '::1') return true
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr)
}

/** Anything that is not a routable public address is refused. */
function isPrivateAddress(ip) {
  const version = net.isIP(ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)
  return true
}

function blockedUrlError() {
  const error = new Error('Refused to fetch a non-public URL')
  error.code = 'BLOCKED_URL'
  return error
}

/**
 * Resolve a URL and refuse anything pointing at private or reserved space, so
 * a user-supplied link cannot be used to probe the host's own network.
 * Note this validates the address at resolve time; pinning the resolved IP to
 * the socket would additionally close the DNS-rebinding window.
 */
async function resolvePublicUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) return isPrivateAddress(host) ? null : parsed

  let addresses
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    return null
  }
  if (addresses.length === 0) return null
  if (addresses.some(({ address }) => isPrivateAddress(address))) return null
  return parsed
}

/** fetch() that validates the target, and every redirect hop, before connecting. */
async function safeFetch(rawUrl, options = {}) {
  let target = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = await resolvePublicUrl(target)
    if (!parsed) throw blockedUrlError()

    const response = await fetch(parsed.href, {
      ...options,
      redirect: 'manual',
    })
    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get('location')
    if (!location) return response
    target = resolveUrl(location, parsed.href)
  }

  throw blockedUrlError()
}

export async function fetchImageAsDataUrl(imageUrl, { referer, signal } = {}) {
  let response
  try {
    response = await safeFetch(imageUrl, {
      headers: {
        'User-Agent': PAGE_HEADERS['User-Agent'],
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      signal,
    })
  } catch (err) {
    if (err?.code === 'BLOCKED_URL') {
      return fail('invalid_url', 'That image link could not be used.')
    }
    throw err
  }

  if (!response.ok) {
    return fail(
      'scrape_failed',
      'Could not download that image. Try another link or upload a photo.',
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    return fail(
      'scrape_failed',
      'That link did not return an image. Paste a direct image address or upload a photo.',
    )
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) {
    return fail('scrape_failed', 'That image is too large. Try a smaller photo.')
  }
  if (buffer.length === 0) {
    return fail('scrape_failed', 'That image was empty. Try another link.')
  }

  return {
    success: true,
    photo: `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`,
  }
}

export async function scrapeProductImage(url) {
  let parsedUrl
  try {
    parsedUrl = new URL(url.trim())
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return fail('invalid_url', 'Enter a valid http or https link.')
    }
  } catch {
    return fail('invalid_url', 'Enter a valid http or https link.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const store = storeLabel(parsedUrl.hostname)

  try {
    // Direct image / CDN URL — skip HTML parsing
    if (isDirectImageUrl(parsedUrl)) {
      return await fetchImageAsDataUrl(parsedUrl.href, {
        referer: store === 'Wayfair' ? 'https://www.wayfair.com/' : undefined,
        signal: controller.signal,
      })
    }

    const pageResponse = await safeFetch(parsedUrl.href, {
      headers: PAGE_HEADERS,
      signal: controller.signal,
    })
    const html = await pageResponse.text()

    if (isBlockedResponse(pageResponse.status, html)) {
      return fail(
        'blocked',
        store
          ? `${store} is blocking automatic image fetch. Right-click the product photo → Copy image address, paste that link here — or upload a screenshot.`
          : 'This store is blocking automatic image fetch. Paste a direct image link (right-click photo → Copy image address) or upload a screenshot.',
      )
    }

    if (!pageResponse.ok) {
      return fail(
        'scrape_failed',
        'Could not open that page. Check the link, or upload a photo instead.',
      )
    }

    const imageUrl =
      extractMetaContent(html, 'og:image') ||
      extractMetaContent(html, 'twitter:image') ||
      extractJsonLdImage(html)

    if (!imageUrl) {
      return fail(
        'scrape_failed',
        'No product image found on that page. Paste a direct image link or upload a photo.',
      )
    }

    return await fetchImageAsDataUrl(resolveUrl(imageUrl, parsedUrl.href), {
      referer: `${parsedUrl.origin}/`,
      signal: controller.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      return fail(
        'scrape_failed',
        'That request timed out. Try a direct image link or upload a photo.',
      )
    }
    if (err?.code === 'BLOCKED_URL') {
      return fail(
        'invalid_url',
        'That link could not be used. Paste a public product or image link.',
      )
    }
    return fail(
      'scrape_failed',
      'Could not fetch that link. Try a direct image link or upload a photo.',
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleScrapeUrlRequest(body) {
  const { url } = body ?? {}

  if (!url?.trim()) {
    return {
      status: 400,
      body: fail('validation', 'URL is required'),
    }
  }

  const result = await scrapeProductImage(url)
  return {
    status: result.success ? 200 : 422,
    body: result,
  }
}
