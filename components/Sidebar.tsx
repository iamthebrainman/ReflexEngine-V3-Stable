import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ProjectFile, MemoryAtom, GeneratedFile, BackgroundInsight } from '../types';
import { FileIcon, UploadIcon, DownloadIcon, CompareIcon, TrashIcon, BookIcon, BrainIcon, ExpandIcon, CollapseIcon, LightbulbIcon, SaveIcon, RefreshIcon, CrystalIcon, GlobeIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';

interface SidebarProps {
  projectFiles: ProjectFile[];
  generatedFiles: GeneratedFile[];
  selfNarrative: string;
  onImportFiles: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportState: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExportAll: () => void;
  onExportState: () => void;
  onCompareFiles: (files: ProjectFile[]) => void;
  onDeleteFiles: (files: ProjectFile[]) => void;
  onToggleFileContext: (fileName: string) => void;
  isFileInContext: (fileName: string) => boolean;
  onWeaveNarrative: () => void;
  onShowCrystal: () => void;
  isCrystalPanelVisible: boolean;
}

const CollapsibleSection: React.FC<{title: string, count?: number, children: React.ReactNode}> = ({ title, count, children }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
        <div className="border-b border-gray-700/50">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="w-full flex justify-between items-center p-2 text-sm font-semibold text-gray-300 hover:bg-gray-800">
                <span>{title} {count !== undefined && `(${count})`}</span>
                {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
            </button>
            {!isCollapsed && <div className="p-1">{children}</div>}
        </div>
    );
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    projectFiles, 
    generatedFiles,
    selfNarrative,
    onImportFiles,
    onImportState,
    onExportAll,
    onExportState,
    onCompareFiles,
    onDeleteFiles,
    onToggleFileContext,
    isFileInContext,
    onWeaveNarrative,
    onShowCrystal,
    isCrystalPanelVisible,
}) => {
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const projectFileInputRef = useRef<HTMLInputElement>(null);
    const stateFileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelectChange = (fileName: string, checked: boolean) => {
        setSelectedFiles(prev => 
            checked ? [...prev, fileName] : prev.filter(name => name !== fileName)
        );
    };

    const handleCompareClick = () => {
        const filesToCompare = projectFiles.filter(f => selectedFiles.includes(f.name));
        onCompareFiles(filesToCompare);
    };

    const handleDeleteSelected = () => {
        if (selectedFiles.length === 0) return;
        if (confirm(`Are you sure you want to delete ${selectedFiles.length} file(s)?`)) {
            const filesToDelete = projectFiles.filter(f => selectedFiles.includes(f.name));
            onDeleteFiles(filesToDelete);
            setSelectedFiles([]);
        }
    }
    
    const handleDownloadSingle = (file: GeneratedFile) => {
        const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <aside className="w-96 bg-gray-900/70 border-r border-gray-700/50 flex flex-col">
            <header className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                <h1 className="text-lg font-bold">Reflex Engine</h1>
                <button 
                    onClick={onShowCrystal} 
                    title={isCrystalPanelVisible ? "Hide Memory Crystal" : "Show Memory Crystal"} 
                    className={`p-2 rounded-md transition-colors ${isCrystalPanelVisible ? 'bg-cyan-900/50 text-cyan-400' : 'text-gray-400 hover:text-cyan-400 hover:bg-gray-800'}`}
                >
                    <CrystalIcon />
                </button>
            </header>

            {/* --- Hidden File Inputs --- */}
            <input type="file" multiple ref={projectFileInputRef} onChange={onImportFiles} className="hidden" />
            <input type="file" accept=".json" ref={stateFileInputRef} onChange={onImportState} className="hidden" />

            {/* --- Import / Export Bar --- */}
            <div className="p-2 border-b border-gray-700/50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => projectFileInputRef.current?.click()} title="Import project files" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><UploadIcon /> Import Files</button>
                    <button onClick={() => stateFileInputRef.current?.click()} title="Import session state from a .json file" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><UploadIcon /> Import State</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={onExportAll} title="Export all generated files as a .zip" disabled={generatedFiles.length === 0} className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><DownloadIcon /> Export Generated</button>
                    <button onClick={onExportState} title="Export current session to a .json file" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><SaveIcon /> Export State</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                <CollapsibleSection title="Core Narrative">
                    <div className="p-2 space-y-2">
                        <div className="text-xs text-gray-300 p-2 bg-gray-800/50 rounded max-h-48 overflow-y-auto prose prose-xs prose-invert">
                            {selfNarrative ? (
                                <ReactMarkdown>{selfNarrative}</ReactMarkdown>
                            ) : (
                                <p className="text-gray-500 italic">No narrative woven yet. New axioms will be synthesized into a story here.</p>
                            )}
                        </div>
                        <button onClick={onWeaveNarrative} title="Re-weave the narrative from all axioms" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                            <RefreshIcon /> Re-weave Narrative
                        </button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Project Files" count={projectFiles.length}>
                    <ul className="space-y-1">
                        {projectFiles.map((file) => (
                            <li key={file.name} className="group flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-800">
                                <input type="checkbox" className="form-checkbox bg-gray-700 border-gray-600 rounded" checked={selectedFiles.includes(file.name)} onChange={(e) => handleFileSelectChange(file.name, e.target.checked)} />
                                <FileIcon />
                                <span className="flex-1 text-sm text-gray-300 truncate" title={file.name}>{file.name}</span>
                                <ToggleSwitch checked={isFileInContext(file.name)} onToggle={() => onToggleFileContext(file.name)} title="Include in context" />
                            </li>
                        ))}
                    </ul>
                    {selectedFiles.length > 0 && (
                        <div className="p-1 mt-2 flex justify-end gap-2 border-t border-gray-700/50 pt-2">
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-800 hover:bg-red-700 rounded transition-colors">
                                <TrashIcon /> Delete ({selectedFiles.length})
                            </button>
                            <button onClick={handleCompareClick} disabled={selectedFiles.length !== 2} className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-800 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <CompareIcon /> Compare
                            </button>
                        </div>
                    )}
                </CollapsibleSection>

                <CollapsibleSection title="Generated Files" count={generatedFiles.length}>
                    <ul className="space-y-1">
                        {generatedFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="group flex items-center gap-3 p-1.5 rounded-md hover:bg-gray-800">
                                <FileIcon />
                                <span className="flex-1 text-sm text-gray-300 truncate" title={file.name}>{file.name}</span>
                                <button onClick={() => handleDownloadSingle(file)} className="text-gray-400 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <DownloadIcon />
                                </button>
                            </li>
                        ))}
                    </ul>
                </CollapsibleSection>
            </div>
        </aside>
    );
};