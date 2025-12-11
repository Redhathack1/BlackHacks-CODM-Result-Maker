import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Trash2 } from 'lucide-react';
import { Chat } from "@google/genai";
import { createChatSession, sendMessageToChat } from '../services/gemini';
import { ChatMessage } from '../types';

const ChatAssistant: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatSession = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize chat session on mount
    chatSession.current = createChatSession();
    
    // Initial greeting
    setMessages([
      {
        id: 'init',
        role: 'model',
        text: 'BlackHacks AI v2.5 initialized. How can I assist with your operations today?',
        timestamp: Date.now()
      }
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !chatSession.current) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await sendMessageToChat(chatSession.current, userMsg.text);
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
        console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    chatSession.current = createChatSession();
     setMessages([
      {
        id: 'init-reset',
        role: 'model',
        text: 'Memory flushed. Ready for new instructions.',
        timestamp: Date.now()
      }
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/30 border border-green-900/50 rounded-lg overflow-hidden">
      <div className="p-4 bg-slate-900/80 border-b border-green-900/50 flex justify-between items-center">
        <div className="flex items-center">
          <Bot className="w-5 h-5 text-green-500 mr-2" />
          <h2 className="font-bold text-white">BlackHacks AI Assistant</h2>
        </div>
        <button onClick={clearChat} className="text-slate-500 hover:text-red-400 transition-colors" title="Clear Chat">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${
              msg.role === 'user' 
                ? 'bg-green-900/20 border border-green-800/50 text-green-100' 
                : 'bg-slate-800/50 border border-slate-700 text-slate-200'
            }`}>
              <div className="flex items-center mb-1 text-xs opacity-50">
                {msg.role === 'user' ? <User className="w-3 h-3 mr-1" /> : <Bot className="w-3 h-3 mr-1" />}
                <span>{msg.role === 'user' ? 'Operator' : 'System'}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {msg.text}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-slate-800/50 border border-slate-700 text-green-400 p-3 rounded-lg flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce mr-1"></span>
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce mr-1 delay-75"></span>
                <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-150"></span>
             </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-slate-900/80 border-t border-green-900/50">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query the database..."
            className="w-full bg-slate-950 border border-slate-700 rounded-md py-3 pl-4 pr-12 text-slate-200 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all placeholder-slate-600"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-2 p-1.5 bg-green-600 text-black rounded hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatAssistant;