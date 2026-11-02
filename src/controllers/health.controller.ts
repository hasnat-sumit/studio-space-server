import type { NextFunction, Request, Response } from 'express';
import { buildHealthReport } from '../services/health.service';

/** GET /api/health */
export function getHealth(_req: Request, res: Response, next: NextFunction): void {
  try {
    res.status(200).json(buildHealthReport());
  } catch (error) {
    next(error);
  }
}
