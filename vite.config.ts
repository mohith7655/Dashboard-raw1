import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveTimeZone } from './src/lib/timeZone.ts'

/**
 * The store's timezone, baked in at build time.
 *
 * The browser needs it to decide which day the date picker may run to, and a
 * function-scoped variable cannot reach it. Read here instead of through
 * `import.meta.env`, which only exposes names beginning `VITE_` — this way the
 * variable can be called whatever the host already calls it.
 *
 * Empty when nothing is set, which leaves the dashboard on UTC exactly as it
 * was before.
 */
const storeTimeZone = resolveTimeZone(process.env) ?? ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __STORE_TIME_ZONE__: JSON.stringify(storeTimeZone),
  },
})
