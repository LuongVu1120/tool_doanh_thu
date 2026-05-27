import fs from 'node:fs'
import path from 'node:path'

export type EnvMap = Record<string, string>

export function findWorkspaceRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir)

  while (true) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(current, '.git'))
    ) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) return path.resolve(startDir)
    current = parent
  }
}

export function parseEnvFile(content: string): EnvMap {
  const values: EnvMap = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    values[key] = stripEnvQuotes(rawValue)
  }

  return values
}

export function loadEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {}

  const values = parseEnvFile(fs.readFileSync(filePath, 'utf8'))
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return values
}

export function loadRootEnv(startDir = process.cwd()): EnvMap {
  return loadEnvFile(path.join(findWorkspaceRoot(startDir), '.env'))
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
