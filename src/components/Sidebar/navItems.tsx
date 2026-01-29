import {
    OverviewIcon, MarketIcon, SignalIcon, PositionMonitoringIcon,
    FilterIcon, MetricsIcon, AlertIcon, UsersIcon, ScriptIcon
} from '../IconComponents';
import { NavItem } from './types';

export const getNavItems = (): NavItem[] => [
    { to: '/', icon: <OverviewIcon className="w-5 h-5 flex-shrink-0" />, label: 'Overview' },
    { to: '/market', icon: <MarketIcon className="w-5 h-5 flex-shrink-0" />, label: 'Market' },
    { to: '/signals', icon: <SignalIcon className="w-5 h-5 flex-shrink-0" />, label: 'Signals' },
    { to: '/screener', icon: <FilterIcon className="w-5 h-5 flex-shrink-0" />, label: 'Screener' },
    { to: '/my-scripts', icon: <FilterIcon className="w-5 h-5 flex-shrink-0" />, label: 'My Scripts' },
    { to: '/positions', icon: <PositionMonitoringIcon className="w-5 h-5 flex-shrink-0" />, label: 'Position Monitoring' },
    { to: '/metrics', icon: <MetricsIcon className="w-5 h-5 flex-shrink-0" />, label: 'Account Metrics' },
    { to: '/journal', icon: <AlertIcon className="w-5 h-5 flex-shrink-0" />, label: 'Trading Journal' },
    { to: '/community', icon: <UsersIcon className="w-5 h-5 flex-shrink-0" />, label: 'Community' },
    { to: '/script-editor', icon: <ScriptIcon className="w-5 h-5 flex-shrink-0" />, label: 'Strategy Studio', desktopOnly: true },
];

export const filterNavItems = (items: NavItem[], windowWidth: number): NavItem[] => {
    return items.filter(item => !item.desktopOnly || windowWidth >= 1024);
};
