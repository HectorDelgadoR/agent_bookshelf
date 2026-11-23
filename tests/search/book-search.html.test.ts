import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import app from '../../src/server.js';
import { initDb, closeDb } from '../../src/db/index.js';

let dbPath: string;

beforeEach(async () => {
  dbPath = join(tmpdir(), `book-search-html-${process.pid}-${Date.now()}.db`);
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

const cardCount = (html: string) => (html.match(/class="book-card"/g) ?? []).length;

describe('AC1: GET /books/search returns a book-card fragment', () => {
  it('AC1: returns 200 HTML with a book-grid containing the matching card', async () => {
    const res = await request(app).get('/books/search').query({ q: 'dune' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<div class="book-grid">');
    expect(cardCount(res.text)).toBe(1);
    expect(res.text).toContain('Dune');
    expect(res.text).toContain('Frank Herbert');
    expect(res.text).toContain('1965');
  });

  it('AC1: the card links to the book page', async () => {
    const all = await request(app).get('/api/books');
    const dune = all.body.find((b: { title: string }) => b.title === 'Dune');
    const res = await request(app).get('/books/search').query({ q: 'dune' });
    expect(res.text).toContain(`href="/books/${dune.id}"`);
  });

  it('AC1: is a fragment, not a full page (no layout)', async () => {
    const res = await request(app).get('/books/search').query({ q: 'dune' });
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<html/i);
    expect(res.text).not.toMatch(/<!doctype/i);
  });

  it('AC1: matches by author, case-insensitively', async () => {
    const res = await request(app).get('/books/search').query({ q: 'HERBERT' });
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(1);
    expect(res.text).toContain('Dune');
  });

  it('AC1: renders one card per matching book (Andy Weir wrote two), ordered by title', async () => {
    const res = await request(app).get('/books/search').query({ q: 'andy weir' });
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(2);
    expect(res.text).toContain('The Martian');
    expect(res.text).toContain('Project Hail Mary');
    expect(res.text.indexOf('Project Hail Mary')).toBeLessThan(res.text.indexOf('The Martian'));
  });

  it('AC1: no matches returns 200 with the no-results message and no cards', async () => {
    const res = await request(app).get('/books/search').query({ q: 'zzzxyzzy' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<p class="search-message">No books found matching "zzzxyzzy".</p>');
    expect(cardCount(res.text)).toBe(0);
  });

  it('AC1: the placeholder "coming soon" message is gone', async () => {
    const res = await request(app).get('/books/search').query({ q: 'dune' });
    expect(res.text).not.toContain('coming soon');
  });

  it('AC1: the no-results message HTML-escapes the query', async () => {
    const res = await request(app)
      .get('/books/search')
      .query({ q: '<script>alert(1)</script>' });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.text).toContain('search-message');
  });

  it('AC1: an HTML-injection attempt with attributes is escaped', async () => {
    const res = await request(app)
      .get('/books/search')
      .query({ q: '"><img src=x onerror=alert(1)>' });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<img');
    expect(res.text).toContain('&lt;img');
  });
});

describe('AC2: an empty query returns all books', () => {
  it('AC2: no q returns 200 with all 50 cards', async () => {
    const res = await request(app).get('/books/search');
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(50);
  });

  it('AC2: q= returns all 50 cards', async () => {
    const res = await request(app).get('/books/search?q=');
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(50);
  });

  it('AC2: a whitespace-only q returns all 50 cards', async () => {
    const res = await request(app).get('/books/search').query({ q: '    ' });
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(50);
  });
});

describe('AC3: trimming and the 100-character limit', () => {
  it('AC3: trims whitespace around the query', async () => {
    const res = await request(app).get('/books/search').query({ q: '   dune   ' });
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(1);
    expect(res.text).toContain('Dune');
  });

  it('AC3: exactly 100 characters is allowed (200, no-results message)', async () => {
    const res = await request(app).get('/books/search').query({ q: 'a'.repeat(100) });
    expect(res.status).toBe(200);
    expect(res.text).toContain('search-message');
    expect(res.text).toContain('No books found matching');
  });

  it('AC3: 101 characters returns 400 with the error fragment', async () => {
    const res = await request(app).get('/books/search').query({ q: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(`<p class="error">${TOO_LONG}</p>`);
    expect(cardCount(res.text)).toBe(0);
  });

  it('AC3: length is measured after trimming (100 chars + padding is allowed)', async () => {
    const res = await request(app)
      .get('/books/search')
      .query({ q: `   ${'a'.repeat(100)}   ` });
    expect(res.status).toBe(200);
    expect(res.text).toContain('search-message');
    expect(res.text).not.toContain('class="error"');
  });

  it('AC3: 101 chars after trimming is rejected even with padding', async () => {
    const res = await request(app)
      .get('/books/search')
      .query({ q: `  ${'a'.repeat(101)}  ` });
    expect(res.status).toBe(400);
    expect(res.text).toContain(`<p class="error">${TOO_LONG}</p>`);
  });

  it('AC3: repeated q parameters return a 400 error fragment', async () => {
    const res = await request(app).get('/books/search?q=a&q=b');
    expect(res.status).toBe(400);
    expect(res.text).toContain(`<p class="error">${NOT_STRING}</p>`);
  });
});

describe('AC4: SQL is parameterised (behavioural proof)', () => {
  it("AC4: injection string \"' OR 1=1 --\" returns the no-results message, not all books", async () => {
    const res = await request(app).get('/books/search').query({ q: "' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(cardCount(res.text)).toBe(0);
    expect(res.text).toContain('search-message');
  });

  it('AC4: LIKE wildcards % and _ match literally (no cards)', async () => {
    for (const q of ['%', '_', 'D%e', 'D_ne']) {
      const res = await request(app).get('/books/search').query({ q });
      expect(res.status).toBe(200);
      expect(cardCount(res.text)).toBe(0);
      expect(res.text).toContain('search-message');
    }
  });

  it('AC4: a DROP TABLE attempt leaves the data intact', async () => {
    const res = await request(app)
      .get('/books/search')
      .query({ q: "'; DROP TABLE books; --" });
    expect(res.status).toBe(200);
    const all = await request(app).get('/books/search');
    expect(cardCount(all.text)).toBe(50);
  });
});
