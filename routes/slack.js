import { Router } from 'express'
import { getConfig, buildAuthUrl, exchangeCodeForTokens, listUnreadSummary, isConnected, clearTokens } from '../lib/slack.js'

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
  if (error) return res.status(400).send(`Slack connection failed: ${error}. Close this tab and try again.`)
  if (!code) return res.status(400).send('Missing authorization code.')
  try {
    await exchangeCodeForTokens(code)
    res.send('<html><body style="font-family:sans-serif;padding:2rem"><h2>Slack connected.</h2><p>You can close this tab and go back to Dylan AI.</p></body></html>')
  } catch (err) {
    console.error(err)
    res.status(500).send(`Could not finish connecting Slack: ${err.message}`)
  }
})

router.get('/unread', async (req, res) => {
  try {
    const conversations = await listUnreadSummary({ maxConversations: 8 })
    res.json({ conversations })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.post('/disconnect', (req, res) => {
  clearTokens()
  res.json({ success: true })
})

export default router
