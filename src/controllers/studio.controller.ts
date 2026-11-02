import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.middleware';
import { getBookedSlots } from '../services/booking.service';
import {
  createStudio,
  deleteStudio,
  findStudioDocument,
  listFeaturedStudios,
  listStudios,
  listStudiosByOwner,
  toStudioView,
  updateStudio,
} from '../services/studio.service';
import { parseInput, routeParam } from '../utils/validate';
import {
  availabilityQuerySchema,
  createStudioSchema,
  featuredQuerySchema,
  listStudiosQuerySchema,
  updateStudioSchema,
} from '../validators/studio.validators';

/** GET /api/studios */
export async function getStudios(req: Request, res: Response): Promise<void> {
  res.json(await listStudios(parseInput(listStudiosQuerySchema, req.query)));
}

/** GET /api/studios/featured */
export async function getFeaturedStudios(req: Request, res: Response): Promise<void> {
  const { limit } = parseInput(featuredQuerySchema, req.query);
  res.json(await listFeaturedStudios(limit));
}

/** GET /api/studios/mine */
export async function getMyStudios(_req: Request, res: Response): Promise<void> {
  res.json(await listStudiosByOwner(currentUser(res).id));
}

/** GET /api/studios/:idOrSlug */
export async function getStudio(req: Request, res: Response): Promise<void> {
  res.json(toStudioView(await findStudioDocument(routeParam(req.params.idOrSlug))));
}

/** GET /api/studios/:idOrSlug/availability?date=YYYY-MM-DD */
export async function getStudioAvailability(req: Request, res: Response): Promise<void> {
  const { date } = parseInput(availabilityQuerySchema, req.query);
  const bookedSlots = await getBookedSlots(routeParam(req.params.idOrSlug), date);
  res.json({ date, bookedSlots });
}

/** POST /api/studios */
export async function postStudio(req: Request, res: Response): Promise<void> {
  const input = parseInput(createStudioSchema, req.body);
  res.status(201).json(await createStudio(currentUser(res), input));
}

/** PATCH /api/studios/:id */
export async function patchStudio(req: Request, res: Response): Promise<void> {
  const input = parseInput(updateStudioSchema, req.body);
  res.json(await updateStudio(currentUser(res), routeParam(req.params.id), input));
}

/** DELETE /api/studios/:id */
export async function removeStudio(req: Request, res: Response): Promise<void> {
  await deleteStudio(currentUser(res), routeParam(req.params.id));
  res.status(204).end();
}
