import type { TestResult } from '../../../services/credentialHealth';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';

export async function testIndianBroker(_cred: BrokerCredentialsFull): Promise<TestResult> {
    throw new Error('testIndianBroker not implemented');
}
