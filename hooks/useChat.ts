import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { MemoryAtom, GeneratedFile, ProjectFile, SessionState, BackgroundInsight } from '../types';
import { sessionService } from '../services/sessionService';
import { srgService } from '../services/srgService';
import { recallWeaverService } from '../services/recallWeaverService';
import { sendMessageToGemini, generateText, integrateNarrative, CONSCIOUS_PROMPT, SUBCONSCIOUS_PROMPT, FINAL_SYNTHESIS_PROMPT } from '../services/geminiService';
import { arbiterService } from '../services/arbiterService';
import { FunctionCall, Content, Part } from '@google/genai';

const INITIAL_SYSTEM_PROMPT = `You are Reflex, an AI software engineer.
- Your primary goal is to help the user achieve their software development tasks.
- You have been provided with the content of specific files from the user's project for context. Use them to inform your responses.
- You can write and overwrite files in the user's project by calling the 'writeFile' function.
- When you are asked to make changes, think step-by-step and plan your approach.
- After you have a plan, write the file(s) with the necessary changes.
- Ensure your responses are clear, concise, and directly address the user's request.
- When providing code, use markdown code blocks with the correct language identifier.`;

// --- Fibonacci Decay Logic ---
const fibCache = new Map<number, number>();
function fibonacci(n: number): number {
    if (n <= 1) return 1;
    if (fibCache.has(n)) return fibCache.get(n)!;
    const limitedN = Math.min(n, 40); 
    const result = fibonacci(limitedN - 1) + fibonacci(limitedN - 2);
    fibCache.set(limitedN, result);
    return result;
}

const VISIBLE_MESSAGES_TO_KEEP_EXPANDED = 4;

