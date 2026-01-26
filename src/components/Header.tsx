
import React from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';
import { BellIcon, AlertIcon, MenuIcon, DocumentTextIcon } from './IconComponents';

// A custom hook to detect clicks outside a component
const useOutsideAlerter = (ref: React.RefObject<HTMLDivElement>, callback: () => void) => {
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, callback]);
}

interface HeaderProps {
    onLogout: () => void;
    pageTitle: string;
    onToggleMobileSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout, pageTitle, onToggleMobileSidebar }) => {
    const [isNotificationsOpen, setNotificationsOpen] = React.useState(false);

    const notificationsRef = React.useRef<HTMLDivElement>(null);

    useOutsideAlerter(notificationsRef, () => setNotificationsOpen(false));

    const dummyNotifications = [
        { id: 1, icon: <AlertIcon className="w-5 h-5 text-yellow-400" />, message: 'New signal detected for GBP/JPY', time: '5m ago' },
        { id: 2, icon: <DocumentTextIcon className="w-5 h-5 text-green-400" />, message: 'EUR/USD trade closed with +$150 profit', time: '1h ago' },
        { id: 3, icon: <AlertIcon className="w-5 h-5 text-red-400" />, message: 'BTC/USDT stop loss hit', time: '3h ago' },
    ];

    return (
        <header className="flex-shrink-0 bg-gray-900 border-b border-gray-700/50 shadow-lg z-30">
            <div className="flex items-center justify-between p-3 h-16">
                {/* Left Section: Page Title */}
                <div className="flex items-center p-2">
                    <button onClick={onToggleMobileSidebar} className="mr-4 text-gray-400 hover:text-white md:hidden">
                        <MenuIcon className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl md:text-2xl font-semibold text-gray-200 tracking-wide">{pageTitle}</h1>
                </div>

                {/* Right Section: Notifications */}
                <div className="flex items-center space-x-4">
                    {/* Notifications Button */}
                    <div className="relative" ref={notificationsRef}>
                        <button
                            onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                            className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 focus:outline-none"
                        >
                            <BellIcon className="h-6 w-6" />
                            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-gray-900"></span>
                        </button>
                        {isNotificationsOpen && (
                            <div className="absolute top-full right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
                                <div className="p-3 border-b border-gray-700">
                                    <h3 className="font-semibold text-white">Notifications</h3>
                                </div>
                                <div className="py-1">
                                    {dummyNotifications.map(notif => (
                                        <a key={notif.id} href="#" className="flex items-start px-4 py-3 hover:bg-gray-700">
                                            <div className="flex-shrink-0">{notif.icon}</div>
                                            <div className="ml-3">
                                                <p className="text-sm text-gray-300">{notif.message}</p>
                                                <p className="text-xs text-gray-500">{notif.time}</p>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                                <div className="p-2 border-t border-gray-700 text-center">
                                    <a href="#" className="text-sm text-blue-400 hover:underline">View all notifications</a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
