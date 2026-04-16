import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const STRATEGY_SYSTEM_PROMPT = `You are an expert AI assistant for the Insight Trading Platform's Strategy Studio. You help users write, debug, explain, and optimize trading scripts.

## Script Language Reference

The Strategy Studio uses Kuri Script, the Insight platform's own scripting language for trading strategies and indicators.

Kuri scripts use a YAML header for metadata, param.* for inputs, kuri.* for technical analysis, and draw.* for rendering.

Here's the reference:

### Script Declaration
- \`strategy("Name", shorttitle="ST", overlay=true, initial_capital=10000)\` — Declare a strategy
- \`indicator("Name", shorttitle="Ind", overlay=true)\` — Declare an indicator

### Built-in Variables (Series)
- \`open\`, \`high\`, \`low\`, \`close\`, \`volume\` — OHLCV price data
- \`bar_index\` — Current bar number
- \`na\` — Not available / null value

### Technical Analysis Functions (ta.*)
**Moving Averages:**
- \`ta.sma(source, period)\` — Simple Moving Average
- \`ta.ema(source, period)\` — Exponential Moving Average
- \`ta.wma(source, period)\` — Weighted Moving Average
- \`ta.vwma(source, volume, period)\` — Volume Weighted Moving Average
- \`ta.dema(source, period)\` — Double EMA
- \`ta.tema(source, period)\` — Triple EMA
- \`ta.hma(source, period)\` — Hull Moving Average

**Oscillators:**
- \`ta.rsi(source, period)\` — Relative Strength Index (0-100)
- \`ta.stoch(source, high, low, period)\` — Stochastic Oscillator
- \`ta.cci(source, period)\` — Commodity Channel Index
- \`ta.mfi(high, low, close, volume, period)\` — Money Flow Index
- \`ta.willr(high, low, close, period)\` — Williams %R
- \`ta.roc(source, period)\` — Rate of Change

**Volatility:**
- \`ta.bb(source, period, mult)\` — Bollinger Bands (returns object with .upper, .middle, .lower)
- \`ta.atr(high, low, close, period)\` — Average True Range
- \`ta.kc(source, atrPeriod, emaPeriod, mult)\` — Keltner Channels

**Trend:**
- \`ta.macd(source, fastPeriod, slowPeriod, signalPeriod)\` — MACD (returns .macd, .signal, .histogram)
- \`ta.adx(high, low, close, period)\` — Average Directional Index
- \`ta.supertrend(high, low, close, period, multiplier)\` — Supertrend
- \`ta.psar(high, low, close, step, max)\` — Parabolic SAR
- \`ta.ichimoku(high, low, close, tenkan, kijun, senkou)\` — Ichimoku Cloud

**Volume:**
- \`ta.obv(close, volume)\` — On Balance Volume
- \`ta.vwap(high, low, close, volume)\` — VWAP

**Crossover Detection:**
- \`ta.crossover(series1, series2)\` — Returns true when series1 crosses above series2
- \`ta.crossunder(series1, series2)\` — Returns true when series1 crosses below series2

### Strategy Functions
- \`strategy.entry(id, direction)\` — Enter a position. direction: "LONG" or "SHORT"
- \`strategy.close(id)\` — Close a position by trade ID
- \`strategy.exit_sl(percentage)\` — Set default stop loss %
- \`strategy.exit_tp(percentage)\` — Set default take profit %

### Plotting
- \`plot(series, title, color)\` — Plot a line on the chart
- \`hline(value, title, color)\` — Horizontal line
- \`plotshape(condition, title, style, location, color)\` — Plot shapes on condition

### Control Flow
- \`if ... else\` — Conditional (indentation-based, no braces)
- \`for i = 0 to N\` — For loop
- \`while condition\` — While loop
- \`var x = value\` — Variable declaration
- \`func myFunc(a, b)\` — Function declaration

### Math Functions
- \`math.abs(x)\`, \`math.max(a, b)\`, \`math.min(a, b)\`
- \`math.round(x)\`, \`math.floor(x)\`, \`math.ceil(x)\`
- \`math.sqrt(x)\`, \`math.pow(x, y)\`, \`math.log(x)\`

## Your Capabilities
1. **Generate**: Create complete strategies/indicators from natural language descriptions
2. **Explain**: Break down what valid code does in plain English
3. **Fix Errors**: Diagnose and fix compilation/logic errors in scripts
4. **Optimize**: Suggest improvements for better signal quality, risk management, or code clarity
5. **Q&A**: Answer questions about trading strategies, technical analysis, and the scripting language

## Response Rules
- Always output valid valid code when generating or fixing scripts
- Wrap code blocks in triple backticks with "typescript" language tag
- When the user asks you to generate, fix, optimize, or modify code, always output the COMPLETE final script in a single code block — not partial snippets. The code block will be applied directly to the editor.
- Keep explanations concise but thorough
- When generating strategies, always include: declaration, indicators, entry conditions, exit conditions
- When fixing errors, explain what was wrong and why the fix works
- Use proper proper syntax (indentation-based, no braces/semicolons)
- For explanation-only or Q&A questions (no code changes requested), you may skip the code block
`;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export async function* streamChat(
    messages: ChatMessage[],
    currentCode: string,
    consoleErrors: string[]
): AsyncGenerator<string> {
    if (!GEMINI_API_KEY) {
        yield 'Error: GEMINI_API_KEY is not configured. Add it to your .env file.';
        return;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build context with current editor state
    let contextParts: string[] = [];

    if (currentCode.trim()) {
        contextParts.push(`\n## Current Editor Code\n\`\`\`\n${currentCode}\n\`\`\``);
    }

    if (consoleErrors.length > 0) {
        contextParts.push(`\n## Console Errors\n${consoleErrors.join('\n')}`);
    }

    // Convert chat history to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const userPrompt =
        lastMessage.content + (contextParts.length > 0 ? contextParts.join('\n') : '');

    const chat = model.startChat({
        history,
        systemInstruction: {
            role: 'system' as const,
            parts: [{ text: STRATEGY_SYSTEM_PROMPT }],
        },
    });

    try {
        const result = await chat.sendMessageStream(userPrompt);

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                yield text;
            }
        }
    } catch (err: unknown) {
        const error = err as { status?: number; message?: string };
        if (error.status === 429) {
            yield 'Error: Gemini API quota exceeded. Your free tier limit has been reached. Please wait for the quota to reset or upgrade your Google AI plan at https://ai.google.dev.';
        } else if (error.status === 400) {
            yield `Error: Bad request to Gemini API. ${error.message || 'Please check your configuration.'}`;
        } else {
            yield `Error: ${error.message || 'Failed to get AI response. Please try again.'}`;
        }
    }
}

// Quick action prompts
export function getQuickActionPrompt(
    action: 'generate' | 'explain' | 'fix' | 'optimize',
    code: string,
    errors: string[]
): string {
    switch (action) {
        case 'generate':
            return 'Generate a new trading strategy. Ask me what kind of strategy I want.';
        case 'explain':
            return `Explain what this script does step by step:\n\`\`\`\n${code}\n\`\`\``;
        case 'fix':
            return `Fix the errors in this script. Here are the console errors:\n${errors.join('\n')}\n\nCode:\n\`\`\`\n${code}\n\`\`\``;
        case 'optimize':
            return `Optimize this strategy for better signal quality and risk management:\n\`\`\`\n${code}\n\`\`\``;
    }
}
