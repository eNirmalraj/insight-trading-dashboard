import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    HeadingLevel,
    ShadingType,
} from 'docx';
import fs from 'fs';

const BLUE = '1a73e8';
const DARK = '1f2937';
const GRAY = '6b7280';
const WHITE = 'ffffff';

function heading(text, level = HeadingLevel.HEADING_1) {
    return new Paragraph({
        heading: level,
        spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 300, after: 200 },
        children: [
            new TextRun({
                text,
                bold: true,
                color: level === HeadingLevel.HEADING_1 ? BLUE : DARK,
                size:
                    level === HeadingLevel.HEADING_1
                        ? 36
                        : level === HeadingLevel.HEADING_2
                          ? 30
                          : 26,
                font: 'Segoe UI',
            }),
        ],
    });
}

function para(text, opts = {}) {
    return new Paragraph({
        spacing: { after: opts.after || 120 },
        alignment: opts.align || AlignmentType.LEFT,
        children: [
            new TextRun({
                text,
                size: opts.size || 22,
                color: opts.color || DARK,
                bold: opts.bold || false,
                italics: opts.italic || false,
                font: opts.font || 'Segoe UI',
            }),
        ],
    });
}

function bullet(text, level = 0) {
    return new Paragraph({
        bullet: { level },
        spacing: { after: 80 },
        children: [new TextRun({ text, size: 22, color: DARK, font: 'Segoe UI' })],
    });
}

function emptyLine() {
    return new Paragraph({ spacing: { after: 100 }, children: [] });
}

function tableCell(text, opts = {}) {
    return new TableCell({
        width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
        verticalAlign: 'center',
        children: [
            new Paragraph({
                alignment: opts.align || AlignmentType.LEFT,
                spacing: { before: 40, after: 40 },
                children: [
                    new TextRun({
                        text: text || '',
                        bold: opts.bold || false,
                        size: opts.size || 20,
                        color: opts.color || DARK,
                        font: 'Segoe UI',
                    }),
                ],
            }),
        ],
    });
}

function headerCell(text, width) {
    return tableCell(text, { bold: true, color: WHITE, shading: BLUE, width, size: 20 });
}

function createTable(headers, rows, colWidths) {
    const headerRow = new TableRow({
        children: headers.map((h, i) => headerCell(h, colWidths?.[i])),
        tableHeader: true,
    });
    const dataRows = rows.map(
        (row, rowIdx) =>
            new TableRow({
                children: row.map((cell, i) =>
                    tableCell(cell, {
                        width: colWidths?.[i],
                        shading: rowIdx % 2 === 0 ? 'f8fafc' : WHITE,
                    })
                ),
            })
    );
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
    });
}

// Email block helper - renders email as formatted paragraphs with monospace font
function emailBlock(to, subject, body) {
    const lines = body.split('\n');
    return [
        new Paragraph({
            spacing: { before: 200, after: 60 },
            children: [
                new TextRun({ text: 'To: ', bold: true, size: 21, color: GRAY, font: 'Segoe UI' }),
                new TextRun({ text: to, size: 21, color: BLUE, font: 'Segoe UI' }),
            ],
        }),
        new Paragraph({
            spacing: { after: 100 },
            children: [
                new TextRun({
                    text: 'Subject: ',
                    bold: true,
                    size: 21,
                    color: GRAY,
                    font: 'Segoe UI',
                }),
                new TextRun({ text: subject, bold: true, size: 21, color: DARK, font: 'Segoe UI' }),
            ],
        }),
        ...lines.map(
            (line) =>
                new Paragraph({
                    spacing: { after: 30 },
                    children: [
                        new TextRun({
                            text: line || ' ',
                            size: 19,
                            color: DARK,
                            font: 'Consolas',
                        }),
                    ],
                })
        ),
        emptyLine(),
    ];
}

