export default function MemoryPage({
  memories,
  memoryInput,
  setMemoryInput,
  saving,
  saveMemory,
  deleteMemory,
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">PERSONAL CONTEXT</span>

          <h1>Memory</h1>

          <p>Control what Dylan AI remembers about you.</p>
        </div>
      </div>

      <div className="form-card">
        <input
          value={memoryInput}
          onChange={(event) => setMemoryInput(event.target.value)}
          placeholder="Tell Dylan AI something to remember..."
        />

        <button onClick={() => saveMemory()} disabled={saving || !memoryInput.trim()}>
          Save Memory
        </button>
      </div>

      <div className="items-list">
        {memories.length ? (
          memories
            .slice()
            .reverse()
            .map((memory) => (
              <div className="item-card" key={memory.id}>
                <div className="item-content">
                  <strong>{memory.content}</strong>

                  <span className="item-meta">
                    Saved {new Date(memory.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <button
                  className="delete-button"
                  onClick={() => deleteMemory(memory.id)}
                >
                  ×
                </button>
              </div>
            ))
        ) : (
          <div className="empty-state">
            <div>✦</div>
            <h3>No memories yet</h3>
            <p>Dylan AI will ask before saving important personal information.</p>
          </div>
        )}
      </div>
    </div>
  )
}
