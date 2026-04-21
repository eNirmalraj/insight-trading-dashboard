import type { TestResult } from '../../../services/credentialHealth';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';

export async function testBitget(_cred: BrokerCredentialsFull): Promise<TestResult> {
    throw new Error('testBitget not implemented');
}
