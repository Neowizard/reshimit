'use client';
import './globals.css';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function RootLayout({ children }) {
    const pathname = usePathname().substring(1);
    const isLTR = pathname?.startsWith('LTR') || false;

    useEffect(() => {
        document.title = `TODO: ${pathname || ''}`;
    }, [pathname]);

    return (
        <html lang={isLTR ? 'en' : 'he'} dir={isLTR ? 'ltr' : 'rtl'}>
        <body>{children}</body>
        </html>
    );
}