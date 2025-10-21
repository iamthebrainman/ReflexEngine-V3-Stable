import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { generateText, CONCEPT_EXTRACTION_PROMPT, SRG_AUGMENTATION_PROMPT } from './geminiService';
import type { MemoryAtom } from '../types';

// The graph now stores directed transitions between concepts tagged with their atom type.
// Key: 'type:concept', Value: Map<'type:concept', weight>
type ConceptGraph = Map<string, Map<string, number>>;

interface SRGDB extends DBSchema {
  srgGraph: {
    key: string;
    value: ConceptGraph;
  };
}

class SrgService {
  private dbPromise: Promise<IDBPDatabase<SRGDB>>;
  private graph: ConceptGraph = new Map();
  private isLoaded = false;
  private saveTimeout: number | null = null;

  constructor() {
    this.dbPromise = openDB<SRGDB>('ReflexEngineSRG', 1, {
      upgrade(db) {
        db.createObjectStore('srgGraph');
      },
    });
    this.loadGraph();
  }

  private async loadGraph(): Promise<void> {
    try {
      const db = await this.dbPromise;
      const storedGraph = await db.get('srgGraph', 'main');
      if (storedGraph) {
        this.graph = storedGraph;
      }
      this.isLoaded = true;
      console.log('Concept Graph loaded from IndexedDB.');
    } catch (error) {
      console.error('Failed to load Concept graph:', error);
    }
  }

  private async saveGraph(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    // Debounce save operations to avoid excessive DB writes
    this.saveTimeout = window.setTimeout(async () => {
        try {
            const db = await this.dbPromise;
            await db.put('srgGraph', this.graph, 'main');
        } catch (error) {
            console.error('Failed to save Concept graph:', error);
        }
    }, 1000);
  }

  async generateSrgAugmentation(text: string, memories: MemoryAtom[]): Promise<string> {
    const memoryContext = memories.length > 0
        ? `\n\nFor context, here are some relevant memories:\n${memories.map(m => `> ${m.text.substring(0, 150)}...`).join('\n')}`
        : '';
    const prompt = `${text}${memoryContext}`;
    return generateText(prompt, SRG_AUGMENTATION_PROMPT);
  }

  async extractConcepts(text: string): Promise<string[]> {
    if (!text || text.trim().length < 10) {
      return [];
    }
    try {
      const conceptString = await generateText(text, CONCEPT_EXTRACTION_PROMPT);
      if (!conceptString) return [];
      return conceptString.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    } catch (e) {
      console.error("Failed to extract concepts:", e);
      return [];
    }
  }
  
  async trainOnTransition(sourceAtom: MemoryAtom, targetAtom: MemoryAtom): Promise<void> {
    if (!this.isLoaded) await this.loadGraph();

    const sourceConcepts = sourceAtom.concepts || await this.extractConcepts(sourceAtom.text);
    const targetConcepts = targetAtom.concepts || await this.extractConcepts(targetAtom.text);

    if (!sourceConcepts || sourceConcepts.length === 0 || !targetConcepts || targetConcepts.length === 0) return;

    for (const sConcept of sourceConcepts) {
      const sourceKey = `${sourceAtom.type}:${sConcept}`;
      if (!this.graph.has(sourceKey)) this.graph.set(sourceKey, new Map());
      const transitions = this.graph.get(sourceKey)!;

      for (const tConcept of targetConcepts) {
        const targetKey = `${targetAtom.type}:${tConcept}`;
        // This creates a directed link from a source concept/type to a target concept/type
        transitions.set(targetKey, (transitions.get(targetKey) || 0) + 1);
      }
    }
    this.saveGraph();
  }

  async getFollowUpConcepts(sourceAtoms: MemoryAtom[], topK: number = 10): Promise<string[]> {
    if (!this.isLoaded) await this.loadGraph();
    const associations = new Map<string, number>();
    const originalConcepts = new Set<string>();

    for (const atom of sourceAtoms) {
      const concepts = atom.concepts || [];
      for (const concept of concepts) {
        originalConcepts.add(concept);
        const sourceKey = `${atom.type}:${concept}`;
        
        if (this.graph.has(sourceKey)) {
          const transitions = this.graph.get(sourceKey)!;
          for (const [followUpKey, weight] of transitions.entries()) {
            // followUpKey is 'type:concept'. We just want the concept part for recall.
            const followUpConcept = followUpKey.split(':').slice(1).join(':');
            associations.set(followUpConcept, (associations.get(followUpConcept) || 0) + weight);
          }
        }
      }
    }
    
    // Exclude original concepts from the final list to find new, related ideas
    for (const concept of originalConcepts) {
        associations.delete(concept);
    }

    return [...associations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(entry => entry[0]);
  }
}

export const srgService = new SrgService();