import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const params = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;

const derive = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, length, { ...options, maxmem: 128 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

// формат: scrypt$N$r$p$salt$key — параметры хранятся в хеше, их можно поднять без миграции
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
};

export const verifyPassword = async (password: string, stored: string) => {
  const [alg, N, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
};

export const generatePassword = () => randomBytes(12).toString('base64url');
