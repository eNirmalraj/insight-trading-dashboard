import type { TestResult } from '../../../services/credentialHealth';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';

export async function testMT5(_cred: BrokerCredentialsFull): Promise<TestResult> {
    throw new Error('testMT5 not implemented');
}
