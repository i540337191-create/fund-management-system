import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password: string, hash: string) {
    const [scheme, salt, key] = hash.split(':');
    if (scheme !== 'scrypt' || !salt || !key || password.length > 128 || !/^[0-9a-f]{128}$/.test(key))
        return false;
    return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
}