const doc = new Document({
    styles: { default: { document: { run: { font: 'Segoe UI', size: 22, color: DARK } } } },
    sections: [
        // COVER PAGE
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [
                        new TextRun({
                            text: 'INSIGHT',
                            bold: true,
                            size: 72,
                            color: BLUE,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [
                        new TextRun({
                            text: 'TRADING PLATFORM',
                            bold: true,
                            size: 48,
                            color: DARK,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 },
                    children: [
                        new TextRun({
                            text: 'Market Data Partnership Plan',
                            size: 28,
                            color: GRAY,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Real-Time Tick Data Partnerships',
                            size: 24,
                            color: BLUE,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Crypto  |  Forex  |  Indian Stock Market',
                            size: 24,
                            color: BLUE,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: 'Document Date: March 2026',
                            size: 20,
                            color: GRAY,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: '9 Partnership Emails Ready to Send',
                            size: 20,
                            color: GRAY,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
            ],
        },

        // TABLE OF CONTENTS
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('Table of Contents'),
                emptyLine(),
                ...[
                    '1. Data Partner Selection — Best 3 Per Market',
                    '2. Crypto Data Partnerships',
                    '   Email 1: Binance',
                    '   Email 2: Bybit',
                    '   Email 3: Bitget',
                    '3. Forex Data Partnerships',
                    '   Email 4: LMAX Exchange',
                    '   Email 5: OANDA',
                    '   Email 6: TraderMade',
                    '4. Indian Stock Market Data Partnerships',
                    '   Email 7: TrueData',
                    '   Email 8: Global Datafeeds',
                    '   Email 9: Dhan (DhanHQ)',
                    '5. Sending Schedule & Priority',
                    '6. Execution Stack Summary',
                ].map(
                    (item) =>
                        new Paragraph({
                            spacing: { after: 80 },
                            children: [
                                new TextRun({
                                    text: item,
                                    size: 22,
                                    color: DARK,
                                    font: 'Segoe UI',
                                }),
                            ],
                        })
                ),
            ],
        },

        // SECTION 1: PARTNER SELECTION
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('1. Data Partner Selection — Best 3 Per Market'),
                emptyLine(),
                para(
                    'These partners are selected purely for MARKET DATA (real-time tick data). Trade execution is handled separately via Binance/Bitget API (crypto), MT5 (forex), and Kite Connect (Indian stocks).',
                    { bold: true }
                ),
                emptyLine(),

                heading('Crypto — Top 3 Data Sources', HeadingLevel.HEADING_2),
                createTable(
                    ['Rank', 'Exchange', 'Why Best for Data', 'Tick Data', 'WebSocket', 'Cost'],
                    [
                        [
                            '1',
                            'Binance',
                            'Most liquid, most pairs, already integrated',
                            'Yes',
                            'Yes',
                            'Free',
                        ],
                        ['2', 'Bybit', 'Best derivatives data, growing fast', 'Yes', 'Yes', 'Free'],
                        ['3', 'Bitget', 'Rising exchange, copy-trading data', 'Yes', 'Yes', 'Free'],
                    ],
                    [8, 15, 37, 12, 13, 15]
                ),
                emptyLine(),

                heading('Forex — Top 3 Data Sources', HeadingLevel.HEADING_2),
                createTable(
                    [
                        'Rank',
                        'Provider',
                        'Why Best for Data',
                        'Tick Data',
                        'WebSocket',
                        'Commercial Display',
                    ],
                    [
                        [
                            '1',
                            'LMAX Exchange',
                            'Institutional-grade, purest feed',
                            'Yes',
                            'Yes',
                            'License required',
                        ],
                        [
                            '2',
                            'OANDA',
                            'Best forex data API, widely trusted',
                            'Yes',
                            'Yes',
                            'License required',
                        ],
                        [
                            '3',
                            'TraderMade',
                            'Dedicated forex data vendor, affordable',
                            'Yes',
                            'Yes',
                            'Included in plan',
                        ],
                    ],
                    [8, 16, 32, 12, 12, 20]
                ),
                emptyLine(),

                heading('Indian Stocks — Top 3 Data Sources', HeadingLevel.HEADING_2),
                createTable(
                    ['Rank', 'Provider', 'Why Best for Data', 'Tick Data', 'WebSocket', 'Cost'],
                    [
                        [
                            '1',
                            'TrueData',
                            'Most reliable Indian market data vendor',
                            'Yes',
                            'Yes',
                            'Rs.1,000-5,000/mo',
                        ],
                        [
                            '2',
                            'Global Datafeeds',
                            'Cheapest, NSE + BSE + MCX',
                            'Yes',
                            'Yes',
                            'Rs.500-3,000/mo',
                        ],
                        [
                            '3',
                            'Dhan (DhanHQ)',
                            'Free API, modern, real-time ticks',
                            'Yes',
                            'Yes',
                            'Free',
                        ],
                    ],
                    [8, 18, 34, 10, 12, 18]
                ),
            ],
        },

        // SECTION 2: CRYPTO EMAILS
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('2. Crypto Data Partnership Emails'),
                emptyLine(),

                heading('Email 1: Binance — Crypto Tick Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'partnerships@binance.com',
                    'Market Data Partnership — Insight Trading Platform (India)',
                    `Dear Binance Partnerships Team,

I am the founder of Insight — a multi-market algorithmic trading
platform targeting Indian retail traders. We use a proprietary
scripting language (Kuri) for automated strategy creation.

We currently use Binance WebSocket API for real-time crypto market
data and it powers our charting and strategy engine for 500+ users.

DATA PARTNERSHIP REQUEST:

1. Elevated API Access
   - Higher WebSocket stream limits (currently using public tier)
   - Dedicated API key for commercial platform use
   - Priority connection stability for our user base

2. Historical Tick Data
   - Access to historical tick-by-tick trade data
   - Required for our backtesting engine
   - All spot + USDT-M futures pairs

3. Data Display Rights
   - Confirmation that displaying Binance market data to our
     platform users is permitted under current API terms
   - "Data provided by Binance" attribution on our charts

4. Technical Support
   - Dedicated technical contact for API issues
   - Early access to new API features or endpoints

ABOUT OUR PLATFORM:
- 500+ users (targeting 5,000 within 12 months)
- Real-time candlestick charts powered by Binance data
- Kuri scripting engine runs strategies on Binance pairs
- Binance is our PRIMARY crypto data source

We are happy to provide "Powered by Binance" attribution on all
crypto charts and data displays.

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]
Website: [Your Website]`
                ),

                heading('Email 2: Bybit — Crypto Derivatives Tick Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'institutional@bybit.com',
                    'Market Data API Partnership — Insight Trading Platform',
                    `Dear Bybit API / Partnerships Team,

I am building Insight — a multi-market algo trading platform
with Kuri scripting language, serving Indian retail traders.

We need Bybit as our secondary crypto data source, specifically
for derivatives/perpetual futures data.

DATA PARTNERSHIP REQUEST:

1. Elevated WebSocket Access
   - Higher rate limits for real-time tick data streaming
   - Spot + USDT Perpetual + Inverse Perpetual data
   - Orderbook depth snapshots (L2 data)

2. Historical Data Access
   - Tick-level historical trade data for backtesting
   - Funding rate history
   - Open interest historical data

3. Commercial Display Confirmation
   - Written confirmation that displaying Bybit data to our
     platform users (500-5,000) is permitted
   - Attribution terms

WHAT WE OFFER:
- "Data provided by Bybit" attribution on derivatives charts
- Bybit featured as data source in our platform
- Exposure to Indian algo trading community

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),

                heading('Email 3: Bitget — Crypto Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'business@bitget.com',
                    'Market Data Partnership — Insight Algo Trading Platform',
                    `Dear Bitget Partnerships Team,

I am the founder of Insight — an algorithmic trading platform
targeting Indian retail traders with a custom scripting language
(Kuri) for automated strategies.

We would like to integrate Bitget as a crypto data source on our
platform.

DATA PARTNERSHIP REQUEST:

1. Real-Time Tick Data
   - WebSocket access for spot + futures pairs
   - Elevated rate limits for commercial platform
   - Tick-by-tick trade data + orderbook depth

2. Historical Data
   - Historical OHLCV + trade data for backtesting
   - Funding rate + open interest history

3. Commercial Display Rights
   - Permission to display Bitget data to our platform users
   - Clear attribution terms

WHAT WE OFFER:
- "Powered by Bitget" attribution on charts
- Bitget listed as data source in our platform
- Exposure to 500-5,000 Indian algo traders

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),
            ],
        },

        // SECTION 3: FOREX EMAILS
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('3. Forex Data Partnership Emails'),
                emptyLine(),

                heading(
                    'Email 4: LMAX Exchange — Institutional Forex Tick Data',
                    HeadingLevel.HEADING_2
                ),
                ...emailBlock(
                    'sales@lmax.com',
                    'Forex Market Data License — Insight Trading Platform',
                    `Dear LMAX Data Team,

I am the founder of Insight — a multi-market algorithmic trading
platform serving Indian retail and semi-professional traders. Our
platform uses a proprietary scripting language (Kuri) for automated
forex strategy creation and signal generation.

We are seeking an institutional-grade forex data feed and LMAX
Exchange is our preferred source due to your transparent,
exchange-quality pricing.

DATA LICENSE REQUEST:

1. Real-Time Forex Tick Data
   - Streaming tick-by-tick bid/ask for all major pairs
     (EUR/USD, GBP/USD, USD/JPY, AUD/USD, etc.)
   - Minor and exotic pairs coverage
   - WebSocket or FIX protocol delivery

2. Data Redistribution License
   - Display rights: Show LMAX forex prices to our platform users
   - User count: 500 initially, scaling to 5,000
   - Display format: Candlestick charts, real-time price ticker,
     strategy signals

3. Historical Tick Data
   - Tick-by-tick historical data for backtesting engine
   - Minimum 2-3 years of history for major pairs
   - Required for strategy validation and performance reporting

ABOUT OUR PLATFORM:
- Multi-market: Crypto (Binance), Forex (seeking LMAX),
  Indian Stocks (NSE/BSE)
- Custom Kuri scripting language for strategy automation
- Strategy marketplace with hidden source code (subscription model)
- Target: 500-5,000 paid users at Rs.3,000/month (~$36)

QUESTIONS:
1. What is the licensing cost for real-time forex tick data
   redistribution to 500-5,000 end users?
2. Is pricing per-user or flat rate?
3. Do you offer a startup/growth-stage pricing tier?
4. What delivery protocols are available (WebSocket/REST/FIX)?

We are happy to provide full "Data by LMAX Exchange" attribution
on all forex charts and pricing displays.

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]
Website: [Your Website]`
                ),

                heading('Email 5: OANDA — Forex Data API', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'api@oanda.com',
                    'Commercial Forex Data API License — Insight Platform',
                    `Dear OANDA API Team,

I am the founder of Insight — an algorithmic trading platform
for Indian traders, featuring Kuri scripting language for
automated forex strategy creation.

We need a commercial forex data feed and OANDA's API is the
industry standard for programmatic forex data access.

DATA LICENSE REQUEST:

1. Real-Time Streaming Forex Data
   - Tick-by-tick bid/ask prices via REST v20 Streaming API
   - All major, minor, and exotic forex pairs
   - Metals (XAU/USD, XAG/USD) if available

2. Commercial Redistribution License
   - Display OANDA forex prices on our platform to end users
   - Current scale: 500 users, growing to 5,000
   - Use case: Real-time charts, price alerts, strategy signals

3. Historical Data
   - Candle data (M1 to Monthly) for backtesting
   - Tick data history for strategy validation

QUESTIONS:
1. Does OANDA offer a commercial data redistribution license
   separate from a trading account?
2. What is the pricing structure (flat rate vs per-user)?
3. Can we use OANDA practice/demo API for real-time data
   display on a commercial platform, or is a separate
   license required?
4. What attribution is required?

ABOUT OUR PLATFORM:
- Multi-market algo trading platform (Crypto + Forex + Stocks)
- Kuri scripting language for strategy creation
- Trade execution handled separately via MT5 integration
- We only need DATA from OANDA, not execution

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),

                heading('Email 6: TraderMade — Forex Data Vendor', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'sales@tradermade.com',
                    'Commercial Forex Data API for Trading Platform',
                    `Dear TraderMade Team,

I am the founder of Insight — a multi-market algo trading platform
serving Indian traders. We need a reliable forex data feed with
commercial redistribution rights.

DATA REQUIREMENTS:

1. Real-Time Forex Tick Data
   - WebSocket streaming for all major/minor pairs
   - Tick-by-tick or sub-second updates
   - Metals (Gold, Silver)

2. Commercial Display License
   - Show forex prices to 500-5,000 platform users
   - Real-time charts, alerts, and strategy signals
   - Full redistribution rights

3. Historical Data
   - Minute-level candles (minimum 3 years)
   - Tick data for backtesting

QUESTIONS:
1. Which TraderMade plan includes commercial redistribution
   rights for 500-5,000 users?
2. Is the Enterprise plan sufficient, or do we need a custom
   agreement?
3. What is the WebSocket symbol limit per plan?
4. Do you offer annual billing discounts?

We are ready to purchase immediately once terms are confirmed.

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),
            ],
        },

        // SECTION 4: INDIAN STOCK MARKET EMAILS
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('4. Indian Stock Market Data Partnership Emails'),
                emptyLine(),

                heading('Email 7: TrueData — NSE/BSE Tick Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'sales@truedata.in',
                    'Commercial Data Feed License — Insight Algo Trading Platform',
                    `Dear TrueData Team,

I am the founder of Insight — a multi-market algorithmic trading
platform serving Indian retail traders with automated strategy
creation using our Kuri scripting language.

We need real-time Indian stock market tick data for our platform
and TrueData is the most trusted independent data vendor for
NSE/BSE feeds.

DATA REQUIREMENTS:

1. Real-Time Tick Data
   - NSE (Equity, F&O, Currency)
   - BSE (Equity)
   - MCX (Commodities) — if available
   - Tick-by-tick trades + L1/L2 orderbook
   - WebSocket or TCP delivery

2. Commercial Redistribution License
   - Display NSE/BSE prices on our platform to end users
   - Real-time candlestick charts
   - Price alerts and strategy signals
   - 500 users initially, scaling to 5,000

3. Historical Data
   - Minute-level candles (minimum 3-5 years)
   - Tick data for F&O backtesting
   - EOD data for all NSE/BSE listed stocks

QUESTIONS:
1. Which TrueData plan supports commercial redistribution
   to platform users?
2. What are the NSE/BSE exchange redistribution fees
   (are they included or separate)?
3. Pricing for 500 concurrent users vs 5,000?
4. WebSocket API availability and documentation?
5. Do you offer startup/growth-stage pricing?

ABOUT OUR PLATFORM:
- Multi-market: Crypto (Binance), Forex, Indian Stocks
- Trade execution via Kite Connect / broker APIs (separate)
- We ONLY need market data from TrueData
- Kuri scripting language generates automated signals
- Strategy marketplace with subscription model

Happy to visit your office or schedule a call.

Warm regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]
Location: [Your City], India`
                ),

                heading('Email 8: Global Datafeeds — Budget NSE/BSE Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'sales@docdatafeeds.in',
                    'Real-Time NSE/BSE Data Feed — Insight Trading Platform',
                    `Dear Global Datafeeds Team,

I am building Insight — a multi-market algo trading platform for
Indian traders. We need affordable real-time NSE/BSE tick data
for our charting and strategy engine.

DATA REQUIREMENTS:

1. Real-Time Data: NSE Equity, F&O, Currency + BSE Equity
2. Delivery: WebSocket or API streaming
3. Commercial Use: Display to 500-5,000 platform users
4. Historical: 3-5 years minute-level candles

QUESTIONS:
1. Which plan covers commercial redistribution?
2. Are NSE/BSE exchange fees included?
3. Pricing for our scale (500-5,000 users)?
4. API/WebSocket documentation available?

Immediate requirement — ready to purchase on confirmed terms.

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),

                heading('Email 9: Dhan (DhanHQ) — Free Indian Market Data', HeadingLevel.HEADING_2),
                ...emailBlock(
                    'api@dhan.co',
                    'DhanHQ Market Data API Access — Insight Trading Platform',
                    `Dear Dhan / DhanHQ Team,

I am the founder of Insight — a multi-market algo trading platform
with Kuri scripting language for Indian retail traders.

DhanHQ API provides the most modern and developer-friendly access
to Indian market data. We want to use DhanHQ purely as a MARKET
DATA SOURCE for our platform.

DATA ACCESS REQUEST:

1. Real-Time NSE/BSE Tick Data
   - WebSocket streaming via DhanHQ API
   - Equity + F&O + Currency segments
   - Tick-by-tick price updates

2. Commercial Display Confirmation
   - Can we display DhanHQ market data to our platform users
     (500-5,000) on candlestick charts?
   - What attribution is required?
   - Are there any restrictions on commercial display?

3. Historical Data
   - OHLCV candle data for backtesting
   - Intraday data (1-min, 5-min candles)

NOTE: We are NOT using Dhan for trade execution. Execution is
handled via separate broker integrations (Kite Connect, etc.).
We only need market data access.

QUESTIONS:
1. Is DhanHQ API free for commercial data display?
2. Any rate limits for WebSocket connections per app?
3. Do we need a Dhan trading account, or is standalone
   API access available?

Best regards,
[Your Full Name]
Founder, Insight Trading Platform
Phone: [Your Number]
Email: [Your Email]`
                ),
            ],
        },

        // SECTION 5: SENDING SCHEDULE
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('5. Sending Schedule & Priority'),
                emptyLine(),

                heading('All 9 Emails Summary', HeadingLevel.HEADING_2),
                createTable(
                    ['#', 'Partner', 'Market', 'Purpose', 'Email To', 'Priority'],
                    [
                        [
                            '1',
                            'Binance',
                            'Crypto',
                            'Elevated API + historical ticks',
                            'partnerships@binance.com',
                            'HIGH',
                        ],
                        [
                            '2',
                            'Bybit',
                            'Crypto',
                            'Derivatives tick data',
                            'institutional@bybit.com',
                            'MEDIUM',
                        ],
                        [
                            '3',
                            'Bitget',
                            'Crypto',
                            'Additional crypto data',
                            'business@bitget.com',
                            'LOW',
                        ],
                        [
                            '4',
                            'LMAX Exchange',
                            'Forex',
                            'Institutional tick data',
                            'sales@lmax.com',
                            'HIGH',
                        ],
                        ['5', 'OANDA', 'Forex', 'Commercial data license', 'api@oanda.com', 'HIGH'],
                        [
                            '6',
                            'TraderMade',
                            'Forex',
                            'Affordable forex data',
                            'sales@tradermade.com',
                            'MEDIUM',
                        ],
                        [
                            '7',
                            'TrueData',
                            'Indian Stocks',
                            'NSE/BSE tick data',
                            'sales@truedata.in',
                            'HIGH',
                        ],
                        [
                            '8',
                            'Global Datafeeds',
                            'Indian Stocks',
                            'Budget NSE/BSE data',
                            'sales@docdatafeeds.in',
                            'MEDIUM',
                        ],
                        [
                            '9',
                            'Dhan (DhanHQ)',
                            'Indian Stocks',
                            'Free NSE/BSE data',
                            'api@dhan.co',
                            'HIGH',
                        ],
                    ],
                    [5, 14, 13, 24, 26, 10]
                ),
                emptyLine(),

                heading('Recommended Sending Order', HeadingLevel.HEADING_2),
                createTable(
                    ['Day', 'Send To', 'Why First'],
                    [
                        [
                            'Day 1',
                            'Binance + Dhan + TrueData',
                            'Already using Binance / Free / Essential for Indian market',
                        ],
                        ['Day 2', 'LMAX + OANDA', 'Forex data — most important gap to fill'],
                        ['Day 3', 'Bybit + TraderMade', 'Backup and secondary data sources'],
                        [
                            'Day 4',
                            'Bitget + Global Datafeeds',
                            'Additional coverage and redundancy',
                        ],
                    ],
                    [15, 40, 45]
                ),
                emptyLine(),

                heading('6. Execution Stack Summary (Separate from Data)', HeadingLevel.HEADING_2),
                emptyLine(),
                para('Data and trade execution are handled by DIFFERENT systems:', { bold: true }),
                emptyLine(),
                createTable(
                    ['Market', 'Data Source (This Document)', 'Trade Execution (Separate)'],
                    [
                        [
                            'Crypto',
                            'Binance + Bybit + Bitget (free APIs)',
                            'Binance API, Bitget API (direct)',
                        ],
                        [
                            'Forex',
                            'LMAX / OANDA / TraderMade (licensed)',
                            'MT5 Integration (broker-agnostic)',
                        ],
                        [
                            'Indian Stocks',
                            'TrueData / Dhan / Global Datafeeds',
                            'Kite Connect (Zerodha)',
                        ],
                    ],
                    [18, 42, 40]
                ),
                emptyLine(),
                para('This separation means:'),
                bullet('Data providers give us real-time prices for charts and strategy signals'),
                bullet(
                    'Trade execution happens through broker APIs when users want to place orders'
                ),
                bullet(
                    'If one data provider has issues, we can switch without affecting execution'
                ),
                bullet('Users can use ANY broker for trading while viewing data from our platform'),

                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 400 },
                    children: [
                        new TextRun({
                            text: '--- End of Document ---',
                            size: 20,
                            color: GRAY,
                            font: 'Segoe UI',
                            italics: true,
                        }),
                    ],
                }),
            ],
        },
    ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('docs/Insight_Partnership_Emails.docx', buffer);
console.log('Word document created: docs/Insight_Partnership_Emails.docx');
