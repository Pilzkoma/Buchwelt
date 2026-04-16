import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

const GENERIC_TERMS = new Set([
  'General',
  'Allgemein',
  'Misc',
  'Miscellaneous',
  'Other',
  'Sonstiges',
]);

const MAX_TAGS_PER_BOOK = 20;

export async function fetchGoogleBooksTags(
  title: string,
  author: string
): Promise<string[]> {
  const t = title?.trim();
  const a = author?.trim();
  if (!t || !a) return [];

  const q = encodeURIComponent(`intitle:${t} inauthor:${a}`);
  const url = `${GOOGLE_BOOKS_URL}?q=${q}&maxResults=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const categories: string[] = data.items?.[0]?.volumeInfo?.categories ?? [];
    return extractTagsFromCategories(categories);
  } catch {
    return [];
  }
}

function extractTagsFromCategories(categories: string[]): string[] {
  const tags = new Set<string>();
  for (const cat of categories) {
    for (const part of cat.split('/')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (GENERIC_TERMS.has(trimmed)) continue;
      tags.add(trimmed);
    }
  }
  return Array.from(tags);
}

export function mergeTags(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  const merged = [...existing];
  for (const tag of incoming) {
    if (set.has(tag)) continue;
    if (merged.length >= MAX_TAGS_PER_BOOK) break;
    merged.push(tag);
    set.add(tag);
  }
  return merged;
}

/** Fire-and-forget: fetch Google Books genre tags for a newly-inserted book row and merge them into its tags column. */
export async function enrichBookWithGoogleBooksTags(
  bookId: string,
  title: string,
  author: string
): Promise<void> {
  try {
    const tags = await fetchGoogleBooksTags(title, author);
    if (tags.length === 0) return;
    const { data: current } = await supabase
      .from('books')
      .select('tags')
      .eq('id', bookId)
      .maybeSingle();
    const merged = mergeTags(current?.tags ?? [], tags);
    if (merged.length === (current?.tags?.length ?? 0)) return;
    await supabase.from('books').update({ tags: merged }).eq('id', bookId);
  } catch {
    // Non-critical enrichment — silently ignore network / DB errors.
  }
}

const GOOGLE_BOOKS_SYNC_KEY = 'google_books_sync_timestamp';
const SYNC_REQUEST_DELAY_MS = 300;

export { GOOGLE_BOOKS_SYNC_KEY };

/** Background migration: fetch Google Books genre tags for all library books.
 *  On first run: all books. On later runs: only books created since last sync. */
export async function syncGoogleBooksTagsForAllBooks(): Promise<void> {
  try {
    const last = await AsyncStorage.getItem(GOOGLE_BOOKS_SYNC_KEY);

    let query = supabase.from('books').select('id, title, author, tags, created_at');
    if (last) query = query.gt('created_at', last);

    const { data: books, error } = await query;
    if (error) return;

    if (!books || books.length === 0) {
      await AsyncStorage.setItem(GOOGLE_BOOKS_SYNC_KEY, new Date().toISOString());
      return;
    }

    for (const book of books) {
      try {
        const fetched = await fetchGoogleBooksTags(book.title, book.author);
        if (fetched.length > 0) {
          const existing = book.tags ?? [];
          const merged = mergeTags(existing, fetched);
          if (merged.length > existing.length) {
            await supabase.from('books').update({ tags: merged }).eq('id', book.id);
          }
        }
      } catch {
        // Per-book failure is fine — continue with the rest.
      }
      await new Promise(resolve => setTimeout(resolve, SYNC_REQUEST_DELAY_MS));
    }

    await AsyncStorage.setItem(GOOGLE_BOOKS_SYNC_KEY, new Date().toISOString());
  } catch {
    // Silent — migration is best-effort.
  }
}
