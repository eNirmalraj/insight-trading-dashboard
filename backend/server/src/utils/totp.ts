import crypto from 'crypto';

/**
 * Generate a TOTP code from a base32-encoded secret.
 * Standard: RFC 6238 (time-based, 30s window, 6 digits, SHA1)
 */
export const generateTOTP = (base32Secret: string): string => {
    // Decode base32
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleaned = base32Secret.replace(/[\s=-]/g, '').toUpperCase();
    let bits = '';
    for (const c of cleaned) {
        const val = base32Chars.indexOf(c);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    const key = Buffer.from(bytes);

    // Time counter (30-second window)
    const time = Math.floor(Date.now() / 1000 / 30);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(0, 0);
    timeBuffer.writeUInt32BE(time, 4);

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, '0');
};
