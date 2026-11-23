import { afterAll, afterEach, beforeEach } from 'vitest';
import { closeDb, initDb } from '../src/db/index.js';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_DB_PATH = join(tmpdir(), `test-bookshelf-setup-${process.pid}.db`);

beforeEach(() => {
  initDb(TEST_DB_PATH);
});

afterEach(() => {
  closeDb();
  try {
    unlinkSync(TEST_DB_PATH);
  } catch (e) {
    // ignore
  }
});
