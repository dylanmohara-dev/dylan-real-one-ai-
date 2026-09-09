// Pulls a short, cached summary from each connected external integration
// (Gmail, Drive, Slack) for injection into the chat system prompt. Cached
// with a short TTL so a normal back-and-forth conversation doesn't hit three
// external APIs on every single message — only refreshes every few minutes,
// and never throws: a dead integration just means an empty section, not a
// broken chat.
import { isConnected as gmailConnected, listNeedsReplyThreads } from './gmail.js'
import { isConnected as driveConnected, listRecentFiles } from './googleDrive.js'
import { isConnected as slackConnected, listUnreadSummary } from './slack.js'

const TTL_MS = 3 * 60 * 1000

const cache = {
  gmail: { at: 0, data: null },
  drive: { at: 0, data: null },
  slack: { at: 0, data: null },
}

// The comment at the top of this file claims a dead integration "never
// throws ... not a broken chat". That was only true for calls that REJECT.
// A call that just hangs — an expired Google token stalling, a socket that
// never closes — never reaches the catch below, so the await sat there
// forever and took the whole chat request down with it. Nothing here is
// worth making Dylan wait on: if an integration can't answer in a couple of
// seconds, the chat is better off with that section simply missing.
const PER_INTEGRATION_TIMEOUT_MS = 2500
const TOTAL_CONTEXT_TIMEOUT_MS = 5000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

async function cached(key, fetcher) {
  const entry = cache[key]
  if (entry.data && Date.now() - entry.at < TTL_MS) return entry.data
  try {
    entry.data = await withTimeout(fetcher(), PER_INTEGRATION_TIMEOUT_MS, key)
    entry.at = Date.now()
  } catch (error) {
    console.error(`liveContext: ${key} refresh failed:`, error.message)
    // Keep serving the last good snapshot rather than a hole in context.
  }
  return entry.data
}

async function buildLiveContextBlock() {
  const sections = []

  if (gmailConnected()) {
    const threads = await cached('gmail', () => listNeedsReplyThreads({ maxResults: 6 }))
    if (threads?.length) {
      sections.push(
        `GMAIL — THREADS WAITING ON A REPLY:\n${threads
          .map((t) => `- "${t.subject}" from ${t.from} (${t.date}): ${t.snippet}`)
          .join('\n')}`
      )
    } else if (threads) {
      sections.push('GMAIL — THREADS WAITING ON A REPLY:\n- None right now.')
    }
  }

  if (driveConnected()) {
    const files = await cached('drive', () => listRecentFiles({ maxResults: 8 }))
    if (files?.length) {
      sections.push(
        `GOOGLE DRIVE — RECENTLY MODIFIED FILES:\n${files
          .map((f) => `- "${f.name}" (modified ${f.modifiedTime})`)
          .join('\n')}`
      )
    }
  }

  if (slackConnected()) {
    const conversations = await cached('slack', () => listUnreadSummary({ maxConversations: 6 }))
    if (conversations?.length) {
      sections.push(
        `SLACK — UNREAD CONVERSATIONS:\n${conversations
          .map(
            (c) =>
              `- ${c.channel} (${c.unreadCount} unread)${
                c.messages?.length ? ': ' + c.messages.map((m) => `${m.from}: ${m.text}`).join(' | ') : ''
              }`
          )
          .join('\n')}`
      )
    } else if (conversations) {
      sections.push('SLACK — UNREAD CONVERSATIONS:\n- None right now.')
    }
  }

  if (sections.length === 0) return ''
  return `\n${sections.join('\n\n')}\n`
}

// Belt and braces: even with per-integration caps, the total time spent
// gathering context before the model is ever called is bounded. Chat
// degrades to "no live context" rather than to "spinner forever".
export async function getLiveContextBlock() {
  try {
    return await withTimeout(buildLiveContextBlock(), TOTAL_CONTEXT_TIMEOUT_MS, 'live context')
  } catch (error) {
    console.error('liveContext: giving up on live context this turn:', error.message)
    return ''
  }
}
