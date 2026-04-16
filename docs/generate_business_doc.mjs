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
    BorderStyle,
    ShadingType,
    PageBreak,
    Tab,
    TabStopPosition,
    TabStopType,
    ImageRun,
} from 'docx';
import fs from 'fs';

// Color palette
const BLUE = '1a73e8';
const DARK = '1f2937';
const GREEN = '16a34a';
const RED = 'dc2626';
const GRAY = '6b7280';
const LIGHT_BG = 'f0f4ff';
const GREEN_BG = 'ecfdf5';
const YELLOW_BG = 'fefce8';
const WHITE = 'ffffff';

// Helper functions
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
        spacing: { after: 120 },
        alignment: opts.align || AlignmentType.LEFT,
        children: [
            new TextRun({
                text,
                size: opts.size || 22,
                color: opts.color || DARK,
                bold: opts.bold || false,
                italics: opts.italic || false,
                font: 'Segoe UI',
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
                        bold: i === 0 ? false : false,
                    })
                ),
            })
    );

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
    });
}

function highlightBox(text, bgColor = LIGHT_BG) {
    return new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [
            new TextRun({
                text: '  ' + text + '  ',
                bold: true,
                size: 24,
                color: DARK,
                font: 'Segoe UI',
                shading: { type: ShadingType.SOLID, color: bgColor },
            }),
        ],
    });
}

