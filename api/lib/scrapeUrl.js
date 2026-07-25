const TIMEOUT_MS = 12_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

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

async function fetchImageAsDataUrl(imageUrl, { referer, signal }) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': PAGE_HEADERS['User-Agent'],
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    signal,
    redirect: 'follow',
  })

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

    const pageResponse = await fetch(parsedUrl.href, {
      headers: PAGE_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
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
    return fail(
      'scrape_failed',
      'Could not fetch that link. Try a direct image link or upload a photo.',
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleScrapeUrlRequest(body) {
  const { url } = body

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
