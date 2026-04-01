// ─── Reading Status ───────────────────────────────────────────────────────────
export type ReadingStatus = 'not_read' | 'reading' | 'finished' | 'abandoned';

// ─── Book ─────────────────────────────────────────────────────────────────────
export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string | null;
  cover_url?: string | null;
  description?: string | null;
  reading_status: ReadingStatus;
  is_read?: boolean; // legacy field – use reading_status
  ranking?: number | null;
  tags?: string[];
  current_page?: number | null;
  total_pages?: number | null;
  finished_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Book Input (for inserts / scanner) ──────────────────────────────────────
export interface BookInput {
  title: string;
  author: string;
  isbn?: string | null;
  cover_url?: string | null;
  description?: string | null;
  total_pages?: number | null;
}

// ─── Wishlist Item ────────────────────────────────────────────────────────────
export interface WishlistItem {
  id: string;
  title: string;
  author: string;
  isbn?: string | null;
  cover_url?: string | null;
  description?: string | null;
  user_id?: string;
  added_at?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface BarData {
  label: string;
  count: number;
}
