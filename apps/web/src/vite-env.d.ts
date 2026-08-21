/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Production origin of the NestJS API (e.g. https://api.example.com).
   * Unset in dev, where the Vite dev proxy (/api -> :4000) is used instead.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
