import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { AppConfig } from '../types'

const defaultConfig: AppConfig = {
  downloadDir: ''
}

let config: AppConfig

function getConfigPath(): string {
  const appDataDir = app.getPath('userData')
  return join(appDataDir, 'config.json')
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8')
      config = { ...defaultConfig, ...JSON.parse(content) }
    } catch {
      config = { ...defaultConfig }
    }
  } else {
    config = { ...defaultConfig }
  }
  return config
}

export function saveConfig(newConfig: Partial<AppConfig>): void {
  config = { ...config, ...newConfig }
  const configPath = getConfigPath()
  const dir = join(configPath, '..')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function getDownloadDir(): string {
  if (!config) {
    loadConfig()
  }

  const customDir = config.downloadDir
  if (customDir && existsSync(customDir)) {
    return customDir
  }

  // Fallback: create a default directory in the user's Documents folder
  const defaultDownloadDir = join(app.getPath('documents'), '样片库')
  if (!existsSync(defaultDownloadDir)) {
    mkdirSync(defaultDownloadDir, { recursive: true })
  }
  return defaultDownloadDir
}

export function setDownloadDir(dir: string): void {
  saveConfig({ downloadDir: dir })
}
