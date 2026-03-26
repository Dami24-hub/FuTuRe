# Database Testing Lifecycle

This document describes the database testing strategy for the FuTuRe Stellar Remittance Platform, covering migration testing, integrity/security checks, performance baselines, and backup/restore validation.

## Test Environment

`docker-compose.test.yml` spins up a clean, ephemeral PostgreSQL instance (using `tmpfs` so data is never persisted between runs):

```bash
docker compose -f docker-compose.test.yml up -d
# wait for health checks, then run tests
docker compose -f docker-compose.test.yml down
```

Two services are defined:
- `db` — primary admin connection (port 5433)
- `db_readonly` — read-only role simulation (port 5434)

## Database Testing Lifecycle

```
1. Spin up clean DB (docker-compose.test.yml)
2. Run migration script from scratch  →  verify schema
3. Roll back all migrations           →  verify clean state
4. Run integrity & security tests
5. Run stress test (10,000 records)
6. Run backup/restore validation
7. Tear down DB
```

## Running the Tests

### All database tests (vitest)

```bash
cd backend
npx vitest run tests/database.framework.test.js
```

### Migration script (standalone)

```bash
node scripts/test-migrations.js
```

This script:
1. Applies all migrations from version 0
2. Verifies the schema matches expected metadata
3. Rolls back all migrations
4. Verifies the schema is empty

## Test Coverage

### Migration Lifecycle (`Migration Lifecycle`)
- Applies all migrations from scratch
- Verifies schema matches expected metadata post-migrate
- Rolls back all migrations and confirms clean schema
- Uses `MigrationTester` to validate each migration's `up`/`down` functions

### Foreign Key Constraints (`Foreign Key Constraints`)
- Confirms valid parent-child inserts succeed
- Confirms orphan inserts are rejected with an FK violation error

### RBAC — Read-Only User (`RBAC: Read-Only User`)
- Verifies `DROP TABLE` is denied for the `readonly` role
- Verifies `INSERT` is denied for the `readonly` role
- Verifies raw SQL `DROP` and `INSERT` statements are blocked

### Performance Baseline — Stress Test (`Performance Baseline: Stress Test`)

Inserts 10,000 records into an in-memory dataset and runs 1,000 random lookups against:
- **Indexed** path: `Map` lookup — O(1)
- **Non-indexed** path: `Array.find` linear scan — O(n)

Results are printed to the console:

```
Indexed   (1000 lookups): 0.45ms
Non-indexed (1000 lookups): 38.12ms
Speedup: 84.7x
```

The test asserts indexed lookups are faster and both complete within 5 seconds.

### Backup / Restore Validation (`Backup and Restore`)
- Dumps the current DB state
- Deletes a table
- Restores from the dump
- Verifies row count and data values match the original
- Verifies the restore produces a deep copy (mutations don't corrupt the snapshot)

## Extending the Framework

To add a new migration to the test suite, register it in `scripts/test-migrations.js` and `backend/tests/database.framework.test.js` following the existing pattern:

```js
{
  name: 'create_my_table',
  version: 4,
  up: async (db) => { /* create table */ },
  down: async (db) => { /* drop table */ },
}
```
