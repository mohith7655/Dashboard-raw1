/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  /**
   * The store's IANA timezone, substituted at build time by `vite.config.ts`
   * from whichever environment variable names it. An empty string where none
   * is set.
   *
   * Declared inside `global` because `moduleDetection: force` makes every file
   * in `src` a module, and a bare `declare const` would only be visible here.
   */
  const __STORE_TIME_ZONE__: string
}

export {}
