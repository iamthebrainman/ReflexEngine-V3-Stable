import React from 'react';
import type { ProjectFile } from '../types';
import { CloseIcon } from './icons';

interface DiffViewerProps {
  file1: ProjectFile;
  file2: ProjectFile;
  onExit: () => void;
}

const simpleLineDiff = (lines1: string[], lines2: string[]) => {
    const maxLen = Math.max(lines1.length, lines2.length);
    const result = [];
    
    for (let i = 0; i < maxLen; i++) {
        const line1 = lines1[i];
        const line2 = lines2[i];
        
        let status = 'common';
        if (line1 !== line2) {
            if (line1 !== undefined && line2 !== undefined) {
                status = 'modified';
            } else if (line1 !== undefined) {
                status = 'removed';
            } else {
                status = 'added';
            }
        }
        
        result.push({
            line1: line1,
            line2: line2,
            lineNum1: line1 !== undefined ? i + 1 : undefined,
            lineNum2: line2 !== undefined ? i + 1 : undefined,
            status,
        });
    }
    return result;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ file1, file2, onExit }) => {
    const lines1 = file1.content.split('\n');
    const lines2 = file2.content.split('\n');
    
    const diffResult = simpleLineDiff(lines1, lines2);

    const getBgColor = (status: string, side: 'left'|'right') => {
        if (status === 'modified') return 'bg-yellow-900/40';
        if (status === 'removed' && side === 'left') return 'bg-red-900/40';
        if (status === 'added' && side === 'right') return 'bg-green-900/40';
        return 'bg-transparent';
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-800 p-4">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 className="text-xl font-bold">Comparing Files</h2>
                <button onClick={onExit} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors">
                    <CloseIcon /> Exit Comparison
                </button>
            </div>
            <div className="flex gap-4 flex-1 min-h-0">
                <div className="w-1/2 flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                    <div className="bg-gray-800 p-2 border-b border-gray-700 font-semibold truncate" title={file1.name}>{file1.name}</div>
                    <div className="overflow-auto font-mono text-sm p-2">
                        {diffResult.map(({ line1, lineNum1, status }, index) => (
                           <div key={`left-${index}`} className={`flex ${getBgColor(status, 'left')}`}>
                                <span className="w-10 text-right pr-4 text-gray-500 select-none">{lineNum1 || ''}</span>
                                <pre className="flex-1 whitespace-pre-wrap">{line1 !== undefined ? (line1.trim() === '' ? ' ' : line1) : ' '}</pre>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="w-1/2 flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                     <div className="bg-gray-800 p-2 border-b border-gray-700 font-semibold truncate" title={file2.name}>{file2.name}</div>
                     <div className="overflow-auto font-mono text-sm p-2">
                        {diffResult.map(({ line2, lineNum2, status }, index) => (
                           <div key={`right-${index}`} className={`flex ${getBgColor(status, 'right')}`}>
                                <span className="w-10 text-right pr-4 text-gray-500 select-none">{lineNum2 || ''}</span>
                                <pre className="flex-1 whitespace-pre-wrap">{line2 !== undefined ? (line2.trim() === '' ? ' ' : line2) : ' '}</pre>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};