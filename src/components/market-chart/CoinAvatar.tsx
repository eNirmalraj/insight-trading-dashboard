// src/components/market-chart/CoinAvatar.tsx
import React, { useState } from 'react';
import { extractBaseAsset } from './symbolSearchTags';

interface CoinAvatarProps {
    symbol: string;
    size?: number;
}

/**
 * Deterministic hue from a string (0–360). Same input always yields same hue.
 */
const hueFromString = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    return h;
};

/**
 * Coin icon: CDN SVG with deterministic-color text fallback on load error.
 */
const CoinAvatar: React.FC<CoinAvatarProps> = ({ symbol, size = 32 }) => {
    const [errored, setErrored] = useState(false);
    const base = extractBaseAsset(symbol);
    const cdnUrl = `https://cryptoicon-api.pages.dev/api/icon/${base.toLowerCase()}`;

    if (errored) {
        const hue = hueFromString(base);
        const gradient = `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 40) % 360}, 70%, 40%))`;
        const label = base.slice(0, 4);
        const fontSize = Math.max(9, Math.floor(size * 0.32));
        return (
            <div
                style={{
                    width: size,
                    height: size,
                    background: gradient,
                    fontSize,
                }}
                className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
                aria-label={`${base} avatar`}
            >
                {label}
            </div>
        );
    }

    return (
        <img
            src={cdnUrl}
            alt={base}
            width={size}
            height={size}
            onError={() => setErrored(true)}
            className="rounded-full flex-shrink-0"
            loading="lazy"
        />
    );
};

export default CoinAvatar;
