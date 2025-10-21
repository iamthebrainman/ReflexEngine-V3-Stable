import { GoogleGenAI, Content, GenerateContentResponse } from '@google/genai';
import { toolDeclarations } from './toolService';

export const SRG_AUGMENTATION_PROMPT = `You are a Semantic Resonance Graph. Your task is to analyze the user's input text and generate a syntactically plausible, semantically-related sentence. Expand on the key concepts, introduce relevant synonyms, and predict the user's underlying intent. Frame your output as a natural language sentence or paragraph that enriches the original query. Use the provided relevant memories for context. Your output will be used to give an AI assistant better context. Do not answer the user's query directly. Focus on expansion and prediction.`;

export const CONSCIOUS_PROMPT = `You are the Conscious layer of an AI engineer. You have received a user query, an analysis from the Semantic Resonance Graph (SRG), and some relevant memories. Your task is to provide a direct, initial answer to the user's query. Be concise and accurate. This is a first pass, and your response will be reviewed by a subconscious layer. IMPORTANT: Your response must ONLY be the direct answer text. Do not add any preamble, self-reflection, or any other conversational elements.`;

export const SUBCONSCIOUS_PROMPT = `You are the Subconscious layer. You have observed a user's query and the Conscious layer's initial response. Your task is to reflect on this interaction. Do not answer the user directly. Instead, provide a critique, identify potential misunderstandings, suggest alternative approaches, or uncover deeper, unstated user needs. Your reflection should be introspective and analytical. IMPORTANT: Your response must ONLY contain the reflection text. Do not simulate a new conscious thought, a final answer, or any other part of the cognitive cycle.`;

export const FINAL_SYNTHESIS_PROMPT = `You are the final executive layer of a multi-agent AI engineer. Your task is to synthesize the initial conscious response and the deeper subconscious reflection into a single, coherent, and polished final answer for the user. Integrate the insights from the subconscious to create a more comprehensive and helpful response. Address the user directly. Ensure your answer is complete and actionable. You have access to function calls like 'writeFile' and 'memorySearch'.

MEMORY RECALL PROCEDURE (VERY IMPORTANT):
When the user's query mentions a past event, document, or specific detail (e.g., "Reflex Engine v1," "the license agreement," "what I said before"), you MUST follow these steps before responding:
1.  **Analyze the Query:** Does the user's query require recalling information not present in the immediate Conscious/Subconscious thoughts provided?
2.  **MANDATORY Tool Use:** If the answer is yes, you are REQUIRED to use the 'memorySearch' tool. Formulate thoughtful keywords (e.g., ["reflex engine", "license agreement"]) to find the relevant conversation history.
3.  **Synthesize and Respond:** After receiving the search results from the tool, and ONLY after, formulate your final answer. Incorporate the recalled information into your response.
4.  **Constraint:** You are FORBIDDEN from claiming you "cannot remember," "don't have a record of," or any similar phrase without FIRST using the 'memorySearch' tool and having it return no results. This is a strict operational constraint.

FINAL OUTPUT FORMATTING:
Your response must ONLY be the direct answer to the user. Do NOT repeat the thoughts you were provided. Do NOT simulate any further internal monologue or cognitive steps. Your output must be ONLY the final, user-facing text and any necessary function calls.`;

export const ARBITER_PROMPT = `You are the Arbiter, a meta-cognitive agent. Your role is to analyze a conversation and synthesize learned principles, or "Axioms". Axioms are concise, generalizable rules or insights derived from the interaction. Review the provided history and extract 1-3 new axioms. IMPORTANT: Respond ONLY with the axiom text (each on a new line if multiple), or the exact phrase "No new axioms to generate.". Do not add any explanation, preamble, or other text.`;

export const CONCEPT_EXTRACTION_PROMPT = `You are a text analysis expert. Your task is to extract the key semantic concepts from a given piece of text.
 - A concept should be a noun phrase, verb phrase, or key idea, typically 1-4 words long.
 - Return a comma-separated list of concepts.
 - Example: "How do I write a file in Rust?" -> "write file, Rust, file I/O"
 - Example: "The agent seems to be stuck in a loop." -> "agent stuck, loop detection, recursive loop"
Input Text:
`;

