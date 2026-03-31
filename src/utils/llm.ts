// Safe LLM JSON parsing with validation

export function safeParseLLMJson<T>(raw: string, label: string): T {
  const cleaned = raw
    .replace(/^```json?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from mixed content
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        throw new Error(`[${label}] Failed to parse LLM JSON response`);
      }
    }
    throw new Error(`[${label}] No valid JSON found in LLM response`);
  }
}
