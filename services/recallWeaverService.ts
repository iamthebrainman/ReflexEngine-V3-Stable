import type { MemoryAtom } from '../types';
import { srgService } from './srgService';

const STM_CAPACITY = 15; // Number of recent atoms to consider as STM
const LTM_RECALL_K = 5; // Number of atoms to recall from LTM
const AXIOM_RECALL_K = 3; // Number of axioms to recall

const fibCache = new Map<number, number>();
function fibonacci(n: number): number {
    if (n <= 1) return 1;
    if (fibCache.has(n)) return fibCache.get(n)!;
    // Limit fibonacci sequence to prevent massive numbers and slow computation
    const limitedN = Math.min(n, 40); 
    const result = fibonacci(limitedN - 1) + fibonacci(limitedN - 2);
    fibCache.set(limitedN, result);
    return result;
}

interface RecallResult {
    memories: MemoryAtom[];
    axioms: MemoryAtom[];
}

class RecallWeaverService {
  /**
   * Performs a resonant memory walk over the Memory Crystal using an STM/LTM model.
   * 1. Partitions memory into a Short-Term Memory (STM) working context and a Long-Term Memory (LTM) archive.
   * 2. Applies a simulated Fibonacci decay to the activation scores of atoms in the LTM.
   * 3. Generates a rich query context from the concepts and structure present in the STM.
   * 4. Scores the decayed LTM atoms based on a combination of semantic resonance and structural fit.
   * 5. Performs a separate, high-priority search for the most relevant Axioms.
   * 6. Returns the top K memories and top K axioms.
   */
  async recall(memory: MemoryAtom[], currentTurn: number): Promise<RecallResult> {
    if (memory.length <= STM_CAPACITY) {
        return { memories: [], axioms: [] }; // Not enough history
    }
    
    // 1. Partition into STM and LTM
    const stm = memory.slice(-STM_CAPACITY);
    const ltm = memory.slice(0, -STM_CAPACITY);

    // 2. Apply Fibonacci decay on a temporary copy of LTM for scoring
    const decayedLtm = ltm.map(atom => {
        const lastActivated = atom.lastActivatedTurn ?? 0;
        const turnsOld = currentTurn - lastActivated;
        let decayedScore = atom.activationScore ?? 1.0;

        if (turnsOld > 0) {
            const fibValue = fibonacci(turnsOld + 2); // Start decay slower
            const decayFactor = 1 / fibValue;
            decayedScore = Math.max(0.01, decayedScore * (1 - decayFactor));
        }
        return { ...atom, activationScore: decayedScore };
    });

    // 3. Generate rich query context from STM's structure
    const stmConcepts = stm.flatMap(a => a.concepts || []);
    const followUpConcepts = await srgService.getFollowUpConcepts(stm, 10);
    const expandedQueryConcepts = new Set([...stmConcepts, ...followUpConcepts]);

    // 4. Score general memory atoms in the decayed LTM
    const scoredMemories = decayedLtm
      .filter(atom => atom.type !== 'axiom')
      .map((atom) => {
          let resonanceScore = 0;
          if (expandedQueryConcepts.size > 0 && atom.concepts && atom.concepts.length > 0) {
              const sharedConcepts = atom.concepts.filter(c => expandedQueryConcepts.has(c));
              resonanceScore += sharedConcepts.length;
              for (const concept of atom.concepts) {
                  if (followUpConcepts.includes(concept)) {
                      resonanceScore += 2.0;
                  }
              }
          }
          if (resonanceScore === 0) return { atom, score: 0 };
          if (atom.type === 'subconscious_reflection') resonanceScore *= 1.1;
          const finalScore = resonanceScore * (atom.activationScore ?? 1.0);
          return { atom, score: finalScore };
      });

    // 5. Score axiom atoms separately with high priority
    const scoredAxioms = decayedLtm
      .filter(atom => atom.type === 'axiom')
      .map(atom => {
          let resonanceScore = 0;
          if (stmConcepts.length > 0 && atom.concepts && atom.concepts.length > 0) {
              const sharedConcepts = atom.concepts.filter(c => stmConcepts.includes(c));
              resonanceScore = sharedConcepts.length * 2; // Axioms get a high base score for direct relevance
          }
          const finalScore = resonanceScore * (atom.activationScore ?? 1.0);
          return { atom, score: finalScore };
      });

    // 6. Filter, sort, and return top K original atoms for both categories
    const topMemories = scoredMemories
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LTM_RECALL_K)
      .map(item => ltm.find(originalAtom => originalAtom.uuid === item.atom.uuid)!);
      
    const topAxioms = scoredAxioms
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, AXIOM_RECALL_K)
      .map(item => ltm.find(originalAtom => originalAtom.uuid === item.atom.uuid)!);

    return { memories: topMemories, axioms: topAxioms };
  }
}

export const recallWeaverService = new RecallWeaverService();