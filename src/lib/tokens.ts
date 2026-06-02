// Simple token estimation (rough approximation)
// Chinese characters: ~1 token per character
// English words: ~0.75 tokens per word
// Punctuation: ~0.1 tokens per character

export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let inWord = false;
  let wordLength = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Chinese/Japanese/Korean characters (roughly 1 token each)
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 1;
      inWord = false;
    }
    // English letters
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      if (!inWord) {
        inWord = true;
        wordLength = 0;
      }
      wordLength++;
    }
    // Numbers
    else if (code >= 48 && code <= 57) {
      if (!inWord) {
        inWord = true;
        wordLength = 0;
      }
      wordLength++;
    }
    // Whitespace or punctuation
    else {
      if (inWord) {
        tokens += Math.ceil(wordLength * 0.75);
        inWord = false;
      }
      tokens += 0.1; // Punctuation
    }
  }

  // Handle last word
  if (inWord) {
    tokens += Math.ceil(wordLength * 0.75);
  }

  return Math.ceil(tokens);
}

export const MAX_INPUT_TOKENS = 4000;
export const MAX_INPUT_CHARS = 5000;

export function validateInputLength(text: string): {
  valid: boolean;
  tokenCount: number;
  charCount: number;
  error?: string;
} {
  const tokenCount = estimateTokens(text);
  const charCount = text.length;

  if (charCount > MAX_INPUT_CHARS) {
    return {
      valid: false,
      tokenCount,
      charCount,
      error: `输入内容太长，请控制在 ${MAX_INPUT_CHARS} 字以内。`,
    };
  }

  if (tokenCount > MAX_INPUT_TOKENS) {
    return {
      valid: false,
      tokenCount,
      charCount,
      error: "输入内容太长，请精简后再发送。",
    };
  }

  return {
    valid: true,
    tokenCount,
    charCount,
  };
}
