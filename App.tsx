
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { useChat } from './hooks/useChat';
import type { ProjectFile, GeneratedFile, MemoryAtom, SessionState, BackgroundInsight } from './types';
import { DiffViewer } from './components/DiffViewer';
import { MemoryCrystal } from './components/MemoryCrystal';
import { backgroundCognitionService } from './services/backgroundCognitionService';
import { validateApiKey } from './services/geminiService';
import { CrystalIcon } from './components/icons';

// This is a mock. In a real app, you'd load these from the filesystem or an API.
const MOCK_PROJECT_FILES: ProjectFile[] = [
    { name: 'index.tsx', content: 'console.log("hello world");', language: 'typescript'},
    { name: 'App.tsx', content: 'function App() { return <div>Hello</div> }', language: 'typescript'},
    { name: 'package.json', content: '{ "name": "my-app" }', language: 'json'},
];

// Add this line to be able to use JSZip from window
declare const JSZip: any;

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success and notify the parent component to render the app.
        // This handles the race condition mentioned in the guidelines.
        onKeySelected();
      } catch (e) {
        console.error("Error opening API key selection:", e);
        alert("There was an error opening the API key selection dialog. Please try again.");
      }
    } else {
      alert("API key selection is not available in this environment.");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center">
        <div className="flex justify-center text-cyan-400">
             <CrystalIcon />
        </div>
        <h1 className="text-2xl font-bold text-cyan-400 mt-4">Welcome to Reflex Engine</h1>
        <p className="text-gray-300 mt-4">
          To use this application, you need to select a Google AI API key.
          Your key will be used for API calls and associated billing.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          This application does not store your API key. It is managed securely by the environment.
          For more information, see the{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500 hover:underline"
          >
            billing documentation
          </a>.
        </p>
        <button
          onClick={handleSelectKey}
          className="mt-8 w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50"
        >
          Select API Key
        </button>
      </div>
    </div>
  );
};

type KeyState = 'unknown' | 'validating' | 'needs_selection' | 'ready' | 'error';

