# Kuri Script — Default Indicator Library

> 18 default indicators for Antigravity. All tested 18/18 against kuri-engine-full.js v2.1.
> Split each indicator into its own `.kuri` file and place in `src/indicators/`.

---

## SMA — Simple Moving Average

**File:** `src/indicators/sma.kuri` | **Overlay:** true | **Inputs:** 5 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Simple Moving Average", shorttitle="SMA", overlay=true)

len = input.int(9, title="Length", minval=1)
src = input.source(close, title="Source")
out = ta.sma(src, len)
plot(out, title="SMA", color=color.blue, linewidth=2)

// Smoothing
maTypeInput = input.string("None", title="Smoothing Type")
maLengthInput = input.int(14, title="Smoothing Length")
bbMultInput = input.float(2.0, title="BB StdDev")
var isBB = maTypeInput == "SMA + Bollinger Bands"
var enableMA = maTypeInput != "None"

ma(source, length, MAtype) =>
    switch MAtype
        "SMA"                   => ta.sma(source, length)
        "SMA + Bollinger Bands" => ta.sma(source, length)
        "EMA"                   => ta.ema(source, length)
        "SMMA (RMA)"            => ta.rma(source, length)
        "WMA"                   => ta.wma(source, length)
        => na

smoothingMA = enableMA ? ma(out, maLengthInput, maTypeInput) : na
smoothingStDev = isBB ? ta.stdev(out, maLengthInput) * bbMultInput : na
plot(smoothingMA, title="Smoothing MA", color=color.yellow)
plot(isBB ? smoothingMA + smoothingStDev : na, title="Upper BB", color=color.green)
plot(isBB ? smoothingMA - smoothingStDev : na, title="Lower BB", color=color.green)

```

---

## EMA — Exponential Moving Average

**File:** `src/indicators/ema.kuri` | **Overlay:** true | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Exponential Moving Average", shorttitle="EMA", overlay=true)

len = input.int(9, title="Length", minval=1)
src = input.source(close, title="Source")
out = ta.ema(src, len)
plot(out, title="EMA", color=color.blue, linewidth=2)

```

---

## WMA — Weighted Moving Average

**File:** `src/indicators/wma.kuri` | **Overlay:** true | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Weighted Moving Average", shorttitle="WMA", overlay=true)

len = input.int(9, title="Length", minval=1)
src = input.source(close, title="Source")
out = ta.wma(src, len)
plot(out, title="WMA", color=color.blue, linewidth=2)

```

---

## MA Ribbon — MA Ribbon

**File:** `src/indicators/ma-ribbon.kuri` | **Overlay:** true | **Inputs:** 16 | **Alerts:** 0
0

```kuri
//@version=1
indicator("Moving Average Ribbon", shorttitle="MA Ribbon", overlay=true)

ma(source, length, MAtype) =>
    switch MAtype
        "SMA"        => ta.sma(source, length)
        "EMA"        => ta.ema(source, length)
        "SMMA (RMA)" => ta.rma(source, length)
        "WMA"        => ta.wma(source, length)
        => na

