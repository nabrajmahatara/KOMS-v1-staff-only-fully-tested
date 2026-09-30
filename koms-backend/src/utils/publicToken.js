import { randomBytes } from 'crypto';

export function generatePublicToken() {
  return randomBytes(32).toString('base64url');
}
