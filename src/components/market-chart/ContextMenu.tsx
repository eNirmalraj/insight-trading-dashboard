
import React, { useLayoutEffect, useState, useRef } from 'react';
import { useOutsideAlerter } from './hooks';
import { ClockIcon, LockIcon, SettingsIcon, ChevronRightIcon, CameraIcon } from '../IconComponents';

interface ContextMenuProps {
    x: number;
    y: number;
    price: number;
    time: number;
    symbol: string;
    lockedTime: number | null;
    onClose: () => void;
    onAddAlert: (price: number) => void;
    onAddDrawingAlert?: (drawing: any) => void;
    drawing?: any;
    onOpenSettings: () => void;
    onLockVerticalLine: (time: number) => void;
    onCopyChart: () => void;
    onRemoveDrawings: () => void;
    onRemoveIndicators: () => void;
    onOpenObjectTree: () => void;
    onOpenTemplateManager: () => void;
}

const MenuItem: React.FC<{
    label: string;
    shortcut?: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    hasSubmenu?: boolean;
    disabled?: boolean;
}> = ({ label, shortcut, icon, onClick, hasSubmenu, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-left text-gray-300 rounded-md hover:bg-gray-700 hover:text-white disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
        <div className="flex items-center">
            {icon && <div className="mr-3 w-4 h-4 text-gray-400">{icon}</div>}
            <span>{label}</span>
        </div>
        <div className="flex items-center">
            {shortcut && <span className="text-xs text-gray-500 mr-2">{shortcut}</span>}
            {hasSubmenu && <ChevronRightIcon className="w-4 h-4 text-gray-500" />}
        </div>
    </button>
);

const MenuSeparator: React.FC = () => (
    <div className="my-1 border-t border-gray-700" />
);

const ContextMenu: React.FC<ContextMenuProps> = (props) => {
    const {
        x, y, price, time, symbol, lockedTime, onClose, onAddAlert, onOpenSettings,
        onLockVerticalLine, onCopyChart, onRemoveDrawings, onRemoveIndicators, onOpenObjectTree,
        onOpenTemplateManager
    } = props;

    const menuRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ x, y });

    useOutsideAlerter(menuRef, onClose);

    useLayoutEffect(() => {
        if (menuRef.current) {
            const { offsetWidth: width, offsetHeight: height } = menuRef.current;
            const { innerWidth: windowWidth, innerHeight: windowHeight } = window;

            let newX = x;
            let newY = y;

            // Check horizontal overflow (right edge)
            if (x + width > windowWidth) {
                newX = x - width;
            }

            // Check vertical overflow (bottom edge)
            if (y + height > windowHeight) {
                newY = y - height;
            }

            // Ensure it doesn't go off top/left
            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;

            setCoords({ x: newX, y: newY });
        }
    }, [x, y]);

    const formatPrice = (p: number) => p.toFixed(5);

    const handleAction = (action: () => void) => {
        action();
        onClose();
    };

    const isLocked = lockedTime === time;

    return (
        <div
            ref={menuRef}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-1 z-50 w-60"
            style={{ top: coords.y, left: coords.x }}
            data-context-menu
        >
            <MenuItem label="Copy chart" icon={<CameraIcon />} onClick={() => handleAction(onCopyChart)} />
            <MenuItem label="Paste" shortcut="Ctrl + V" disabled />
            <MenuSeparator />
            <MenuItem label={`Add alert on ${symbol} at ${formatPrice(price)}`} icon={<ClockIcon />} onClick={() => handleAction(() => onAddAlert(price))} />
            {props.drawing && props.onAddDrawingAlert && (
                <MenuItem
                    label={`Add alert on ${props.drawing.type}`}
                    icon={<ClockIcon />}
                    onClick={() => handleAction(() => props.onAddDrawingAlert && props.onAddDrawingAlert(props.drawing))}
                />
            )}
            <MenuItem label={isLocked ? "Unlock vertical cursor line" : "Lock vertical cursor line by time"} icon={<LockIcon />} onClick={() => handleAction(() => onLockVerticalLine(time))} />
            <MenuSeparator />
            <MenuItem label="Object Tree..." onClick={() => handleAction(onOpenObjectTree)} />
            <MenuItem label="Chart template" hasSubmenu onClick={() => handleAction(onOpenTemplateManager)} />
            <MenuItem label="Remove drawings" onClick={() => handleAction(onRemoveDrawings)} />
            <MenuItem label="Remove indicators" onClick={() => handleAction(onRemoveIndicators)} />
            <MenuSeparator />
            <MenuItem label="Settings..." icon={<SettingsIcon />} onClick={() => handleAction(onOpenSettings)} />
        </div>
    );
};

export default ContextMenu;
