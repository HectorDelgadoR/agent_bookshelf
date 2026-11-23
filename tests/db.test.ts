import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb, all } from '../src/db/index.js';

// Per-process temp DB: works on Windows (no /tmp) and never collides with a parallel run.
const TEST_DB_PATH = join(tmpdir(), `test-bookshelf-db-${process.pid}.db`);

beforeEach(async () => {
  await initDb(TEST_DB_PATH);
});

afterEach(() => {
  closeDb();
  try {
    unlinkSync(TEST_DB_PATH);
  } catch (e) {
    // ignore
  }
});

describe('Database', () => {
  it('initializes with seed data', () => {
    const users = all('SELECT COUNT(*) as count FROM users');
    expect(users[0].count).toBe(3);
  });

  it('seeds 50 books', () => {
    const books = all('SELECT COUNT(*) as count FROM books');
    expect(books[0].count).toBe(50);
  });

  it('creates shelves for each user', () => {
    const shelves = all('SELECT COUNT(*) as count FROM shelves');
    expect(shelves[0].count).toBe(9);
  });

  it('seeds sample reviews', () => {
    const reviews = all('SELECT COUNT(*) as count FROM reviews');
    expect(reviews[0].count).toBeGreaterThan(0);
  });
});
