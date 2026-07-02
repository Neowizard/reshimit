'use client';
import './globals.css';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getLangParam, resolveLang } from '../lib/lang';

export default function RootLayout({ children }) {
    const pathname = usePathname().substring(1);

    // Read the ?lang param after mount (window isn't available during SSR).
    // Until then rawLang is null -> resolves to the 'he'/RTL default, which
    // matches the server-rendered HTML and avoids a hydration mismatch.
    const [rawLang, setRawLang] = useState(null);
    useEffect(() => {
        setRawLang(getLangParam());
    }, []);

    const { lang, dir, raw, isValid } = resolveLang(rawLang);

    useEffect(() => {
        document.title = `TODO: ${pathname || ''}`;
    }, [pathname]);

    // Sole warn site: fires once only when a value is present but unrecognized.
    useEffect(() => {
        if (raw !== null && !isValid) {
            console.warn(`Unrecognized lang parameter "${raw}", defaulting to "he".`);
        }
    }, [raw, isValid]);

    return (
        <html lang={lang} dir={dir}>
        <body>{children}</body>
        </html>
    );
}
