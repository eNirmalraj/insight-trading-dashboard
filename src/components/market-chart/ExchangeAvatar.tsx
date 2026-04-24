import React from 'react';

interface ExchangeAvatarProps {
    exchange: string;
    size?: number;
}

const BinanceLogo: React.FC<{ size: number }> = ({ size }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 126 126"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-label="Binance"
    >
        <path
            fill="#F0B90B"
            d="M38.73,53.2L62.94,29l24.22,24.22l14.09-14.09L62.94,0.81L24.65,39.1L38.73,53.2z M0,63L14.09,48.91L28.18,63L14.09,77.09L0,63z M38.73,72.79l24.22,24.22l24.22-24.22l14.09,14.09L62.94,125.18L24.65,86.89L38.73,72.79z M97.82,63l14.09-14.09L126,63l-14.09,14.09L97.82,63z M77.23,63L62.94,48.71L52.41,59.24l-1.21,1.21L48.71,63l14.23,14.29L77.23,63z"
        />
    </svg>
);

/**
 * Exchange brand mark for the Symbol Search row. Inline SVG — no network.
 * Add cases here as more exchanges come online (OKX, Coinbase, Bybit, ...).
 */
const ExchangeAvatar: React.FC<ExchangeAvatarProps> = ({ exchange, size = 14 }) => {
    const normalized = exchange.toUpperCase();
    if (normalized === 'BINANCE') {
        return <BinanceLogo size={size} />;
    }
    return null;
};

export default ExchangeAvatar;
