
export interface ProjectFile {
  name: string;
  content: string;
  language: string;
}

// Fix: Add 'axiom' to MemoryAtomType to resolve type errors in arbiterService.ts and recallWeaverService.ts
export type MemoryAtomType = 'user_message' | 'model_response' | 'steward_note' | 'conscious_thought' | 'subconscious_reflection' | 'axiom';

export interface GeneratedFile {
    name: string;
    content: string;
    language: string;
}

export interface MemoryAtom {
  uuid: string;
  timestamp: number;
  role: 'user' | 'model';
  type: MemoryAtomType;
  text: string;
  isInContext: boolean;
  isCollapsed: boolean;
  concepts?: string[];
  generatedFiles?: GeneratedFile[];
  // New properties for STM/LTM with Fibonacci decay
  activationScore?: number;
  lastActivatedTurn?: number;
  // New properties for nesting cognitive artifacts
  cognitiveTrace?: MemoryAtom[];
  backgroundInsight?: BackgroundInsight;
}

export interface SessionState {
    messages: MemoryAtom[];
    projectFiles: ProjectFile[];
    contextFileNames: string[];
    selfNarrative?: string;
}

// New type for background cognition results
export interface BackgroundInsight {
  query: string;
  insight: string;
  sources: { web: { uri: string; title: string } }[];
}

// FIX: Resolved a type collision by defining the `AIStudio` interface and using it on the global `Window` object.
// The previous inline/anonymous type for `aistudio` conflicted with another declaration.
// The `AIStudio` interface is now defined inside the `declare global` block to prevent type conflicts.


declare global {
  // FIX: Moved the AIStudio interface into the `declare global` block to ensure it becomes a single, mergeable global type.
  // This resolves the "Subsequent property declarations must have the same type" error by preventing module-scoped type conflicts.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
