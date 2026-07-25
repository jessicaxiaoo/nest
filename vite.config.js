import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleCheckCompatibilityRequest } from './api/lib/checkCompatibility.js'
import {
  handleAnalyzeRoomRequest,
  handleGeneratePlanRequest,
  handleRecommendItemsRequest,
} from './api/lib/generateRoomPlan.js'
import { handleScrapeUrlRequest } from './api/lib/scrapeUrl.js'
import { handleShopSearchRequest } from './api/lib/shopSearch.js'
import { readJsonBody } from './api/lib/utils.js'

function createApiMiddleware(handler) {
  return async (req, res, next) => {
    if (req.method !== 'POST') return next()

    try {
      const body = await readJsonBody(req)
      const { status, body: responseBody } = await handler(body)
      res.setHeader('Content-Type', 'application/json')
      res.statusCode = status
      res.end(JSON.stringify(responseBody))
    } catch (err) {
      console.error(`[api] ${req.url}`, err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          success: false,
          errorType: 'api_error',
          message: 'Something went wrong on our end — try again in a moment.',
        }),
      )
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  }
  if (env.SERPER_API_KEY) {
    process.env.SERPER_API_KEY = env.SERPER_API_KEY
  }

  const routes = [
    ['/api/generate-plan', handleGeneratePlanRequest],
    ['/api/analyze-room', handleAnalyzeRoomRequest],
    ['/api/recommend-items', handleRecommendItemsRequest],
    ['/api/scrape-url', handleScrapeUrlRequest],
    ['/api/check-compatibility', handleCheckCompatibilityRequest],
    ['/api/shop-search', handleShopSearchRequest],
  ]

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'api-dev-server',
        configureServer(server) {
          for (const [path, handler] of routes) {
            server.middlewares.use(path, createApiMiddleware(handler))
          }
        },
      },
    ],
  }
})
