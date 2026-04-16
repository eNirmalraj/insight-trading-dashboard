import React from 'react';

interface AIChatSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    currentCode: string;
    consoleErrors: string[];
    onApplyCode: (code: string) => void;
    externalMessage: string | null;
    onExternalMessageHandled: () => void;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ isOpen }) => {
    if (!isOpen) return null;
    return (
        <div className="w-80 border-l border-white/10 bg-[#111] p-4 text-gray-400 text-sm">
            <p>AI Chat — Coming Soon</p>
        </div>
    );
};
