/// <reference types="vite/client" />

/**
 * Only non-secret switches belong here. Secrets are read by the Netlify
 * Functions from `process.env` and never reach the client bundle.
 */
interface ImportMetaEnv {
  readonly VITE_USE_FIXTURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
