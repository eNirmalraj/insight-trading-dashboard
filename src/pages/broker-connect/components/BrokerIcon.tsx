import React from 'react';
import { BROKERS } from '../brokerMeta';
import { BrokerId } from '../../../services/brokerCredentialService';

interface Props { broker: BrokerId; size?: 'sm' | 'md' | 'lg'; }

const SIZES: Record<NonNullable<Props['size']>, string> = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
};

const BrokerIcon: React.FC<Props> = ({ broker, size = 'md' }) => {
    const meta = BROKERS[broker];
    return (
        <div
            aria-label={`${meta.name} icon`}
            className={`${SIZES[size]} ${meta.iconBgClass} rounded-lg flex items-center justify-center font-bold font-mono text-white shrink-0`}
        >
            {meta.iconLetters}
        </div>
    );
};
export default BrokerIcon;
