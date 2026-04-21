import React from 'react';

interface Props { permissions: string[]; }

const PermissionChips: React.FC<Props> = ({ permissions }) => {
    if (!permissions || permissions.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {permissions.map((p) => (
                <span
                    key={p}
                    className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"
                >
                    {p}
                </span>
            ))}
        </div>
    );
};
export default PermissionChips;
