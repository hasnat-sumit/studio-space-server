import type { ObjectId } from 'mongodb';

/** Persisted MongoDB documents and the public shapes the API returns for them. */

export const STUDIO_CATEGORIES = ['photography', 'sound-stage', 'podcast', 'music', 'art'] as const;
export type StudioCategory = (typeof STUDIO_CATEGORIES)[number];

export const STUDIO_AMENITIES = [
  'gigabit-wifi',
  'natural-light',
  'cyclorama',
  'blackout',
  'makeup-stations',
  'kitchenette',
  'espresso-bar',
  'parking',
  'loading-dock',
  'green-room',
  'drum-kit',
  'grand-piano',
  'mixing-desk',
  'mic-array',
  'vocal-booth',
  'acoustic-treatment',
  'easels',
  'kilns',
  'clay-sink',
  'step-free-access',
  'climate-control',
  'lockable-storage',
  'garment-racks',
  'prop-library',
  'lounge-seating',
] as const;
export type StudioAmenity = (typeof STUDIO_AMENITIES)[number];

export interface StudioImage {
  src: string;
  alt: string;
}

/** Public host card embedded on each studio. Never holds private contact details. */
export interface StudioHost {
  id: string;
  name: string;
  avatar?: string;
  tagline: string;
  responseNote: string;
  joinedYear: number;
}

export interface StudioDocument {
  _id: ObjectId;
  /** Better Auth user id of the listing's owner; every write is checked against it. */
  ownerId: string;
  /** Private. Absent on seed listings, whose hosts aren't real accounts. */
  ownerEmail?: string;
  slug: string;
  title: string;
  category: StudioCategory;
  location: string;
  hourlyRate: number;
  deposit: number;
  capacity: number;
  description: string;
  overview: string[];
  amenities: StudioAmenity[];
  gallery: StudioImage[];
  host: StudioHost;
  rating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Matches the client's `Studio` type. */
export type StudioView = Omit<StudioDocument, '_id' | 'ownerId' | 'ownerEmail' | 'createdAt' | 'updatedAt'> & {
  id: string;
  image: string;
  imageAlt: string;
  createdAt: string;
};

export const BOOKING_STATUSES = ['pending', 'confirmed', 'declined', 'cancelled', 'completed'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookingDocument {
  _id: ObjectId;
  studioId: string;
  /** Snapshot of the listing at booking time, so history survives edits and deletion. */
  studioTitle: string;
  studioSlug: string;
  studioImage: string;
  studioLocation: string;
  hostId: string;
  hostName: string;
  guestId: string;
  guestName: string;
  guestEmail: string;
  /** Calendar date as `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:mm` on a 30-minute step. */
  start: string;
  end: string;
  hours: number;
  hourlyRate: number;
  subtotal: number;
  deposit: number;
  notes: string;
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookingView = Omit<BookingDocument, '_id' | 'createdAt' | 'updatedAt'> & {
  id: string;
  /** The viewer's relationship to this booking. */
  role: 'host' | 'guest';
  createdAt: string;
  updatedAt: string;
};

/**
 * One 30-minute reservation. The unique index on (studioId, date, slot) is what
 * makes double-booking impossible, even under concurrent requests and without
 * multi-document transactions.
 */
export interface BookingSlotDocument {
  _id?: ObjectId;
  studioId: string;
  date: string;
  slot: string;
  bookingId: string;
}

export interface ReviewDocument {
  _id: ObjectId;
  studioId: string;
  studioSlug: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  projectType: string;
  createdAt: Date;
}

/** Matches the client's `StudioReview` type. */
export type ReviewView = Omit<ReviewDocument, '_id' | 'studioId' | 'createdAt'> & {
  id: string;
  createdAt: string;
};

/** Editable profile fields; identity (name, email) stays in Better Auth's `user` collection. */
export interface ProfileDocument {
  _id?: unknown;
  userId: string;
  tagline: string;
  bio: string;
  location: string;
  phone: string;
  responseNote: string;
  updatedAt: Date;
}

export interface ProfileView {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  tagline: string;
  bio: string;
  location: string;
  phone: string;
  responseNote: string;
}

/** The authenticated user attached to a request by `requireAuth`. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface DashboardSummary {
  hosting: {
    listings: number;
    pendingRequests: number;
    upcomingBookings: number;
    earnings: number;
  };
  renting: {
    upcomingBookings: number;
    totalBookings: number;
    totalSpent: number;
  };
  /** The next few active bookings across both roles, soonest first. */
  upcoming: BookingView[];
}

export const COLLECTIONS = {
  studios: 'studios',
  bookings: 'bookings',
  bookingSlots: 'booking_slots',
  reviews: 'reviews',
  profiles: 'profiles',
  newsletterSubscribers: 'newsletter_subscribers',
} as const;
