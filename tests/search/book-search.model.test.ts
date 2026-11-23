import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { initDb, closeDb } from '../../src/db/index.js';
import * as Book from '../../src/models/book.js';

let dbPath: string;

beforeEach(async () => {
  dbPath = join(tmpdir(), `book-search-model-${process.pid}-${Date.now()}.db`);
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

function titles(books: Book.Book[]): string[] {
  return books.map((b) => b.title);
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('AC1: query matches title or author, partial and case-insensitive', () => {
  it('AC1: matches a partial title', () => {
    expect(titles(Book.searchBooks('pragmat'))).toEqual(['The Pragmatic Programmer']);
  });

  it('AC1: matches a full title', () => {
    expect(titles(Book.searchBooks('Dune'))).toEqual(['Dune']);
  });

  it('AC1: matches a partial author', () => {
    expect(titles(Book.searchBooks('herbert'))).toEqual(['Dune']);
  });

  it('AC1: matches a partial author in the middle of a longer author string', () => {
    expect(titles(Book.searchBooks('Hunt'))).toEqual(['The Pragmatic Programmer']);
  });

  it('AC1: is case-insensitive for titles (upper, lower, mixed)', () => {
    for (const q of ['DUNE', 'dune', 'dUnE']) {
      expect(titles(Book.searchBooks(q))).toEqual(['Dune']);
    }
  });

  it('AC1: is case-insensitive for authors (upper, lower, mixed)', () => {
    for (const q of ['FRANK HERBERT', 'frank herbert', 'fRaNk HeRbErT']) {
      expect(titles(Book.searchBooks(q))).toEqual(['Dune']);
    }
  });

  it('AC1: returns every book by an author with several books (Andy Weir)', () => {
    expect(titles(Book.searchBooks('andy weir'))).toEqual(['Project Hail Mary', 'The Martian']);
  });

  it('AC1: returns every book by an author with several books (Ursula K. Le Guin)', () => {
    expect(titles(Book.searchBooks('le guin'))).toEqual([
      'The Dispossessed',
      'The Left Hand of Darkness',
    ]);
  });

  it('AC1: a query matching several authors returns all of them, ordered by title', () => {
    // "martin": Robert C. Martin (Clean Code), Martin Fowler (Refactoring),
    // George R.R. Martin (A Game of Thrones), Arkady Martine (A Memory Called Empire)
    expect(titles(Book.searchBooks('martin'))).toEqual([
      'A Game of Thrones',
      'A Memory Called Empire',
      'Clean Code',
      'Refactoring',
    ]);
  });

  it('AC1: matches titles containing an apostrophe', () => {
    expect(titles(Book.searchBooks("Ender's"))).toEqual(["Ender's Game"]);
    expect(titles(Book.searchBooks("ender's game"))).toEqual(["Ender's Game"]);
  });

  it('AC1: returns an empty array when nothing matches', () => {
    expect(Book.searchBooks('zzzxyzzy')).toEqual([]);
  });

  it('AC1: results are ordered by title, same ordering as getAllBooks()', () => {
    const res = titles(Book.searchBooks('the'));
    expect(res.length).toBeGreaterThan(5);
    const expected = titles(Book.getAllBooks()).filter((t) => res.includes(t));
    expect(res).toEqual(expected);
  });

  it('AC1: each result is a full Book row', () => {
    const [dune] = Book.searchBooks('dune');
    expect(dune).toMatchObject({
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '978-0441013593',
      published_year: 1965,
    });
    expect(typeof dune.id).toBe('number');
    expect(dune).toHaveProperty('cover_url');
    expect(dune).toHaveProperty('description');
    expect(dune).toHaveProperty('created_at');
  });
});

describe('AC2: an empty query returns all books', () => {
  it('AC2: searchBooks("") returns all 50 books', () => {
    expect(Book.searchBooks('')).toHaveLength(50);
  });

  it('AC2: searchBooks("") equals getAllBooks()', () => {
    expect(Book.searchBooks('')).toEqual(Book.getAllBooks());
  });

  it('AC2: a whitespace-only query returns all books', () => {
    expect(Book.searchBooks('   ')).toEqual(Book.getAllBooks());
    expect(Book.searchBooks(' \t\n ')).toEqual(Book.getAllBooks());
  });

  it('AC2: normalizeSearchQuery maps undefined and null to the empty string', () => {
    expect(Book.normalizeSearchQuery(undefined)).toBe('');
    expect(Book.normalizeSearchQuery(null)).toBe('');
  });
});

describe('AC3: input is trimmed; trimmed length over 100 is a validation error', () => {
  it('AC3: MAX_SEARCH_QUERY_LENGTH is 100', () => {
    expect(Book.MAX_SEARCH_QUERY_LENGTH).toBe(100);
  });

  it('AC3: normalizeSearchQuery trims leading and trailing whitespace', () => {
    expect(Book.normalizeSearchQuery('  dune  ')).toBe('dune');
    expect(Book.normalizeSearchQuery('\t dune \n')).toBe('dune');
    expect(Book.normalizeSearchQuery('   ')).toBe('');
  });

  it('AC3: normalizeSearchQuery keeps inner whitespace', () => {
    expect(Book.normalizeSearchQuery('  frank   herbert ')).toBe('frank   herbert');
  });

  it('AC3: searchBooks trims the query before matching', () => {
    expect(titles(Book.searchBooks('   dune   '))).toEqual(['Dune']);
    expect(titles(Book.searchBooks('\n\therbert\t'))).toEqual(['Dune']);
  });

  it('AC3: a query of exactly 100 characters is allowed', () => {
    const q = 'a'.repeat(100);
    expect(Book.normalizeSearchQuery(q)).toBe(q);
    expect(Book.searchBooks(q)).toEqual([]);
  });

  it('AC3: a query of 101 characters throws SearchQueryError', () => {
    const err = catchError(() => Book.searchBooks('a'.repeat(101)));
    expect(err).toBeInstanceOf(Book.SearchQueryError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('SearchQueryError');
    expect((err as Error).message).toBe('Search query must be 100 characters or fewer');
  });

  it('AC3: normalizeSearchQuery throws SearchQueryError for 101 characters', () => {
    const err = catchError(() => Book.normalizeSearchQuery('a'.repeat(101)));
    expect(err).toBeInstanceOf(Book.SearchQueryError);
    expect((err as Error).message).toBe('Search query must be 100 characters or fewer');
  });

  it('AC3: length is measured after trimming (100 chars + padding is allowed)', () => {
    const q = 'a'.repeat(100);
    expect(Book.normalizeSearchQuery(`   ${q}   `)).toBe(q);
    expect(Book.searchBooks(`   ${q}   `)).toEqual([]);
  });

  it('AC3: 101 chars after trimming is rejected even with padding', () => {
    const err = catchError(() => Book.searchBooks(`  ${'a'.repeat(101)}  `));
    expect(err).toBeInstanceOf(Book.SearchQueryError);
  });

  it('AC3: a non-string value (array) throws SearchQueryError "Search query must be a string"', () => {
    const err = catchError(() => Book.normalizeSearchQuery(['a', 'b']));
    expect(err).toBeInstanceOf(Book.SearchQueryError);
    expect((err as Error).message).toBe('Search query must be a string');
  });

  it('AC3: other non-string values (number, object, boolean) throw SearchQueryError', () => {
    for (const v of [42, { q: 'x' }, true]) {
      const err = catchError(() => Book.normalizeSearchQuery(v));
      expect(err).toBeInstanceOf(Book.SearchQueryError);
      expect((err as Error).message).toBe('Search query must be a string');
    }
  });
});

describe('AC4: SQL is parameterised (behavioural proof)', () => {
  it("AC4: injection string \"' OR 1=1 --\" returns no rows and does not throw", () => {
    expect(Book.searchBooks("' OR 1=1 --")).toEqual([]);
  });

  it('AC4: classic tautology injections return no rows', () => {
    expect(Book.searchBooks("x' OR '1'='1")).toEqual([]);
    expect(Book.searchBooks("%' OR '1'='1")).toEqual([]);
  });

  it('AC4: a stacked DROP TABLE statement is treated as data and the table survives', () => {
    expect(Book.searchBooks("'; DROP TABLE books; --")).toEqual([]);
    expect(Book.getAllBooks()).toHaveLength(50);
  });

  it('AC4: a UNION injection returns no rows', () => {
    expect(Book.searchBooks("' UNION SELECT * FROM books --")).toEqual([]);
  });

  it('AC4: a lone % matches literally, not as a wildcard', () => {
    expect(Book.searchBooks('%')).toEqual([]);
  });

  it('AC4: a lone _ matches literally, not as a single-char wildcard', () => {
    expect(Book.searchBooks('_')).toEqual([]);
  });

  it('AC4: % inside a query is not a wildcard ("D%e" and "Dun%" do not match Dune)', () => {
    expect(Book.searchBooks('D%e')).toEqual([]);
    expect(Book.searchBooks('Dun%')).toEqual([]);
  });

  it('AC4: _ inside a query is not a wildcard ("D_ne" does not match Dune)', () => {
    expect(Book.searchBooks('D_ne')).toEqual([]);
    expect(Book.searchBooks('Fran_ Herbert')).toEqual([]);
  });

  it('AC4: a backslash is matched literally and does not throw', () => {
    expect(Book.searchBooks('\\')).toEqual([]);
    expect(Book.searchBooks('Dune\\')).toEqual([]);
    expect(Book.searchBooks('\\%')).toEqual([]);
  });

  it('AC4: a double quote and semicolon are harmless', () => {
    expect(Book.searchBooks('"; --')).toEqual([]);
  });

  it('AC4: a literal % is found when stored data contains it (escaping works both ways)', () => {
    Book.createBook({
      title: '100% Pure Testing',
      author: 'Tess Ter',
      isbn: null,
      cover_url: null,
      description: null,
      published_year: null,
    });
    expect(titles(Book.searchBooks('100%'))).toEqual(['100% Pure Testing']);
    expect(titles(Book.searchBooks('%'))).toEqual(['100% Pure Testing']);
    expect(Book.searchBooks('1%0')).toEqual([]);
  });
});
