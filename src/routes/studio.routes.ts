import { Router } from 'express';
import {
  getFeaturedStudios,
  getMyStudios,
  getStudio,
  getStudioAvailability,
  getStudios,
  patchStudio,
  postStudio,
  removeStudio,
} from '../controllers/studio.controller';
import { getStudioReviews, postStudioReview } from '../controllers/review.controller';
import { requireAuth } from '../middleware/auth.middleware';

const studioRouter = Router();

// Fixed paths must come before `/:idOrSlug`.
studioRouter.get('/featured', getFeaturedStudios);
studioRouter.get('/mine', requireAuth, getMyStudios);

studioRouter.get('/', getStudios);
studioRouter.post('/', requireAuth, postStudio);

studioRouter.get('/:idOrSlug', getStudio);
studioRouter.get('/:idOrSlug/availability', getStudioAvailability);
studioRouter.get('/:idOrSlug/reviews', getStudioReviews);
studioRouter.post('/:idOrSlug/reviews', requireAuth, postStudioReview);

studioRouter.patch('/:id', requireAuth, patchStudio);
studioRouter.delete('/:id', requireAuth, removeStudio);

export default studioRouter;
