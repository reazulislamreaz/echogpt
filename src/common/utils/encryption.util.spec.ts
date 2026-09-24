import { encryptSecret, decryptSecret, buildKeyPreview } from './encryption.util';

describe('encryption.util', () => {
  const secret = 'unit-test-encryption-secret';

  it('should encrypt and decrypt symmetrically', () => {
    const plaintext = 'sk-live-example-key-123456';
    const encrypted = encryptSecret(plaintext, secret);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted, secret)).toBe(plaintext);
  });

  it('should build a masked key preview', () => {
    expect(buildKeyPreview('sk-abcdefgh')).toBe('****efgh');
    expect(buildKeyPreview('ab')).toBe('****');
  });
});
