# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Main Application)
```bash
# Install dependencies (uses pnpm workspace)
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run Kuri parity tests
pnpm test:parity
pnpm test:parity:simple
```

### Backend Server
```bash
# Navigate to backend
cd backend/server

# Install dependencies
npm install

# Run development server with hot reload
npm run dev

# Start production server
npm start

# Run worker process
npm run worker

# Build TypeScript
npm run build
```

### Kuri Engine Package
```bash
cd packages/kuri-engine

# Build TypeScript
pnpm build

# Watch mode for development
pnpm dev

# Run tests
pnpm test
```

## Architecture Overview

### Multi-Package Monorepo Structure
This is a pnpm workspace monorepo with the following structure:
- **Frontend**: Vite-based React app with TypeScript
- **Backend**: Node.js/Express server in `backend/server/`
- **Packages**: Shared packages in `packages/` directory
  - `@insight/kuri-engine`: Core Kuri scripting engine and indicator calculations
  - `@insight/chart`: Chart components
  - `@insight/kuri-chart-bridge`: Bridge between Kuri engine and charts
  - `@insight/types`: Shared TypeScript types

### Core Systems

#### Indicator System Architecture
The indicator system is currently distributed across multiple files, creating complexity:

**Frontend Indicator Files:**
- `src/components/market-chart/IndicatorPanels.tsx`: UI indicator definitions (uses type: 'MA', 'BB', etc.)
- `src/components/market-chart/CandlestickChart.tsx`: Hardcoded indicator defaults and calculations
- `src/components/market-chart/helpers.ts`: Calculation wrappers for indicators
- `src/services/builtInIndicators.ts`: Service-level indicator definitions (id: 'sma', 'bollinger_bands')
- `src/data/builtInIndicators.ts`: Alert conditions and metadata (name: "Bollinger Bands")

**Backend/Engine:**
- `packages/kuri-engine/src/indicators/`: Core mathematical implementations (TypeScript)
  - `moving_averages.ts`, `oscillators.ts`, `volume.ts`, `volatility.ts`, etc.
- `packages/kuri-engine/src/backendVM.ts`: Maps Kuri functions to TypeScript implementations

**Key Issue**: Same indicators have different identifiers across files (e.g., 'MA' vs 'sma' vs 'Simple Moving Average').

#### Kuri Scripting Engine
- **Location**: `packages/kuri-engine/src/`
- **Purpose**: Custom scripting language for trading strategies
- **Components**:
  - `lexer.ts`, `parser.ts`: Parse Kuri scripts to AST
  - `ir.ts`: Intermediate representation
  - `backendVM.ts`: Executes Kuri IR, handles strategy signals
  - `frontendVM.ts`: Frontend execution for visualization
  - Indicator implementations link to TypeScript functions

#### Data Flow
1. **Market Data**: Binance WebSocket → `backend/server/src/services/binanceStream.ts`
2. **Strategy Execution**: Data → Kuri VM → Indicator Calculations → Signals
3. **Frontend Display**:
   - Chart UI requests indicator → Multiple files consulted → Calculations performed → Rendered

#### Signal/Execution System (refactored 2026-04)

The signal lifecycle is split between a Scanner and an Executor:

- **Signal Engine** (`backend/server/src/engine/signalEngine.ts`): Scanner.
  Loads assignments from `watchlist_strategies`, runs strategies against
  closed candles via `strategyRunner.ts`, writes immutable event rows to
  the `signals` table, and emits `SIGNAL_CREATED` on the event bus.
  Dedupe is enforced by a unique index on
  `(strategy_id, params_snapshot, symbol, timeframe, candle_time)`.

- **Execution Engine** (`backend/server/src/engine/executionEngine.ts`):
  Executor + tick monitor. Listens for `SIGNAL_CREATED`, fans out each
  event to per-user executions in `signal_executions` with SL/TP computed
  by `riskCalculator.ts`, then watches @bookTicker ticks for SL/TP hits.
  Broker dispatch goes through `brokerAdapters/` (paper broker default).

- **Startup order matters**: `startExecutionEngine()` MUST run BEFORE
  `startSignalEngine()` in `worker.ts` so the event-bus listener is
  registered before the scanner's cold-start scan begins emitting.

- **Built-in strategies** live as `.kuri` files in
  `backend/server/src/strategies/`. `strategyLoader.ts` parses yaml
  frontmatter + param schema on startup and upserts into the `scripts`
  table (deterministic uuidv5 mapping since `scripts.id` is uuid-typed).

