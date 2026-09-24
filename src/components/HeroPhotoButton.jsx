import { useRef, useState } from 'react'
import { Camera, RotateCcw } from 'lucide-react'

// Small overlay control rendered inside a hero-photo header (Overview's
// .overview-header, or any mode page's .page-header) so Dylan can swap
// that life area's photo for his own -- a Gemini generation, a real photo,
// whatever -- without ever asking for a code change. Deliberately
// positioned absolute (see App.css) so it drops into any header regardless
// of how many other flex children that header already has (School's class
// list header, for one, also has a "back to Overview" button).
export default function HeroPhotoButton({ modeKey, heroUrl, onChange, onReset }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await onChange(modeKey, reader.result)
      } finally {
        setBusy(false)
      }
    }
    reader.onerror = () => setBusy(false)
    reader.readAsDataURL(file)
  }

  async function handleReset() {
    setBusy(true)
    try {
      await onReset(modeKey)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hero-photo-control" aria-hidden={false}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className="hero-photo-btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={heroUrl ? 'Change photo' : 'Add a photo'}
      >
        <Camera size={14} strokeWidth={2.25} />
        <span>{heroUrl ? 'Change photo' : 'Add photo'}</span>
      </button>
      {heroUrl && (
        <button
          type="button"
          className="hero-photo-btn hero-photo-btn-reset"
          onClick={handleReset}
          disabled={busy}
          title="Reset to default"
        >
          <RotateCcw size={13} strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}
