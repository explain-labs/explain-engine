// One-time, idempotent migration: ensure every user document carries a
// `modelDeveloper` boolean (default false). Safe to re-run — it only touches
// users that don't already have the field.
//
// Run:  node --env-file=.env.local scripts/backfill_model_developer.mjs
import { getUsersCollection } from "../server/db.mjs";

const users = await getUsersCollection();
const missing = await users.countDocuments({ modelDeveloper: { $exists: false } });
const r = await users.updateMany(
  { modelDeveloper: { $exists: false } },
  { $set: { modelDeveloper: false } },
);
console.log(`users missing modelDeveloper before: ${missing}`);
console.log(`matched: ${r.matchedCount}, modified: ${r.modifiedCount}`);
const total = await users.countDocuments({});
const withField = await users.countDocuments({ modelDeveloper: { $exists: true } });
console.log(`now ${withField}/${total} users have the field`);
process.exit(0);
