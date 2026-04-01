import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE = 'gemini_api_key';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  return key.trim();
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

export const getBookRecommendations = async (
  finishedBooks: { title: string; author: string; ranking?: number | null; tags?: string[] }[],
  topTags: string[]
): Promise<BookRecommendation[]> => {
  const apiKey = await getApiKey();

  const bookList = finishedBooks
    .slice(0, 20) // cap context size
    .map(b => `"${b.title}" by ${b.author}${b.ranking ? ` (${b.ranking}/5 stars)` : ''}`)
    .join('\n');

  const tagList = topTags.slice(0, 10).join(', ');

  const prompt = `You are a scholarly literary curator with deep knowledge across all genres and periods.

Based on this reader's library:

FINISHED BOOKS:
${bookList || 'None yet – recommend broadly acclaimed literary works.'}

FAVORITE GENRES / TAGS:
${tagList || 'Not specified'}

Recommend exactly 5 books this reader would love but likely hasn't read yet. Avoid recommending any books already in their list above.

For each recommendation provide:
- A compelling, specific reason in one sentence (scholarly, insightful tone – not generic)

Respond ONLY with valid JSON, no markdown, no code blocks:
[{"title": "...", "author": "...", "reason": "..."}, ...]`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 1.0, topP: 0.95 },
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
