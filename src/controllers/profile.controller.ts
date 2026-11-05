import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.middleware';
import { getDashboardSummary } from '../services/dashboard.service';
import { getProfile, updateProfile } from '../services/profile.service';
import { parseInput } from '../utils/validate';
import { updateProfileSchema } from '../validators/profile.validators';

/** GET /api/users/me */
export async function getMe(_req: Request, res: Response): Promise<void> {
  res.json(await getProfile(currentUser(res)));
}

/** PATCH /api/users/me */
export async function patchMe(req: Request, res: Response): Promise<void> {
  const input = parseInput(updateProfileSchema, req.body);
  const { profile, setCookies } = await updateProfile(currentUser(res), req.headers, input);
  for (const cookie of setCookies) res.append('Set-Cookie', cookie);
  res.json(profile);
}

/** GET /api/dashboard/summary */
export async function getSummary(_req: Request, res: Response): Promise<void> {
  res.json(await getDashboardSummary(currentUser(res)));
}