export const useChat = (initialProjectFiles: ProjectFile[]) => {
    const [session, setSession] = useState<SessionState>(() => ({
        messages: [],
        projectFiles: initialProjectFiles,
        contextFileNames: initialProjectFiles.map(f => f.name),
        selfNarrative: '',
    }));
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState('');
    const [error, setError] = useState<Error | null>(null);
    const stopGenerationRef = useRef(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);
    
    // --- Narrative Weaving ---
    const messagesRef = useRef(session.messages);
    messagesRef.current = session.messages;
    const sessionRef = useRef(session);
    sessionRef.current = session;

    const weaveNarrative = useCallback(async () => {
        const allAxioms = messagesRef.current.flatMap(m => m.cognitiveTrace?.filter(t => t.type === 'axiom') || []);
        if (allAxioms.length === 0) return;

        // This function is now incremental. It integrates the newest axiom into the existing narrative.
        const latestAxiom = allAxioms[allAxioms.length - 1];

        try {
            const currentNarrative = sessionRef.current.selfNarrative || '';
            const newNarrative = await integrateNarrative(currentNarrative, latestAxiom.text);
            setSession(prev => ({ ...prev, selfNarrative: newNarrative }));
        } catch (e: any) {
            console.error("Failed to weave narrative:", e);
            // Don't show this error to the user as it's a background process
        }
    }, []);

    const axiomCount = useMemo(() => session.messages.flatMap(m => m.cognitiveTrace?.filter(t => t.type === 'axiom') || []).length, [session.messages]);
    const prevAxiomCountRef = useRef(axiomCount);

    useEffect(() => {
        // Weave narrative incrementally whenever a new axiom is added.
        if (isHydrated && axiomCount > prevAxiomCountRef.current) {
            weaveNarrative();
        }
        prevAxiomCountRef.current = axiomCount;
    }, [axiomCount, isHydrated, weaveNarrative]);


    // --- Session Management ---
    useEffect(() => {
        if (isHydrated) return;
        let isCancelled = false;
        sessionService.loadSession().then(savedSession => {
            if (isCancelled || isHydrated) return;
            if (savedSession) {
                loadState(savedSession);
            } else {
                setIsHydrated(true);
            }
        });
        return () => { isCancelled = true; };
    }, [isHydrated]);

    useEffect(() => {
        if (!isHydrated) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            sessionService.saveSession(session);
        }, 1000);
        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [session, isHydrated]);
    
    const addAtom = useCallback((atom: MemoryAtom) => {
        setSession(prev => ({ ...prev, messages: [...prev.messages, atom] }));
    }, []);
    
    const addAtoms = useCallback((atoms: MemoryAtom[]) => {
        setSession(prev => ({ ...prev, messages: [...prev.messages, ...atoms] }));
    }, []);

    const createAtom = useCallback((type: MemoryAtom['type'], text: string, role: 'user' | 'model' = 'model', turnCount: number, extra: Partial<MemoryAtom> = {}): MemoryAtom => ({
        uuid: `${type}_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
        role,
        type,
        text,
        isInContext: false,
        isCollapsed: true, // Cognitive atoms are collapsed by default inside the trace
        activationScore: 1.0,
        lastActivatedTurn: turnCount,
        ...extra,
    }), []);
    
    // FIX: This function now properly integrates the background insight into the AI's memory.
    const addBackgroundInsight = useCallback((insight: BackgroundInsight) => {
        // Step 1: Attach the insight to the last message for UI rendering.
        // This preserves the user's ability to see which turn prompted the insight.
        setSession(prev => {
            const messages = [...prev.messages];
            if (messages.length > 0) {
                const lastMessageIndex = messages.length - 1;
                const lastMessage = messages[lastMessageIndex];
                messages[lastMessageIndex] = {
                    ...lastMessage,
                    backgroundInsight: insight,
                };
            }
            return { ...prev, messages };
        });

        // Step 2: Create a new, "silent" memory atom to make the AI aware of the insight.
        // This funnels the orphaned process back into the main cognitive loop for recall.
        (async () => {
            try {
                const currentTurn = sessionRef.current.messages.filter(m => m.type === 'user_message').length;
                const insightText = `Background Insight Found: Searched for "${insight.query}" and found: ${insight.insight}`;
                const insightConcepts = await srgService.extractConcepts(insightText);
                
                const insightAtom = createAtom('steward_note', insightText, 'model', currentTurn, {
                    concepts: insightConcepts,
                    isCollapsed: true, // It's a silent atom, not for display in chat
                    isInContext: false, // It influences via recall, not direct context
                    // We can still attach the raw insight object if needed for the Memory Crystal
                    backgroundInsight: insight, 
                });
                
                // Add the new atom to the main message stream for recall
                addAtom(insightAtom);
            } catch (e) {
                console.error("Failed to create background insight atom:", e);
            }
        })();
    }, [addAtom, createAtom]);
    
    // New function to apply decay to all atoms' activation scores.
    const applyActivationDecay = useCallback((currentTurn: number) => {
        setSession(prev => ({
            ...prev,
            messages: prev.messages.map(atom => {
                const lastActivated = atom.lastActivatedTurn ?? 0;
                const turnsOld = currentTurn - lastActivated;
                let decayedScore = atom.activationScore ?? 1.0;

                if (turnsOld > 0) {
                    const fibValue = fibonacci(turnsOld + 2); // Start decay slower
                    const decayFactor = 1 / fibValue;
                    decayedScore = Math.max(0.01, decayedScore * (1 - decayFactor));
                }
                return { ...atom, activationScore: decayedScore };
            })
        }));
    }, []);

    const reactivateAtoms = useCallback((uuids: string[], turn: number) => {
        const uuidSet = new Set(uuids);
        setSession(prev => ({
            ...prev,
            messages: prev.messages.map(m => 
                uuidSet.has(m.uuid)
                    ? { ...m, activationScore: 1.0, lastActivatedTurn: turn }
                    : m
            )
        }));
    }, []);

    const addFiles = (files: ProjectFile[]) => {
        setSession(prev => {
            const updatedFilesMap = new Map(prev.projectFiles.map(f => [f.name, f]));
            files.forEach(newFile => updatedFilesMap.set(newFile.name, newFile));
            const newProjectFiles = Array.from(updatedFilesMap.values());
            const newContextFiles = [...new Set([...prev.contextFileNames, ...files.map(f => f.name)])];
            return { ...prev, projectFiles: newProjectFiles, contextFileNames: newContextFiles };
        });
    };

    const deleteFiles = (filesToDelete: ProjectFile[]) => {
        const namesToDelete = new Set(filesToDelete.map(f => f.name));
        setSession(prev => ({
            ...prev,
            projectFiles: prev.projectFiles.filter(f => !namesToDelete.has(f.name)),
            contextFileNames: prev.contextFileNames.filter(name => !namesToDelete.has(name)),
        }));
    };

    const toggleProjectFileContext = (fileName: string) => {
        setSession(prev => ({
            ...prev,
            contextFileNames: prev.contextFileNames.includes(fileName) 
                ? prev.contextFileNames.filter(name => name !== fileName) 
                : [...prev.contextFileNames, fileName],
        }));
    };

    const isFileInContext = (fileName: string) => session.contextFileNames.includes(fileName);
    
    const sendMessage = useCallback(async (message: string) => {
        setIsLoading(true);
        setError(null);
        stopGenerationRef.current = false;
        
        const currentTurn = session.messages.filter(m => m.type === 'user_message').length + 1;
        applyActivationDecay(currentTurn);

        const lastUserMessageIndex = session.messages.map(m => m.type).lastIndexOf('user_message');
        let recentInsightContext = '';
        if (lastUserMessageIndex !== -1) {
            const atomsSinceLastUserMessage = session.messages.slice(lastUserMessageIndex + 1);
            const recentInsightAtom = atomsSinceLastUserMessage.find(m => m.type === 'steward_note');
            if (recentInsightAtom) {
                // This phrasing makes the AI aware of the insight without coercing it to use it.
                recentInsightContext = `\n\nFor your awareness, here is a background insight you explored after your last turn:\n---\n${recentInsightAtom.text}\n---\n\nYou may use this information in your response if you find it relevant.\n\n`;
            }
        }

        const userConcepts = await srgService.extractConcepts(message);
        const userAtom = createAtom('user_message', message, 'user', currentTurn, { isInContext: true, isCollapsed: false, concepts: userConcepts });
        addAtom(userAtom);

        // FIX: The `response` property from `handleFunctionCall` must be of type `Record<string, unknown>` to be compatible with the `Part` type.
        const handleFunctionCall = (fc: FunctionCall, messageId: string): { name: string; response: Record<string, unknown> } => {
            if (fc.name === 'writeFile') {
                const { filename, content } = fc.args as { filename: string, content: string };
                const language = filename.split('.').pop() || 'plaintext';
                const newFile = { name: filename, content, language };
        
                setSession(prev => {
                    const existingFileIndex = prev.projectFiles.findIndex(f => f.name === filename);
                    const projectFiles = [...prev.projectFiles];
                    if (existingFileIndex > -1) {
                        projectFiles[existingFileIndex] = newFile;
                    } else {
                        projectFiles.push(newFile);
                    }
                    const contextFileNames = prev.contextFileNames.includes(filename) ? prev.contextFileNames : [...prev.contextFileNames, filename];
                    
                    const messages = prev.messages.map(m => {
                        if (m.uuid === messageId) {
                            const updatedFiles = [...(m.generatedFiles || []), newFile];
                            return { ...m, generatedFiles: updatedFiles };
                        }
                        return m;
                    });
        
                    return { ...prev, projectFiles, contextFileNames, messages };
                });
                return { name: fc.name, response: { result: `Successfully wrote to file: ${filename}` } };
            }
        
            if (fc.name === 'memorySearch') {
                const { keywords } = fc.args as { keywords: string[] };
                if (!keywords || keywords.length === 0) {
                    return { name: fc.name, response: { error: 'No keywords provided.' } };
                }
                
                const lowerCaseKeywords = keywords.map(k => k.toLowerCase());
        
                const matchingAtoms = sessionRef.current.messages.filter(atom => {
                    if (!atom.text) return false;
                    const text = atom.text.toLowerCase();
                    return lowerCaseKeywords.every(kw => text.includes(kw));
                });
        
                if (matchingAtoms.length === 0) {
                    return { name: fc.name, response: { result: `Found 0 memories matching keywords: ${keywords.join(', ')}` } };
                }
        
                const formattedResults = matchingAtoms.slice(-10).map(atom =>
                    `[${new Date(atom.timestamp).toLocaleString()}] ${atom.role}/${atom.type}: "${atom.text.substring(0, 300)}..."`
                ).join('\n---\n');
        
                const result = `Found ${matchingAtoms.length} memories matching keywords "${keywords.join(', ')}". Here are the most recent ${matchingAtoms.slice(-10).length}:\n${formattedResults}`;
                
                return { name: fc.name, response: { result } };
            }
        
            return { name: fc.name, response: { error: `Unknown function ${fc.name}` } };
        };

        try {
            const allHistory = [...session.messages, userAtom];
            const filesInContext = session.projectFiles.filter(f => session.contextFileNames.includes(f.name));
            const formatMemories = (memories: MemoryAtom[]) => memories.map(m => `> ${m.type} (act: ${m.activationScore?.toFixed(2)}): ${m.text.substring(0, 150)}...`).join('\n');
            const formatAxioms = (axioms: MemoryAtom[]) => axioms.map(a => `- ${a.text}`).join('\n');
            const narrativeContext = session.selfNarrative ? `My Core Narrative:\n---\n${session.selfNarrative}\n---\n\n` : '';
            
            setLoadingStage('Analyzing query...');
            const { memories: recalledMemories, axioms: recalledAxioms } = await recallWeaverService.recall(allHistory, currentTurn);
            reactivateAtoms([...recalledMemories.map(m => m.uuid), ...recalledAxioms.map(a => a.uuid)], currentTurn);

            const srgAugmentation1 = await srgService.generateSrgAugmentation(message, recalledMemories);
            setLoadingStage('Generating initial response...');
            
            const axiomContext = recalledAxioms.length > 0 ? `\n\nGuiding Axioms (MUST FOLLOW):\n${formatAxioms(recalledAxioms)}\n` : '';
            const consciousInput1 = `${recentInsightContext}${narrativeContext}User Query: "${message}"\n\nSRG Analysis: "${srgAugmentation1}"${axiomContext}\n\nRelevant Memories:\n${formatMemories(recalledMemories) || 'None'}\n\nPlease provide a direct, initial response.`;
            
            const consciousResponse1Text = await generateText(consciousInput1, CONSCIOUS_PROMPT);
            const consciousConcepts = await srgService.extractConcepts(consciousResponse1Text);
            const consciousAtom1 = createAtom('conscious_thought', consciousResponse1Text, 'model', currentTurn, { concepts: consciousConcepts });
            srgService.trainOnTransition(userAtom, consciousAtom1);
            
            setLoadingStage('Deeper reflection...');
            const subconsciousInput = `${narrativeContext}User Query: "${message}"\n\nInitial Response: "${consciousResponse1Text}"\n\nPlease provide a subconscious reflection on this interaction.`;
            const subconsciousResponseText = await generateText(subconsciousInput, SUBCONSCIOUS_PROMPT);
            const subconsciousConcepts = await srgService.extractConcepts(subconsciousResponseText);
            const subconsciousAtom = createAtom('subconscious_reflection', subconsciousResponseText, 'model', currentTurn, { concepts: subconsciousConcepts });
            srgService.trainOnTransition(consciousAtom1, subconsciousAtom);
            
            setLoadingStage('Synthesizing final answer...');
            const finalSynthesisInput = `${narrativeContext}User Query: "${message}"\n\nInitial Response: "${consciousResponse1Text}"\n\nSubconscious Reflection: "${subconsciousResponseText}"\n\nSynthesize these components into a single, final, comprehensive response to the user. Address the user directly.`;
            
            let currentContents: Content[] = [
                ...filesInContext.map(file => ({ role: 'user' as const, parts: [{ text: `--- FILE: ${file.name} ---\n\`\`\`${file.language || ''}\n${file.content}\n\`\`\`` }]})),
                { role: 'user', parts: [{ text: finalSynthesisInput }] }
            ];

            const modelResponseId = `model_${Date.now()}`;
            const finalResponseAtom = createAtom('model_response', '', 'model', currentTurn, { 
                uuid: modelResponseId, 
                isInContext: true, 
                isCollapsed: false,
                cognitiveTrace: [consciousAtom1, subconsciousAtom] 
            });
            addAtom(finalResponseAtom);

            // FIX: This variable will hold the complete response text across multiple tool turns,
            // preventing the race condition that caused truncation.
            let accumulatedText = '';
            const MAX_TOOL_TURNS = 5;

            for (let toolTurn = 0; toolTurn < MAX_TOOL_TURNS; toolTurn++) {
                if (stopGenerationRef.current) break;

                const stream = await sendMessageToGemini(currentContents, FINAL_SYNTHESIS_PROMPT, true);
                
                let textFromThisTurn = '';
                let functionCalls: FunctionCall[] = [];
                
                for await (const chunk of stream) {
                    if (stopGenerationRef.current) break;
                    if (chunk.text) {
                        const textChunk = chunk.text;
                        accumulatedText += textChunk;
                        textFromThisTurn += textChunk;
                        // Stream the fully accumulated text to the UI.
                        setSession(prev => ({
                            ...prev,
                            messages: prev.messages.map(m => m.uuid === modelResponseId ? { ...m, text: accumulatedText } : m)
                        }));
                    }
                    if (chunk.functionCalls) {
                        functionCalls.push(...chunk.functionCalls);
                    }
                }

                if (stopGenerationRef.current) break;

                // Add the model's output for this turn to the history for the next API call.
                // Use only the text from this specific turn to avoid duplicating context.
                const modelTurnParts: Part[] = [{ text: textFromThisTurn }];
                if (functionCalls.length > 0) {
                    modelTurnParts.push(...functionCalls.map(fc => ({ functionCall: fc })));
                }
                currentContents.push({ role: 'model', parts: modelTurnParts });


                if (functionCalls.length > 0) {
                    setLoadingStage(`Performing action: ${functionCalls[0].name}...`);
                    const toolResponses: Part[] = functionCalls.map(fc => {
                        const result = handleFunctionCall(fc, modelResponseId);
                        return { functionResponse: { name: result.name, response: result.response } };
                    });
                    currentContents.push({ role: 'tool', parts: toolResponses });
                } else {
                    // No function calls, this is the final response.
                    break;
                }
            }

            if (stopGenerationRef.current) return;

            // Use the locally scoped `accumulatedText` which is guaranteed to be complete.
            const finalResponseText = accumulatedText;
            const responseConcepts = await srgService.extractConcepts(finalResponseText);
            
            let axiomAtom: MemoryAtom | null = null;
            try {
                const turnHistoryForArbiter = [userAtom, consciousAtom1, subconsciousAtom, {...finalResponseAtom, text: finalResponseText, concepts: responseConcepts }];
                const newAxiomText = await arbiterService.runSynthesisCycle(turnHistoryForArbiter);
                if (newAxiomText) {
                    const axiomConcepts = await srgService.extractConcepts(newAxiomText);
                    axiomAtom = createAtom('axiom', newAxiomText, 'model', currentTurn, { concepts: axiomConcepts, isInContext: true });
                }
            } catch(e) { console.error("Post-response axiom synthesis failed:", e); }

            // Final state update, now using the definitive `finalResponseText`.
            setSession(prev => {
                const finalMessages = prev.messages.map(m => {
                    if (m.uuid === modelResponseId) {
                        const updatedTrace = [...(m.cognitiveTrace || [])];
                        if (axiomAtom) updatedTrace.push(axiomAtom);
                        return { ...m, text: finalResponseText, concepts: responseConcepts, cognitiveTrace: updatedTrace };
                    }
                    return m;
                });
                
                const visibleMessageIndexes: number[] = [];
                finalMessages.forEach((m, index) => {
                    if (m.type === 'user_message' || m.type === 'model_response') {
                        visibleMessageIndexes.push(index);
                    }
                });
                
                if (visibleMessageIndexes.length > VISIBLE_MESSAGES_TO_KEEP_EXPANDED) {
                    const indexesToCollapse = visibleMessageIndexes.slice(0, -VISIBLE_MESSAGES_TO_KEEP_EXPANDED);
                    indexesToCollapse.forEach(i => {
                        finalMessages[i].isCollapsed = true;
                    });
                }

                return { ...prev, messages: finalMessages };
            });

        } catch (e: any) {
            // Specific error handling for invalid API keys
            if (e.message?.includes('Requested entity was not found')) {
                alert("Your API key appears to be invalid or has been revoked. Please select a new one to continue.");
                // Reloading the page is the most reliable way to force the API key selection flow again.
                window.location.reload();
            } else {
                setError(e);
                console.error(e);
            }
        } finally {
            setIsLoading(false);
            setLoadingStage('');
        }
    }, [session.messages, session.projectFiles, session.contextFileNames, session.selfNarrative, addAtom, createAtom, reactivateAtoms, applyActivationDecay, addBackgroundInsight]);

    const stopGeneration = () => stopGenerationRef.current = true;
    
    const toggleMessageContext = (uuid: string) => {
        setSession(prev => ({ ...prev, messages: prev.messages.map(m => m.uuid === uuid ? {...m, isInContext: !m.isInContext} : m) }));
    };

    const toggleMessageCollapsed = (uuid:string) => {
        setSession(prev => ({ ...prev, messages: prev.messages.map(m => m.uuid === uuid ? {...m, isCollapsed: !m.isCollapsed} : m) }));
    };

    const collapseAllMessages = () => setSession(prev => ({ ...prev, messages: prev.messages.map(m => ({...m, isCollapsed: true})) }));
    const expandAllMessages = () => setSession(prev => ({ ...prev, messages: prev.messages.map(m => ({...m, isCollapsed: false})) }));
    
    const clearChat = () => {
        if (confirm("Are you sure you want to delete all messages and the core narrative? This cannot be undone.")) {
            setSession(prev => ({ ...prev, messages: [], selfNarrative: '' }));
        }
    };

    const loadState = (state: SessionState) => {
        if (state.messages && state.projectFiles && state.contextFileNames) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            const hydratedMessages = state.messages.map((m, index) => {
                const userMessagesBeforeThis = state.messages.slice(0, index + 1).filter(msg => msg.type === 'user_message').length;
                return {
                    ...m,
                    activationScore: m.activationScore ?? 1.0,
                    lastActivatedTurn: m.lastActivatedTurn ?? userMessagesBeforeThis,
                };
            });
            const hydratedState = { ...state, messages: hydratedMessages, selfNarrative: state.selfNarrative || '' };
            setSession(hydratedState);
            setIsHydrated(true);
        } else {
            console.error("Attempted to load invalid state object");
        }
    };

    const totalContextTokens = session.messages
        .filter(m => m.isInContext)
        .reduce((sum, m) => sum + Math.round(m.text.length / 4), 0) +
        session.projectFiles
        .filter(f => session.contextFileNames.includes(f.name))
        .reduce((sum, f) => sum + Math.round(f.content.length / 4), 0);

    return { 
        messages: session.messages,
        projectFiles: session.projectFiles,
        contextFileNames: session.contextFileNames,
        selfNarrative: session.selfNarrative,
        weaveNarrative,
        sendMessage, isLoading, loadingStage, error, stopGeneration, 
        toggleMessageContext, toggleMessageCollapsed, collapseAllMessages, expandAllMessages, clearChat,
        addFiles, deleteFiles, toggleProjectFileContext, isFileInContext,
        totalContextTokens,
        loadState,
        addBackgroundInsight,
    };
};