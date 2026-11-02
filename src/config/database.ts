import { MongoClient, type Db } from 'mongodb';
import env from './env';
import logger from '../utils/logger';

/**
 * Reusable MongoDB connection utility.
 *
 * - `connectDatabase()` is idempotent and safe to call concurrently.
 * - `getDatabase()` throws until a connection exists (use it inside services).
 * - A failed boot connection is handled by `server.ts` and is non-fatal.
 */

let client: MongoClient | null = null;
let database: Db | null = null;
let pendingConnection: Promise<Db> | null = null;

async function openConnection(uri: string, dbName: string): Promise<Db> {
  const mongoClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 10,
  });

  mongoClient.on('error', (error) => {
    logger.error('MongoDB client error', error.message);
  });

  await mongoClient.connect();
  const db = mongoClient.db(dbName);
  await db.command({ ping: 1 });

  client = mongoClient;
  database = db;
  logger.info(`MongoDB connected (db="${dbName}")`);

  return db;
}

/** Establish (or reuse) the application database connection. */
export async function connectDatabase(
  uri: string = env.MONGODB_URI,
  dbName: string = env.DB_NAME,
): Promise<Db> {
  if (database) return database;

  if (!uri) {
    throw new Error('Cannot connect to MongoDB: MONGODB_URI is missing or empty.');
  }

  if (!pendingConnection) {
    pendingConnection = openConnection(uri, dbName).catch((error: unknown) => {
      pendingConnection = null;
      throw error;
    });
  }

  return pendingConnection;
}

/** Returns the live Db instance; throws when not connected yet. */
export function getDatabase(): Db {
  if (!database) {
    throw new Error('MongoDB is not connected. Call connectDatabase() first.');
  }
  return database;
}

/** Whether a connection is currently established. */
export function isDatabaseConnected(): boolean {
  return database !== null && client !== null;
}

/** Close the connection gracefully (used during shutdown). */
export async function closeDatabase(): Promise<void> {
  if (pendingConnection) {
    try {
      await pendingConnection;
    } catch {
      // Connection never succeeded; nothing to close.
    }
  }

  const activeClient = client;
  client = null;
  database = null;
  pendingConnection = null;

  if (activeClient) {
    await activeClient.close();
    logger.info('MongoDB connection closed');
  }
}
