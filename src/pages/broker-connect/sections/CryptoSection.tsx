import React from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { HealthEntry } from '../hooks/useHealthCheck';

interface Props {
    creds: BrokerCredentialInfo[];
    healthMap: Map<string, HealthEntry>;
    onTest: (id: string) => void;
    onRemove: (id: string) => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onAdd: () => void;
}

const CryptoSection: React.FC<Props> = () => <div>CryptoSection stub</div>;

export default CryptoSection;
