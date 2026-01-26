import React from 'react';

const ApiEndpoint: React.FC<{ method: string, path: string, description: string }> = ({ method, path, description }) => {
    const methodColor = method === 'GET' ? 'text-green-400' : method === 'POST' ? 'text-blue-400' : method === 'PUT' ? 'text-yellow-400' : method === 'DELETE' ? 'text-red-400' : 'text-purple-400';
    
    return (
        <div className="bg-gray-900 p-3 rounded-md border border-gray-700 flex items-start sm:items-center flex-col sm:flex-row">
            <span className={`w-24 text-left sm:text-center font-bold text-sm ${methodColor}`}>{method}</span>
            <div className="flex-grow ml-0 sm:ml-4 mt-1 sm:mt-0">
                <p className="text-sm font-mono text-white break-all">{path}</p>
                <p className="text-xs text-gray-400 mt-1">{description}</p>
            </div>
        </div>
    )
}

const About: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-6">
      <div className="bg-card-bg rounded-xl p-6 prose-container">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">Core Features</h2>
        <div className="prose">
            <ul>
                <li>AI-Powered Signal Generation: Leverage multiple advanced strategies for timely trading signals.</li>
                <li>Multi-Platform Integration: Connect seamlessly to your MT5 and Binance accounts.</li>
                <li>Real-Time Analytics: Monitor markets and your performance with live charts and detailed metrics.</li>
                <li>Customizable Watchlists & Alerts: Stay on top of market movements that matter to you.</li>
                <li>Educational Resources: Grow your knowledge with our curated library of content.</li>
            </ul>
        </div>
      </div>

      <div className="bg-card-bg rounded-xl p-6">
        <h2 className="text-xl md:text-2xl font-semibold text-white mb-4">Required API Endpoints</h2>
        <p className="text-gray-400 mb-6">The following is a list of backend API endpoints that this frontend is designed to interact with. A backend would handle authentication, data processing, and connections to brokers/exchanges.</p>
        
        <div className="space-y-8">
            <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Connections</h3>
                <div className="space-y-2">
                    <ApiEndpoint method="POST" path="/api/connections/mt5" description="Connects to an MT5 account. Body: { accountNumber, password, serverName }" />
                    <ApiEndpoint method="POST" path="/api/connections/binance" description="Connects to a Binance account. Body: { apiKey, apiSecret }" />
                </div>
            </div>
             <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Overview Page</h3>
                <div className="space-y-2">
                    <ApiEndpoint method="GET" path="/api/metrics/summary/{accountType}" description="Fetches key summary metrics for a specified account ('forex' or 'binance')." />
                    <ApiEndpoint method="GET" path="/api/account/performance-chart" description="Retrieves historical data for the main performance chart." />
                    <ApiEndpoint method="GET" path="/api/ai/suggestions" description="Fetches AI-powered suggestions for market opportunities." />
                    <ApiEndpoint method="GET" path="/api/education/upcoming" description="Gets a list of upcoming live classes and briefings." />
                </div>
            </div>
             <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Watchlist Page</h3>
                 <div className="space-y-2">
                    <ApiEndpoint method="GET" path="/api/watchlists" description="Fetches all user watchlists and their items." />
                    <ApiEndpoint method="POST" path="/api/watchlists" description="Creates a new watchlist. Body: { name, accountType, strategyType }" />
                    <ApiEndpoint method="PUT" path="/api/watchlists/{id}" description="Updates a watchlist's name or strategy." />
                    <ApiEndpoint method="DELETE" path="/api/watchlists/{id}" description="Deletes an entire watchlist." />
                    <ApiEndpoint method="POST" path="/api/watchlists/{id}/symbols" description="Adds a symbol to a watchlist. Body: { symbol }" />
                    <ApiEndpoint method="DELETE" path="/api/watchlists/{id}/symbols/{symbolId}" description="Removes a symbol from a watchlist." />
                    <ApiEndpoint method="POST" path="/api/watchlists/autotrade" description="Toggles auto-trade for a watchlist or item." />
                 </div>
            </div>
             <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Signals & Positions</h3>
                 <div className="space-y-2">
                    <ApiEndpoint method="GET" path="/api/signals" description="Fetches all signals with filtering options." />
                    <ApiEndpoint method="GET" path="/api/positions" description="Fetches all open, pending, and historical positions." />
                    <ApiEndpoint method="POST" path="/api/positions" description="Creates a new position or pending order." />
                    <ApiEndpoint method="PUT" path="/api/positions/{id}" description="Modifies an existing position (e.g., updates SL/TP)." />
                    <ApiEndpoint method="POST" path="/api/positions/{id}/close" description="Closes an open position." />
                    <ApiEndpoint method="POST" path="/api/positions/{id}/cancel" description="Cancels a pending order." />
                    <ApiEndpoint method="POST" path="/api/positions/{id}/reverse" description="Reverses a position." />
                 </div>
            </div>
            <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Account Metrics Page</h3>
                 <div className="space-y-2">
                    <ApiEndpoint method="GET" path="/api/metrics/detailed/{accountType}" description="Detailed performance stats for 'forex' or 'binance'." />
                    <ApiEndpoint method="GET" path="/api/metrics/balance-history/{accountType}" description="Equity curve data for the performance chart." />
                    <ApiEndpoint method="GET" path="/api/metrics/strategy-performance" description="Data for the strategy performance analysis section." />
                    <ApiEndpoint method="GET" path="/api/metrics/daily-summary" description="Daily trade history for the calendar view." />
                 </div>
            </div>
            <div>
                <h3 className="text-lg md:text-xl font-bold text-blue-400 mb-3">Alerts & Market Data</h3>
                <div className="space-y-2">
                    <ApiEndpoint method="GET" path="/api/alerts" description="Fetches a log of all triggered and live alerts." />
                    <ApiEndpoint method="POST" path="/api/alerts" description="Creates a new price alert." />
                    <ApiEndpoint method="GET" path="/api/market-data/historical/{symbol}" description="Fetches historical candlestick data for charts." />
                    <ApiEndpoint method="WebSocket" path="/ws/market-data/{symbol}" description="Streams real-time price data for a symbol." />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default About;
