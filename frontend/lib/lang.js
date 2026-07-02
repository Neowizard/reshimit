// Resolves the UI language/direction from the `lang` URL query parameter.
// Strict exact-match: only 'en' or 'he' are accepted. Anything else (or a
// missing param) falls back to Hebrew/RTL. Pure and logging-free; callers
// decide whether to warn (see `isValid`/`raw`).
//
// We read the param from window.location rather than Next's useSearchParams()
// on purpose: useSearchParams() in the root layout forces a client-side
// rendering bailout that breaks static prerendering of /_not-found at build
// time. Reading window.location keeps the layout statically prerenderable.

// Client-only: current `lang` query value, or null during SSR / before mount.
export function getLangParam() {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('lang');
}

export function resolveLang(raw) {
    const isValid = raw === 'en' || raw === 'he';
    const lang = isValid ? raw : 'he'; // resolved, always 'en' | 'he'
    return {
        lang,                          // 'en' | 'he'  -> <html lang>
        dir: lang === 'en' ? 'ltr' : 'rtl', // -> <html dir>
        isLTR: lang === 'en',          // boolean      -> label language
        raw,                           // original value, for warn message
        isValid,                       // false when a value is present but unrecognized
    };
}
