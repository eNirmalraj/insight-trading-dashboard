import { BrokerId } from '../../services/brokerCredentialService';

export type Category = 'crypto' | 'forex' | 'indian';

export interface BrokerMeta {
    id: BrokerId;
    name: string;
    category: Category;
    iconLetters: string;
    iconBgClass: string;
    authMethod: 'key_secret' | 'key_secret_passphrase' | 'mt5_login' | 'oauth' | 'direct_api';
}

export const BROKERS: Record<BrokerId, BrokerMeta> = {
    binance:  { id: 'binance',  name: 'Binance',      category: 'crypto', iconLetters: 'BN', iconBgClass: 'bg-yellow-500',  authMethod: 'key_secret' },
    bitget:   { id: 'bitget',   name: 'Bitget',       category: 'crypto', iconLetters: 'BT', iconBgClass: 'bg-teal-500',    authMethod: 'key_secret_passphrase' },
    mt5:      { id: 'mt5',      name: 'MetaTrader 5', category: 'forex',  iconLetters: 'MT', iconBgClass: 'bg-blue-600',    authMethod: 'mt5_login' },
    zerodha:  { id: 'zerodha',  name: 'Zerodha',      category: 'indian', iconLetters: 'ZE', iconBgClass: 'bg-orange-500',  authMethod: 'oauth' },
    angelone: { id: 'angelone', name: 'Angel One',    category: 'indian', iconLetters: 'AO', iconBgClass: 'bg-red-500',     authMethod: 'direct_api' },
    upstox:   { id: 'upstox',   name: 'Upstox',       category: 'indian', iconLetters: 'UP', iconBgClass: 'bg-purple-500',  authMethod: 'oauth' },
    dhan:     { id: 'dhan',     name: 'Dhan',         category: 'indian', iconLetters: 'DH', iconBgClass: 'bg-indigo-500',  authMethod: 'direct_api' },
    fyers:    { id: 'fyers',    name: 'Fyers',        category: 'indian', iconLetters: 'FY', iconBgClass: 'bg-pink-500',    authMethod: 'oauth' },
};

export function categoryOf(broker: BrokerId): Category {
    return BROKERS[broker].category;
}
