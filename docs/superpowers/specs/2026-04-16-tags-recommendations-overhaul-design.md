# Tags & Recommendations Overhaul — Design Spec

## Overview

Three interconnected features for BuchWelt:

1. **Tag Toggle System** — Replace add/remove with toggle pills + long press edit/delete
2. **Google Books Auto-Tags** — Fetch genres from Google Books API, add as regular tags
3. **Recommendations Screen Overhaul** — Modular KI search sheet, better offline scoring, fixed headline

---

## Feature 1: Tag Toggle System

### Book Detail Screen — Tag Section

**Current behavior:** Tags shown as pills with X icon. Tap X to remove. TextInput to add new tags.

**New behavior:** All app-wide tags shown as toggle pills. Tap to toggle on/off for this book. Long press for global edit/delete.

### Display Logic

Tags are sorted and displayed as follows:

1. **Selected tags** (this book has them) — alphabetically sorted, always visible
2. **Unselected tags** — alphabetically sorted, fill up to 5 visible pills total
3. **Overflow** — remaining unselected tags hidden behind a "Mehr" pill (e.g. "+12 mehr"), tappable to expand
4. **TextInput** remains at the bottom to create new tags

Example with 3 selected tags and 20 total tags:
- Pills 1-3: selected tags (always visible)
- Pills 4-5: first 2 unselected tags (alphabetically)
- Pill 6: "+15 mehr" (expandable, shows remaining unselected alphabetically)

### "Mehr" Pill Expansion

When tapped, the "Mehr" pill expands inline — all remaining unselected tags appear in the same flexWrap container. The "Mehr" pill is replaced by a "Weniger" pill at the end to collapse back. No modal or separate view.

### Visual States

| State | Background | Text Color | Border |
|-------|-----------|------------|--------|
| Selected | `theme.primary` | `#fff` | none |
| Unselected | `theme.surface` | `theme.textSecondary` | `theme.border` |
| "Mehr" pill | `theme.surfaceHighest` | `theme.textSecondary` | `theme.border` |

### Interactions

- **Tap** — Toggle tag on/off for this book. Updates `tags[]` in Supabase immediately.
- **Long Press** — Shows Alert with options:
  - **"Bearbeiten"** — Opens Alert prompt pre-filled with current tag text. On confirm, updates the tag name across ALL books in Supabase (query all books containing old tag, replace with new tag).
  - **"Löschen"** — Confirmation alert. On confirm, removes tag from ALL books in Supabase.
  - **"Abbrechen"** — Dismiss.

### X-Icon Removal

The close/X icon on tag pills is removed entirely. All interaction is via tap (toggle) and long press (edit/delete).

### Home Screen Tag Filter

The tag filter chips on the home/library screen remain as-is (horizontal scroll, toggle to filter). No X icons were present there — no change needed.

---

## Feature 2: Google Books API Integration

### Purpose

Enrich books with genre tags automatically using the free Google Books API. Auto-tags are indistinguishable from manual tags — same array, same behavior.

### API Details

- **Endpoint:** `https://www.googleapis.com/books/v1/volumes?q=intitle:{title}+inauthor:{author}`
- **No API key required** for basic lookups
- **Response field:** `items[0].volumeInfo.categories` — e.g. `["Fiction / Fantasy / General"]`

### Tag Extraction

1. Fetch categories from Google Books API for a book (title + author lookup)
2. Split category strings by ` / ` separator
3. Normalize: trim whitespace, deduplicate
4. Filter out overly generic terms (e.g. "General")
5. Add resulting tags to the book's `tags[]` array, skipping any that already exist
6. Respect existing limits: max 20 tags per book

Example: `"Fiction / Fantasy / General"` becomes `["Fiction", "Fantasy"]` (General filtered out).

### When to Fetch

**On book creation:** Whenever a book is added (scanner, manual entry, wishlist-to-library move), immediately do a Google Books lookup and add genre tags.

**Migration for existing books:**
- On app start, check `AsyncStorage` for `google_books_sync_timestamp`
- If no timestamp: fetch genres for ALL books (first-time migration)
- If timestamp exists: fetch only for books with `created_at > lastSyncTimestamp`
- After sync, update timestamp to current time
- Run in background — no UI blocking
- Optional subtle indicator: "Tags werden aktualisiert..."
- Sequential fetching with small delay between requests to avoid rate issues

---

## Feature 3: Recommendations Screen Overhaul

### Headline Fix

Reduce `fontSize` from 48 to ~36 so "My Recommendations" fits on one line. Keep the existing Newsreader font and italic styling.

### Tab Structure (unchanged concept, refined)

