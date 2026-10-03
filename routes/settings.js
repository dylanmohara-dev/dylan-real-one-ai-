import { Router } from 'express'
import { getApiKeyStatuses, setApiKey, API_KEY_DEFS } from '../lib/apiKeys.js'

const router = Router()

// Never returns a raw key value -- getApiKeyStatuses() only ever hands
// back the last 4 characters (see lib/apiKeys.js). This is what the
// Settings page's API Keys section reads on load and after every save.
router.get('/api-keys', (req, res) => {
  res.json({ keys: getApiKeyStatuses() })
})

// Body: { value: string }. An empty/blank value clears the stored key
// (falls back to .env if one's set there, otherwise the feature it gates
// just goes back to its honest "no key" state -- nothing breaks).
router.put('/api-keys/:key', (req, res) => {
  const { key } = req.params
  if (!API_KEY_DEFS.some((def) => def.key === key)) {
    return res.status(400).json({ error: 'Unknown API key' })
  }
  try {
    const keys = setApiKey(key, req.body?.value)
    res.json({ keys })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
