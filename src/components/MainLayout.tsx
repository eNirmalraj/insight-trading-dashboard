
import React, { useState } from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';

import Sidebar from './Sidebar';

import Overview from '../pages/Overview';
import Market from '../pages/Market';
import Screener from '../pages/MarketScreener';
// Fix: Import 'Signals' correctly now that it has a default export.
import Signals from '../pages/Signals';
import WatchlistPage from '../pages/My Scripts';
import AccountMetrics from '../pages/AccountMetrics';
import PositionMonitoring from '../pages/PositionMonitoring';
import TradingJournal from '../pages/TradingJournal';
import Settings from '../pages/Settings';
import StrategyStudio from '../pages/StrategyStudio';
import Community from '../pages/Community';
import Subscription from '../pages/Subscription';
import InsightAssistant from './InsightAssistant';
import { SparklesIcon } from './IconComponents';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';

const MainLayout: React.FC = () => {
  const location = ReactRouterDOM.useLocation();
  const { signOut } = useAuth();
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isAssistantOpen, setAssistantOpen] = useState(false);

  // Check Supabase Connection
  // Check Supabase Connection

  React.useEffect(() => {
    const checkConnection = async () => {
      if (!supabase) {
        console.error("Supabase client is not initialized.");
        alert("Warning: Supabase is not configured. Features will not work.");
        return;
      }
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) {
        console.error("Supabase connection check failed:", error);
        // Don't alert for permission errors (RLS), only connection errors if possible
        if (error.code !== 'PGRST116' && error.code !== '406') { // Ignore some RLS related codes if table empty
          // For now, let's just log. Alerting might be annoying if it's just empty table
        }
      } else {
        console.log("Supabase connected successfully.");
      }
    };
    checkConnection();
  }, []);

  const isMarketPage = location.pathname === '/market';
  const isStrategyStudio = location.pathname === '/script-editor';
  const showHeader = !isMarketPage;
  const showFab = !isMarketPage && !isStrategyStudio;

  const handleLogout = async () => {
    await signOut();
  };


  const getPageTitle = (pathname: string): string => {
    switch (pathname) {
      case '/': return 'Dashboard Overview';
      case '/screener': return 'Screener';
      case '/signals': return 'Trading Signals';
      case '/my-scripts': return 'My Scripts';
      case '/metrics': return 'Account Metrics';
      case '/positions': return 'Position Monitoring';
      case '/journal': return 'Trading Journal';
      case '/settings': return 'Settings';
      default: return 'Insight Trading';
    }
  };

  const pageTitle = getPageTitle(location.pathname);
  const handleToggleMobileSidebar = () => setMobileSidebarOpen(o => !o);

  return (
    <div className="flex h-screen font-sans bg-dark-bg">
      <Sidebar
        isMarketPage={isMarketPage}
        isMobileOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={handleToggleMobileSidebar}
        onLogout={handleLogout}
      />
      {isMobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/60 z-40" />}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile Sidebar Toggle - Visible only on mobile */}
        <button
          onClick={handleToggleMobileSidebar}
          className="md:hidden absolute top-4 left-4 z-50 p-2 text-gray-400 hover:text-white bg-gray-900/50 rounded-lg backdrop-blur-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <main className="flex-1 overflow-y-auto bg-dark-bg scrollbar-hide">
          <ReactRouterDOM.Routes>
            <ReactRouterDOM.Route path="/" element={<Overview />} />
            <ReactRouterDOM.Route path="/market" element={<Market onLogout={handleLogout} onToggleMobileSidebar={handleToggleMobileSidebar} onOpenAssistant={() => setAssistantOpen(true)} />} />
            <ReactRouterDOM.Route path="/screener" element={<Screener />} />
            <ReactRouterDOM.Route path="/signals" element={<Signals />} />
            <ReactRouterDOM.Route path="/my-scripts" element={<WatchlistPage />} />
            <ReactRouterDOM.Route path="/metrics" element={<AccountMetrics />} />
            <ReactRouterDOM.Route path="/positions" element={<PositionMonitoring />} />
            <ReactRouterDOM.Route path="/journal" element={<TradingJournal />} />
            <ReactRouterDOM.Route path="/settings" element={<Settings />} />
            <ReactRouterDOM.Route path="/community" element={<Community />} />
            <ReactRouterDOM.Route path="/subscription" element={<Subscription />} />
            <ReactRouterDOM.Route path="/script-editor" element={<StrategyStudio />} />
          </ReactRouterDOM.Routes>
        </main>
      </div>

      {/* AI Assistant FAB - Hidden on Market Page and Strategy Studio */}
      {showFab && (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-110 z-40"
          aria-label="Open Insight Assistant"
        >
          <SparklesIcon className="w-6 h-6" />
        </button>
      )}

      {/* AI Assistant Modal */}
      <InsightAssistant
        isOpen={isAssistantOpen}
        onClose={() => setAssistantOpen(false)}
      />
    </div>
  );
};

export default MainLayout;
