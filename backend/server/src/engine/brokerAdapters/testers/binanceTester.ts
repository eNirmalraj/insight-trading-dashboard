import type { TestResult } from '../../../services/credentialHealth';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';

export async function testBinance(_cred: BrokerCredentialsFull): Promise<TestResult> {
    throw new Error('testBinance not implemented');
}
