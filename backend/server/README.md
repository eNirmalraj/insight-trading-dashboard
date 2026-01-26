# Insight Trading Engine (Backend)

The "Brain" of the Insight Trading platform. This Node.js server handles trade execution, signal processing, and safety checks.

## Setup

1.  Navigate to `backend/server`:
    ```bash
    cd backend/server
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure `.env` (Create this file):
    ```env
    PORT=4000
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_KEY=your_service_key
    PAPER_TRADING=true
    ```

## Running the Engine

*   **Development**:
    ```bash
    npm run dev
    ```
*   **Production**:
    ```bash
    npm run build
    npm start
    ```

## Architecture

*   **`src/services/tradeExecutor.ts`**: Wrapper around `ccxt` for executing trades.
*   **`src/services/signalQueue.ts`**: Listens to Supabase `signal_logs` for new trade instructions.
*   **`src/index.ts`**: Entry point.

## Verification

Run the test script to simulate a mock trade:
```bash
npx ts-node src/test-verification.ts
```
