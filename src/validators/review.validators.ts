import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rate from 1 to 5 stars.').max(5, 'Rate from 1 to 5 stars.'),
  comment: z.string().trim().min(10, 'Reviews must be at least 10 characters.').max(1000),
  projectType: z.string().trim().min(2, 'Tell us what you worked on.').max(80),
});
export type CreateReviewInput = z.output<typeof createReviewSchema>;
