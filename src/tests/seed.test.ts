import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** Runs the real seed script as a subprocess against a throwaway database. */
describe('seed script', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;

  const runSeed = () =>
    execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/seed.ts'], {
      env: {
        ...process.env,
        MONGODB_URI: mongo.getUri(),
        DB_NAME: 'seed_test',
        BETTER_AUTH_SECRET: 'test-only-secret-test-only-secret-1234',
      },
      stdio: 'pipe',
    });

  before(async () => {
    mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongo.getUri());
  });

  after(async () => {
    await client.close();
    await mongo.stop();
  });

  it('loads the catalogue, and a re-run changes nothing', async () => {
    const db = client.db('seed_test');
    runSeed();

    const studios = await db.collection('studios').countDocuments();
    const reviews = await db.collection('reviews').countDocuments();
    assert.ok(studios > 0);
    assert.ok(reviews > 0);
    assert.equal(await db.collection('user').countDocuments({ email: 'examiner@studiospace.dev' }), 1);

    // A host's edit must survive a re-run.
    await db.collection('studios').updateOne({ slug: 'noir-photo-studio' }, { $set: { hourlyRate: 1 } });
    runSeed();

    assert.equal(await db.collection('studios').countDocuments(), studios);
    assert.equal(await db.collection('reviews').countDocuments(), reviews);
    assert.equal(await db.collection('user').countDocuments({ email: 'examiner@studiospace.dev' }), 1);
    const edited = await db.collection('studios').findOne({ slug: 'noir-photo-studio' });
    assert.equal(edited?.hourlyRate, 1);
  });
});
