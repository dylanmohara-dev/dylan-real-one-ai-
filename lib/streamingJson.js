// Incrementally extracts the string value of a `"reply": "..."` field out
// of a JSON blob that's arriving in chunks -- so the chat route can show
// Dylan the model's answer as it's generated instead of making him wait
// for the ENTIRE response (including the "action" field that always comes
// after "reply" in the JSON) to finish first. That full-response wait is
// exactly what a 14.7s "thinking" delay before anything appears turns
// into with a 3B local model.
//
// Deliberately does NOT change what the model is asked to produce -- the
// system prompt and its JSON-action contract are untouched, so nothing
// about action-detection reliability (already tuned against the real
// model over many sessions) is put at risk by this. This only changes
// WHEN the "reply" text gets read out of the same response shape as
// today, not what shape the model is asked for.
export function createReplyExtractor() {
  let raw = ''
  let replyStart = -1
  let replyEnd = -1
  let consumedRawTo = -1

  const KEY_PATTERN = /"reply"\s*:\s*"/

  const ESCAPE_MAP = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }

  // Decodes JSON string escapes in raw[from..upTo), stopping early (without
  // consuming the trailing partial sequence) if the buffer ends mid-escape
  // -- the caller re-tries that tail once more data has arrived. Also
  // stops the moment it hits the closing (unescaped) quote, recording
  // where in `raw` that happened.
  function decodeSegment(from, upTo) {
    let out = ''
    let i = from
    while (i < upTo) {
      const ch = raw[i]
      if (ch === '\\') {
        if (i + 1 >= upTo) break
        const next = raw[i + 1]
        if (next === 'u') {
          if (i + 6 > upTo) break
          out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        out += ESCAPE_MAP[next] !== undefined ? ESCAPE_MAP[next] : next
        i += 2
        continue
      }
      if (ch === '"') {
        replyEnd = i
        return { text: out, consumedTo: i }
      }
      out += ch
      i += 1
    }
    return { text: out, consumedTo: i }
  }

  // Call with each new chunk of raw model output as it arrives. Returns
  // any NEW decoded text to show the user right now (possibly ''), and
  // never returns anything from after the reply value's closing quote.
  function feed(deltaText) {
    raw += deltaText
    if (replyEnd !== -1) return ''

    if (replyStart === -1) {
      const match = KEY_PATTERN.exec(raw)
      if (!match) return ''
      replyStart = match.index + match[0].length
      consumedRawTo = replyStart
    }

    const { text, consumedTo } = decodeSegment(consumedRawTo, raw.length)
    consumedRawTo = consumedTo
    return text
  }

  // The full raw text seen so far -- used once streaming ends to run the
  // EXACT SAME parse/action-execution path routes/chat.js already used
  // before this change (extractFirstJsonObject + JSON.parse), so nothing
  // about how actions get detected changes, only when the visible text
  // was shown.
  function getRaw() {
    return raw
  }

  return { feed, getRaw }
}
