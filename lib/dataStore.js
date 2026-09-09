import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const dataDirectory = path.join(__dirname, '..', 'data')

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true })
}

export function getDataPath(name) {
  return path.join(dataDirectory, `${name}.json`)
}

// defaultValue lets a caller store a plain object (settings-shaped data,
// e.g. a single weekly plan) instead of the usual list -- always returned
// as a fresh clone, never the literal defaultValue reference, so a caller
// that mutates what it gets back can never accidentally corrupt a shared
// default across calls.
export function loadData(name, defaultValue = []) {
  try {
    const filePath = getDataPath(name)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue), 'utf8')
      return structuredClone(defaultValue)
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return structuredClone(defaultValue)
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Could not load ${name}:`, error)
    return structuredClone(defaultValue)
  }
}

export function saveData(name, data) {
  const filePath = getDataPath(name)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}