function App() {
  const [keyState, setKeyState] = useState<KeyState>('unknown');
  const [keyError, setKeyError] = useState<string | null>(null);
  const chat = useChat(MOCK_PROJECT_FILES);
  const [view, setView] = useState<'chat' | 'diff'>('chat');
  const [isCrystalPanelVisible, setIsCrystalPanelVisible] = useState(false);
  const [diffFiles, setDiffFiles] = useState<{file1: ProjectFile, file2: ProjectFile} | null>(null);
  const isCognitionRunning = useRef(false);

  useEffect(() => {
    // This effect runs only once on mount to validate the API key.
    const validate = async () => {
        // Bypass validation if in a non-aistudio environment (for local dev)
        if (!window.aistudio) {
            console.warn("aistudio environment not detected. Assuming API_KEY is set and valid.");
            setKeyState('ready');
            return;
        }

        setKeyState('validating');
        try {
            const isValid = await validateApiKey();
            if (isValid) {
                setKeyState('ready');
            } else {
                setKeyState('needs_selection');
            }
        } catch (e: any) {
            setKeyError(e.message);
            setKeyState('error');
        }
    };
    
    validate();
  }, []);

  // Background Cognition Loop
  useEffect(() => {
    if (keyState !== 'ready') return; // Don't run background tasks if the API key isn't ready

    const cognitionInterval = setInterval(async () => {
        if (isCognitionRunning.current || chat.isLoading) {
            return; // Don't run if a cycle is already in progress or if the main chat is busy
        }
        
        // Ensure there's enough conversation to analyze
        if (chat.messages.length < 2) {
            return;
        }
        
        isCognitionRunning.current = true;
        try {
            const insight = await backgroundCognitionService.runCognitionCycle(chat.messages);
            if (insight) {
                chat.addBackgroundInsight(insight);
            }
        } catch (e) {
            console.error("Error in background cognition interval:", e);
        } finally {
            isCognitionRunning.current = false;
        }
    }, 60000); // Run every 60 seconds

    return () => clearInterval(cognitionInterval);
  }, [keyState, chat.messages, chat.isLoading, chat.addBackgroundInsight]);

  const handleCompareFiles = (filesToCompare: ProjectFile[]) => {
    if (filesToCompare.length !== 2) {
        alert("Please select exactly two files to compare.");
        return;
    }
    setDiffFiles({ file1: filesToCompare[0], file2: filesToCompare[1] });
    setView('diff');
  };
  
  const handleImportFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    
    const newFiles: ProjectFile[] = [];
    // FIX: Iterate directly over the FileList. It's an iterable of File objects,
    // which avoids the issue where `file` was being inferred as `unknown`.
    for (const file of fileList) {
        try {
            const content = await file.text();
            const language = file.name.split('.').pop() || 'plaintext';
            newFiles.push({ name: file.name, content, language });
        } catch (e) {
            console.error("Error reading file:", file.name, e);
            alert(`Could not read file: ${file.name}`);
        }
    }
    chat.addFiles(newFiles);
    
    // CRITICAL: Reset the input value to allow importing the same file again
    event.target.value = '';
  };

  const handleImportState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
        alert('Please select a valid JSON session file.');
        event.target.value = '';
        return;
    }

    try {
        const content = await file.text();
        const sessionState = JSON.parse(content) as SessionState;
        // Basic validation
        if (Array.isArray(sessionState.messages) && Array.isArray(sessionState.projectFiles) && Array.isArray(sessionState.contextFileNames)) {
            chat.loadState(sessionState);
        } else {
            throw new Error("Invalid session file format. Missing required keys.");
        }
    } catch (e: any) {
        console.error("Error importing session state:", e);
        alert(`Could not import session file: ${e.message}`);
    }
    // Reset input to allow re-importing the same file
    event.target.value = '';
  };

  const handleExportState = () => {
    const sessionState: SessionState = {
        messages: chat.messages,
        projectFiles: chat.projectFiles,
        contextFileNames: chat.contextFileNames,
        selfNarrative: chat.selfNarrative,
    };
    const blob = new Blob([JSON.stringify(sessionState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `reflex-session-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleExportAllGenerated = async (files: GeneratedFile[]) => {
    if (files.length === 0) return;
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  if (keyState === 'unknown' || keyState === 'validating') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-cyan-400">
            <CrystalIcon />
        </div>
        <h1 className="text-xl font-bold text-cyan-400 mt-4 animate-pulse">
          {keyState === 'validating' ? 'Validating API Key...' : 'Initializing...'}
        </h1>
      </div>
    );
  }

  if (keyState === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="max-w-md w-full bg-red-900/50 p-8 rounded-lg border border-red-700 text-center">
              <h1 className="text-2xl font-bold text-red-300">Initialization Failed</h1>
              <p className="text-red-200 mt-4">{keyError}</p>
              <button onClick={() => window.location.reload()} className="mt-8 w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50">
                  Retry
              </button>
          </div>
      </div>
    );
  }

  if (keyState === 'needs_selection') {
    return <ApiKeySelector onKeySelected={() => setKeyState('ready')} />;
  }

  const generatedFiles = chat.messages.flatMap(m => m.generatedFiles || []);
  
  return (
    <main className="flex h-screen bg-gray-900 text-white font-sans">
      <Sidebar 
        projectFiles={chat.projectFiles}
        generatedFiles={generatedFiles}
        selfNarrative={chat.selfNarrative}
        onImportFiles={handleImportFiles}
        onImportState={handleImportState}
        onDeleteFiles={chat.deleteFiles}
        onCompareFiles={handleCompareFiles}
        onToggleFileContext={chat.toggleProjectFileContext}
        isFileInContext={chat.isFileInContext}
        onExportAll={() => handleExportAllGenerated(generatedFiles)}
        onExportState={handleExportState}
        onWeaveNarrative={chat.weaveNarrative}
        onShowCrystal={() => setIsCrystalPanelVisible(prev => !prev)}
        isCrystalPanelVisible={isCrystalPanelVisible}
      />
      <div className="flex-1 flex min-w-0">
        {view === 'diff' && diffFiles ? (
            <DiffViewer file1={diffFiles.file1} file2={diffFiles.file2} onExit={() => setView('chat')} />
        ) : (
          <>
            <div className="flex-1 flex flex-col min-w-0">
                <ChatPanel 
                    messages={chat.messages}
                    sendMessage={chat.sendMessage}
                    isLoading={chat.isLoading}
                    loadingStage={chat.loadingStage}
                    error={chat.error}
                    onToggleMessageContext={chat.toggleMessageContext}
                    onStopGeneration={chat.stopGeneration}
                    totalContextTokens={chat.totalContextTokens}
                    onToggleMessageCollapsed={chat.toggleMessageCollapsed}
                    onCollapseAll={chat.collapseAllMessages}
                    onExpandAll={chat.expandAllMessages}
                    onClearChat={chat.clearChat}
                />
            </div>
            {isCrystalPanelVisible && (
              <div className="flex-shrink-0 w-2/5 min-w-[400px] max-w-[600px] flex flex-col border-l border-gray-700/50 bg-gray-800">
                <MemoryCrystal 
                  atoms={chat.messages} 
                  onExit={() => setIsCrystalPanelVisible(false)} 
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default App;
