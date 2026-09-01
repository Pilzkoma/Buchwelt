import { Book, WishlistItem } from '@/types';

export interface ScoredBook {
  id: string;
  title: string;
  author: string;
  cover_url?: string | null;
  tags: string[];
  score: number;
  source: 'library' | 'wishlist';
}

/** Build a tag → weight map from finished books. Each tag is weighted by the book's star rating (default 3). */
export function scoreTagAffinity(
  finishedBooks: Pick<Book, 'ranking' | 'tags'>[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const book of finishedBooks) {
    const weight = book.ranking ?? 3;
    for (const tag of book.tags ?? []) {
      map[tag] = (map[tag] ?? 0) + weight;
    }
  }
  return map;
}

/** Score and sort unread library books + wishlist items by tag affinity.
 *  If selectedTags is non-empty, only items matching ≥1 tag are returned. */
export function scoreAndSortBooks(
  unreadBooks: Pick<Book, 'id' | 'title' | 'author' | 'cover_url' | 'tags'>[],
  wishlistItems: Pick<WishlistItem, 'id' | 'title' | 'author' | 'cover_url'>[],
  affinityMap: Record<string, number>,
  selectedTags: string[]
): ScoredBook[] {
  const libraryScored: ScoredBook[] = unreadBooks.map(b => ({
    id: b.id,
    title: b.title,
    author: b.author,
    cover_url: b.cover_url,
    tags: b.tags ?? [],
    score: (b.tags ?? []).reduce((sum, tag) => sum + (affinityMap[tag] ?? 0), 0),
    source: 'library',
  }));

  const wishlistScored: ScoredBook[] = wishlistItems.map(w => ({
    id: w.id,
    title: w.title,
    author: w.author,
    cover_url: w.cover_url,
    tags: [],
    score: 0,
    source: 'wishlist',
  }));

  let combined = [...libraryScored, ...wishlistScored];

  if (selectedTags.length > 0) {
    combined = combined.filter(b => selectedTags.some(t => b.tags.includes(t)));
  }

  return combined.sort((a, b) => {
    const aTagged = a.tags.length > 0;
    const bTagged = b.tags.length > 0;
    if (aTagged !== bTagged) return aTagged ? -1 : 1;
    if (!aTagged) return a.title.localeCompare(b.title);
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });
}
