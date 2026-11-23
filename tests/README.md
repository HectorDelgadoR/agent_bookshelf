# Tests

This directory contains the test setup for Agent Bookshelf. Tests are written using Vitest.

## Running Tests

```bash
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
```

## What's Here

### Database Tests (`db.test.ts`)
- Verifies seed data is loaded correctly
- Tests database initialization

### Model Tests (`models/book.test.ts`)
- Example tests for the Book model
- Shows patterns for testing CRUD operations
- **Intentionally incomplete** - missing tests for:
  - `updateBook()`
  - `deleteBook()`
  - `searchBooks()`
  - Edge cases (duplicate ISBN, missing fields, etc.)

### Route Tests (`routes/api.test.ts`)
- Example tests for API endpoints
- Shows patterns for testing HTTP routes
- Tests review creation and validation
- **Intentionally incomplete** - missing tests for:
  - User endpoints
  - Shelf endpoints
  - Book update/delete endpoints
  - Error handling edge cases

## What's Missing (Homework Gaps)

The following models have **no tests at all**:

- `models/user.ts` - User CRUD operations
- `models/review.ts` - Review CRUD operations
- `models/shelf.ts` - Shelf CRUD operations

This is intentional. These are homework assignments for:

1. **QA Engineers**: Write comprehensive test suites for untested models
2. **Developers**: Add edge case tests and error handling tests
3. **Product Managers**: Define acceptance criteria for missing functionality

## Writing New Tests

When adding tests, follow the existing patterns:

1. Use `beforeEach` to initialize a fresh test database
2. Use `afterEach` to clean up
3. Test both success and error cases
4. Use descriptive test names
5. Group related tests with `describe` blocks

Example:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/db/index.js';
import * as User from '../../src/models/user.js';

// os.tmpdir() works on macOS, Linux and Windows; the pid keeps parallel runs apart.
const TEST_DB_PATH = join(tmpdir(), `test-user-${process.pid}.db`);

beforeEach(async () => {
  await initDb(TEST_DB_PATH);
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* already gone */ }
});

describe('User Model', () => {
  it('creates a user', () => {
    const user = User.createUser(db, 'testuser', 'Test User');
    expect(user.username).toBe('testuser');
  });
});
```

## Test Coverage Goals

For homework assignments, aim for:

- **Unit tests**: Test each model method
- **Integration tests**: Test API endpoints
- **Edge cases**: Test error conditions, invalid input, boundary values
- **Happy path**: Test normal operation
