import type { MemoryAtom, BackgroundInsight } from '../types';
import { generateText, runGoogleSearch, BACKGROUND_COGNITION_PROMPT } from './geminiService';

class BackgroundCognitionService {
  /**
   * Analyzes conversation history to generate a search query, executes the search,
   * and returns a structured insight.
   * @param history A list of MemoryAtoms from the conversation.
   * @returns A BackgroundInsight object or null if no insight was generated.
   */
  async runCognitionCycle(history: MemoryAtom[]): Promise<BackgroundInsight | null> {
    if (history.length < 4) { // Need some context to work with
      return null;
    }

    try {
      // 1. Distill a "desire" (search query) from the conversation.
      // FIX: To prevent token limit errors, only use the most recent part of the conversation history.
      const recentHistory = history.slice(-20);
      const conversationText = recentHistory
        // FIX: Filter for actual conversation messages to prevent the insight loop from feeding on its own output.
        .filter(m => m.type === 'user_message' || m.type === 'model_response')
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
        .join('\n');
      
      if (!conversationText.trim()) {
        // Don't run if there's no actual conversation in the recent history
        return null;
      }
      
      const query = await generateText(conversationText, BACKGROUND_COGNITION_PROMPT);

      if (!query || query.trim() === '') {
        console.log("Background cognition: No query generated.");
        return null;
      }
      
      console.log(`Background cognition: Generated query - "${query}"`);

      // 2. Execute the search using the distilled query.
      const searchResult = await runGoogleSearch(query);
      const insightText = searchResult.text;
      
      const groundingChunks = searchResult.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      // CRITICAL FIX: This logic correctly filters for valid web sources WHILE preserving
      // the necessary `{ web: { ... } }` object structure that the UI expects.
      // The previous bug was stripping this `web` wrapper, causing the render crash.
      const sources = groundingChunks
        .filter((chunk): chunk is { web: { uri: string; title: string } } => 
            !!chunk && !!chunk.web?.uri && !!chunk.web.title
        );

      if (!insightText || insightText.trim() === '') {
        console.log("Background cognition: Search returned no text insight.");
        return null;
      }

      return {
        query,
        insight: insightText,
        sources,
      };

    } catch (e) {
      console.error("Background Cognition Cycle failed:", e);
      return null;
    }
  }
}

export const backgroundCognitionService = new BackgroundCognitionService();