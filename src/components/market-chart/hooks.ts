import React from 'react';

// A custom hook to detect clicks outside a component
export const useOutsideAlerter = (ref: React.RefObject<HTMLElement>, callback: () => void) => {
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const isOutsideMain = ref.current && !ref.current.contains(event.target as Node);
            const isInsidePortal = document.getElementById('color-picker-portal-content')?.contains(event.target as Node);

            if (isOutsideMain && !isInsidePortal) {
                callback();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, callback]);
}
