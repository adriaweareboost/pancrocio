import Groq from 'groq-sdk';
import type { LLMProvider } from '../models/interfaces.js';

export function createGroqProvider(apiKey: string): LLMProvider {
  const groq = new Groq({ apiKey });

  return {
    name: 'groq',

    async generateText(prompt: string): Promise<string> {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4096,
      });
      return response.choices[0]?.message?.content || '';
    },

    async generateWithImage(_prompt: string, _image: Buffer): Promise<string> {
      throw new Error('Groq provider does not support image analysis. Use Gemini instead.');
    },

    async generateJSON<T>(prompt: string): Promise<T> {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a JSON-only responder. Output valid JSON with no markdown, no code blocks, no explanation.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });
      const text = response.choices[0]?.message?.content || '{}';
      return JSON.parse(text) as T;
    },
  };
}
