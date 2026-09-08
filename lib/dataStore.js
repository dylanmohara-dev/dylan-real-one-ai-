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

export function loadData(name) {
  try {
    const filePath = getDataPath(name)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf8')
      return []
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return []
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Could not load ${name}:`, error)
    return []
  }
}

export function saveData(name, data) {
  const filePath = getDataPath(name)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}
