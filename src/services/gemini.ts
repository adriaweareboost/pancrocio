import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider } from '../models/interfaces.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const DELAY_BETWEEN_CALLS_MS = 200; // Minimal delay — each provider has its own key/queue
const CALL_TIMEOUT_MS = 30000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = pending.then(
      () => delay(DELAY_BETWEEN_CALLS_MS).then(fn),
      () => delay(DELAY_BETWEEN_CALLS_MS).then(fn),
    );
    pending = result.then(() => {}, () => {});
    return result as Promise<T>;
  };
}

/** Execute directly without queue — for parallel batch operations like translation. */
function directCall<T>(fn: () => Promise<T>, label: string): Promise<T> {
  return withRetry(fn, label);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[Gemini] ${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(fn(), CALL_TIMEOUT_MS, label);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED');

      if (!isRateLimit || attempt === MAX_RETRIES) {
        throw error;
      }

      const waitMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 15000);
      console.log(`[Gemini] ${label} rate limited, retrying in ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await delay(waitMs);
    }
  }
  throw new Error('Unreachable');
}

export function createGeminiProvider(apiKey: string): LLMProvider {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  const enqueue = createQueue();

  return {
    name: 'gemini',

    async generateText(prompt: string): Promise<string> {
      return enqueue(() =>
        withRetry(async () => {
          const result = await model.generateContent(prompt);
          return result.response.text();
        }, 'generateText')
      );
    },

    async generateWithImage(prompt: string, image: Buffer): Promise<string> {
      return enqueue(() =>
        withRetry(async () => {
          const imagePart = {
            inlineData: {
              data: image.toString('base64'),
              mimeType: 'image/jpeg' as const,
            },
          };
          const result = await model.generateContent([prompt, imagePart]);
          return result.response.text();
        }, 'generateWithImage')
      );
    },

    async generateJSON<T>(prompt: string): Promise<T> {
      return enqueue(() =>
        withRetry(async () => {
          const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.`;
          const result = await model.generateContent(jsonPrompt);
          const text = result.response.text().trim();
          const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
          return JSON.parse(cleaned) as T;
        }, 'generateJSON')
      );
    },

    /** Direct call bypassing queue — use for parallel batch operations. */
    async generateJSONDirect<T>(prompt: string): Promise<T> {
      return directCall(async () => {
        const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.`;
        const result = await model.generateContent(jsonPrompt);
        const text = result.response.text().trim();
        const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        return JSON.parse(cleaned) as T;
      }, 'generateJSONDirect');
    },
  };
}
