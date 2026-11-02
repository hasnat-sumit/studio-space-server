import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.middleware';
import { createReview, deleteReview, listReviews } from '../services/review.service';
import { parseInput, routeParam } from '../utils/validate';
import { createReviewSchema } from '../validators/review.validators';

/** GET /api/studios/:idOrSlug/reviews */
export async function getStudioReviews(req: Request, res: Response): Promise<void> {
  res.json(await listReviews(routeParam(req.params.idOrSlug)));
}

/** POST /api/studios/:idOrSlug/reviews */
export async function postStudioReview(req: Request, res: Response): Promise<void> {
  const input = parseInput(createReviewSchema, req.body);
  res.status(201).json(await createReview(currentUser(res), routeParam(req.params.idOrSlug), input));
}

/** DELETE /api/reviews/:id */
export async function removeReview(req: Request, res: Response): Promise<void> {
  await deleteReview(currentUser(res), routeParam(req.params.id));
  res.status(204).end();
}
