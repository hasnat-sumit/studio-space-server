import { Router } from 'express';
import { getMe, getSummary, patchMe } from '../controllers/profile.controller';
import { postNewsletter } from '../controllers/newsletter.controller';
import { removeReview } from '../controllers/review.controller';
import { postImage } from '../controllers/upload.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { ensureDatabase } from '../middleware/database.middleware';
import bookingRouter from './booking.routes';
import healthRouter from './health.routes';
import studioRouter from './studio.routes';

/**
 * Central router mounted at /api in app.ts.
 * Add new resource routers here, e.g. apiRouter.use('/studios', studiosRouter).
 */
const apiRouter = Router();

apiRouter.use('/health', healthRouter);

// Everything below needs MongoDB; health must keep answering without it.
apiRouter.use(ensureDatabase);

apiRouter.use('/studios', studioRouter);
apiRouter.use('/bookings', bookingRouter);
apiRouter.delete('/reviews/:id', requireAuth, removeReview);
apiRouter.get('/users/me', requireAuth, getMe);
apiRouter.patch('/users/me', requireAuth, patchMe);
apiRouter.get('/dashboard/summary', requireAuth, getSummary);
apiRouter.post('/uploads/image', requireAuth, postImage);
apiRouter.post('/newsletter', postNewsletter);

export default apiRouter;
