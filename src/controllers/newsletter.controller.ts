import type { Request, Response } from 'express';
import { subscribe } from '../services/newsletter.service';
import { parseInput } from '../utils/validate';
import { newsletterSchema } from '../validators/newsletter.validators';

/** POST /api/newsletter */
export async function postNewsletter(req: Request, res: Response): Promise<void> {
  const { email } = parseInput(newsletterSchema, req.body);
  await subscribe(email);
  res.status(201).json({ subscribed: true });
}