- **Platform signals**: 10 hardcoded top-symbol pairs run SMA Trend
  continuously as a discovery feed for users with no watchlists.
  See `services/platformSignals.ts` and the `signal_executions` rows
  with `user_id IS NULL`.

- **Deleted in the refactor**: old `signalMonitor.ts` (merged into
  executionEngine) and old `strategyEngine.ts` (split into strategyRunner
  and riskCalculator).

### Database
Uses Supabase (PostgreSQL) with tables for:
- Users, strategies, signals, watchlists, positions
- Schema migrations in `backend/schema/`

### Important Architectural Considerations

1. **Indicator Naming Inconsistency**: Critical issue - same indicator has different names/IDs across files. When modifying indicators, check ALL locations.

2. **Kuri VM Dual Implementation**: Both frontend and backend VMs exist for different purposes - backend for signal generation, frontend for visualization.

3. **Package Dependencies**: Workspace packages (`@insight/*`) are symlinked. Changes require rebuilding dependent packages.

4. **Real-time Data**: WebSocket connections to Binance require careful error handling and reconnection logic.

5. **Strategy Execution**: Strategies run in isolated VM contexts with safety limits (execution time, memory, recursion depth).

## Critical File Relationships

### Indicator Addition Flow
To add a new indicator, modifications needed in:
1. `packages/kuri-engine/src/indicators/[category].ts` - Implementation
2. `packages/kuri-engine/src/backendVM.ts` - VM mapping
3. `src/components/market-chart/IndicatorPanels.tsx` - UI listing
4. `src/components/market-chart/CandlestickChart.tsx` - Chart integration
5. `src/components/market-chart/helpers.ts` - Calculation wrapper
6. `src/services/builtInIndicators.ts` - Service definition
7. `src/data/builtInIndicators.ts` - Alert conditions

### Strategy Flow (post-refactor)

**Authoring:**
1. User writes Kuri script in Strategy Studio, OR a dev drops a new
   `.kuri` file into `backend/server/src/strategies/`
2. On backend boot, `strategyLoader.syncToDatabase()` parses yaml
   frontmatter + extracts param schema via regex on `param.*()` calls
3. Built-in strategies upserted to `scripts` table with
   `is_builtin = true` and a SHA-256-first-8-chars `template_version`

**Assignment:**
1. User picks a watchlist on the Signals page, clicks "Assign Strategies"
2. `AssignStrategiesModal` opens: shows Available strategies (built-ins
   get a "Built-in" badge) and Assigned (with params chip + Edit/Remove)
3. Click `+ Add` on a strategy → `ParamEditorModal` opens (if the strategy
   has params), user edits values, clicks Save
4. `watchlistService.addWatchlistStrategy()` writes a row to
   `watchlist_strategies` (params + timeframe + risk_settings)
5. Supabase Realtime notifies the backend Signal Engine within ms,
   which calls `loadAssignments()` and updates its in-memory map

**Execution (per candle close):**
1. Binance WebSocket emits a `CANDLE_CLOSED` event for symbol+timeframe
2. Signal Engine finds matching assignments and runs
   `strategyRunner.runStrategy()` on the historical buffer with the
   assignment's params
3. Kuri VM returns entry signals for the last bar
4. `signalStorage.insertSignal()` inserts into `signals` (unique index
   dedupes, emits `SIGNAL_CREATED` on the event bus)
5. Execution Engine's `handleNewSignal()` finds all watchlist_strategies
   assignments matching this signal, inserts one execution per user
   into `signal_executions` with risk-adjusted SL/TP
6. `brokerAdapters.execute()` dispatches to the paper broker (default)
7. `binanceStream.subscribeBookTicker()` starts tracking ticks for SL/TP

**SL/TP monitoring (per tick):**
1. `@bookTicker` stream delivers bid/ask for every subscribed symbol
2. Execution Engine checks each active execution: BUY closes at bid
   when it crosses SL/TP; SELL closes at ask
3. `executionStorage.closeExecution()` does an atomic update
   `WHERE status='Active'` to prevent double-close
4. Ticker is unsubscribed when the last active execution for a symbol closes

## Environment Variables
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_KEY`: Supabase service key (backend only)
- `GEMINI_API_KEY`: For AI features