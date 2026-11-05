import env from '../config/env';
import { ApiError } from '../utils/api-error';
import logger from '../utils/logger';

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const IMGBB_IMAGE_HOST = 'i.ibb.co';
const UPLOAD_TIMEOUT_MS = 20_000;

function uploadFailed(): ApiError {
  return new ApiError(502, "We couldn't upload that image. Please try again.");
}

/** Stores an image on imgbb and returns its public URL. */
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!env.IMGBB_API_KEY) {
    throw new ApiError(503, "Image uploads aren't set up yet. Paste an image URL instead.");
  }

  const form = new FormData();
  form.set('image', dataUrl.slice(dataUrl.indexOf(',') + 1));

  let url: unknown;
  try {
    const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${encodeURIComponent(env.IMGBB_API_KEY)}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`imgbb responded with ${response.status}`);
    const payload = (await response.json()) as { data?: { url?: unknown } };
    url = payload.data?.url;
  } catch (error) {
    // Log only the error's type: a fetch error's details can include the URL, which holds the key.
    logger.warn('Image upload failed', error instanceof Error ? error.name : 'unknown error');
    throw uploadFailed();
  }

  // Listings only accept hosts that the client's image optimizer allows.
  if (typeof url !== 'string' || !url.startsWith(`https://${IMGBB_IMAGE_HOST}/`)) {
    throw uploadFailed();
  }
  return url;
}