// Build document
const doc = new Document({
    styles: {
        default: {
            document: {
                run: { font: 'Segoe UI', size: 22, color: DARK },
            },
        },
    },
    sections: [
        // ==================== COVER PAGE ====================
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
                            text: 'Complete Business Analysis & Cost Estimation',
                            size: 28,
                            color: GRAY,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({
                            text: '18-Month Financial Roadmap',
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
                            text: '500 to 5,000 Paid Users Growth Plan',
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
                            text: 'Subscription Price: Rs.3,000/month',
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
                            text: 'Data Provider: Twelve Data + Binance',
                            size: 20,
                            color: GRAY,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
            ],
        },

        // ==================== TABLE OF CONTENTS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('Table of Contents'),
                emptyLine(),
                ...[
                    '1. Platform Overview',
                    '2. Market Opportunity & Competitors',
                    '3. Technology Stack & Data Providers',
                    '4. One-Time Setup Costs',
                    '5. Monthly Cost - 500 Paid Users',
                    '6. Monthly Cost - 5,000 Paid Users',
                    '7. Side-by-Side Cost Comparison',
                    '8. 18-Month Cost Estimation',
                    '9. Revenue & Profit Projections',
                    '10. User Acquisition Strategy',
                    '11. Timeline to 500 & 5,000 Paid Users',
                    '12. Risks & Mitigation',
                    '13. Final Recommendation',
                ].map(
                    (item) =>
                        new Paragraph({
                            spacing: { after: 100 },
                            children: [
                                new TextRun({
                                    text: item,
                                    size: 24,
                                    color: DARK,
                                    font: 'Segoe UI',
                                }),
                            ],
                        })
                ),
            ],
        },

        // ==================== SECTION 1: PLATFORM OVERVIEW ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('1. Platform Overview'),
                emptyLine(),
                heading('What Is Insight?', HeadingLevel.HEADING_2),
                para('Insight is a multi-market algorithmic trading platform that combines:'),
                bullet(
                    'Real-time market charting - Live candlestick charts with technical indicators across Crypto, Forex, and Stocks'
                ),
                bullet(
                    'Kuri Scripting Engine - A proprietary scripting language for creating custom trading strategies'
                ),
                bullet(
                    'Strategy Studio - Workspace for writing, testing, and managing Kuri strategies that generate buy/sell signals'
                ),
                bullet(
                    'Signal & Alert System - Real-time automated alerts when strategies trigger'
                ),
                bullet(
                    'Strategy Marketplace - Subscription-based marketplace where creators sell strategies with hidden source code'
                ),
                emptyLine(),

                heading('Target Markets', HeadingLevel.HEADING_2),
                createTable(
                    ['Market', 'Status', 'Timeline'],
                    [
                        ['Cryptocurrency', 'Phase 1 (Already integrated via Binance)', 'Now'],
                        ['Forex', 'Phase 2 (Via Twelve Data)', 'Month 4+'],
                        ['Stocks (US, EU, Global)', 'Phase 2 (Via Twelve Data)', 'Month 4+'],
                        ['Indian Stocks (NSE/BSE)', 'Phase 3 (Future expansion)', 'Month 15+'],
                    ],
                    [30, 45, 25]
                ),
                emptyLine(),

                heading('Subscription Model', HeadingLevel.HEADING_2),
                para('Plan Price: Rs.3,000/month (~$36 USD)', { bold: true }),
                para(
                    'Model: Hidden strategy subscription - creators sell strategies, subscribers get signals without seeing source code'
                ),
                emptyLine(),

                heading('Key Differentiators', HeadingLevel.HEADING_2),
                createTable(
                    ['Feature', 'Insight', 'Competitors'],
                    [
                        ['Scripting Language', 'Kuri (proprietary, simple)', 'Pine Script or none'],
                        ['Markets', 'Crypto + Forex + Stocks', 'Usually single market'],
                        ['Strategy IP Protection', 'Hidden source code', 'Code visible/copyable'],
                        ['Real-time Signals', 'Automated across all markets', 'Manual or delayed'],
                        ['Marketplace Model', 'Subscription-based', 'Not available in India'],
                    ],
                    [25, 40, 35]
                ),
            ],
        },

        // ==================== SECTION 2: MARKET & COMPETITORS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('2. Market Opportunity & Competitors'),
                emptyLine(),

                heading('Target Addressable Market (India)', HeadingLevel.HEADING_2),
                createTable(
                    ['Segment', 'Active Users'],
                    [
                        ['Stock Market (Active Demat accounts)', '1.5 crore+'],
                        ['Crypto Traders', '1.5-2 crore'],
                        ['Forex Traders', '10-15 lakh'],
                        ['Total Addressable Market', '3-4 crore traders'],
                    ],
                    [55, 45]
                ),
                emptyLine(),
                para('500 paid users = 0.0017% of market (very achievable)'),
                para('5,000 paid users = 0.017% of market (still a tiny fraction)'),
                emptyLine(),

                heading('Direct Competitors (Global)', HeadingLevel.HEADING_2),
                createTable(
                    ['Platform', 'What They Do', 'Users', 'Pricing', "Insight's Edge"],
                    [
                        [
                            'TradingView',
                            'Charting + Pine Script',
                            'Millions',
                            '$12-60/mo',
                            'Kuri simpler than Pine Script',
                        ],
                        [
                            '3Commas',
                            'Bot trading + marketplace',
                            '100K+',
                            '$22-49/mo',
                            'No custom scripting',
                        ],
                        ['Pionex', 'Built-in trading bots', '200K+', 'Free', 'Zero customization'],
                        [
                            'Cryptohopper',
                            'Strategy marketplace',
                            '50K+',
                            '$19-99/mo',
                            'No real scripting',
                        ],
                        [
                            'Mudrex',
                            'Visual strategy builder',
                            '30K+',
                            '$16-49/mo',
                            'Drag-and-drop ceiling',
                        ],
                    ],
                    [15, 22, 12, 15, 36]
                ),
                emptyLine(),

                heading('Indian Competitors', HeadingLevel.HEADING_2),
                createTable(
                    ['Platform', 'What They Do', 'Users', 'Pricing'],
                    [
                        [
                            'Streak (Zerodha)',
                            'Visual algo builder for stocks',
                            '5 lakh+',
                            'Free + Rs.500/mo',
                        ],
                        ['Tradetron', 'Strategy marketplace', '50K+', 'Rs.1,000-5,000/mo'],
                        ['Algotest', 'Algo backtesting for options', '20K+', 'Rs.2,000-4,000/mo'],
                        ['StockMock', 'Paper trading + strategies', '10K+', 'Free + premium'],
                    ],
                    [25, 35, 20, 20]
                ),
                emptyLine(),
                para(
                    'These Indian platforms ALREADY have paying users at Rs.1,000-5,000/month. The market exists and users are willing to pay.',
                    { bold: true }
                ),
            ],
        },

        // ==================== SECTION 3: TECHNOLOGY STACK ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('3. Technology Stack & Data Providers'),
                emptyLine(),

                heading('Market Data Provider: Twelve Data', HeadingLevel.HEADING_2),
                createTable(
                    ['Feature', 'Grow ($79/mo)', 'Venture ($499/mo)', 'Enterprise ($1,099/mo)'],
                    [
                        [
                            'Data Access',
                            'Internal non-display',
                            'External display',
                            'External distribution',
                        ],
                        ['API Credits/min', '377', '2,584+', '10,946+'],
                        ['WebSocket Credits', '8 trial', '2,500+', '10,000+'],
                        ['Markets', '3', '75', '84'],
                        ['US Stocks Real-time', 'Yes', 'Yes', 'Yes'],
                        ['EU Stocks', 'No', 'Real-time', 'Real-time'],
                        ['SLA', 'None', 'None listed', '99.99%'],
                        ['Best For', 'Building/testing', '500 users', '5,000 users'],
                    ],
                    [22, 26, 26, 26]
                ),
                emptyLine(),

                heading('Complete Technology Stack', HeadingLevel.HEADING_2),
                createTable(
                    ['Component', 'Provider', 'Purpose'],
                    [
                        [
                            'Market Data (Forex + Stocks)',
                            'Twelve Data',
                            'Real-time WebSocket streaming',
                        ],
                        ['Market Data (Crypto)', 'Binance WebSocket', 'Free real-time crypto data'],
                        ['Application Servers', 'Hetzner Cloud', 'API, WebSocket, Kuri workers'],
                        ['Database + Auth', 'Supabase', 'PostgreSQL, authentication, storage'],
                        ['Caching', 'Upstash', 'Redis for pub/sub and caching'],
                        ['CDN + Security', 'Cloudflare', 'CDN, SSL, DDoS protection, WAF'],
                        ['Email', 'Resend', 'Transactional emails'],
                        ['Push Notifications', 'Firebase FCM', 'Mobile and web push alerts'],
                        ['Error Tracking', 'Sentry', 'Bug monitoring'],
                        ['Uptime Monitoring', 'BetterUptime', 'Server health checks'],
                        ['Payment Gateway', 'Razorpay', 'INR payments (UPI, cards, netbanking)'],
                    ],
                    [30, 25, 45]
                ),
            ],
        },

        // ==================== SECTION 4: ONE-TIME COSTS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('4. One-Time Setup Costs'),
                emptyLine(),

                heading('For 500 Paid Users', HeadingLevel.HEADING_2),
                createTable(
                    ['#', 'Item', 'Purpose', 'Cost (INR)', 'Cost (USD)'],
                    [
                        ['1', 'Pvt Ltd Company Registration', 'Legal entity', 'Rs.15,000', '$180'],
                        ['2', 'GST Registration', 'Tax compliance', 'Rs.3,000', '$36'],
                        ['3', 'Terms of Service', 'Legal protection', 'Rs.5,000', '$60'],
                        ['4', 'Privacy Policy', 'DPDP Act compliance', 'Rs.5,000', '$60'],
                        ['5', 'Disclaimer Page', 'Legal shield', 'Rs.2,000', '$24'],
                        ['6', 'Trademark Filing', 'Brand protection', 'Rs.7,000', '$84'],
                        ['7', 'Domain Name (.com)', 'Website address', 'Rs.850', '$10'],
                        ['8', 'Logo + Branding', 'Professional identity', 'Rs.3,000', '$36'],
                        ['', 'TOTAL', '', 'Rs.40,850', '~$490'],
                    ],
                    [5, 28, 27, 20, 20]
                ),
                emptyLine(),

                heading('Additional for 5,000 Paid Users', HeadingLevel.HEADING_2),
                createTable(
                    ['#', 'Item', 'Purpose', 'Cost (INR)', 'Cost (USD)'],
                    [
                        ['1-8', 'Same as above', '', 'Rs.40,850', '$490'],
                        ['9', 'Security Audit', 'Penetration testing', 'Rs.50,000', '$600'],
                        ['10', 'Legal Review', 'Compliance check', 'Rs.25,000', '$300'],
                        ['', 'TOTAL', '', 'Rs.1,15,850', '~$1,390'],
                    ],
                    [8, 28, 27, 20, 17]
                ),
            ],
        },

        // ==================== SECTION 5: MONTHLY COST 500 USERS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('5. Monthly Cost - 500 Paid Users'),
                emptyLine(),

                heading('A. Infrastructure & Technology', HeadingLevel.HEADING_3),
                createTable(
                    ['Item', 'Provider', 'Plan', 'Cost/mo (INR)'],
                    [
                        ['Market Data (Forex + Stocks)', 'Twelve Data', 'Venture', 'Rs.41,600'],
                        ['Crypto Data', 'Binance', 'WebSocket API', 'Rs.0'],
                        ['Server #1 (API)', 'Hetzner', 'CX32', 'Rs.670'],
                        ['Server #2 (WebSocket)', 'Hetzner', 'CX32', 'Rs.670'],
                        ['Server #3 (Workers)', 'Hetzner', 'CX32', 'Rs.670'],
                        ['Database + Auth', 'Supabase', 'Team', 'Rs.8,250'],
                        ['Redis Cache', 'Upstash', 'Pay-as-you-go', 'Rs.1,250'],
                        ['CDN + SSL + WAF', 'Cloudflare', 'Pro', 'Rs.2,080'],
                        ['Email / Push / Monitoring', 'Resend/Firebase/Sentry', 'Free', 'Rs.0'],
                        ['SUBTOTAL', '', '', 'Rs.55,190'],
                    ],
                    [28, 20, 22, 30]
                ),
                emptyLine(),

                heading('B. Team & Manpower', HeadingLevel.HEADING_3),
                createTable(
                    ['Role', 'Type', 'Cost/mo (INR)'],
                    [
                        ['Customer Support', 'Part-time freelancer', 'Rs.20,000'],
                        ['Social Media / Content', 'Part-time freelancer', 'Rs.15,000'],
                        ['UI/UX Designer', 'Freelance (as needed)', 'Rs.5,000'],
                        ['SUBTOTAL', '', 'Rs.40,000'],
                    ],
                    [35, 35, 30]
                ),
                emptyLine(),

                heading('C. Marketing', HeadingLevel.HEADING_3),
                createTable(
                    ['Channel', 'Purpose', 'Cost/mo (INR)'],
                    [
                        ['Google Ads', 'Search keywords', 'Rs.10,000'],
                        ['Instagram / Facebook Ads', 'Target traders', 'Rs.5,000'],
                        ['YouTube + Telegram + Influencers', 'Organic + paid', 'Rs.5,000'],
                        ['SUBTOTAL', '', 'Rs.20,000'],
                    ],
                    [35, 35, 30]
                ),
                emptyLine(),

                heading('D-G. Other Costs', HeadingLevel.HEADING_3),
                createTable(
                    ['Category', 'Details', 'Cost/mo (INR)'],
                    [
                        ['Legal / CA', 'Bookkeeping + GST filing', 'Rs.5,000'],
                        ['Payment Gateway', 'Razorpay 2% of Rs.15,00,000', 'Rs.30,000'],
                        ['Tools', 'Google Workspace', 'Rs.280'],
                        ['Miscellaneous', 'Contingency + connectivity', 'Rs.6,000'],
                        ['SUBTOTAL', '', 'Rs.41,280'],
                    ],
                    [30, 40, 30]
                ),
                emptyLine(),

                highlightBox('TOTAL MONTHLY (500 Paid Users): Rs.1,56,470 (~$1,877)'),
            ],
        },

        // ==================== SECTION 6: MONTHLY COST 5000 USERS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('6. Monthly Cost - 5,000 Paid Users'),
                emptyLine(),

                heading('A. Infrastructure & Technology', HeadingLevel.HEADING_3),
                createTable(
                    ['Item', 'Provider', 'Plan', 'Cost/mo (INR)'],
                    [
                        ['Market Data', 'Twelve Data', 'Enterprise', 'Rs.91,600'],
                        ['Crypto Data', 'Binance', 'WebSocket', 'Rs.0'],
                        ['Servers (6 x CX32 + LB)', 'Hetzner', 'Cluster', 'Rs.4,530'],
                        ['Database + Auth', 'Supabase', 'Team + Compute', 'Rs.12,500'],
                        ['Redis Cache', 'Upstash', 'Pro', 'Rs.2,500'],
                        ['CDN + SSL + WAF', 'Cloudflare', 'Pro', 'Rs.2,080'],
                        ['Email', 'Resend', 'Pro (50K)', 'Rs.1,660'],
                        ['SMS Alerts', 'Twilio', 'Pay-as-you-go', 'Rs.2,500'],
                        ['Error Tracking', 'Sentry', 'Team', 'Rs.2,160'],
                        ['SUBTOTAL', '', '', 'Rs.1,19,530'],
                    ],
                    [28, 20, 22, 30]
                ),
                emptyLine(),

                heading('B. Team & Manpower', HeadingLevel.HEADING_3),
                createTable(
                    ['Role', 'Type', 'Cost/mo (INR)'],
                    [
                        ['Customer Support (2 people)', 'Full-time', 'Rs.50,000'],
                        ['Sr. Support / Community Mgr', 'Full-time', 'Rs.30,000'],
                        ['Social Media / Content', 'Full-time', 'Rs.25,000'],
                        ['Junior Developer (frontend)', 'Full-time', 'Rs.35,000'],
                        ['UI/UX Designer', 'Part-time', 'Rs.15,000'],
                        ['SUBTOTAL', '', 'Rs.1,55,000'],
                    ],
                    [35, 30, 35]
                ),
                emptyLine(),

                heading('C. Marketing', HeadingLevel.HEADING_3),
                createTable(
                    ['Channel', 'Cost/mo (INR)'],
                    [
                        ['Google Ads', 'Rs.40,000'],
                        ['Instagram / Facebook Ads', 'Rs.25,000'],
                        ['YouTube (production + ads)', 'Rs.15,000'],
                        ['Influencer Collaborations', 'Rs.20,000'],
                        ['Telegram / Discord', 'Rs.5,000'],
                        ['SEO / Content Writing', 'Rs.10,000'],
                        ['SUBTOTAL', 'Rs.1,15,000'],
                    ],
                    [60, 40]
                ),
                emptyLine(),

                heading('D-G. Other Costs', HeadingLevel.HEADING_3),
                createTable(
                    ['Category', 'Details', 'Cost/mo (INR)'],
                    [
                        ['Legal / CA + Retainer', 'Compliance + filing', 'Rs.18,000'],
                        ['Payment Gateway', 'Razorpay 2% of Rs.1.5 Cr', 'Rs.3,00,000'],
                        ['Tools + Misc', 'Workspace + contingency', 'Rs.19,400'],
                        ['SUBTOTAL', '', 'Rs.3,37,400'],
                    ],
                    [30, 40, 30]
                ),
                emptyLine(),

                highlightBox('TOTAL MONTHLY (5,000 Paid Users): Rs.7,26,930 (~$8,715)'),
            ],
        },

        // ==================== SECTION 7: SIDE-BY-SIDE COMPARISON ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('7. Side-by-Side Cost Comparison'),
                emptyLine(),
                createTable(
                    ['Metric', '500 Paid Users', '5,000 Paid Users'],
                    [
                        ['One-Time Setup', 'Rs.40,850', 'Rs.1,15,850'],
                        ['', '', ''],
                        ['Infrastructure/mo', 'Rs.55,190', 'Rs.1,19,530'],
                        ['Team/mo', 'Rs.40,000', 'Rs.1,55,000'],
                        ['Marketing/mo', 'Rs.20,000', 'Rs.1,15,000'],
                        ['Legal/mo', 'Rs.5,000', 'Rs.18,000'],
                        ['Payment Gateway/mo', 'Rs.30,000', 'Rs.3,00,000'],
                        ['Tools + Misc/mo', 'Rs.6,280', 'Rs.19,400'],
                        ['', '', ''],
                        ['TOTAL MONTHLY', 'Rs.1,56,470', 'Rs.7,26,930'],
                        ['TOTAL ANNUAL', 'Rs.18,77,640', 'Rs.87,23,160'],
                        ['', '', ''],
                        ['Monthly Revenue', 'Rs.15,00,000', 'Rs.1,50,00,000'],
                        ['Monthly Profit', 'Rs.13,43,530', 'Rs.1,42,73,070'],
                        ['Profit Margin', '89.6%', '95.2%'],
                        ['Annual Profit', 'Rs.1.61 crore', 'Rs.17.13 crore'],
                        ['Break-Even Point', '53 users', '243 users'],
                        ['Team Size', '3 part-time', '5 (full + part-time)'],
                    ],
                    [35, 32, 33]
                ),
            ],
        },

        // ==================== SECTION 8: 18-MONTH ESTIMATION ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('8. 18-Month Cost Estimation'),
                emptyLine(),

                heading('Phase 1: Build & Beta (Month 1-3) - 0 Paid Users', HeadingLevel.HEADING_2),
                createTable(
                    ['Item', 'Cost/mo (INR)'],
                    [
                        ['Twelve Data (Grow - building phase)', 'Rs.6,600'],
                        ['Hetzner (2 x CX32)', 'Rs.1,340'],
                        ['Supabase Pro', 'Rs.2,080'],
                        ['Cloudflare Free + Domain', 'Rs.85'],
                        ['One-time setup (Month 1 only)', 'Rs.40,850'],
                    ],
                    [60, 40]
                ),
                para('Phase 1 Total (3 months): Rs.71,165', { bold: true }),
                emptyLine(),

                heading(
                    'Phase 2: Soft Launch (Month 4-6) - 0 to 80 Paid Users',
                    HeadingLevel.HEADING_2
                ),
                createTable(
                    ['Month', 'Paid Users', 'Revenue', 'Total Cost', 'Profit/Loss'],
                    [
                        ['Month 4', '10', 'Rs.30,000', 'Rs.99,070', '-Rs.69,070'],
                        ['Month 5', '35', 'Rs.1,05,000', 'Rs.1,00,570', '+Rs.4,430'],
                        ['Month 6', '80', 'Rs.2,40,000', 'Rs.1,03,270', '+Rs.1,36,730'],
                    ],
                    [15, 17, 22, 22, 24]
                ),
                para('Phase 2 Total (3 months): Rs.3,02,910 | Revenue: Rs.3,75,000', {
                    bold: true,
                }),
                emptyLine(),

                heading(
                    'Phase 3: Growth (Month 7-12) - 80 to 500 Paid Users',
                    HeadingLevel.HEADING_2
                ),
                createTable(
                    ['Month', 'Paid Users', 'Revenue', 'Total Cost', 'Profit'],
                    [
                        ['Month 7', '120', 'Rs.3,60,000', 'Rs.1,32,670', '+Rs.2,27,330'],
                        ['Month 8', '170', 'Rs.5,10,000', 'Rs.1,35,670', '+Rs.3,74,330'],
                        ['Month 9', '230', 'Rs.6,90,000', 'Rs.1,39,270', '+Rs.5,50,730'],
                        ['Month 10', '300', 'Rs.9,00,000', 'Rs.1,43,470', '+Rs.7,56,530'],
                        ['Month 11', '400', 'Rs.12,00,000', 'Rs.1,49,470', '+Rs.10,50,530'],
                        ['Month 12', '500', 'Rs.15,00,000', 'Rs.1,55,470', '+Rs.13,44,530'],
                    ],
                    [15, 17, 22, 22, 24]
                ),
                para('Phase 3 Total (6 months): Rs.8,56,020 | Revenue: Rs.51,60,000', {
                    bold: true,
                }),
                emptyLine(),

                heading(
                    'Phase 4: Scale (Month 13-18) - 500 to 2,000 Paid Users',
                    HeadingLevel.HEADING_2
                ),
                createTable(
                    ['Month', 'Paid Users', 'Revenue', 'Total Cost', 'Profit'],
                    [
                        ['Month 13', '650', 'Rs.19,50,000', 'Rs.2,99,030', '+Rs.16,50,970'],
                        ['Month 14', '850', 'Rs.25,50,000', 'Rs.3,11,030', '+Rs.22,38,970'],
                        ['Month 15', '1,100', 'Rs.33,00,000', 'Rs.3,76,030', '+Rs.29,23,970'],
                        ['Month 16', '1,400', 'Rs.42,00,000', 'Rs.3,94,030', '+Rs.38,05,970'],
                        ['Month 17', '1,700', 'Rs.51,00,000', 'Rs.4,12,030', '+Rs.46,87,970'],
                        ['Month 18', '2,000', 'Rs.60,00,000', 'Rs.4,30,030', '+Rs.55,69,970'],
                    ],
                    [15, 17, 22, 22, 24]
                ),
                para('Phase 4 Total (6 months): Rs.22,22,180 | Revenue: Rs.2,31,00,000', {
                    bold: true,
                }),
                emptyLine(),

                heading('18-Month Grand Summary', HeadingLevel.HEADING_2),
                createTable(
                    ['Phase', 'Duration', 'Total Cost', 'Total Revenue', 'Total Profit'],
                    [
                        ['Phase 1 (Build)', 'Month 1-3', 'Rs.71,165', 'Rs.0', '-Rs.71,165'],
                        [
                            'Phase 2 (Soft Launch)',
                            'Month 4-6',
                            'Rs.3,02,910',
                            'Rs.3,75,000',
                            '+Rs.72,090',
                        ],
                        [
                            'Phase 3 (Growth)',
                            'Month 7-12',
                            'Rs.8,56,020',
                            'Rs.51,60,000',
                            '+Rs.43,03,980',
                        ],
                        [
                            'Phase 4 (Scale)',
                            'Month 13-18',
                            'Rs.22,22,180',
                            'Rs.2,31,00,000',
                            '+Rs.2,08,77,820',
                        ],
                        ['18-MONTH TOTAL', '', 'Rs.34,52,275', 'Rs.2,86,35,000', 'Rs.2,51,82,725'],
                    ],
                    [20, 15, 20, 22, 23]
                ),
                emptyLine(),

                highlightBox(
                    '18-Month: Rs.34.5 Lakhs Investment -> Rs.2.86 Crore Revenue -> Rs.2.52 Crore Profit'
                ),
            ],
        },

        // ==================== SECTION 9: CUMULATIVE CASH FLOW ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('9. Cumulative Cash Flow (Month by Month)'),
                emptyLine(),
                createTable(
                    ['Month', 'Paid Users', 'Revenue', 'Cost', 'Monthly P/L', 'Running Total'],
                    [
                        ['1', '0', 'Rs.0', 'Rs.50,955', '-Rs.50,955', '-Rs.50,955'],
                        ['2', '0', 'Rs.0', 'Rs.10,105', '-Rs.10,105', '-Rs.61,060'],
                        ['3', '0', 'Rs.0', 'Rs.10,105', '-Rs.10,105', '-Rs.71,165'],
                        ['4', '10', 'Rs.30,000', 'Rs.99,070', '-Rs.69,070', '-Rs.1,40,235'],
                        ['5', '35', 'Rs.1,05,000', 'Rs.1,00,570', '+Rs.4,430', '-Rs.1,35,805'],
                        ['6', '80', 'Rs.2,40,000', 'Rs.1,03,270', '+Rs.1,36,730', '+Rs.935'],
                        ['7', '120', 'Rs.3,60,000', 'Rs.1,32,670', '+Rs.2,27,330', '+Rs.2,28,265'],
                        ['8', '170', 'Rs.5,10,000', 'Rs.1,35,670', '+Rs.3,74,330', '+Rs.6,02,595'],
                        ['9', '230', 'Rs.6,90,000', 'Rs.1,39,270', '+Rs.5,50,730', '+Rs.11,53,325'],
                        [
                            '10',
                            '300',
                            'Rs.9,00,000',
                            'Rs.1,43,470',
                            '+Rs.7,56,530',
                            '+Rs.19,09,855',
                        ],
                        [
                            '11',
                            '400',
                            'Rs.12,00,000',
                            'Rs.1,49,470',
                            '+Rs.10,50,530',
                            '+Rs.29,60,385',
                        ],
                        [
                            '12',
                            '500',
                            'Rs.15,00,000',
                            'Rs.1,55,470',
                            '+Rs.13,44,530',
                            '+Rs.43,04,915',
                        ],
                        [
                            '13',
                            '650',
                            'Rs.19,50,000',
                            'Rs.2,99,030',
                            '+Rs.16,50,970',
                            '+Rs.59,55,885',
                        ],
                        [
                            '14',
                            '850',
                            'Rs.25,50,000',
                            'Rs.3,11,030',
                            '+Rs.22,38,970',
                            '+Rs.81,94,855',
                        ],
                        [
                            '15',
                            '1,100',
                            'Rs.33,00,000',
                            'Rs.3,76,030',
                            '+Rs.29,23,970',
                            '+Rs.1,11,18,825',
                        ],
                        [
                            '16',
                            '1,400',
                            'Rs.42,00,000',
                            'Rs.3,94,030',
                            '+Rs.38,05,970',
                            '+Rs.1,49,24,795',
                        ],
                        [
                            '17',
                            '1,700',
                            'Rs.51,00,000',
                            'Rs.4,12,030',
                            '+Rs.46,87,970',
                            '+Rs.1,96,12,765',
                        ],
                        [
                            '18',
                            '2,000',
                            'Rs.60,00,000',
                            'Rs.4,30,030',
                            '+Rs.55,69,970',
                            '+Rs.2,51,82,735',
                        ],
                    ],
                    [8, 12, 18, 18, 19, 25]
                ),
                emptyLine(),

                heading('Key Milestones', HeadingLevel.HEADING_2),
                bullet('Month 5: Breakeven (35 paid users)'),
                bullet('Month 6: Total investment recovered'),
                bullet('Month 12: 500 paid users, Rs.43 lakhs cumulative profit'),
                bullet('Month 15: Rs.1.11 crore cumulative profit'),
                bullet('Month 18: 2,000 paid users, Rs.2.52 crore cumulative profit'),
                emptyLine(),
                highlightBox(
                    'Initial Capital Needed: Rs.1,40,235 (~Rs.1.5 Lakhs) to survive until breakeven at Month 5'
                ),
            ],
        },

        // ==================== SECTION 10: USER ACQUISITION ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('10. User Acquisition Strategy'),
                emptyLine(),

                heading('Channel 1: YouTube (FREE - Highest ROI)', HeadingLevel.HEADING_2),
                para(
                    'Why: Indian traders actively learn on YouTube. Trading content gets high engagement.'
                ),
                para('Content Ideas:'),
                bullet("'I built an algo trading bot in Kuri - here's how'"),
                bullet("'My bot made Rs.15,000 in 1 week - live results'"),
                bullet("'Free vs Paid: Is algo trading worth Rs.3,000/month?'"),
                bullet("'How to automate BTC trading in 5 minutes'"),
                para('Expected: 100-200 signups/month | Cost: Rs.0', { bold: true }),
                emptyLine(),

                heading('Channel 2: Telegram & Discord (FREE)', HeadingLevel.HEADING_2),
                para('Why: Indian crypto/forex traders live on Telegram.'),
                bullet("Create 'Insight Trading Community' group"),
                bullet('Share daily free signals (tease premium features)'),
                bullet('Post strategy performance screenshots'),
                bullet('Run weekly AMA sessions'),
                para('Expected: 50-100 signups/month | Cost: Rs.0', { bold: true }),
                emptyLine(),

                heading('Channel 3: Influencer Partnerships (LOW COST)', HeadingLevel.HEADING_2),
                para(
                    'Find 5-10 trading YouTubers (10K-100K subscribers). Offer free lifetime access + revenue share.'
                ),
                para('Expected: 200-500 signups per video | Cost: Rs.5,000-20,000 per collab', {
                    bold: true,
                }),
                emptyLine(),

                heading('Channel 4: Google & Social Ads (PAID)', HeadingLevel.HEADING_2),
                para(
                    "Keywords: 'algo trading platform India', 'automated trading bot', 'crypto trading signals'"
                ),
                para('Cost per click: Rs.15-40 | Conversion: 3-5% signup, 10-15% paid'),
                para('Rs.20,000/month = ~600 clicks = ~25 signups = ~4 paid users', { bold: true }),
                emptyLine(),

                heading('Channel 5: Referral Program (VIRAL)', HeadingLevel.HEADING_2),
                para("Offer: 'Invite a friend - both get 1 month free'"),
                para(
                    'If 30% of paid users refer 1 friend: 100 -> 130 -> 169 -> 300 (month 6) -> 500 (month 9)',
                    { bold: true }
                ),
                emptyLine(),

                heading('The #1 Growth Driver: PROVEN RESULTS', HeadingLevel.HEADING_2),
                para('This single factor determines success more than all marketing combined:', {
                    bold: true,
                }),
                bullet('Run 5-10 strategies on paper trading for 3 months before launch'),
                bullet('Show REAL performance dashboards publicly'),
                bullet('Post weekly performance reports on Telegram/YouTube'),
                bullet('Let free users SEE results but not GET signals (creates FOMO)'),
                bullet('Never fake results - transparency builds trust'),
            ],
        },

        // ==================== SECTION 11: TIMELINE ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('11. Timeline to 500 & 5,000 Paid Users'),
                emptyLine(),

                heading('Phase 1: Build & Beta (Month 1-3)', HeadingLevel.HEADING_2),
                createTable(
                    ['Month', 'Action', 'Target'],
                    [
                        ['Month 1', 'Complete all platform features', '100% product ready'],
                        ['Month 1', 'Start paper trading 5-10 strategies', 'Build track record'],
                        ['Month 2', 'Invite 50 beta testers (free access)', '50 users testing'],
                        ['Month 2', 'Set up Telegram community', '100+ members'],
                        ['Month 3', 'Fix bugs from beta feedback', 'Product polish'],
                        ['Month 3', 'Create 3-4 YouTube tutorials', 'Organic content'],
                    ],
                    [15, 50, 35]
                ),
                para('End of Phase 1: 50 users (0 paid) - Product validated', { bold: true }),
                emptyLine(),

                heading('Phase 2: Soft Launch (Month 4-6)', HeadingLevel.HEADING_2),
                createTable(
                    ['Month', 'Action', 'Target'],
                    [
                        ['Month 4', 'Public launch with free + paid plan', 'Live product'],
                        ['Month 4', 'First 100 users 50% off (Rs.1,500/mo)', 'Early adopters'],
                        ['Month 5', 'Partner with 2-3 trading influencers', 'Credibility boost'],
                        ['Month 5', 'Start Google Ads (Rs.10K/mo)', 'Paid acquisition'],
                        ['Month 6', 'Publish 3-month strategy results', 'Trust building'],
                        ['Month 6', 'Launch referral program', 'Viral growth'],
                    ],
                    [15, 50, 35]
                ),
                para('End of Phase 2: 500 total users, 50-80 paid - First revenue', { bold: true }),
                emptyLine(),

                heading('Phase 3: Growth (Month 7-12)', HeadingLevel.HEADING_2),
                createTable(
                    ['Month', 'Action', 'Target'],
                    [
                        ['7-8', 'Increase ad spend to Rs.20K/mo', 'Scale acquisition'],
                        ['8-9', 'Launch strategy marketplace (beta)', 'Network effect begins'],
                        ['9-10', 'Weekly live trading webinars', 'Community engagement'],
                        ['10-11', 'Onboard 5-10 strategy creators', 'Marketplace content'],
                        ['11-12', 'Publish 6-month performance data', 'Strong trust signal'],
                    ],
                    [15, 50, 35]
                ),
                para('End of Phase 3: 2,000 total, 500 paid - Rs.15L/mo revenue', { bold: true }),
                emptyLine(),

                heading('Phase 4: Scale (Month 13-24)', HeadingLevel.HEADING_2),
                createTable(
                    ['Month', 'Action', 'Target'],
                    [
                        ['13-15', 'Increase ad spend to Rs.1L/mo', 'Aggressive growth'],
                        ['15-18', 'Add Indian stock market (NSE/BSE)', 'Huge market unlock'],
                        ['18-20', 'Launch mobile app', '60% users prefer mobile'],
                        ['20-22', 'PR / media coverage', 'Brand awareness'],
                        ['22-24', 'Strategy marketplace fully active', 'Flywheel spinning'],
                    ],
                    [15, 50, 35]
                ),
                para('End of Phase 4: 10,000+ total, 5,000 paid - Rs.1.5 Cr/mo revenue', {
                    bold: true,
                }),
            ],
        },

        // ==================== SECTION 12: RISKS ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('12. Risks & Mitigation'),
                emptyLine(),
                createTable(
                    ['Risk', 'Probability', 'Impact', 'Mitigation'],
                    [
                        [
                            'Strategies lose money',
                            'High',
                            'High',
                            'Diversify strategies. Risk disclaimers. Never promise returns.',
                        ],
                        [
                            'Users churn after 1-2 months',
                            'Medium',
                            'High',
                            'Sticky features: community, leaderboard, marketplace.',
                        ],
                        [
                            'Free alternatives steal users',
                            'High',
                            'Medium',
                            'Differentiate with Kuri + hidden marketplace.',
                        ],
                        [
                            'Legal issues (SEBI)',
                            'Medium',
                            'High',
                            'Disclaimers. Provide tools, not advice.',
                        ],
                        [
                            'Technical outages',
                            'Low-Medium',
                            'High',
                            'Redundant servers + monitoring + auto-restart.',
                        ],
                        [
                            'Binance blocks India API',
                            'Low',
                            'High',
                            'Backup: Bybit/OKX. Twelve Data covers crypto too.',
                        ],
                        [
                            'Twelve Data price increase',
                            'Low',
                            'Medium',
                            'Keep architecture data-provider-agnostic.',
                        ],
                        [
                            'Competitor copies model',
                            'Medium',
                            'Low',
                            'First-mover advantage. Kuri is proprietary.',
                        ],
                        [
                            "Can't reach 500 users",
                            'Low',
                            'High',
                            '3 crore+ traders. 500 = 0.0017%. Market is huge.',
                        ],
                    ],
                    [22, 12, 10, 56]
                ),
                emptyLine(),

                heading('Required Legal Disclaimers', HeadingLevel.HEADING_2),
                bullet(
                    "'Insight is a technology platform providing trading tools. We do not provide financial advice.'"
                ),
                bullet("'Past performance of strategies does not guarantee future results.'"),
                bullet("'Trading involves risk. You may lose some or all of your investment.'"),
                bullet("'Insight is not a registered investment advisor or broker-dealer.'"),
                bullet("'Users are solely responsible for their trading decisions.'"),
            ],
        },

        // ==================== SECTION 13: FINAL RECOMMENDATION ====================
        {
            properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children: [
                heading('13. Final Recommendation'),
                emptyLine(),

                heading('Immediate Action Plan', HeadingLevel.HEADING_2),
                para('Step 1: Complete the platform (Month 1-2)', { bold: true }),
                bullet('Integrate Twelve Data for forex + stocks'),
                bullet('Build unified data adapter (Binance + Twelve Data)'),
                bullet('Polish UI/UX for public launch'),
                bullet('Create 5-10 pre-built strategies'),
                emptyLine(),

                para('Step 2: Set up business (Month 2-3)', { bold: true }),
                bullet('Register Pvt Ltd company'),
                bullet('Get GST registration'),
                bullet('Set up Razorpay'),
                bullet('Create legal pages (ToS, Privacy Policy, Disclaimer)'),
                emptyLine(),

                para('Step 3: Build track record (Month 1-3, parallel)', { bold: true }),
                bullet('Run strategies on paper trading'),
                bullet('Document performance daily'),
                bullet('Build public performance dashboard'),
                emptyLine(),

                para('Step 4: Launch (Month 4)', { bold: true }),
                bullet('Go live with free + Rs.3,000/mo paid plan'),
                bullet('Start YouTube content'),
                bullet('Set up Telegram community'),
                bullet('Begin influencer outreach'),
                emptyLine(),

                heading('Financial Summary', HeadingLevel.HEADING_2),
                createTable(
                    ['Metric', '500 Paid Users', '5,000 Paid Users'],
                    [
                        ['One-time investment', 'Rs.40,850', 'Rs.1,15,850'],
                        ['Monthly expenses', 'Rs.1,56,470', 'Rs.7,26,930'],
                        ['Monthly revenue', 'Rs.15,00,000', 'Rs.1,50,00,000'],
                        ['Monthly profit', 'Rs.13,43,530', 'Rs.1,42,73,070'],
                        ['Profit margin', '89.6%', '95.2%'],
                        ['Annual profit', 'Rs.1.61 crore', 'Rs.17.13 crore'],
                        ['Break-even', '53 users', '243 users'],
                        ['Timeline to achieve', '6-12 months', '18-24 months'],
                    ],
                    [30, 35, 35]
                ),
                emptyLine(),

                heading('18-Month Projection', HeadingLevel.HEADING_2),
                createTable(
                    ['Metric', 'Value'],
                    [
                        ['Total Investment', 'Rs.34,52,275 (~Rs.34.5 Lakhs)'],
                        ['Total Revenue', 'Rs.2,86,35,000 (~Rs.2.86 Crore)'],
                        ['Total Profit', 'Rs.2,51,82,725 (~Rs.2.52 Crore)'],
                        ['Overall Margin', '87.9%'],
                        ['Breakeven Month', 'Month 5 (35 paid users)'],
                        ['Users at Month 18', '2,000 paid users'],
                        ['Initial Capital Needed', 'Rs.1,40,235 (~Rs.1.5 Lakhs)'],
                    ],
                    [40, 60]
                ),
                emptyLine(),

                heading('Final Verdict', HeadingLevel.HEADING_2),
                para(
                    'The business model is VALIDATED by existing competitors (Tradetron, Streak, Algotest) who already have paying Indian users at similar price points.',
                    { bold: true }
                ),
                emptyLine(),
                para('The market is LARGE (3+ crore traders in India alone).'),
                para('The technology is BUILT (working platform with Kuri engine).'),
                para('The margins are EXCEPTIONAL (89-95%).'),
                emptyLine(),
                para('Success depends on three things:', { bold: true }),
                bullet('Ship fast - Launch within 3-4 months, iterate based on feedback'),
                bullet('Prove value - Show real strategy performance results'),
                bullet('Build community - Traders who trade together, stay together'),
                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 400 },
                    children: [
                        new TextRun({
                            text: "Don't overthink. Ship it.",
                            bold: true,
                            size: 32,
                            color: BLUE,
                            font: 'Segoe UI',
                        }),
                    ],
                }),
                emptyLine(),
                emptyLine(),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
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

// Generate and save
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('docs/Insight_Business_Analysis.docx', buffer);
console.log('Word document created: docs/Insight_Business_Analysis.docx');
