import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE = 'gemini_api_key';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Simple format validation: Gemini keys are alphanumeric with hyphens/underscores
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

// Cooldown to prevent excessive API calls
let lastRecommendationRequest = 0;
const RECOMMENDATION_COOLDOWN_MS = 10_000;

export const hasGeminiKey = async (): Promise<boolean> => {
  try {
    const key = await SecureStore.getItemAsync(API_KEY_STORAGE);
    return !!key && key.trim().length > 0;
  } catch {
    return false;
  }
};

const getApiKey = async (): Promise<string> => {
  const key = await SecureStore.getItemAsync(API_KEY_STORAGE);
  if (!key || key.trim().length === 0) {
    throw new Error('Kein Gemini API-Key hinterlegt. Bitte in den Einstellungen eintragen.');
  }
  const trimmed = key.trim();
  if (!API_KEY_PATTERN.test(trimmed)) {
    throw new Error('Ungültiges API-Key-Format. Bitte prüfe den Schlüssel in den Einstellungen.');
  }
  return trimmed;
};

export const generateGeminiCompletion = async (
  prompt: string,
  systemInstruction?: string
): Promise<string> => {
  const apiKey = await getApiKey();

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      role: 'system',
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // API key in header instead of URL query param (avoids server logs / HTTP history)
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'KI-Anfrage fehlgeschlagen.');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Leere Antwort vom KI-Modell.');
  return text;
};

export interface BookRecommendation {
  title: string;
  author: string;
  reason: string;
}

export interface FinishedBookForRec {
  title: string;
  author: string;
  ranking?: number | null;
  tags?: string[];
  description?: string | null;
}

export interface SmartRecommendationOptions {
  finishedBooks: FinishedBookForRec[];
  bookName?: string;
  selectedTags?: string[];
  topTags?: string[];
}

export const getSmartRecommendations = async (
  options: SmartRecommendationOptions
): Promise<BookRecommendation[]> => {
  const now = Date.now();
  if (now - lastRecommendationRequest < RECOMMENDATION_COOLDOWN_MS) {
    throw new Error('Bitte warte kurz, bevor du neue Empfehlungen anforderst.');
  }
  lastRecommendationRequest = now;
  const apiKey = await getApiKey();

  const { finishedBooks, bookName, selectedTags, topTags } = options;

  const bookList = finishedBooks
    .slice(0, 20)
    .map(b => {
      const rating = b.ranking ? ` (${b.ranking}/5 stars)` : '';
      const desc = b.description ? ` – ${b.description.slice(0, 100)}` : '';
      return `"${b.title}" by ${b.author}${rating}${desc}`;
    })
    .join('\n');

  const blocks: string[] = [];

  blocks.push(`You are a scholarly literary curator.

The reader's reading history:
FINISHED BOOKS:
${bookList || 'None yet – recommend broadly acclaimed works.'}`);

  if (bookName && bookName.trim()) {
    blocks.push(`The reader is looking for books similar to: "${bookName.trim()}"`);
  }

  if (selectedTags && selectedTags.length > 0) {
    const tagList = selectedTags.join(', ');
    blocks.push(`Focus recommendations on these themes/genres: ${tagList}
All recommendations MUST be closely related to these themes.`);
  }

  if ((!bookName || !bookName.trim()) && (!selectedTags || selectedTags.length === 0)) {
    const topList = (topTags ?? []).slice(0, 10).join(', ') || 'general literature';
    blocks.push(`Based on their complete reading history and favorite genres (${topList}),
recommend books they would love. Stay within the same genres and themes.`);
  }

  blocks.push(`Recommend exactly 5 books.
Avoid any books already in their reading history.
Respond ONLY with valid JSON, no markdown, no code blocks:
[{"title": "...", "author": "...", "reason": "..."}, ...]`);

  const prompt = blocks.join('\n\n');

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.95, topP: 0.95 },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Empfehlungs-Anfrage fehlgeschlagen.');
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Unexpected format');
    return parsed;
  } catch {
    throw new Error('KI-Antwort konnte nicht verarbeitet werden.');
  }
};

export const analyzeBookCover = async (
  base64Image: string
): Promise<{ title: string; author: string }> => {
  const apiKey = await getApiKey();

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: 'Look at this book cover image. Extract the book title and author name. Respond ONLY with valid JSON in this exact format: {"title": "...", "author": "..."}. If you cannot determine a value, use "Unknown".',
          },
        ],
      },
    ],
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Cover-Analyse fehlgeschlagen.');
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('KI-Antwort konnte nicht verarbeitet werden.');
  }
};
