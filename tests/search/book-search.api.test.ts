import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import app from '../../src/server.js';
import { initDb, closeDb } from '../../src/db/index.js';

let dbPath: string;

beforeEach(async () => {
  dbPath = join(tmpdir(), `book-search-api-${process.pid}-${Date.now()}.db`);
  await initDb(dbPath);
});

afterEach(() => {
  closeDb();
  try {
    unlinkSync(dbPath);
  } catch {
    // ignore
  }
});

const TOO_LONG = 'Search query must be 100 characters or fewer';
const NOT_STRING = 'Search query must be a string';

const titlesOf = (body: Array<{ title: string }>) => body.map((b) => b.title);

describe('AC1: GET /api/books/search matches title or author', () => {
  it('AC1: returns 200 and a JSON array for a partial title', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'pragmat' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(titlesOf(res.body)).toEqual(['The Pragmatic Programmer']);
  });

  it('AC1: matches a partial author', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'herbert' });
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['Dune']);
  });

  it('AC1: is case-insensitive', async () => {
    for (const q of ['DUNE', 'dune', 'FRANK herbert']) {
      const res = await request(app).get('/api/books/search').query({ q });
      expect(res.status).toBe(200);
      expect(titlesOf(res.body)).toEqual(['Dune']);
    }
  });

  it('AC1: returns every book by an author with several books, ordered by title', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'andy weir' });
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['Project Hail Mary', 'The Martian']);
  });

  it('AC1: each element has the same shape as GET /api/books', async () => {
    const search = await request(app).get('/api/books/search').query({ q: 'dune' });
    const all = await request(app).get('/api/books');
    expect(search.status).toBe(200);
    const dune = all.body.find((b: { title: string }) => b.title === 'Dune');
    expect(search.body).toEqual([dune]);
  });

  it('AC1: returns 200 and [] when nothing matches', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'zzzxyzzy' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC1: "search" is not parsed as a book id by /api/books/:id', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'dune' });
    expect(res.status).not.toBe(404);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('AC1: GET /api/books?q= is an alias of the search endpoint', async () => {
    const alias = await request(app).get('/api/books').query({ q: 'weir' });
    const search = await request(app).get('/api/books/search').query({ q: 'weir' });
    expect(alias.status).toBe(200);
    expect(titlesOf(alias.body)).toEqual(['Project Hail Mary', 'The Martian']);
    expect(alias.body).toEqual(search.body);
  });

  it('AC1: GET /api/books/:id still works for numeric ids', async () => {
    const res = await request(app).get('/api/books/1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('The Pragmatic Programmer');
  });
});

describe('AC2: an empty query returns all books', () => {
  it('AC2: /api/books/search without q returns all 50 books', async () => {
    const res = await request(app).get('/api/books/search');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  it('AC2: /api/books/search?q= returns all 50 books', async () => {
    const res = await request(app).get('/api/books/search?q=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  it('AC2: a whitespace-only q returns all 50 books', async () => {
    const res = await request(app).get('/api/books/search').query({ q: '   ' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  it('AC2: the search result for a blank q equals GET /api/books', async () => {
    const search = await request(app).get('/api/books/search');
    const all = await request(app).get('/api/books');
    expect(search.status).toBe(200);
    expect(search.body).toEqual(all.body);
  });

  it('AC2: GET /api/books?q= (alias) returns all 50 books', async () => {
    const res = await request(app).get('/api/books?q=');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  it('AC2: GET /api/books without q still returns all 50 books (unchanged)', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
    expect(res.body[0]).toHaveProperty('title');
    expect(res.body[0]).toHaveProperty('author');
  });
});

describe('AC3: input is trimmed; trimmed length over 100 returns 400', () => {
  it('AC3: trims whitespace around the query', async () => {
    const res = await request(app).get('/api/books/search').query({ q: '   dune   ' });
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(['Dune']);
  });

  it('AC3: exactly 100 characters is allowed', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'a'.repeat(100) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC3: 101 characters returns 400 with the error body', async () => {
    const res = await request(app).get('/api/books/search').query({ q: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: TOO_LONG });
  });

  it('AC3: length is measured after trimming (100 chars + padding is allowed)', async () => {
    const res = await request(app)
      .get('/api/books/search')
      .query({ q: `   ${'a'.repeat(100)}   ` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC3: 101 chars after trimming is rejected even with padding', async () => {
    const res = await request(app)
      .get('/api/books/search')
      .query({ q: `  ${'a'.repeat(101)}  ` });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: TOO_LONG });
  });

  it('AC3: repeated q parameters return 400 "must be a string"', async () => {
    const res = await request(app).get('/api/books/search?q=a&q=b');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: NOT_STRING });
  });

  it('AC3: the alias GET /api/books?q=<101 chars> returns 400 too', async () => {
    const res = await request(app).get('/api/books').query({ q: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: TOO_LONG });
  });

  it('AC3: the alias with repeated q returns 400 "must be a string"', async () => {
    const res = await request(app).get('/api/books?q=a&q=b');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: NOT_STRING });
  });

  it('AC3: the alias with exactly 100 characters is allowed', async () => {
    const res = await request(app).get('/api/books').query({ q: 'a'.repeat(100) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('AC4: SQL is parameterised (behavioural proof)', () => {
  it("AC4: injection string \"' OR 1=1 --\" returns 200 and no rows", async () => {
    const res = await request(app).get('/api/books/search').query({ q: "' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC4: a stacked DROP TABLE is treated as data and the books survive', async () => {
    const res = await request(app)
      .get('/api/books/search')
      .query({ q: "'; DROP TABLE books; --" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    const all = await request(app).get('/api/books');
    expect(all.body).toHaveLength(50);
  });

  it('AC4: the injection string through the alias returns no rows', async () => {
    const res = await request(app).get('/api/books').query({ q: "x' OR '1'='1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC4: LIKE wildcards % and _ match literally', async () => {
    for (const q of ['%', '_', 'D%e', 'D_ne']) {
      const res = await request(app).get('/api/books/search').query({ q });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
  });

  it('AC4: a backslash query does not error', async () => {
    const res = await request(app).get('/api/books/search').query({ q: '\\' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC4: apostrophes in a legitimate query work', async () => {
    const res = await request(app).get('/api/books/search').query({ q: "Ender's" });
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toEqual(["Ender's Game"]);
  });
});
