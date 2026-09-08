import { Router } from 'express'
import { getConfig, buildAuthUrl, exchangeCodeForTokens, listNeedsReplyThreads, isConnected, clearTokens } from '../lib/gmail.js'

const router = Router()

router.get('/status', (req, res) => {
  const { configured } = getConfig()
  res.json({ configured, connected: configured && isConnected() })
})

router.get('/auth-url', (req, res) => {
  try {
    res.json({ url: buildAuthUrl() })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query
  if (error) return res.status(400).send(`Gmail connection failed: ${error}. Close this tab and try again.`)
  if (!code) return res.status(400).send('Missing authorization code.')
  try {
    await exchangeCodeForTokens(code)
    res.send('<html><body style="font-family:sans-serif;padding:2rem"><h2>Gmail connected.</h2><p>You can close this tab and go back to Dylan AI.</p></body></html>')
  } catch (err) {
    console.error(err)
    res.status(500).send(`Could not finish connecting Gmail: ${err.message}`)
  }
})

router.get('/needs-reply', async (req, res) => {
  try {
    const threads = await listNeedsReplyThreads({ maxResults: 8 })
    res.json({ threads })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/disconnect', (req, res) => {
  clearTokens()
  res.json({ success: true })
})

export default router
