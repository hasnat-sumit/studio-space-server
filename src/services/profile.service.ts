import type { IncomingHttpHeaders } from 'node:http';
import { getAuth, toAuthHeaders } from '../config/auth';
import { getDatabase } from '../config/database';
import {
  COLLECTIONS,
  type AuthUser,
  type ProfileDocument,
  type ProfileView,
  type StudioDocument,
} from '../types/domain';
import type { UpdateProfileInput } from '../validators/profile.validators';

function profiles() {
  return getDatabase().collection<ProfileDocument>(COLLECTIONS.profiles);
}

export function getProfileDocument(userId: string): Promise<ProfileDocument | null> {
  return profiles().findOne({ userId });
}

function toProfileView(user: AuthUser, profile: ProfileDocument | null): ProfileView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    joinedAt: user.createdAt.toISOString(),
    tagline: profile?.tagline ?? '',
    bio: profile?.bio ?? '',
    location: profile?.location ?? '',
    phone: profile?.phone ?? '',
    responseNote: profile?.responseNote ?? '',
  };
}

export async function getProfile(user: AuthUser): Promise<ProfileView> {
  return toProfileView(user, await getProfileDocument(user.id));
}

/** Keeps the public host card on a user's listings in sync with their profile. */
async function syncHostCard(
  ownerId: string,
  fields: { name?: string; tagline?: string; responseNote?: string },
): Promise<void> {
  const $set: Record<string, string> = {};
  if (fields.name) $set['host.name'] = fields.name;
  if (fields.tagline) $set['host.tagline'] = fields.tagline;
  if (fields.responseNote) $set['host.responseNote'] = fields.responseNote;
  if (Object.keys($set).length === 0) return;

  await getDatabase()
    .collection<StudioDocument>(COLLECTIONS.studios)
    .updateMany({ ownerId }, { $set });
}

export async function updateProfile(
  user: AuthUser,
  headers: IncomingHttpHeaders,
  input: UpdateProfileInput,
): Promise<{ profile: ProfileView; setCookies: string[] }> {
  const { name, ...fields } = input;
  let setCookies: string[] = [];

  // Identity belongs to Better Auth, so names change through its own API.
  if (name !== undefined && name !== user.name) {
    const auth = await getAuth();
    const result = await auth.api.updateUser({
      headers: await toAuthHeaders(headers),
      body: { name },
      returnHeaders: true,
    });
    // The session JWT holds the name, so the browser needs the reissued cookie.
    setCookies = result.headers.getSetCookie();
  }

  const profile = await profiles().findOneAndUpdate(
    { userId: user.id },
    {
      $set: { ...fields, updatedAt: new Date() },
      $setOnInsert: { userId: user.id },
    },
    { upsert: true, returnDocument: 'after' },
  );

  await syncHostCard(user.id, { name, tagline: fields.tagline, responseNote: fields.responseNote });

  return { profile: toProfileView({ ...user, name: name ?? user.name }, profile), setCookies };
}