- **Tab 1 "Meine Bücher"** — Offline suggestions based on tag affinity scoring
- **Tab 2 "KI-Empfehlungen"** — AI-powered, with search sheet for targeted queries

### Tab 1: Meine Bücher (Offline)

Scoring uses tag affinity from finished books (weighted by rating). Now improved because Google Books auto-tags give more books meaningful tags.

- Books without any tags sort after tagged books (by title alphabetically as fallback)
- Optional tag filter chips to narrow results
- Shows library books + wishlist items
- Wishlist items now also benefit from Google Books tags

### Tab 2: KI-Empfehlungen

**Auto-load:** On screen open (if Gemini key present), automatically loads general recommendations based on entire reading history. Same as current behavior.

**Search Button:** Prominent button (e.g. "Suche anpassen" with filter/search icon) placed in the tab, opens the search sheet.

### Search Sheet (Bottom Sheet)

**Layout (top to bottom):**
1. **Handle bar** (standard sheet indicator)
2. **Title:** "Empfehlungen anpassen"
3. **TextInput:** Book name (optional). Placeholder: "z.B. Der Hobbit"
4. **Tag selection:** Toggle pills showing all available tags (same visual toggle as book detail, but simpler: all tags visible in a scrollable flexWrap area, no "Mehr" collapsing, no long press — just tap to select/deselect)
5. **Generate button:** "Empfehlungen generieren" — primary style, full width
6. Dismissible via swipe down or tap outside

**On generate:** Sheet dismisses, KI tab shows loading state, then results.

### KI Result Display

**Context banner:** When results come from a targeted search, show a banner/chip row at the top:
- Shows search context: e.g. "Ähnlich wie: Der Hobbit" or "Themen: Fantasy, Abenteuer" or both
- Tappable X/close on the banner → resets to general recommendations (re-fetches)
- No banner when showing general (no-filter) recommendations

**Result cards:** Same design as current AI recommendation cards (numbered, with title/author/reason).

**Actions on AI suggestions:** Tap → Alert with "Wunschliste" / "Library" / "Abbrechen" (unchanged).

**Regenerate button:** Stays at bottom. Text adapts to current context.

### Modular KI Prompt

**Replace** `getBookRecommendations()` and `getTagGuidedRecommendations()` with a single function:

```typescript
interface SmartRecommendationOptions {
  finishedBooks: FinishedBook[];
  bookName?: string;
  selectedTags?: string[];
  topTags?: string[];  // fallback for general recommendations
}

function getSmartRecommendations(options: SmartRecommendationOptions): Promise<BookRecommendation[]>
```

**Prompt construction — modular blocks:**

1. **Base (always):**
   ```
   You are a scholarly literary curator.

   The reader's reading history:
   FINISHED BOOKS:
   {bookList}
   ```

2. **Book name block (if bookName provided):**
   ```
   The reader is looking for books similar to: "{bookName}"
   ```

3. **Tag block (if selectedTags provided):**
   ```
   Focus recommendations on these themes/genres: {tagList}
   All recommendations MUST be closely related to these themes.
   ```

4. **General block (if neither bookName nor selectedTags):**
   ```
   Based on their complete reading history and favorite genres ({topTags}),
   recommend books they would love. Stay within the same genres and themes.
   ```

5. **Rules (always):**
   ```
   Recommend exactly 5 books.
   Avoid any books already in their reading history.
   Respond ONLY with valid JSON, no markdown, no code blocks:
   [{"title": "...", "author": "...", "reason": "..."}, ...]
   ```

**Config:** temperature 0.95, topP 0.95. Cooldown 10 seconds (unchanged).

**Old functions removed:** `getBookRecommendations()` and `getTagGuidedRecommendations()` are deleted and replaced by `getSmartRecommendations()`.

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/book/[id].tsx` | Tag toggle system, long press, remove X icon, "Mehr" pill |
| `app/recommendations.tsx` | Headline size, search sheet, context banner, new AI flow |
| `utils/gemini.ts` | Replace two functions with `getSmartRecommendations()` |
| `utils/recommendationScoring.ts` | Improve fallback sorting for untagged books |
| `utils/googleBooks.ts` | **New file** — Google Books API lookup + tag extraction |
| `app/_layout.tsx` | Trigger migration sync on app start |
| `app/(tabs)/index.tsx` | Tag filter benefits from richer tags (no code change needed) |

---

## Out of Scope

- Tag color coding or visual distinction between auto/manual tags
- Google Books API key management (not needed for basic lookups)
- Offline caching of Google Books responses
- Tag suggestions/autocomplete in TextInput
