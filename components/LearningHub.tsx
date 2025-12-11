import React, { useState } from 'react';
import { BookOpen, Search, Code, Lock, Server } from 'lucide-react';
import { explainConcept } from '../services/gemini';
import ReactMarkdown from 'react-markdown';

const TOPICS = [
  { id: 'sql-injection', label: 'SQL Injection', icon: <Code className="w-4 h-4"/> },
  { id: 'xss', label: 'Cross-Site Scripting (XSS)', icon: <Code className="w-4 h-4"/> },
  { id: 'encryption', label: 'AES Encryption', icon: <Lock className="w-4 h-4"/> },
  { id: 'ddos', label: 'DDoS Attacks', icon: <Server className="w-4 h-4"/> },
  { id: 'phishing', label: 'Social Engineering', icon: <UserIcon className="w-4 h-4"/> },
];

function UserIcon(props: any) {
    return (
        <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
}

const LearningHub: React.FC = () => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [customQuery, setCustomQuery] = useState("");

  const handleTopicClick = async (topic: string) => {
    setSelectedTopic(topic);
    setLoading(true);
    const explanation = await explainConcept(topic);
    setContent(explanation);
    setLoading(false);
  };

  const handleCustomSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!customQuery) return;
    handleTopicClick(customQuery);
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      {/* Sidebar Topics */}
      <div className="w-full md:w-1/3 space-y-4">
         <div className="bg-slate-900/50 p-4 rounded-lg border border-green-900/50">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-green-500"/>
                Knowledge Base
            </h2>
            
            <form onSubmit={handleCustomSearch} className="mb-6 relative">
                <input 
                    type="text"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    placeholder="Search concept..."
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 pl-8 text-sm text-green-400 placeholder-slate-600 focus:outline-none focus:border-green-500"
                />
                <Search className="w-4 h-4 text-slate-600 absolute left-2.5 top-2.5" />
            </form>

            <div className="space-y-2">
                {TOPICS.map((topic) => (
                    <button
                        key={topic.id}
                        onClick={() => handleTopicClick(topic.label)}
                        className={`w-full text-left p-3 rounded flex items-center transition-all ${
                            selectedTopic === topic.label 
                            ? 'bg-green-900/30 text-green-400 border border-green-800' 
                            : 'hover:bg-slate-800 text-slate-400'
                        }`}
                    >
                        <span className="mr-3 opacity-70">{topic.icon}</span>
                        {topic.label}
                    </button>
                ))}
            </div>
         </div>
      </div>

      {/* Content Area */}
      <div className="w-full md:w-2/3 bg-slate-900/50 p-6 rounded-lg border border-green-900/50 flex flex-col min-h-[400px]">
        {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center text-green-500">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mb-4"></div>
                <p className="animate-pulse">Decrypting data...</p>
             </div>
        ) : selectedTopic && content ? (
            <div className="prose prose-invert prose-green max-w-none">
                <h2 className="text-2xl font-bold text-green-400 mb-4 border-b border-green-900 pb-2">{selectedTopic}</h2>
                <div className="text-slate-300 leading-relaxed whitespace-pre-line">
                   <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                <p>Select a topic or search to access the BlackHacks archives.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default LearningHub;