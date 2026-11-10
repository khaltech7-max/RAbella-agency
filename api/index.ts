import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApp } from '../server.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req, res);
}
