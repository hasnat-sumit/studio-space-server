import { ObjectId } from 'mongodb';
import { z, type ZodType } from 'zod';
import { ApiError } from './api-error';

/** Parses untrusted input; failures become a 400 with per-field messages in `details`. */
export function parseInput<Schema extends ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const { fieldErrors, formErrors } = z.flattenError(result.error);
  throw ApiError.badRequest(formErrors[0] ?? 'Please check the highlighted fields.', { fieldErrors });
}

/** Express 5 types route params as `string | string[]`; ours are always single values. */
export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Strict 24-hex check: `ObjectId.isValid` also accepts arbitrary 12-character strings. */
export function toObjectId(value: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}

/** True for MongoDB's duplicate-key error (a unique index rejected the write). */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
