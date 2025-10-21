import React, { useState, useRef, useEffect } from 'react';
import type { MemoryAtom } from '../types';
import { Message } from './Message';
import { PaperPlaneIcon, StopIcon, TrashIcon, CollapseIcon, ExpandIcon, MicrophoneIcon } from './icons';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface ChatPanelProps {
  messages: MemoryAtom[];
  sendMessage: (message: string) => void;
  isLoading: boolean;
  loadingStage: string;
  error: Error | null;
  onToggleMessageContext: (uuid: string) => void;
  onStopGeneration: () => void;
  totalContextTokens: number;
  onToggleMessageCollapsed: (uuid: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onClearChat: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  sendMessage,
  isLoading,
  loadingStage,
  error,
  onToggleMessageContext,
  onStopGeneration,
  totalContextTokens,
  onToggleMessageCollapsed,
  onCollapseAll,
  onExpandAll,
  onClearChat,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isListening, transcript, startListening, stopListening, isSupported, error: speechError } = useSpeechRecognition();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const visibleMessages = messages.filter(m => m.type === 'user_message' || m.type === 'model_response');

  useEffect(() => {
    scrollToBottom();
  }, [visibleMessages, isLoading]);
  
  useEffect(() => {
    if (transcript) {
        setInput(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      sendMessage(input.trim());
      setInput('');
      if (isListening) {
        stopListening();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800">
      <header className="flex-shrink-0 flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded-full">
                Context Tokens: ~{totalContextTokens.toLocaleString()}
            </span>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onCollapseAll} title="Collapse All" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><CollapseIcon /></button>
            <button onClick={onExpandAll} title="Expand All" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><ExpandIcon /></button>
            <button onClick={onClearChat} title="Clear Chat" className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md"><TrashIcon /></button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {visibleMessages.map((msg) => (
          <Message
            key={msg.uuid}
            atom={msg}
            onToggleContext={onToggleMessageContext}
            onToggleCollapsed={onToggleMessageCollapsed}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800">
        {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 p-2 rounded-md mb-2 text-sm">
                <strong>Error:</strong> {error.message}
            </div>
        )}
        {speechError && (
            <div className="text-red-400 text-xs text-center mb-2">
                Speech Recognition Error: {speechError}
            </div>
        )}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message or ask about the files..."
            rows={1}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 pr-40 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none max-h-48"
            disabled={isLoading}
          />
          <div className="absolute right-3 bottom-2 flex items-center gap-2">
            {isLoading ? (
              <button
                onClick={onStopGeneration}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
              >
                <StopIcon /> Stop
              </button>
            ) : (
                isSupported && (
                    <button
                        onClick={isListening ? stopListening : startListening}
                        className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-600 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-600'}`}
                        title={isListening ? 'Stop listening' : 'Start voice input'}
                    >
                        <MicrophoneIcon />
                    </button>
                )
            )}
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-2 bg-cyan-600 text-white rounded-full hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              <PaperPlaneIcon />
            </button>
          </div>
        </div>
         {isLoading && <div className="text-center text-xs text-cyan-400 animate-pulse pt-2">{loadingStage}</div>}

      </footer>
    </div>
  );
};