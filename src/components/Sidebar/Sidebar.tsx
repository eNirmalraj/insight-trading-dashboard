import React from 'react';
import { SidebarProps } from './types';
import { NavItem } from './NavItem';
import { UserProfile } from './UserProfile';
import { getNavItems, filterNavItems } from './navItems';
import { MenuIcon } from '../IconComponents';
import { useResponsive } from '../../hooks/useResponsive';

const Sidebar: React.FC<SidebarProps> = ({
    isMarketPage = false,
    isMobileOpen,
    onToggleMobileSidebar,
    onLogout
}) => {
    const { isMobile, width: windowWidth } = useResponsive();
    const [isDesktopExpanded, setIsDesktopExpanded] = React.useState(true);

    // Effect to collapse sidebar when entering market page on desktop
    React.useEffect(() => {
        if (isMarketPage && !isMobile) {
            setIsDesktopExpanded(false);
        }
    }, [isMarketPage, isMobile]);

    const handleToggle = () => {
        if (isMobile) {
            if (onToggleMobileSidebar) onToggleMobileSidebar();
        } else {
            setIsDesktopExpanded(!isDesktopExpanded);
        }
    };

    const isExpanded = isMobile ? isMobileOpen : isDesktopExpanded;
    const navItems = getNavItems();
    const filteredNavItems = filterNavItems(navItems, windowWidth);

    // Mobile (<768px) gets a fixed overlay. Desktop (>=768px) gets a relative sidebar.
    const sidebarClasses = [
        'bg-gray-900', 'border-r', 'border-gray-700/50', 'flex', 'flex-col', 'transition-all', 'duration-300', 'p-2',
        isMobile
            ? `fixed inset-y-0 left-0 h-full z-50 w-52 transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `relative flex-shrink-0 ${isExpanded ? 'w-52' : 'w-14'}`
    ].join(' ');

    return (
        <aside className={sidebarClasses}>
            <div
                className={`flex items-center h-12 mb-2 transition-all duration-300 ${isExpanded ? 'px-2 justify-start' : 'justify-center'} `}
            >
                <button
                    onClick={handleToggle}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
                    aria-label={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    <MenuIcon className="w-6 h-6" />
                </button>
                <h1 className={`text-lg font-bold text-white ml-2 whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0'}`}>
                    Insight Trading
                </h1>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto scrollbar-hide">
                {filteredNavItems.map(item => <NavItem key={item.to} {...item} isExpanded={isExpanded} />)}
            </nav>
            <UserProfile isExpanded={isExpanded} onLogout={onLogout} />
        </aside>
    );
};

export default Sidebar;
