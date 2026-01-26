// Shared types for Sidebar components

export interface SidebarProps {
    isMarketPage?: boolean;
    isMobileOpen: boolean;
    onToggleMobileSidebar?: () => void;
    onLogout: () => void;
}

export interface NavItemProps {
    to: string;
    icon: React.ReactNode;
    label: string;
    isExpanded: boolean;
}

export interface UserProfileProps {
    isExpanded: boolean;
    onLogout: () => void;
}

export interface NavItem {
    to: string;
    icon: React.ReactNode;
    label: string;
    desktopOnly?: boolean;
}
