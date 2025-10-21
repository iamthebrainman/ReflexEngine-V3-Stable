import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MemoryAtom } from '../types';
import { UserIcon, BotIcon, BrainIcon, BookIcon, CollapseIcon, ExpandIcon, IncludeInContextIcon, ExcludeFromContextIcon, LightbulbIcon, SettingsIcon, SpeakerIcon, SpeakerOffIcon } from './icons';
import { CodeBlock } from './CodeBlock';
import { GeneratedFilesPanel } from './GeneratedFilesPanel';
import { CognitiveTraceViewer } from './CognitiveTraceViewer';
import { speechService } from '../services/speechService';


interface MessageProps {
  atom: MemoryAtom;
  onToggleContext: (uuid: string) => void;
  onToggleCollapsed: (uuid: string) => void;
}

const getRoleStyles = (role: 'user' | 'model', type: MemoryAtom['type']) => {
  if (type === 'subconscious_reflection') return { bg: 'bg-purple-900/20', border: 'border-purple-700/50', icon: <BrainIcon /> };
  if (type === 'conscious_thought') return { bg: 'bg-blue-900/20', border: 'border-blue-700/50', icon: <LightbulbIcon /> };
  if (type === 'axiom') return { bg: 'bg-green-900/20', border: 'border-green-700/50', icon: <BookIcon /> };
  
  if (role === 'user') return { bg: 'bg-gray-800', border: 'border-gray-700', icon: <UserIcon /> };
  return { bg: 'bg-gray-900/50', border: 'border-gray-700/50', icon: <BotIcon /> };
};

const summarizeText = (text: string, startWords = 15, endWords = 10): string => {
    const words = text.split(/\s+/);
    if (words.length <= startWords + endWords) {
        return text;
    }
    const start = words.slice(0, startWords).join(' ');
    const end = words.slice(-endWords).join(' ');
    return `${start} ... ${end}`;
};

export const Message: React.FC<MessageProps> = ({ atom, onToggleContext, onToggleCollapsed }) => {
  const { bg, border, icon } = getRoleStyles(atom.role, atom.type);
  const isCognitive = atom.type === 'subconscious_reflection' || atom.type === 'conscious_thought' || atom.type === 'axiom';
  const hasInternals = (atom.cognitiveTrace && atom.cognitiveTrace.length > 0) || atom.backgroundInsight;
  
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
        setIsSpeaking(speechService.isSpeaking(atom.uuid));
    };
    speechService.addListener(handleUpdate);
    return () => speechService.removeListener(handleUpdate);
  }, [atom.uuid]);

  const handleSpeakClick = () => {
    if (isSpeaking) {
        speechService.cancel();
    } else {
        let textToSpeak = `Final response. ${atom.text}`;
        
        if (isTraceExpanded) {
            const traceParts: string[] = [];
            if (atom.cognitiveTrace) {
                for (const trace of atom.cognitiveTrace) {
                    traceParts.push(`${trace.type.replace(/_/g, ' ')}. ${trace.text}`);
                }
            }
            if (atom.backgroundInsight) {
                traceParts.push(`Background Insight. I searched for: ${atom.backgroundInsight.query}. And found: ${atom.backgroundInsight.insight}`);
            }
            if (traceParts.length > 0) {
              textToSpeak += `\n\n Now reading internal thoughts.\n ${traceParts.join('.\n\n')}`;
            }
        }
        speechService.speak(textToSpeak, atom.uuid);
    }
  };


  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border ${bg} ${border}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mt-1">{icon}</div>
      <div className="flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
            <div className="font-semibold text-sm capitalize text-gray-400">
                {isCognitive ? atom.type.replace(/_/g, ' ') : atom.role}
            </div>
            <div className="flex items-center gap-2">
                 {atom.role === 'model' && (
                    <button
                        onClick={handleSpeakClick}
                        title={isSpeaking ? "Stop speaking" : "Read response aloud"}
                        className="p-1.5 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-cyan-400"
                    >
                        {isSpeaking ? <SpeakerOffIcon /> : <SpeakerIcon />}
                    </button>
                 )}
                 <button 
                    onClick={() => onToggleContext(atom.uuid)}
                    title={atom.isInContext ? "Exclude from context" : "Include in context"}
                    className={`p-1.5 rounded-md hover:bg-gray-700 transition-colors ${atom.isInContext ? 'text-cyan-400' : 'text-gray-500'}`}
                >
                    {atom.isInContext ? <IncludeInContextIcon /> : <ExcludeFromContextIcon />}
                </button>
                 <button 
                    onClick={() => onToggleCollapsed(atom.uuid)}
                    title={atom.isCollapsed ? "Expand" : "Collapse"}
                    className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                    {atom.isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                </button>
            </div>
        </div>

        {atom.isCollapsed ? (
             <p className="text-gray-400 italic text-sm pr-8">
                {summarizeText(atom.text)}
            </p>
        ) : (
            <div className="prose prose-sm prose-invert max-w-none text-gray-300">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        code({node, inline, className, children, ...props}) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                                <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
                            ) : (
                                <code className={className} {...props}>
                                {children}
                                </code>
                            );
                        }
                    }}
                >
                    {atom.text}
                </ReactMarkdown>

                {atom.generatedFiles && atom.generatedFiles.length > 0 && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-xs text-gray-400 mb-2">Generated Files:</h4>
                        <GeneratedFilesPanel files={atom.generatedFiles} />
                    </div>
                )}
                
                {hasInternals && (
                    <CognitiveTraceViewer 
                        trace={atom.cognitiveTrace} 
                        insight={atom.backgroundInsight}
                        isExpanded={isTraceExpanded}
                        setIsExpanded={setIsTraceExpanded}
                    />
                )}
            </div>
        )}
      </div>
    </div>
  );
};