
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Play, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

interface Tutorial {
    id: string;
    title: string;
    content: string;
}

interface TutorialPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onInjectCode: (code: string) => void;
}

// Hardcoded JSON tutorials
const TUTORIALS: Tutorial[] = [
    {
        id: '01',
        title: 'Introduction to Rule-Based Strategies',
        content: `
# Tutorial 1: Your First Strategy

### Step 1: Defining Indicators
A rule-based strategy requires technical indicators.

### Try it:
\`\`\`json
{
  "name": "My First Strategy",
  "indicators": [
    {
      "id": "sma20",
      "type": "SMA",
      "params": {
        "period": 20,
        "source": "close"
      }
    }
  ]
}
\`\`\`
        `
    },
    {
        id: '02',
        title: 'Entry Rules',
        content: `
# Tutorial 2: Writing Entry Rules

You can construct simple rules by comparing indicators to each other or a static value.

### Example: SMA Crossover
A classic strategy that enters LONG when a fast SMA crosses above a slow SMA.

\`\`\`json
{
  "name": "SMA Crossover",
  "indicators": [
    { "id": "fast", "type": "SMA", "params": { "period": 9, "source": "close" } },
    { "id": "slow", "type": "SMA", "params": { "period": 21, "source": "close" } }
  ],
  "entryRules": [
    {
      "condition": "CROSSES_ABOVE",
      "indicator1": "fast",
      "indicator2": "slow",
      "direction": "BUY"
    }
  ]
}
\`\`\`
        `
    },
    {
        id: '03',
        title: 'Risk Management',
        content: `
# Tutorial 3: Risk Management

Protect your capital by setting Stop Loss and Take Profit levels.

### Automatic Exits
You can set default SL/TP rules:

\`\`\`json
{
  "exitRules": [
    {
      "id": "sl",
      "type": "STOP_LOSS",
      "value": 1.0,
      "unit": "PERCENTAGE"
    },
    {
      "id": "tp",
      "type": "TAKE_PROFIT",
      "value": 2.0,
      "unit": "PERCENTAGE"
    }
  ]
}
\`\`\`
        `
    }
];

export const TutorialPanel: React.FC<TutorialPanelProps> = ({ isOpen, onClose, onInjectCode }) => {
    const [currentIdx, setCurrentIdx] = useState(0);
    const tutorial = TUTORIALS[currentIdx];

    if (!isOpen) return null;

    const handleInject = (content: string) => {
        // Extract json code block
        const match = content.match(/```json\n([\s\S]*?)```/);
        if (match && match[1]) {
            onInjectCode(match[1]);
        }
    };

    return (
        <div className="fixed right-0 top-16 bottom-0 w-96 bg-[#1a1a1a] border-l border-white/10 z-50 flex flex-col shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2 text-blue-400">
                    <BookOpen size={18} />
                    <span className="font-semibold text-sm uppercase tracking-wider">Tutorials</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded-md text-gray-400 transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 prose prose-invert max-w-none tutorial-content">
                <ReactMarkdown
                    components={{
                        code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isJson = match && match[1] === 'json';

                            if (!inline && isJson) {
                                return (
                                    <div className="relative group my-4">
                                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => onInjectCode(String(children).replace(/\n$/, ''))}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md shadow-lg"
                                            >
                                                <Play size={10} fill="currentColor" />
                                                Try it
                                            </button>
                                        </div>
                                        <pre className="bg-black/40 p-4 rounded-lg border border-white/5 font-mono text-sm leading-relaxed overflow-x-auto">
                                            <code className={className} {...props}>
                                                {children}
                                            </code>
                                        </pre>
                                    </div>
                                );
                            }
                            return <code className={className} {...props}>{children}</code>;
                        }
                    }}
                >
                    {tutorial.content}
                </ReactMarkdown>
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20 flex items-center justify-between gap-4">
                <button
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx(prev => prev - 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-gray-300 rounded-lg text-sm font-medium transition-all"
                >
                    <ChevronLeft size={16} />
                    Previous
                </button>
                <div className="text-xs text-gray-500 font-medium bg-white/5 px-3 py-1 rounded-full border border-white/5">
                    {currentIdx + 1} / {TUTORIALS.length}
                </div>
                <button
                    disabled={currentIdx === TUTORIALS.length - 1}
                    onClick={() => setCurrentIdx(prev => prev + 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-gray-300 rounded-lg text-sm font-medium transition-all"
                >
                    Next
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
};
