import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Send } from 'lucide-react';

const COMMANDS = {
  help: "Available commands: help, clear, whoami, status, date, scan",
  whoami: "root@blackhacks-security",
  status: "System: ONLINE | Security: HIGH | Encryption: AES-256",
  scan: "Initiating network scan... \n[+] Target found: 192.168.1.105 \n[+] Ports open: 80, 443, 22 \n[+] Vulnerabilities: None detected.",
};

const Terminal: React.FC = () => {
  const [history, setHistory] = useState<string[]>(["Welcome to BlackHacks Terminal v2.0. Type 'help' to start."]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    let response = "";

    if (trimmed === 'clear') {
      setHistory([]);
      return;
    }

    if (trimmed in COMMANDS) {
      response = COMMANDS[trimmed as keyof typeof COMMANDS];
    } else if (trimmed === '') {
      response = "";
    } else {
      response = `Command not found: ${trimmed}. Type 'help' for list.`;
    }

    setHistory(prev => [...prev, `> ${cmd}`, response]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    handleCommand(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-green-800 rounded-lg overflow-hidden font-mono shadow-[0_0_15px_rgba(74,222,128,0.1)]">
      <div className="bg-slate-900 p-2 flex items-center border-b border-green-900">
        <TerminalIcon className="w-4 h-4 text-green-500 mr-2" />
        <span className="text-xs text-green-600">bash -- 80x24</span>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto space-y-1 text-sm">
        {history.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap text-green-400 break-words">
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-2 bg-slate-900 border-t border-green-900 flex">
        <span className="text-green-500 mr-2">$</span>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-green-400 placeholder-green-800"
          placeholder="Enter command..."
          autoFocus
        />
        <button type="submit" className="text-green-600 hover:text-green-400">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default Terminal;