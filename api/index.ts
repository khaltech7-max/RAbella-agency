import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApp } from '../server.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // If Vercel rewrote the request to /api/index, restore the original request path
  const originalPath =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    (req.headers['x-forwarded-uri'] as string) ||
    (req.headers['x-original-url'] as string);

  if (originalPath && req.url && req.url.startsWith('/api/index')) {
    const queryIdx = req.url.indexOf('?');
    const queryStr = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
    req.url = originalPath + queryStr;
  }

  const app = await getApp();

  return new Promise<void>((resolve, reject) => {
    if (typeof res.on === 'function') {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err) => reject(err));
    }

    try {
      app(req, res, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
