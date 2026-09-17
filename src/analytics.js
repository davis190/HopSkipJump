// Google Analytics 4. The whole integration lives here, and index.html stays
// free of the inline gtag snippet on purpose: an inline <script> would force
// script-src 'unsafe-inline' into the CSP in infra/site.yaml, while an injected
// external script is allowed on the strength of the googletagmanager.com host.

const MEASUREMENT_ID = import.meta.env.VITE_GA_ID ?? 'G-VCEH55VD4G'

// Vite inlines import.meta.env.PROD, so `npm run dev` never loads the tag and
// never reports: events log to the console instead, where they can be checked
// without polluting the property. Set VITE_GA_ID='' to opt a build out entirely.
const ENABLED = import.meta.env.PROD && Boolean(MEASUREMENT_ID)

let started = false

/** Loads gtag.js and sends the page_view. Safe to call more than once. */
export function initAnalytics() {
  if (typeof window === 'undefined' || started) return
  started = true
  if (!ENABLED) return

  window.dataLayer = window.dataLayer || []
  // gtag has to forward `arguments` verbatim — the tag reads the pushed
  // array-like, so a rest parameter would arrive as one nested array.
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  // Queued here and replayed by the tag once it loads, which is what sends the
  // page_view behind the "visits" numbers in GA.
  window.gtag('config', MEASUREMENT_ID)

  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
  document.head.appendChild(tag)
}

/**
 * Sends a custom event. Parameter names have to be registered in GA as custom
 * dimensions (strings) or metrics (numbers) before they show up in reports —
 * see the analytics section of the README.
 */
export function track(name, params = {}) {
  if (typeof window === 'undefined') return
  if (!ENABLED) {
    console.debug('[analytics]', name, params)
    return
  }
  window.gtag?.('event', name, params)
}
