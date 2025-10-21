import type { MemoryAtom } from '../types';
import { sendMessageToGemini, ARBITER_PROMPT } from './geminiService';
import { Content } from '@google/genai';

class ArbiterService {
  /**
   * Runs an axiom synthesis cycle.
   * It reviews recent conversation history and calls the Gemini API with the Arbiter prompt
   * to generate the text for a new learned principle (Axiom).
   * @param history A list of recent MemoryAtoms to be reviewed.
   * @returns The text for a new axiom if synthesis is successful, otherwise null.
   */
  async runSynthesisCycle(history: MemoryAtom[]): Promise<string | null> {
    if (history.length === 0) {
      return null;
    }

    // Use a subset of history to keep the context manageable
    const relevantHistory = history.slice(-10); 
    const userInstruction = 'Review the preceding conversation history and generate 1-3 new, concise Axioms (learned principles).';

    const contents: Content[] = relevantHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userInstruction }] });

    try {
      const arbiterStream = await sendMessageToGemini(contents, ARBITER_PROMPT, false);
      let arbiterText = '';
      for await (const chunk of arbiterStream) {
        if (chunk.text) {
          arbiterText += chunk.text;
        }
      }
      
      const trimmedText = arbiterText.trim();

      if (trimmedText && !trimmedText.toLowerCase().includes("no new axioms")) {
        return trimmedText;
      }
      return null;
    } catch (e) {
      console.error("Arbiter synthesis cycle failed:", e);
      return null;
    }
  }
}

export const arbiterService = new ArbiterService();