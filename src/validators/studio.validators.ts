import { z } from 'zod';
import { STUDIO_AMENITIES, STUDIO_CATEGORIES } from '../types/domain';

/** `next/image` on the client only serves whitelisted hosts (see its next.config.ts). */
const ALLOWED_IMAGE_HOSTS = new Set(['images.unsplash.com']);

const imageUrl = z.url().refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  },
  { message: 'Image URLs must be https://images.unsplash.com links.' },
);

const studioFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(100),
  category: z.enum(STUDIO_CATEGORIES, { message: 'Choose a category.' }),
  location: z.string().trim().min(2, 'Location is required.').max(120),
  hourlyRate: z.number().min(1, 'Hourly rate must be at least $1.').max(10000),
  deposit: z.number().min(0, "Deposit can't be negative.").max(100000),
  capacity: z.number().int().min(1, 'Capacity must be at least 1.').max(1000),
  description: z.string().trim().min(10, 'Summary must be at least 10 characters.').max(200),
  overview: z
    .array(z.string().trim().min(1).max(2000))
    .min(1, 'Add an overview.')
    .max(6, 'Use at most 6 paragraphs.'),
  amenities: z.array(z.enum(STUDIO_AMENITIES)).max(STUDIO_AMENITIES.length),
  gallery: z
    .array(z.object({ src: imageUrl, alt: z.string().trim().min(1).max(200) }))
    .min(1, 'Add at least one photo.')
    .max(8, 'Use at most 8 photos.'),
};

export const createStudioSchema = z.object(studioFields);
export type CreateStudioInput = z.output<typeof createStudioSchema>;

export const updateStudioSchema = z
  .object(studioFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });
export type UpdateStudioInput = z.output<typeof updateStudioSchema>;

const numericQuery = z.coerce.number().min(0).optional();

export const listStudiosQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(STUDIO_CATEGORIES).optional(),
  minPrice: numericQuery,
  maxPrice: numericQuery,
  minCapacity: numericQuery,
  sort: z.enum(['rating', 'price-asc', 'price-desc', 'newest']).default('rating'),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListStudiosQuery = z.output<typeof listStudiosQuerySchema>;

export const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(6),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.'),
});
