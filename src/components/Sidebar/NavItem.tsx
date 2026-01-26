import React from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { NavItemProps } from './types';

export const NavItem: React.FC<NavItemProps> = ({ to, icon, label, isExpanded }) => {
    return (
        <ReactRouterDOM.NavLink
            to={to}
            end
            className={({ isActive }) =>
                `flex items-center px-2 py-2 text-sm font-medium rounded-lg transition-colors duration-200 relative ${isExpanded ? 'justify-start' : 'justify-center'} ${isActive
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
            }
            title={isExpanded ? '' : label}
        >
            {({ isActive }) => (
                <>
                    {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-full"></div>}
                    {icon}
                    <span className={`ml-3 whitespace-nowrap transition-opacity ${isExpanded ? 'inline-block' : 'hidden'}`}>{label}</span>
                </>
            )}
        </ReactRouterDOM.NavLink>
    );
};
