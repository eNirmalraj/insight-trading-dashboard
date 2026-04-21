import React from 'react';

interface Props {
    summary: { total: number; healthy: number; disconnected: number };
    onAdd: () => void;
}

const BrokerConnectHeader: React.FC<Props> = ({ summary, onAdd }) => (
    <div>Header stub — total={summary.total}</div>
);

export default BrokerConnectHeader;
