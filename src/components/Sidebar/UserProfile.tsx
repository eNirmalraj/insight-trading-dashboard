import React, { useState, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { UserProfileProps } from './types';
import { ChevronDownIcon, UserIcon, SignOutIcon, StarIcon, SubscriptionIcon } from '../IconComponents';

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
};

export const UserProfile: React.FC<UserProfileProps> = ({ isExpanded, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isPro, setIsPro] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(menuRef, () => setIsOpen(false));

    // Check subscription status
    React.useEffect(() => {
        const checkSub = async () => {
            const { getUserSubscription } = await import('../../services/subscriptionService');
            const sub = await getUserSubscription();
            setIsPro(sub?.plan?.name === 'Pro' && sub?.status === 'active');
        };
        checkSub();
    }, [isOpen]);

    return (
        <div className="relative border-t border-gray-700 mt-2 pt-2" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center w-full p-2 rounded-lg hover:bg-gray-800 transition-colors ${isExpanded ? 'px-2' : 'justify-center px-0'}`}
                title={!isExpanded ? "User Profile" : ""}
            >
                <img src="https://picsum.photos/40/40" alt="User" className="w-8 h-8 rounded-full border border-gray-600 flex-shrink-0" />
                {isExpanded && (
                    <div className="ml-3 text-left flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">John Doe</p>
                        <p className="text-xs text-gray-400 truncate">{isPro ? 'Pro Member' : 'Free Plan'}</p>
                    </div>
                )}
                {isExpanded && <ChevronDownIcon className={`w-4 h-4 text-gray-500 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
            </button>

            {isOpen && (
                <div className={`absolute z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-56 overflow-hidden py-1 ${isExpanded ? 'bottom-full left-0 mb-2' : 'left-full bottom-0 ml-2'}`}>
                    {isPro ? (
                        <div className="flex items-center px-4 py-2 text-sm text-yellow-400 bg-yellow-500/10 mb-1">
                            <StarIcon className="w-4 h-4 mr-2" />
                            <span className="font-bold">Pro Active</span>
                        </div>
                    ) : (
                        <ReactRouterDOM.NavLink
                            to="/subscription"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 mb-1 font-bold"
                        >
                            <StarIcon className="w-4 h-4 mr-2" />
                            Upgrade to Pro
                        </ReactRouterDOM.NavLink>
                    )}

                    <ReactRouterDOM.NavLink to="/settings" onClick={() => setIsOpen(false)} className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white">
                        <UserIcon className="w-5 h-5 mr-3" /> Profile & Settings
                    </ReactRouterDOM.NavLink>

                    <ReactRouterDOM.NavLink to="/subscription" onClick={() => setIsOpen(false)} className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white">
                        <SubscriptionIcon className="w-5 h-5 mr-3" /> Manage Subscription
                    </ReactRouterDOM.NavLink>

                    <div className="border-t border-gray-700 my-1"></div>
                    <button onClick={onLogout} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300">
                        <SignOutIcon className="w-5 h-5 mr-3" /> Sign Out
                    </button>
                </div>
            )}
        </div>
    );
};