show_ma1 = input.bool(true, title="MA #1")
ma1_type = input.string("SMA", title="MA #1 Type")
ma1_length = input.int(20, title="MA #1 Length", minval=1)
ma1_color = input.color(#f6c309, title="MA #1 Color")

show_ma2 = input.bool(true, title="MA #2")
ma2_type = input.string("SMA", title="MA #2 Type")
ma2_length = input.int(50, title="MA #2 Length", minval=1)
ma2_color = input.color(#fb9800, title="MA #2 Color")

show_ma3 = input.bool(true, title="MA #3")
ma3_type = input.string("SMA", title="MA #3 Type")
ma3_length = input.int(100, title="MA #3 Length", minval=1)
ma3_color = input.color(#fb6500, title="MA #3 Color")

show_ma4 = input.bool(true, title="MA #4")
ma4_type = input.string("SMA", title="MA #4 Type")
ma4_length = input.int(200, title="MA #4 Length", minval=1)
ma4_color = input.color(#f60c0c, title="MA #4 Color")

plot(show_ma1 ? ma(close, ma1_length, ma1_type) : na, title="MA #1", color=ma1_color)
plot(show_ma2 ? ma(close, ma2_length, ma2_type) : na, title="MA #2", color=ma2_color)
plot(show_ma3 ? ma(close, ma3_length, ma3_type) : na, title="MA #3", color=ma3_color)
plot(show_ma4 ? ma(close, ma4_length, ma4_type) : na, title="MA #4", color=ma4_color)

```

---

## MACD — MACD

**File:** `src/indicators/macd.kuri` | **Overlay:** false | **Inputs:** 6 | **Alerts:** 2

```kuri
//@version=1
indicator("MACD", shorttitle="MACD", overlay=false)

sourceInput = input.source(close, title="Source")
fastLenInput = input.int(12, title="Fast Length", minval=1)
slowLenInput = input.int(26, title="Slow Length", minval=1)
sigLenInput = input.int(9, title="Signal Length", minval=1)
oscTypeInput = input.string("EMA", title="Oscillator MA Type")
sigTypeInput = input.string("EMA", title="Signal MA Type")

ma(source, length, maType) =>
    switch maType
        "EMA" => ta.ema(source, length)
        "SMA" => ta.sma(source, length)
        => ta.ema(source, length)

maFast = ma(sourceInput, fastLenInput, oscTypeInput)
maSlow = ma(sourceInput, slowLenInput, oscTypeInput)
float macd = maFast - maSlow
float signal = ma(macd, sigLenInput, sigTypeInput)
float hist = macd - signal
hColor = hist >= 0
     ? (hist > hist[1] ? #26a69a : #b2dfdb)
     : (hist > hist[1] ? #ffcdd2 : #ff5252)

hline(0, title="Zero", color=#787B86)
plot(hist, title="Histogram", color=hColor, style=plot.style_columns)
plot(macd, title="MACD", color=color.blue)
plot(signal, title="Signal", color=#ff6d00)

alertcondition(hist[1] >= 0 and hist < 0, title="Rising to Falling", message="MACD histogram switched from rising to falling")
alertcondition(hist[1] <= 0 and hist > 0, title="Falling to Rising", message="MACD histogram switched from falling to rising")

```

---

## RSI — Relative Strength Index

**File:** `src/indicators/rsi.kuri` | **Overlay:** false | **Inputs:** 2 | **Alerts:** 2

```kuri
//@version=1
indicator(title="Relative Strength Index", shorttitle="RSI", overlay=false)

rsiLengthInput = input.int(14, title="RSI Length", minval=1)
rsiSourceInput = input.source(close, title="Source")

change = ta.change(rsiSourceInput)
up = ta.rma(math.max(change, 0), rsiLengthInput)
down = ta.rma(-math.min(change, 0), rsiLengthInput)
rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))

plot(rsi, title="RSI", color=#7E57C2)
hline(70, title="Overbought", color=#787B86)
hline(50, title="Middle", color=#787B86)
hline(30, title="Oversold", color=#787B86)

alertcondition(ta.crossover(rsi, 30), title="RSI Oversold Exit", message="RSI crossed above 30")
alertcondition(ta.crossunder(rsi, 70), title="RSI Overbought Exit", message="RSI crossed below 70")

```

---

## ADR — ADR

**File:** `src/indicators/adr.kuri` | **Overlay:** false | **Inputs:** 1 | **Alerts:** 0
0

```kuri
//@version=1
indicator("Average Daily Range", shorttitle="ADR", overlay=false)

lengthInput = input.int(14, title="Length", minval=1)
adr = ta.sma(high - low, lengthInput)
plot(adr, title="ADR", color=color.blue)

```

---

## ATR — Average True Range

**File:** `src/indicators/atr.kuri` | **Overlay:** false | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Average True Range", shorttitle="ATR", overlay=false)

length = input.int(14, title="Length", minval=1)
smoothing = input.string("RMA", title="Smoothing")
trueRange = ta.tr(high, low, close)

ma_function(source, length) =>
    switch smoothing
        "RMA" => ta.rma(source, length)
        "SMA" => ta.sma(source, length)
        "EMA" => ta.ema(source, length)
        => ta.wma(source, length)

plot(ma_function(trueRange, length), title="ATR", color=#B71C1C)

```

---

## BB — BB

**File:** `src/indicators/bb.kuri` | **Overlay:** true | **Inputs:** 4 | **Alerts:** 0
0

```kuri
//@version=1
indicator(shorttitle="BB", title="Bollinger Bands", overlay=true)

length = input.int(20, title="Length", minval=1)
maType = input.string("SMA", title="Basis MA Type")
src = input.source(close, title="Source")
mult = input.float(2.0, title="StdDev", minval=0.001, maxval=50)

ma(source, length, _type) =>
    switch _type
        "SMA"        => ta.sma(source, length)
        "EMA"        => ta.ema(source, length)
        "SMMA (RMA)" => ta.rma(source, length)
        "WMA"        => ta.wma(source, length)
        => ta.sma(source, length)

basis = ma(src, length, maType)
dev = mult * ta.stdev(src, length)
upper = basis + dev
lower = basis - dev

plot(basis, title="Basis", color=#2962FF)
plot(upper, title="Upper", color=#F23645)
plot(lower, title="Lower", color=#089981)

```

---

## supertrend — ATR Length

**File:** `src/indicators/supertrend.kuri` | **Overlay:** true | **Inputs:** 2 | **Alerts:** 3

```kuri
//@version=1
indicator("Supertrend", overlay=true)

atrPeriod = input.int(10, title="ATR Length", minval=1)
factor = input.float(3.0, title="Factor", minval=0.01)

atrVal = ta.atr(high, low, close, atrPeriod)
hl2Val = (high + low) / 2

var float upperBand = na
var float lowerBand = na
var float supertrend = na
var int direction = 1

upperBand := hl2Val + factor * atrVal
lowerBand := hl2Val - factor * atrVal

if not na(lowerBand[1])
    lowerBand := lowerBand > lowerBand[1]
         or close[1] < lowerBand[1]
         ? lowerBand : lowerBand[1]
if not na(upperBand[1])
    upperBand := upperBand < upperBand[1]
         or close[1] > upperBand[1]
         ? upperBand : upperBand[1]

prevST = nz(supertrend[1], upperBand)
if na(atrVal[1])
    direction := 1
else if prevST == upperBand[1]
    direction := close > upperBand ? -1 : 1
else
    direction := close < lowerBand ? 1 : -1

supertrend := direction == -1 ? lowerBand : upperBand

plot(direction < 0 ? supertrend : na, title="Up Trend", color=color.green, linewidth=2)
plot(direction < 0 ? na : supertrend, title="Down Trend", color=color.red, linewidth=2)

alertcondition(direction[1] > direction, title="Downtrend to Uptrend", message="Supertrend switched to Uptrend")
alertcondition(direction[1] < direction, title="Uptrend to Downtrend", message="Supertrend switched to Downtrend")
alertcondition(direction[1] != direction, title="Trend Change", message="Supertrend direction changed")

```

---

## DC — Donchian Channels

**File:** `src/indicators/donchian.kuri` | **Overlay:** true | **Inputs:** 1 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Donchian Channels", shorttitle="DC", overlay=true)

length = input.int(20, title="Length", minval=1)
lower = ta.lowest(low, length)
upper = ta.highest(high, length)
basis = (upper + lower) / 2

plot(basis, title="Basis", color=#FF6D00)
plot(upper, title="Upper", color=#2962FF)
plot(lower, title="Lower", color=#2962FF)

```

---

## Ichimoku — Ichimoku Cloud

**File:** `src/indicators/ichimoku.kuri` | **Overlay:** true | **Inputs:** 4 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Ichimoku Cloud", shorttitle="Ichimoku", overlay=true)

conversionPeriods = input.int(9, title="Conversion Line Length", minval=1)
basePeriods = input.int(26, title="Base Line Length", minval=1)
laggingSpan2Periods = input.int(52, title="Leading Span B Length", minval=1)
displacement = input.int(26, title="Displacement", minval=1)

donchian(len) =>
    (ta.lowest(low, len) + ta.highest(high, len)) / 2

conversionLine = donchian(conversionPeriods)
baseLine = donchian(basePeriods)
leadLine1 = (conversionLine + baseLine) / 2
leadLine2 = donchian(laggingSpan2Periods)

plot(conversionLine, title="Conversion Line", color=#2962FF)
plot(baseLine, title="Base Line", color=#B71C1C)
plot(leadLine1, title="Leading Span A", color=#A5D6A7)
plot(leadLine2, title="Leading Span B", color=#EF9A9A)

```

---

## KC — Keltner Channels

**File:** `src/indicators/keltner.kuri` | **Overlay:** true | **Inputs:** 5 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Keltner Channels", shorttitle="KC", overlay=true)

length = input.int(20, title="Length", minval=1)
mult = input.float(2.0, title="Multiplier")
src = input.source(close, title="Source")
useEMA = input.bool(true, title="Use Exponential MA")
atrlength = input.int(10, title="ATR Length")

ma = useEMA ? ta.ema(src, length) : ta.sma(src, length)
atrVal = ta.atr(high, low, close, atrlength)
upper = ma + atrVal * mult
lower = ma - atrVal * mult

plot(upper, title="Upper", color=#2962FF)
plot(ma, title="Basis", color=#2962FF)
plot(lower, title="Lower", color=#2962FF)

```

---

## Stoch — Stochastic

**File:** `src/indicators/stochastic.kuri` | **Overlay:** false | **Inputs:** 3 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Stochastic", shorttitle="Stoch", overlay=false)

periodK = input.int(14, title="%K Length", minval=1)
smoothK = input.int(1, title="%K Smoothing", minval=1)
periodD = input.int(3, title="%D Smoothing", minval=1)

hh = ta.highest(high, periodK)
ll = ta.lowest(low, periodK)
rawK = (hh - ll) != 0 ? (close - ll) / (hh - ll) * 100 : 50
k = ta.sma(rawK, smoothK)
d = ta.sma(k, periodD)

plot(k, title="%K", color=#2962FF)
plot(d, title="%D", color=#FF6D00)
hline(80, title="Overbought", color=#787B86)
hline(50, title="Middle", color=#787B86)
hline(20, title="Oversold", color=#787B86)

```

---

## VWMA — Volume Weighted Moving Average

**File:** `src/indicators/vwma.kuri` | **Overlay:** true | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Volume Weighted Moving Average", shorttitle="VWMA", overlay=true)

len = input.int(20, title="Length", minval=1)
src = input.source(close, title="Source")
ma = ta.vwma(src, volume, len)
plot(ma, title="VWMA", color=#2962FF, linewidth=2)

```

---

## HMA — Hull Moving Average

**File:** `src/indicators/hma.kuri` | **Overlay:** true | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="Hull Moving Average", shorttitle="HMA", overlay=true)

length = input.int(9, title="Length", minval=2)
src = input.source(close, title="Source")
hullma = ta.hma(src, length)
plot(hullma, title="HMA", color=color.blue, linewidth=2)

```

---

## CCI — Commodity Channel Index

**File:** `src/indicators/cci.kuri` | **Overlay:** false | **Inputs:** 2 | **Alerts:** 2

```kuri
//@version=1
indicator(title="Commodity Channel Index", shorttitle="CCI", overlay=false)

length = input.int(20, title="Length", minval=1)
src = input.source(hlc3, title="Source")
cci = ta.cci(src, length)

plot(cci, title="CCI", color=#2962FF)
hline(100, title="Upper Band", color=#787B86)
hline(0, title="Middle", color=#787B86)
hline(-100, title="Lower Band", color=#787B86)

alertcondition(ta.crossover(cci, 100), title="CCI Above 100", message="CCI crossed above 100")
alertcondition(ta.crossunder(cci, -100), title="CCI Below -100", message="CCI crossed below -100")

```

---

## OBV — On Balance Volume

**File:** `src/indicators/obv.kuri` | **Overlay:** false | **Inputs:** 2 | **Alerts:** 0
0

```kuri
//@version=1
indicator(title="On Balance Volume", shorttitle="OBV", overlay=false)

obv = ta.cum(math.sign(ta.change(close)) * volume)
plot(obv, title="OBV", color=#2962FF)

// Smoothing
maTypeInput = input.string("None", title="Smoothing Type")
maLengthInput = input.int(14, title="Smoothing Length")
var enableMA = maTypeInput != "None"

ma_smooth(source, length, MAtype) =>
    switch MAtype
        "SMA" => ta.sma(source, length)
        "EMA" => ta.ema(source, length)
        => na

smoothingMA = enableMA ? ma_smooth(obv, maLengthInput, maTypeInput) : na
plot(smoothingMA, title="OBV MA", color=color.yellow)

```

---