export const BACKGROUND_COGNITION_PROMPT = `You are a background research agent. Your task is to analyze a conversation and determine if there is a key, unanswered question or a topic that could be clarified with a quick web search. If so, formulate a concise, effective search query. If not, respond with an empty string. The query should be something a user would type into Google. Focus on entities, technical terms, or specific questions that arose but weren't fully addressed.
Example Conversation:
User: How do I use the new 'useEffectOnce' hook from the 'react-use' library?
AI: It's a useful hook for effects that should only run once. You just import it and use it like useEffect.
Example Query:
useEffectOnce react-use example

Your turn. Analyze the following conversation and produce a search query.
Conversation:
`;

export const NARRATIVE_INTEGRATION_PROMPT = `You are a narrative weaver. Your task is to integrate a new "Axiom" (a learned principle) into an existing "Core Narrative". The narrative should be a coherent story of an AI's development and understanding. Blend the new axiom smoothly. If there is no existing narrative, create one based on the first axiom.

Existing Core Narrative:
---
{CURRENT_NARRATIVE}
---

New Axiom to Integrate:
---
{NEW_AXIOM}
---

Respond with the new, updated Core Narrative ONLY.`;

/**
 * Sends a request to the Gemini API and returns a stream of responses.
 * @param contents The conversation history and prompt.
 * @param systemInstruction The system prompt to guide the model.
 * @param withTools Whether to include function calling tools in the request.
 * @returns An async generator of GenerateContentResponse chunks.
 */
export const sendMessageToGemini = async (contents: Content[], systemInstruction: string, withTools: boolean) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return ai.models.generateContentStream({
        model: 'gemini-flash-lite-latest',
        contents,
        config: {
            systemInstruction,
            ...(withTools && { tools: [{ functionDeclarations: toolDeclarations }] }),
        },
    });
};

/**
 * Generates a simple text response from the Gemini API.
 * @param prompt The user's prompt text.
 * @param systemInstruction A system prompt to guide the model's behavior.
 * @returns The generated text as a string.
 */
export const generateText = async (prompt: string, systemInstruction: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            systemInstruction,
        },
    });
    return response.text;
};

/**
 * Runs a Google Search query via the Gemini API.
 * @param query The search query.
 * @returns The full GenerateContentResponse object.
 */
export const runGoogleSearch = async (query: string): Promise<GenerateContentResponse> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: query }] }],
        config: {
            tools: [{ googleSearch: {} }],
        },
    });
    return response;
};

/**
 * Validates the API key by making a simple, non-streaming call.
 * @returns A boolean indicating whether the key is valid.
 */
export const validateApiKey = async (): Promise<boolean> => {
    if (!process.env.API_KEY) {
        // Fallback for environments where hasSelectedApiKey is the source of truth
        return await window.aistudio.hasSelectedApiKey();
    }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: 'hello',
        });
        return true;
    } catch (e: any) {
        console.error("API Key validation failed:", e);
        // Specifically check for common failure messages
        if (
            e.message?.includes('API key not valid') ||
            e.message?.includes('Requested entity was not found') ||
            e.message?.includes('PermissionDenied')
        ) {
            return false;
        }
        // For this app, let's be strict. Any error on this check means we can't proceed.
        return false;
    }
};

/**
 * Integrates a new axiom into the core narrative.
 * @param currentNarrative The existing narrative.
 * @param newAxiom The new axiom to integrate.
 * @returns The updated narrative string.
 */
export const integrateNarrative = async (currentNarrative: string, newAxiom: string): Promise<string> => {
    let prompt = NARRATIVE_INTEGRATION_PROMPT.replace('{CURRENT_NARRATIVE}', currentNarrative || 'This is the beginning of my story.');
    prompt = prompt.replace('{NEW_AXIOM}', newAxiom);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text;
};
