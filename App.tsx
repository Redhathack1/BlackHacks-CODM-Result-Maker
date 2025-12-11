import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, Users, Settings, Save, Upload, 
  ChevronRight, Trophy, AlertTriangle, FileText, 
  Plus, Minus, Image as ImageIcon, Trash2, Menu, X,
  Key, LogOut, CheckCircle, User as UserIcon,
  Sparkles, RefreshCw, Crosshair, BarChart3, Zap,
  TrendingUp, TrendingDown, Calendar, Download, Globe,
  LayoutGrid, ArrowLeft, Copy, Check, Calculator, FolderOpen,
  ClipboardPaste, RotateCcw, Fingerprint, Edit3, UserPlus,
  Monitor, Wifi, ArrowRight, Printer, Scan, Loader2, BookOpen,
  FileSpreadsheet, Swords, Medal
} from 'lucide-react';
import { 
  TournamentData, Team, ScoringSystem, ScoringPreset,
  DayData, Match, TeamMatchResult, Penalty,
  User, LicenseKey, LicenseDuration, EventType
} from './types';
import { extractMatchData, ExtractedMatchData, parseScoringRules } from './services/gemini';

// --- Constants & Defaults ---

const APP_VERSION = "5.7.3 (Export Restored & Vision V3)"; 
const DATA_VERSION = "v5.7.3_EXPORT"; // Changing this wipes local storage for users

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin_password'
};

const DURATION_MAP: Record<LicenseDuration, number | null> = {
  '1h': 3600 * 1000,
  '2h': 2 * 3600 * 1000,
  '3h': 3 * 3600 * 1000,
  '1d': 24 * 3600 * 1000,
  '3d': 3 * 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '14d': 14 * 24 * 3600 * 1000,
  '21d': 21 * 24 * 3600 * 1000,
  '1m': 30 * 24 * 3600 * 1000,
  '3m': 90 * 24 * 3600 * 1000,
  '6m': 180 * 24 * 3600 * 1000,
  '1y': 365 * 24 * 3600 * 1000,
  'infinity': null
};

const KEY_CODE_MAP: Record<string, LicenseDuration> = {
    '1H': '1h', '2H': '2h', '3H': '3h',
    '1D': '1d', '3D': '3d', '7D': '7d',
    '14': '14d', '21': '21d',
    '1M': '1m', '3M': '3m', '6M': '6m',
    '1Y': '1y', 'IN': 'infinity'
};

const DEFAULT_SCORING: ScoringSystem = {
  pointsPerKill: 1,
  rankPoints: [
    20, 16, 15, 14, 13, 12, 11, 10, 9, 8, 
    7, 6, 5, 4, 3, 2, 1, 1, 1, 1,       
    0, 0, 0, 0, 0                       
  ] 
};

// --- Mock Database ---
const DB = {
  getUsers: (): User[] => JSON.parse(localStorage.getItem('bh_users') || '[]'),
  saveUsers: (users: User[]) => localStorage.setItem('bh_users', JSON.stringify(users)),
  getKeys: (): LicenseKey[] => JSON.parse(localStorage.getItem('bh_keys') || '[]'),
  saveKeys: (keys: LicenseKey[]) => localStorage.setItem('bh_keys', JSON.stringify(keys)),
  getTournaments: (): TournamentData[] => JSON.parse(localStorage.getItem('bh_tournaments') || '[]'),
  saveTournaments: (data: TournamentData[]) => localStorage.setItem('bh_tournaments', JSON.stringify(data)),
  getScoringPresets: (): ScoringPreset[] => JSON.parse(localStorage.getItem('bh_scoring_presets') || '[]'),
  saveScoringPresets: (data: ScoringPreset[]) => localStorage.setItem('bh_scoring_presets', JSON.stringify(data)),
};

// --- Helpers ---

const SECRET_SALT = "BLACKHACKS_SECURE_2025";

const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const positiveHash = Math.abs(hash);
    return positiveHash.toString(36).substring(0, 4).toUpperCase();
};

const generateSmartKey = (duration: LicenseDuration): string => {
    const typeCode = Object.keys(KEY_CODE_MAP).find(key => KEY_CODE_MAP[key] === duration) || '7D';
    const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
    const raw = `BH-${typeCode}-${rand}-${SECRET_SALT}`;
    const checksum = simpleHash(raw);
    return `BH-${typeCode}-${rand}-${checksum}`;
};

const verifySmartKey = (key: string): { valid: boolean, duration?: LicenseDuration } => {
    const parts = key.trim().toUpperCase().split('-');
    if (parts.length !== 4) return { valid: false };
    if (parts[0] !== 'BH') return { valid: false };
    const [prefix, typeCode, rand, providedChecksum] = parts;
    const raw = `BH-${typeCode}-${rand}-${SECRET_SALT}`;
    const calculatedChecksum = simpleHash(raw);
    if (calculatedChecksum === providedChecksum) {
        return { valid: true, duration: KEY_CODE_MAP[typeCode] };
    }
    return { valid: false };
};

const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

const cleanTeamName = (raw: string) => {
    let name = raw.trim();
    // Aggressively strip leading numbering (e.g., "1.", "1 ", "#1", "1-", "1)")
    name = name.replace(/^[\#]?\d+[\.\)\:\-\s]+\s*/, '');
    // Clean invisible characters like U+2060 (Word Joiner) often found in copy-pastes
    name = name.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
    return name.trim();
};

const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const normalizeStr = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const TechButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' }> = ({ 
  children, className = '', variant = 'primary', ...props 
}) => {
  const baseStyle = "px-6 py-3 font-tech font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed clip-tech-button relative overflow-hidden group shadow-[0_0_10px_rgba(0,0,0,0.5)]";
  
  const variants = {
    primary: "bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]",
    secondary: "bg-slate-900/80 border border-slate-600 text-cyan-500 hover:bg-slate-800 hover:border-cyan-500 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]",
    danger: "bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]",
    success: "bg-green-500/10 border border-green-500/50 text-green-500 hover:bg-green-500/20 hover:border-green-500 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]",
    ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-slate-800/30"
  };
  
  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {variant === 'primary' && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />}
    </button>
  );
};

const TechCard: React.FC<{ children: React.ReactNode; className?: string; title?: string; icon?: React.ReactNode; rightElement?: React.ReactNode; onClick?: React.MouseEventHandler<HTMLDivElement> }> = ({ 
  children, className = '', title, icon, rightElement, onClick 
}) => (
  <div onClick={onClick} className={`relative bg-[#0a0f1e]/80 backdrop-blur-xl border border-slate-800/60 shadow-xl ${className} clip-tech-corner group transition-all duration-300 hover:border-slate-700/80`}>
    {/* Glowing Corners */}
    <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t-2 border-l-2 border-cyan-500/30 group-hover:border-cyan-500 transition-colors"></div>
    <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t-2 border-r-2 border-cyan-500/30 group-hover:border-cyan-500 transition-colors"></div>
    <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b-2 border-l-2 border-cyan-500/30 group-hover:border-cyan-500 transition-colors"></div>
    <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-2 border-r-2 border-cyan-500/30 group-hover:border-cyan-500 transition-colors"></div>

    {(title || icon) && (
      <div className="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between bg-gradient-to-r from-slate-900/50 to-transparent">
        <div className="flex items-center gap-3">
            {icon && <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">{icon}</span>}
            <h3 className="font-tech text-xl text-white uppercase tracking-widest font-bold">{title}</h3>
        </div>
        {rightElement}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

// ... (AuthScreen, LicenseGate, AdminPanel, SetupScreen remain unchanged) ...
// --- Sub-Screens ---

const AuthScreen: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [uniqueId, setUniqueId] = useState('');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [error, setError] = useState('');

  const validateUniqueId = (id: string): boolean => {
    const hasUpper = /[A-Z]/.test(id);
    const hasLower = /[a-z]/.test(id);
    const hasSpecial = /[^a-zA-Z0-9]/.test(id);
    return hasUpper && hasLower && hasSpecial;
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (uniqueId === ADMIN_CREDENTIALS.username && licenseKeyInput === ADMIN_CREDENTIALS.password) {
      onLogin({ 
        id: 'admin', 
        username: 'admin', 
        email: 'admin@blackhacks.tech', 
        password: '', 
        role: 'admin',
        licenseExpiry: 9999999999999,
        lastActive: Date.now()
      });
      return;
    }

    const cleanKeyInput = licenseKeyInput.trim().toUpperCase();
    const users = DB.getUsers();
    const keys = DB.getKeys();

    if (mode === 'signup') {
        if (!validateUniqueId(uniqueId)) return setError("Unique ID: 1 Upper, 1 Lower, 1 Special Char required.");
        if (users.find(u => u.username === uniqueId)) return setError("Unique ID already registered.");

        let duration: LicenseDuration = '7d';
        
        // 1. Check if Key exists in DB
        let existingKey = keys.find(k => k.code === cleanKeyInput);
        let isAlgorithmic = false;

        if (existingKey) {
            if (existingKey.isRevoked) return setError("License Key Revoked");
            // STRICT ONE-USER CHECK: If key is used, block it immediately if it's someone else
            if (existingKey.isUsed && existingKey.usedByUsername !== uniqueId) return setError(`This license is permanently assigned to another device/user (${existingKey.usedByUsername}). Access Denied.`);
            duration = existingKey.durationLabel;
        } else {
            // 2. Not in DB, check if it's a valid generated Smart Key
            const smartCheck = verifySmartKey(cleanKeyInput);
            if (smartCheck.valid && smartCheck.duration) {
                isAlgorithmic = true;
                duration = smartCheck.duration;
            } else {
                return setError("Invalid License Key");
            }
        }

        const durationMs = DURATION_MAP[duration] || (100 * 365 * 24 * 60 * 60 * 1000); 
        const expiry = Date.now() + durationMs;
        
        const newUser: User = {
            id: Math.random().toString(36).substr(2, 9),
            username: uniqueId,
            email: '', 
            password: cleanKeyInput,
            role: 'user',
            licenseKey: cleanKeyInput,
            licenseExpiry: expiry,
            lastActive: Date.now()
        };

        if (isAlgorithmic) {
            // New smart key being claimed for the first time
            const newKeyRecord: LicenseKey = {
                code: cleanKeyInput,
                durationLabel: duration,
                durationMs: durationMs,
                isUsed: true,
                usedByUserId: newUser.id,
                usedByUsername: newUser.username,
                isRevoked: false,
                createdAt: Date.now()
            };
            keys.push(newKeyRecord);
            DB.saveKeys(keys);
        } else if (existingKey) {
            // Existing DB key being claimed
            existingKey.isUsed = true;
            existingKey.usedByUserId = newUser.id;
            existingKey.usedByUsername = newUser.username;
            DB.saveKeys(keys);
        }

        users.push(newUser);
        DB.saveUsers(users);
        onLogin(newUser);

    } else {
        // LOGIN MODE
        let user = users.find(u => u.username === uniqueId);
        
        // If user not found, try to recover from Algorithmic Key on a new device
        if (!user) {
             const smartCheck = verifySmartKey(cleanKeyInput);
             const existingKey = keys.find(k => k.code === cleanKeyInput);
             
             // STRICT: If key exists in DB and is used by someone else, DO NOT allow recovery
             if (existingKey && existingKey.isUsed && existingKey.usedByUsername !== uniqueId) {
                  return setError("License key is already assigned to a device. Please use the original device.");
             }

             if (smartCheck.valid && smartCheck.duration) {
                  const durationMs = DURATION_MAP[smartCheck.duration] || 0;
                  const newUser: User = {
                    id: Math.random().toString(36).substr(2, 9),
                    username: uniqueId,
                    email: '', 
                    password: cleanKeyInput,
                    role: 'user',
                    licenseKey: cleanKeyInput,
                    licenseExpiry: Date.now() + (durationMs || 31536000000),
                    lastActive: Date.now()
                  };
                  users.push(newUser);
                  DB.saveUsers(users);
                  user = newUser;
                  
                  // If key didn't exist in DB (fresh algorithmic), save it now
                  if (!existingKey) {
                      keys.push({
                        code: cleanKeyInput,
                        durationLabel: smartCheck.duration,
                        durationMs: durationMs,
                        isUsed: true,
                        usedByUserId: newUser.id,
                        usedByUsername: newUser.username,
                        isRevoked: false,
                        createdAt: Date.now()
                      });
                      DB.saveKeys(keys);
                  }
             } else {
                  return setError("User not found & Key Invalid.");
             }
        }
        
        if (!user) return setError("Login Failed.");

        if (cleanKeyInput === user.licenseKey || cleanKeyInput === user.password) {
             user.lastActive = Date.now();
             DB.saveUsers(users);
             onLogin(user);
        } else {
            // Trying to Login with a NEW/RENEWAL Key?
            let potentialNewKey = keys.find(k => k.code === cleanKeyInput);
            let isSmart = false;
            let duration: LicenseDuration = '7d';

            // STRICT: If key exists and is used by another, BLOCK
            if (potentialNewKey && potentialNewKey.isUsed && potentialNewKey.usedByUsername !== user.username) {
                return setError(`License Key is already assigned to a device (${potentialNewKey.usedByUsername}). Please use the original device.`);
            }

            if (!potentialNewKey) {
                const smart = verifySmartKey(cleanKeyInput);
                if (smart.valid && smart.duration) {
                    isSmart = true;
                    duration = smart.duration;
                }
            }

            if ((potentialNewKey && !potentialNewKey.isUsed) || isSmart) {
                const durationMs = DURATION_MAP[duration] || (100 * 365 * 24 * 60 * 60 * 1000); 
                
                if (isSmart) {
                     const newKeyRecord: LicenseKey = {
                        code: cleanKeyInput,
                        durationLabel: duration,
                        durationMs: durationMs,
                        isUsed: true,
                        usedByUserId: user.id,
                        usedByUsername: user.username,
                        isRevoked: false,
                        createdAt: Date.now()
                      };
                    keys.push(newKeyRecord);
                    DB.saveKeys(keys);
                } else if (potentialNewKey) {
                    potentialNewKey.isUsed = true;
                    potentialNewKey.usedByUserId = user.id;
                    potentialNewKey.usedByUsername = user.username;
                    DB.saveKeys(keys);
                }

                user.licenseKey = cleanKeyInput;
                user.licenseExpiry = Date.now() + durationMs;
                user.password = cleanKeyInput;
                user.lastActive = Date.now();
                DB.saveUsers(users);
                
                onLogin(user);
            } else {
                setError("Invalid Credentials or License Key.");
            }
        }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#030712]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.1),transparent_70%)]"></div>
      
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-0 relative z-10 shadow-[0_0_50px_rgba(6,182,212,0.15)] rounded-2xl overflow-hidden border border-slate-800">
        <div className="bg-slate-950/90 border-r border-slate-800 p-12 flex flex-col justify-between relative backdrop-blur-3xl hidden md:flex">
          <div className="relative z-10">
            <div className="w-20 h-20 bg-cyan-500/10 border border-cyan-500/50 rounded-2xl flex items-center justify-center mb-8 rotate-3 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                  <Shield className="w-10 h-10 text-cyan-400" />
            </div>
            <h1 className="font-tech text-6xl font-bold text-white mb-2 tracking-tight">BLACK<br/><span className="text-cyan-500">HACKS</span></h1>
            <p className="text-slate-400 font-mono tracking-widest text-xs mt-4">ELITE TOURNAMENT MANAGER v{APP_VERSION}</p>
          </div>
          <div className="font-mono text-[10px] text-slate-500 relative z-10">
             <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> SYSTEM OPERATIONAL</div>
             <p>SECURE ENCRYPTED CONNECTION ESTABLISHED</p>
          </div>
        </div>

        <div className="bg-[#050b1a]/95 p-12 flex flex-col justify-center backdrop-blur-sm">
          <div className="mb-10">
            <h2 className="font-tech text-4xl text-white uppercase tracking-wider mb-2">
              {mode === 'login' ? 'System Access' : 'New Identity'}
            </h2>
            <p className="text-slate-500 text-sm">Enter credentials to proceed.</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="flex p-1.5 bg-slate-950 rounded-lg border border-slate-800 mb-8">
              <button type="button" onClick={() => {setMode('login'); setError('');}} className={`flex-1 py-2.5 rounded-md text-xs font-bold font-tech uppercase tracking-widest transition-all ${mode === 'login' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Login</button>
              <button type="button" onClick={() => {setMode('signup'); setError('');}} className={`flex-1 py-2.5 rounded-md text-xs font-bold font-tech uppercase tracking-widest transition-all ${mode === 'signup' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Register</button>
            </div>

            <div className="group space-y-2">
              <label className="text-[10px] font-mono text-cyan-500/70 uppercase tracking-wider flex items-center gap-2">
                 <Fingerprint className="w-3 h-3"/> Unique ID
              </label>
              <input 
                type="text"
                required
                value={uniqueId}
                onChange={e => setUniqueId(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded p-4 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono text-sm placeholder-slate-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                placeholder="Agent#007"
              />
              {mode === 'signup' && (
                  <p className="text-[10px] text-slate-500 flex items-center gap-1"><Monitor className="w-3 h-3"/> Req: 1 Upper, 1 Lower, 1 Special Char.</p>
              )}
            </div>

            <div className="group space-y-2">
              <label className="text-[10px] font-mono text-cyan-500/70 uppercase tracking-wider flex items-center gap-2">
                 <Key className="w-3 h-3"/> License Key / Password
              </label>
              <input 
                type="text"
                required
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded p-4 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono text-sm placeholder-slate-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                placeholder="BH-XXXX-XXXX-XXXX"
              />
            </div>

            {error && (
              <div className="p-4 rounded bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-500 text-xs font-mono animate-pulse">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            <TechButton type="submit" className="w-full mt-4 py-4 text-lg">
              {mode === 'login' ? 'AUTHENTICATE' : 'INITIALIZE'}
            </TechButton>
          </form>
        </div>
      </div>
    </div>
  );
};

const LicenseGate: React.FC<{ user: User; onValidated: (user: User) => void; onLogout: () => void }> = ({ user, onValidated, onLogout }) => {
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  
  const handlePaste = async () => {
      try {
          const text = await navigator.clipboard.readText();
          setKeyInput(text.trim().toUpperCase());
      } catch (err) {
          console.error("Clipboard access failed", err);
      }
  };

  const handleRenew = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const keys = DB.getKeys();
    
    const cleanInput = keyInput.trim().toUpperCase();
    if (cleanInput.length < 5) return setError("INVALID FORMAT");

    let matchedKey = keys.find(k => k.code === cleanInput);
    let isValidSmart = false;
    let duration: LicenseDuration = '7d';

    if (matchedKey) {
        if (matchedKey.isRevoked) return setError("KEY REVOKED");
        // STRICT: Block if used by another
        if (matchedKey.isUsed && matchedKey.usedByUsername !== user.username) {
            return setError(`License Key is already assigned to a device (${matchedKey.usedByUsername}). Please use the original device.`);
        }
        duration = matchedKey.durationLabel;
    } else {
        const smartCheck = verifySmartKey(cleanInput);
        if (smartCheck.valid && smartCheck.duration) {
            isValidSmart = true;
            duration = smartCheck.duration;
        } else {
            return setError("INVALID LICENSE KEY");
        }
    }
    
    const durationMs = DURATION_MAP[duration] || (100 * 365 * 24 * 60 * 60 * 1000); 
    const expiry = Date.now() + durationMs;

    if (isValidSmart) {
        const newKey: LicenseKey = {
            code: cleanInput,
            durationLabel: duration,
            durationMs: durationMs,
            isUsed: true,
            usedByUserId: user.id,
            usedByUsername: user.username,
            isRevoked: false,
            createdAt: Date.now()
        };
        keys.push(newKey);
    } else if (matchedKey) {
        matchedKey.isUsed = true;
        matchedKey.usedByUserId = user.id;
        matchedKey.usedByUsername = user.username;
    }
    DB.saveKeys(keys);
      
    const users = DB.getUsers();
    const currentUserIndex = users.findIndex(u => u.id === user.id);
    if (currentUserIndex >= 0) {
      users[currentUserIndex].licenseKey = cleanInput;
      users[currentUserIndex].licenseExpiry = expiry;
      users[currentUserIndex].password = cleanInput; 
      users[currentUserIndex].lastActive = Date.now();
      DB.saveUsers(users);
    }
    
    onValidated({ ...user, licenseKey: cleanInput, licenseExpiry: expiry, lastActive: Date.now() });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050b14] p-4 relative overflow-hidden">
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.1),transparent_70%)] pointer-events-none"></div>

      <TechCard className="max-w-md w-full text-center py-12 relative overflow-hidden z-10 border-red-500/30">
        <div className="w-24 h-24 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="font-tech text-3xl text-white mb-2">ACCESS DENIED</h2>
        <p className="text-red-400 mb-8 font-mono text-sm">LICENSE EXPIRED OR INVALID</p>

        <form onSubmit={handleRenew} className="space-y-4">
           <div className="flex gap-2">
              <input 
                type="text" 
                value={keyInput}
                onChange={e => setKeyInput(e.target.value.toUpperCase())}
                placeholder="ENTER NEW LICENSE KEY"
                className="flex-1 bg-black/50 border border-red-900/50 rounded p-3 text-center text-red-100 placeholder-red-900/50 font-mono tracking-widest focus:border-red-500 focus:outline-none transition-colors"
              />
              <button type="button" onClick={handlePaste} className="p-3 bg-red-900/20 border border-red-900/50 text-red-500 rounded hover:bg-red-900/40"><ClipboardPaste className="w-5 h-5"/></button>
           </div>
          {error && <p className="text-xs text-red-500 font-bold animate-pulse">{error}</p>}
          <TechButton variant="danger" className="w-full justify-center">ACTIVATE NEW KEY</TechButton>
        </form>

        <button onClick={onLogout} className="mt-6 text-slate-500 text-xs hover:text-white flex items-center justify-center gap-2 w-full">
            <LogOut className="w-3 h-3" /> Terminate Session
        </button>
      </TechCard>
    </div>
  );
};

// 3. Admin Panel
const AdminPanel: React.FC<{ onLogout: () => void; onEnterApp: () => void }> = ({ onLogout, onEnterApp }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [genDuration, setGenDuration] = useState<LicenseDuration>('7d');
  const [view, setView] = useState<'keys' | 'users'>('keys');

  useEffect(() => {
    const refresh = () => {
        setUsers(DB.getUsers());
        setKeys(DB.getKeys());
    };
    refresh();
    const interval = setInterval(refresh, 5000); // Live update
    return () => clearInterval(interval);
  }, []);

  const handleGenerateKey = () => {
    const newKeyStr = generateSmartKey(genDuration);
    const newKey: LicenseKey = {
        code: newKeyStr,
        durationLabel: genDuration,
        durationMs: DURATION_MAP[genDuration],
        isUsed: false,
        isRevoked: false,
        createdAt: Date.now()
    };
    const updatedKeys = [...keys, newKey];
    DB.saveKeys(updatedKeys);
    setKeys(updatedKeys);
    setGeneratedKey(newKeyStr);
  };

  const resetUserKey = (user: User) => {
      if(!confirm(`Reset key for ${user.username}? They will need a new key.`)) return;
      // Revoke current key if exists
      const updatedKeys = [...keys];
      const keyIdx = updatedKeys.findIndex(k => k.code === user.licenseKey);
      if(keyIdx >= 0) updatedKeys[keyIdx].isRevoked = true;
      DB.saveKeys(updatedKeys);
      setKeys(updatedKeys);
      
      const updatedUsers = [...users];
      const uIdx = updatedUsers.findIndex(u => u.id === user.id);
      if(uIdx >= 0) {
          updatedUsers[uIdx].licenseKey = undefined;
          updatedUsers[uIdx].licenseExpiry = 0;
          DB.saveUsers(updatedUsers);
          setUsers(updatedUsers);
      }
  };

  return (
    <div className="min-h-screen bg-[#030712] p-8 font-mono text-sm">
      <header className="flex flex-col md:flex-row justify-between items-center mb-10 border-b border-slate-800 pb-6 gap-6">
        <div>
            <h1 className="text-3xl font-tech text-white mb-1"><span className="text-cyan-500">ADMIN</span> CONSOLE</h1>
            <p className="text-slate-500">System Monitoring & Access Control</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
            <TechButton onClick={onEnterApp} variant="primary" className="w-full md:w-auto">
                OPEN DASHBOARD <ArrowRight className="w-4 h-4"/>
            </TechButton>
            <div className="bg-slate-900 px-4 py-2 rounded border border-slate-700 text-xs flex flex-col justify-center w-full md:w-auto text-center">
                <span className="text-slate-400 block text-[10px]">TOTAL USERS</span>
                <span className="text-lg text-white font-bold">{users.filter(u => u.role !== 'admin').length}</span>
            </div>
            <TechButton variant="danger" onClick={onLogout} className="w-full md:w-auto">LOGOUT</TechButton>
        </div>
      </header>

      <div className="flex gap-4 mb-6">
          <button onClick={() => setView('keys')} className={`px-4 py-2 rounded ${view === 'keys' ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-700' : 'bg-slate-900 text-slate-500'}`}>LICENSE MANAGEMENT</button>
          <button onClick={() => setView('users')} className={`px-4 py-2 rounded ${view === 'users' ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-700' : 'bg-slate-900 text-slate-500'}`}>USER REGISTRY</button>
      </div>

      {view === 'keys' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <TechCard title="GENERATE LICENSE" icon={<Key className="w-5 h-5"/>}>
          <div className="space-y-4">
            <div>
                <label className="block text-slate-500 mb-2 text-xs">DURATION</label>
                <div className="grid grid-cols-4 gap-2">
                    {(['1d', '3d', '7d', '14d', '1m', '3m', '1y', 'infinity'] as LicenseDuration[]).map(d => (
                        <button 
                            key={d}
                            onClick={() => setGenDuration(d)}
                            className={`p-2 text-xs border rounded ${genDuration === d ? 'border-cyan-500 bg-cyan-500/20 text-white' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}
                        >
                            {d.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
            <TechButton onClick={handleGenerateKey} className="w-full">CREATE KEY</TechButton>
            
            {generatedKey && (
                <div className="mt-6 p-4 bg-green-900/20 border border-green-500/50 rounded flex flex-col items-center">
                    <span className="text-green-500 text-xs mb-1">NEW KEY GENERATED</span>
                    <div className="text-2xl text-white font-bold tracking-widest break-all text-center">{generatedKey}</div>
                    <button 
                        onClick={() => navigator.clipboard.writeText(generatedKey)}
                        className="mt-2 flex items-center gap-2 text-green-400 hover:text-white text-xs"
                    >
                        <Copy className="w-3 h-3"/> COPY TO CLIPBOARD
                    </button>
                </div>
            )}
          </div>
        </TechCard>

        <div className="lg:col-span-2 space-y-4">
             <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs">
                        <tr>
                            <th className="p-4">LICENSE CODE</th>
                            <th className="p-4">DURATION</th>
                            <th className="p-4">STATUS</th>
                            <th className="p-4">USED BY</th>
                            <th className="p-4">CREATED</th>
                            <th className="p-4">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                        {keys.slice().reverse().map(key => (
                            <tr key={key.code} className="hover:bg-slate-800/30">
                                <td className="p-4 font-mono text-xs">{key.code}</td>
                                <td className="p-4 text-xs uppercase">{key.durationLabel}</td>
                                <td className="p-4">
                                    {key.isRevoked ? <span className="text-red-500 text-xs px-2 py-1 bg-red-900/20 rounded">REVOKED</span> :
                                     key.isUsed ? <span className="text-cyan-500 text-xs px-2 py-1 bg-cyan-900/20 rounded">ACTIVE</span> :
                                     <span className="text-green-500 text-xs px-2 py-1 bg-green-900/20 rounded">UNUSED</span>}
                                </td>
                                <td className="p-4 text-xs text-slate-500">{key.usedByUsername || '-'}</td>
                                <td className="p-4 text-xs text-slate-500">{formatTimeAgo(key.createdAt)}</td>
                                <td className="p-4">
                                    <button onClick={() => navigator.clipboard.writeText(key.code)} className="text-slate-400 hover:text-white"><Copy className="w-4 h-4"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
        </div>
      </div>
      )}

      {view === 'users' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs">
                        <tr>
                            <th className="p-4">UNIQUE ID</th>
                            <th className="p-4">LICENSE KEY</th>
                            <th className="p-4">EXPIRY</th>
                            <th className="p-4">LAST SEEN</th>
                            <th className="p-4">STATUS</th>
                            <th className="p-4">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                        {users.filter(u => u.role !== 'admin').map(u => {
                            const isOnline = (Date.now() - (u.lastActive || 0)) < 5 * 60 * 1000;
                            return (
                            <tr key={u.id} className="hover:bg-slate-800/30">
                                <td className="p-4 font-bold text-white">{u.username}</td>
                                <td className="p-4 font-mono text-xs">{u.licenseKey || 'NO KEY'}</td>
                                <td className="p-4 text-xs">{u.licenseExpiry ? new Date(u.licenseExpiry).toLocaleDateString() : '-'}</td>
                                <td className="p-4 text-xs">{formatTimeAgo(u.lastActive)}</td>
                                <td className="p-4">
                                    {isOnline ? 
                                        <span className="flex items-center gap-1 text-green-500 text-xs"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> ONLINE</span> : 
                                        <span className="text-slate-600 text-xs">OFFLINE</span>
                                    }
                                </td>
                                <td className="p-4">
                                    <button onClick={() => resetUserKey(u)} className="text-red-500 hover:text-red-400 text-xs border border-red-900/50 px-2 py-1 rounded">RESET KEY</button>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
          </div>
      )}
    </div>
  );
};

// 4. Setup Wizard
const SetupScreen: React.FC<{ onComplete: (data: TournamentData) => void, onCancel: () => void, user: User }> = ({ onComplete, onCancel, user }) => {
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState<EventType>('scrim');
  const [name, setName] = useState('');
  const [teamsInput, setTeamsInput] = useState('');
  const [scoring, setScoring] = useState<ScoringSystem>(DEFAULT_SCORING);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [aiRuleInput, setAiRuleInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const handleAiParse = async () => {
      if(!aiRuleInput.trim()) return;
      setIsParsing(true);
      const parsed = await parseScoringRules(aiRuleInput);
      if(parsed) {
          setScoring(parsed);
      }
      setIsParsing(false);
  };

  const handleFinish = () => {
    const rawTeams = teamsInput.split('\n').map(t => cleanTeamName(t)).filter(t => t.length > 0);
    const teams: Team[] = rawTeams.map(name => ({ id: Math.random().toString(36).substr(2, 9), name }));
    
    let days: DayData[] = [];

    if (eventType === 'scrim') {
        // Scrims start with no days, they are added via calendar
        days = [];
    } else {
        // Tournament: Generate days based on date range
        if (startDate && endDate) {
            let start = new Date(startDate);
            const end = new Date(endDate);
            let dayCount = 1;
            while (start <= end) {
                days.push({
                    id: Math.random().toString(),
                    dayNumber: dayCount,
                    date: start.toISOString().split('T')[0],
                    matches: [],
                    penalties: []
                });
                start.setDate(start.getDate() + 1);
                dayCount++;
            }
        } else {
            // Fallback: 3 days default
            days = Array.from({ length: 3 }, (_, i) => ({
                id: Math.random().toString(),
                dayNumber: i + 1,
                matches: [],
                penalties: []
            }));
        }
    }

    const newEvent: TournamentData = {
        id: Math.random().toString(36).substr(2, 9),
        ownerId: user.id,
        name: name || 'Untitled Event',
        type: eventType,
        teams,
        scoring,
        days,
        currentDay: 1
    };
    
    onComplete(newEvent);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030712] flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                <h2 className="font-tech text-2xl text-white">EVENT SETUP // STEP {step}/3</h2>
                <button onClick={onCancel} className="text-slate-500 hover:text-white"><X className="w-6 h-6"/></button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto">
                {step === 1 && (
                    <div className="space-y-8">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase mb-4">Select Event Type</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setEventType('scrim')}
                                    className={`p-6 rounded-lg border-2 flex flex-col items-center gap-3 transition-all ${eventType === 'scrim' ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'}`}
                                >
                                    <Swords className={`w-8 h-8 ${eventType === 'scrim' ? 'text-cyan-400' : 'text-slate-500'}`}/>
                                    <span className={`font-bold font-tech text-lg ${eventType === 'scrim' ? 'text-white' : 'text-slate-400'}`}>DAILY SCRIMS</span>
                                    <span className="text-xs text-center text-slate-500">Flexible dates, daily rosters, ongoing results storage.</span>
                                </button>
                                <button 
                                    onClick={() => setEventType('tournament')}
                                    className={`p-6 rounded-lg border-2 flex flex-col items-center gap-3 transition-all ${eventType === 'tournament' ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'}`}
                                >
                                    <Medal className={`w-8 h-8 ${eventType === 'tournament' ? 'text-cyan-400' : 'text-slate-500'}`}/>
                                    <span className={`font-bold font-tech text-lg ${eventType === 'tournament' ? 'text-white' : 'text-slate-400'}`}>TOURNAMENT</span>
                                    <span className="text-xs text-center text-slate-500">Fixed dates, consistent roster, cumulative scoring.</span>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-xs uppercase mb-2">Event Name</label>
                            <input 
                                value={name} onChange={e => setName(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded p-4 text-white focus:border-cyan-500 outline-none font-tech text-xl"
                                placeholder={eventType === 'scrim' ? "e.g. DAILY T1 SCRIMS" : "e.g. SUMMER CHAMPIONSHIP 2025"}
                            />
                        </div>

                        {eventType === 'tournament' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-slate-400 text-xs uppercase mb-2">Start Date</label>
                                    <input 
                                        type="date"
                                        value={startDate} onChange={e => setStartDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-4 text-white focus:border-cyan-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-400 text-xs uppercase mb-2">End Date</label>
                                    <input 
                                        type="date"
                                        value={endDate} onChange={e => setEndDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded p-4 text-white focus:border-cyan-500 outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase mb-2">
                                {eventType === 'scrim' ? "Default Team Template (Optional)" : "Team Roster (One per line)"}
                            </label>
                            <textarea 
                                value={teamsInput} onChange={e => setTeamsInput(e.target.value)}
                                className="w-full h-64 bg-slate-950 border border-slate-700 rounded p-4 text-white focus:border-cyan-500 outline-none font-mono text-sm"
                                placeholder="Paste team list here (e.g. 1. Legionaries)"
                            />
                            <p className="text-slate-500 text-xs mt-2">
                                {eventType === 'scrim' 
                                    ? "You can set specific slots for each day later in the dashboard." 
                                    : "Format: Paste your list. Numbering (e.g. '1. ') will be auto-removed, preserving order."}
                            </p>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-8">
                        {/* AI Builder */}
                        <div className="bg-cyan-900/10 border border-cyan-500/30 p-6 rounded-lg">
                            <h3 className="text-cyan-400 font-bold mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4"/> AI SCORING BUILDER</h3>
                            <div className="flex gap-2 mb-2">
                                <input 
                                    value={aiRuleInput}
                                    onChange={e => setAiRuleInput(e.target.value)}
                                    placeholder="e.g. 1st=20, 2nd=15, minus 1 pt till 10th. 2pts per kill."
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
                                />
                                <button 
                                    onClick={handleAiParse}
                                    disabled={isParsing}
                                    className="bg-cyan-600 text-white px-4 rounded text-xs font-bold hover:bg-cyan-500 disabled:opacity-50"
                                >
                                    {isParsing ? 'BUILDING...' : 'GENERATE'}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-white font-bold mb-4 border-b border-slate-800 pb-2">Placement Points</h3>
                                <div className="h-64 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                    {scoring.rankPoints.map((pts, i) => (
                                        <div key={i} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800">
                                            <span className="text-slate-400 text-xs">#{i + 1}</span>
                                            <input 
                                                type="number"
                                                value={pts}
                                                onChange={e => {
                                                    const newRanks = [...scoring.rankPoints];
                                                    newRanks[i] = parseInt(e.target.value) || 0;
                                                    setScoring({...scoring, rankPoints: newRanks});
                                                }}
                                                className="w-16 bg-slate-900 text-center text-white border border-slate-700 rounded text-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-white font-bold mb-4 border-b border-slate-800 pb-2">Kill Points</h3>
                                <div className="bg-slate-950 p-4 rounded border border-slate-800 mb-6">
                                    <label className="text-xs text-slate-500 block mb-2">POINTS PER KILL</label>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setScoring({...scoring, pointsPerKill: Math.max(0, scoring.pointsPerKill - 1)})} className="p-2 bg-slate-800 rounded text-white hover:bg-slate-700"><Minus className="w-4 h-4"/></button>
                                        <span className="text-2xl font-bold text-white">{scoring.pointsPerKill}</span>
                                        <button onClick={() => setScoring({...scoring, pointsPerKill: scoring.pointsPerKill + 1})} className="p-2 bg-slate-800 rounded text-white hover:bg-slate-700"><Plus className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 bg-slate-950 border-t border-slate-800 flex justify-between">
                <button 
                    onClick={() => setStep(Math.max(1, step - 1))}
                    className={`text-slate-400 hover:text-white ${step === 1 ? 'invisible' : ''}`}
                >
                    BACK
                </button>
                {step < 3 ? (
                    <TechButton onClick={() => setStep(step + 1)}>NEXT STEP <ChevronRight className="w-4 h-4"/></TechButton>
                ) : (
                    <TechButton onClick={handleFinish} variant="primary">INITIALIZE EVENT</TechButton>
                )}
            </div>
        </div>
    </div>
  );
};

// 5. Dashboard
const Dashboard: React.FC<{ tournament: TournamentData, onUpdate: (t: TournamentData) => void, onBack: () => void }> = ({ tournament, onUpdate, onBack }) => {
  const [tab, setTab] = useState<'overview' | 'matches' | 'intel' | 'manage'>('overview');
  // For Scrims, currentDay maps to selected date string if we want, or we just rely on ID
  const [selectedDayId, setSelectedDayId] = useState<string>(tournament.days[0]?.id || '');
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [sanctionForm, setSanctionForm] = useState({
      teamId: '',
      type: 'deduction' as 'deduction' | 'bonus',
      points: 10,
      reason: ''
  });
  const [analyzingMatchId, setAnalyzingMatchId] = useState<string | null>(null);
  const [newScrimDate, setNewScrimDate] = useState('');

  // Manage Tab States
  const [manageTeamInput, setManageTeamInput] = useState('');
  const [manageAiRule, setManageAiRule] = useState('');
  
  const currentDayData = useMemo(() => tournament.days.find(d => d.id === selectedDayId), [tournament, selectedDayId]);
  
  // Use daily team roster if available, otherwise global
  const activeTeams = currentDayData?.teams || tournament.teams;

  // Intelligence Logic
  const dailyStandings = useMemo(() => {
    if (!currentDayData) return [];

    const scores = activeTeams.map(team => {
        let kills = 0;
        let placePts = 0;
        let killPts = 0;
        let penaltyPts = 0;

        currentDayData.matches.forEach(m => {
            const res = m.results.find(r => r.teamId === team.id);
            if (res) {
                kills += res.kills;
                placePts += (res.totalPoints - (res.kills * tournament.scoring.pointsPerKill));
                killPts += (res.kills * tournament.scoring.pointsPerKill);
            }
        });

        // Penalties
        currentDayData.penalties.filter(p => p.teamId === team.id).forEach(p => {
             penaltyPts += p.points;
        });

        return {
            team,
            kills,
            placePts,
            killPts,
            penaltyPts,
            total: placePts + killPts + penaltyPts
        };
    });

    return scores.sort((a, b) => b.total - a.total);
  }, [tournament, selectedDayId, activeTeams]);

  const handleAddScrimDay = () => {
      if(!newScrimDate) return alert("Please select a date");
      const exists = tournament.days.find(d => d.date === newScrimDate);
      if(exists) return alert("Date already exists!");

      const newDays = [...tournament.days];
      newDays.push({
          id: Math.random().toString(),
          dayNumber: newDays.length + 1,
          date: newScrimDate,
          matches: [],
          penalties: [],
          teams: tournament.teams.length > 0 ? tournament.teams : undefined // Default to global template if exists
      });
      // Sort days by date
      newDays.sort((a,b) => (a.date || '').localeCompare(b.date || ''));
      onUpdate({...tournament, days: newDays});
      setNewScrimDate('');
  };

  const handleUpdateTeams = () => {
      const raw = manageTeamInput.split('\n').map(t => cleanTeamName(t)).filter(t => t.length > 0);
      const newTeams: Team[] = raw.map(name => {
          const existing = activeTeams.find(t => t.name === name);
          return existing ? existing : { id: Math.random().toString(36).substr(2, 9), name };
      });

      if (tournament.type === 'scrim' && currentDayData) {
          // Update ONLY this day's roster
          const newDays = tournament.days.map(d => 
              d.id === currentDayData.id ? { ...d, teams: newTeams } : d
          );
          onUpdate({ ...tournament, days: newDays });
          alert(`Roster updated for ${currentDayData.date}`);
      } else {
          // Update Global
          onUpdate({ ...tournament, teams: newTeams });
          alert("Global Roster Updated!");
      }
  };

  const handleUpdateScoring = async () => {
      const parsed = await parseScoringRules(manageAiRule);
      if(parsed) {
          onUpdate({ ...tournament, scoring: parsed });
          alert("Scoring Updated!");
      }
  };

  const handleAddPenalty = (teamId: string, points: number, reason: string) => {
     const newDays = [...tournament.days];
     const dayIdx = newDays.findIndex(d => d.id === selectedDayId);
     if(dayIdx >= 0) {
         newDays[dayIdx].penalties.push({
             id: Math.random().toString(),
             teamId,
             points,
             reason
         });
         onUpdate({...tournament, days: newDays});
     }
  };
  
  const handleRemovePenalty = (penaltyId: string) => {
     const newDays = [...tournament.days];
     const dayIdx = newDays.findIndex(d => d.id === selectedDayId);
     if(dayIdx >= 0) {
         newDays[dayIdx].penalties = newDays[dayIdx].penalties.filter(p => p.id !== penaltyId);
         onUpdate({...tournament, days: newDays});
     }
  };

  const handleResetMatch = (matchId: string) => {
    if(!confirm("Reset this lobby? All data will be lost.")) return;
    const newDays = [...tournament.days];
    const dayIdx = newDays.findIndex(d => d.id === selectedDayId);
    if(dayIdx >= 0) {
        const mIdx = newDays[dayIdx].matches.findIndex(m => m.id === matchId);
        if(mIdx >= 0) {
            newDays[dayIdx].matches[mIdx].results = [];
            newDays[dayIdx].matches[mIdx].isCompleted = false;
            onUpdate({...tournament, days: newDays});
        }
    }
  };

  const handleAnalyzeMatch = async (matchId: string) => {
      setAnalyzingMatchId(matchId);
      const newDays = [...tournament.days];
      const dIdx = newDays.findIndex(d => d.id === selectedDayId);
      if(dIdx < 0) return;
      const mIdx = newDays[dIdx].matches.findIndex(m => m.id === matchId);
      if(mIdx < 0) return;

      const match = newDays[dIdx].matches[mIdx];
      
      try {
          const allExtractedData = await Promise.all(
              match.screenshots.map(base64 => {
                  const mimeType = base64.match(/:(.*?);/)?.[1] || 'image/png';
                  const data = base64.split(',')[1];
                  return extractMatchData(data, mimeType, activeTeams.map(t => t.name));
              })
          );

          const flatExtracted = allExtractedData.flat();

          if (flatExtracted.length === 0) {
              alert("AI Analysis complete but NO data was found. Please ensure screenshots are clear.");
              setAnalyzingMatchId(null);
              return;
          }

          const resultsMap = new Map<string, TeamMatchResult>();

          flatExtracted.forEach(ex => {
               const rawName = ex.teamName;
               const exNumMatch = rawName.match(/(\d+)/);
               const exNum = exNumMatch ? parseInt(exNumMatch[0], 10) : null;

               let team = null;
               const isGenericIdentifier = /^(team|slot|#|no\.?)?\s*\d+$/i.test(rawName) || /^\d+$/.test(rawName);
               
               if (isGenericIdentifier && exNum !== null && exNum > 0 && exNum <= activeTeams.length) {
                    team = activeTeams[exNum - 1];
               } 
               
               if (!team) {
                   team = activeTeams.find(t => {
                        const nTeam = normalizeStr(t.name);
                        const nEx = normalizeStr(rawName);
                        if (nTeam === nEx || nTeam.includes(nEx) || nEx.includes(nTeam)) return true;
                        return false;
                   });
               }
               
               if(team) {
                   const placePts = tournament.scoring.rankPoints[ex.rank - 1] || 0;
                   const killPts = ex.kills * tournament.scoring.pointsPerKill;
                   const total = placePts + killPts;
                   
                   if (!resultsMap.has(team.id)) {
                       resultsMap.set(team.id, {
                           teamId: team.id,
                           kills: ex.kills,
                           place: ex.rank,
                           totalPoints: total
                       });
                   } else {
                       const existing = resultsMap.get(team.id)!;
                       if (ex.rank < existing.place) {
                           resultsMap.set(team.id, {
                               teamId: team.id,
                               kills: ex.kills,
                               place: ex.rank,
                               totalPoints: total
                           });
                       }
                   }
               }
          });
          
          if (resultsMap.size === 0) {
              alert("AI found data but could NOT match any teams to your roster. Check your team names/slots.");
              setAnalyzingMatchId(null);
              return;
          }

          newDays[dIdx].matches[mIdx].results = Array.from(resultsMap.values());
          newDays[dIdx].matches[mIdx].isCompleted = true;
          onUpdate({ ...tournament, days: newDays });
      } catch (err) {
          console.error("Analysis failed", err);
          alert("Analysis Failed. Please try again.");
      } finally {
          setAnalyzingMatchId(null);
      }
  };

  const openSanctionModal = (teamId?: string) => {
      setSanctionForm({
          teamId: teamId || (activeTeams[0]?.id || ''),
          type: 'deduction',
          points: 10,
          reason: ''
      });
      setShowSanctionModal(true);
  };

  const submitSanction = () => {
      let points = Math.abs(sanctionForm.points);
      if (sanctionForm.type === 'deduction') points = -points;
      handleAddPenalty(sanctionForm.teamId, points, sanctionForm.reason);
      setShowSanctionModal(false);
  };

  const handleExport = (format: 'csv' | 'xls' | 'pdf') => {
      const data = dailyStandings.map((s, i) => ({
          rank: i + 1,
          team: s.team.name,
          kills: s.kills,
          placePts: s.placePts,
          killPts: s.killPts,
          sanctions: s.penaltyPts,
          total: s.total
      }));

      const sanitizedName = tournament.name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const dayLabel = currentDayData?.date || `Day${currentDayData?.dayNumber}`;
      const fileName = `${sanitizedName}_${dayLabel}_Report`;

      if (format === 'csv') {
          const headers = ['Rank', 'Team', 'Kills', 'Place Pts', 'Kill Pts', 'Sanctions', 'Total'];
          const rows = data.map(d => [`#${d.rank}`, d.team, d.kills, d.placePts, d.killPts, d.sanctions, d.total]);
          downloadCSV(`${fileName}.csv`, headers, rows);
      } else if (format === 'xls') {
          // Construct HTML Table for XLS compatibility
          const tableContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                <style>
                    body { font-family: Arial, sans-serif; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #000; padding: 5px; text-align: center; }
                    th { background-color: #4CAF50; color: white; }
                    tr:nth-child(even) { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h2>${tournament.name} - ${dayLabel}</h2>
                <table>
                    <thead>
                        <tr><th>Rank</th><th>Team</th><th>Kills</th><th>Place Pts</th><th>Kill Pts</th><th>Sanctions</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${data.map(d => `
                            <tr>
                                <td>${d.rank}</td>
                                <td>${d.team}</td>
                                <td>${d.kills}</td>
                                <td>${d.placePts}</td>
                                <td>${d.killPts}</td>
                                <td>${d.sanctions}</td>
                                <td><strong>${d.total}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
          `;
          const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${fileName}.xls`;
          link.click();
          URL.revokeObjectURL(url);
      } else if (format === 'pdf') {
          // Use Browser Print for PDF
          const printWindow = window.open('', '', 'height=600,width=800');
          if (printWindow) {
              printWindow.document.write('<html><head><title>Report</title>');
              printWindow.document.write(`
                <style>
                    body { font-family: 'Helvetica', sans-serif; padding: 20px; }
                    h1 { text-align: center; color: #333; margin-bottom: 20px; }
                    .meta { text-align: center; color: #666; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: #009879; color: #ffffff; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
                    tr:nth-of-type(even) { background-color: #f3f3f3; }
                    tr:last-of-type { border-bottom: 2px solid #009879; }
                    .total-cell { font-weight: bold; color: #009879; }
                </style>
              `);
              printWindow.document.write('</head><body>');
              printWindow.document.write(`<h1>${tournament.name}</h1>`);
              printWindow.document.write(`<div class="meta">${dayLabel} Report | Generated by BlackHacks</div>`);
              printWindow.document.write(`
                <table>
                    <thead>
                        <tr><th>#</th><th>TEAM</th><th>KILLS</th><th>PLACE PTS</th><th>KILL PTS</th><th>SANCTIONS</th><th>TOTAL</th></tr>
                    </thead>
                    <tbody>
                        ${data.map(d => `
                            <tr>
                                <td>${d.rank}</td>
                                <td>${d.team}</td>
                                <td>${d.kills}</td>
                                <td>${d.placePts}</td>
                                <td>${d.killPts}</td>
                                <td>${d.sanctions}</td>
                                <td class="total-cell">${d.total}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
              `);
              printWindow.document.write('</body></html>');
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                  printWindow.print();
                  printWindow.close();
              }, 500);
          }
      }
  };

  return (
    <div className="h-full flex flex-col bg-[#030712] text-white">
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded"><ArrowLeft/></button>
                <div>
                    <h1 className="font-tech text-2xl uppercase font-bold flex items-center gap-2">
                        {tournament.name}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                            {tournament.type === 'scrim' ? 'Daily Scrims' : 'Ranked Tournament'}
                        </span>
                    </h1>
                    <div className="flex gap-4 text-xs text-slate-500 font-mono mt-1">
                        <span>{currentDayData?.date ? currentDayData.date : `DAY ${currentDayData?.dayNumber || 1}`}</span>
                        <span>{activeTeams.length} TEAMS</span>
                    </div>
                </div>
            </div>
            <div className="flex bg-slate-900 rounded p-1">
                {['overview', 'matches', 'intel', 'manage'].map(t => (
                    <button 
                        key={t}
                        onClick={() => setTab(t as any)}
                        className={`px-4 py-2 rounded text-xs font-bold font-tech uppercase transition-all ${tab === t ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                        {t === 'matches' ? 'LOBBIES' : t}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 relative">
            {tab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <TechCard title="LEADERBOARD" icon={<Trophy className="w-5 h-5"/>} className="min-h-[400px]">
                            {dailyStandings.length > 0 ? (
                                <div className="space-y-2">
                                    {dailyStandings.slice(0, 5).map((stat, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
                                            <div className="flex items-center gap-4">
                                                <span className={`text-xl font-bold font-mono ${i===0?'text-yellow-400':i===1?'text-slate-300':i===2?'text-amber-600':'text-slate-600'}`}>#{i+1}</span>
                                                <span className="font-bold">{stat.team.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold font-mono text-cyan-400">{stat.total}</div>
                                                <div className="text-xs text-slate-500">{stat.kills} KILLS</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-500 py-12">No data for selected day.</div>
                            )}
                        </TechCard>
                    </div>
                    <div className="space-y-6">
                         <TechCard title={tournament.type === 'scrim' ? "SCRIM CALENDAR" : "DAY SELECTOR"} icon={<Calendar className="w-5 h-5"/>}>
                             <div className="space-y-4">
                                 {tournament.type === 'scrim' && (
                                     <div className="flex gap-2">
                                         <input 
                                            type="date" 
                                            className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white"
                                            value={newScrimDate}
                                            onChange={e => setNewScrimDate(e.target.value)}
                                         />
                                         <button onClick={handleAddScrimDay} className="p-2 bg-cyan-600 text-white rounded text-xs font-bold hover:bg-cyan-500">ADD DAY</button>
                                     </div>
                                 )}
                                 
                                 <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                                     {tournament.days.map(d => (
                                         <button 
                                            key={d.id}
                                            onClick={() => setSelectedDayId(d.id)}
                                            className={`p-3 rounded text-xs font-bold border flex flex-col items-center justify-center transition-all ${selectedDayId === d.id ? 'bg-cyan-900/40 border-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-slate-900/50 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                                         >
                                             {d.date ? (
                                                 <>
                                                    <span className="text-[10px] text-slate-400 uppercase">{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                                    <span className="text-lg">{new Date(d.date).getDate()}</span>
                                                    <span className="text-[10px] uppercase">{new Date(d.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                                                 </>
                                             ) : `DAY ${d.dayNumber}`}
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         </TechCard>
                    </div>
                </div>
            )}

            {tab === 'matches' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Check if roster is empty for this day (Scrims) */}
                    {activeTeams.length === 0 && (
                        <div className="col-span-full bg-yellow-900/20 border border-yellow-500/50 p-6 rounded-lg text-center">
                            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4"/>
                            <h3 className="text-xl font-bold text-white mb-2">NO ROSTER SET FOR {currentDayData?.date || 'THIS DAY'}</h3>
                            <p className="text-slate-400 mb-6">Please go to the "Manage" tab to set the slots for this scrim day before adding results.</p>
                            <button onClick={() => setTab('manage')} className="bg-yellow-600 text-black font-bold px-6 py-3 rounded hover:bg-yellow-500">GO TO MANAGE</button>
                        </div>
                    )}

                    {activeTeams.length > 0 && currentDayData?.matches.map((match) => (
                        <TechCard key={match.id} title={`LOBBY ${match.matchNumber}`} icon={<Crosshair className="w-5 h-5"/>}>
                            {match.isCompleted ? (
                                <div className="text-center py-4">
                                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2"/>
                                    <h3 className="text-white font-bold mb-4">COMPLETED</h3>
                                    
                                    <div className="bg-slate-950 p-2 rounded mb-4 text-left border border-slate-800">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Results Preview</div>
                                        {match.results.sort((a,b) => a.place - b.place).slice(0, 3).map((r, idx) => {
                                            const tName = activeTeams.find(t=>t.id===r.teamId)?.name || 'Unknown';
                                            return (
                                                <div key={idx} className="flex justify-between text-xs text-slate-300 mb-1">
                                                    <span>#{r.place} {tName}</span>
                                                    <span className="text-cyan-500">{r.totalPoints}pts</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex gap-2 justify-center mb-4">
                                        {match.screenshots.slice(0, 3).map((src, idx) => (
                                            <img key={idx} src={src} className="w-10 h-10 object-cover rounded border border-slate-700"/>
                                        ))}
                                    </div>
                                    <button onClick={() => handleResetMatch(match.id)} className="text-red-500 text-xs underline">RESET LOBBY DATA</button>
                                </div>
                            ) : (
                                <div className="text-center py-4">
                                    {match.screenshots.length > 0 ? (
                                        <div className="mb-6">
                                            <div className="grid grid-cols-3 gap-2 mb-4">
                                                {match.screenshots.map((src, idx) => (
                                                    <div key={idx} className="relative group">
                                                        <img src={src} className="w-full h-16 object-cover rounded border border-slate-700"/>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newDays = [...tournament.days];
                                                                const dIdx = newDays.findIndex(d => d.id === selectedDayId);
                                                                if (dIdx === -1) return;
                                                                const mIdx = newDays[dIdx].matches.findIndex(m => m.id === match.id);
                                                                if (mIdx === -1) return;
                                                                
                                                                const current = newDays[dIdx].matches[mIdx].screenshots;
                                                                newDays[dIdx].matches[mIdx].screenshots = current.filter((_, i) => i !== idx);
                                                                onUpdate({ ...tournament, days: newDays });
                                                            }}
                                                            className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all shadow-md transform hover:scale-110"
                                                            title="Delete Screenshot"
                                                        >
                                                            <X className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-slate-400 mb-4">{match.screenshots.length} Screenshots Loaded</p>
                                        </div>
                                    ) : (
                                        <div className="mb-6">
                                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-600">
                                                <ImageIcon className="w-6 h-6 text-slate-500"/>
                                            </div>
                                            <p className="text-slate-500 text-sm">Upload leaderboard screenshots</p>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            id={`file-upload-${match.id}`}
                                            className="hidden"
                                            onChange={async (e) => {
                                                const files = Array.from(e.target.files || []);
                                                if (files.length > 0) {
                                                    const base64s = await Promise.all(files.map(readFileAsBase64));
                                                    const newDays = [...tournament.days];
                                                    const dIdx = newDays.findIndex(d => d.id === selectedDayId);
                                                    const mIdx = newDays[dIdx].matches.findIndex(m => m.id === match.id);
                                                    const currentScreenshots = newDays[dIdx].matches[mIdx].screenshots || [];
                                                    newDays[dIdx].matches[mIdx].screenshots = [...currentScreenshots, ...base64s];
                                                    onUpdate({ ...tournament, days: newDays });
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        
                                        <label 
                                            htmlFor={`file-upload-${match.id}`}
                                            className="block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded cursor-pointer text-xs font-bold text-white transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-4 h-4"/> {match.screenshots.length > 0 ? 'ADD MORE IMAGES' : 'SELECT IMAGES'}
                                        </label>

                                        {match.screenshots.length > 0 && (
                                            <TechButton 
                                                variant="primary" 
                                                className="w-full"
                                                onClick={() => handleAnalyzeMatch(match.id)}
                                                disabled={analyzingMatchId === match.id}
                                            >
                                                {analyzingMatchId === match.id ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin"/> PROCESSING...</>
                                                ) : (
                                                    <><Scan className="w-4 h-4"/> INITIALIZE AI SCAN</>
                                                )}
                                            </TechButton>
                                        )}
                                    </div>
                                </div>
                            )}
                        </TechCard>
                    ))}
                    
                    {activeTeams.length > 0 && (
                        <button 
                            onClick={() => {
                                const newDays = [...tournament.days];
                                const dIdx = newDays.findIndex(d => d.id === selectedDayId);
                                newDays[dIdx].matches.push({
                                    id: Math.random().toString(),
                                    matchNumber: newDays[dIdx].matches.length + 1,
                                    results: [],
                                    screenshots: [],
                                    isCompleted: false
                                });
                                onUpdate({ ...tournament, days: newDays });
                            }}
                            className="border-2 border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-600 hover:border-cyan-500 hover:text-cyan-500 transition-colors h-[320px]"
                        >
                            <Plus className="w-8 h-8 mb-2"/>
                            <span className="font-tech font-bold">ADD LOBBY</span>
                        </button>
                    )}
                </div>
            )}

            {/* INTEL TAB REMAINING SAME LOGIC BUT USING activeTeams */}
            {tab === 'intel' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h2 className="text-xl font-bold text-white">DAILY INTELLIGENCE REPORT</h2>
                        <div className="flex gap-2">
                             <button onClick={() => handleExport('csv')} className="px-3 py-2 bg-slate-900 border border-slate-700 hover:border-green-500 rounded text-xs flex items-center gap-2 text-slate-300 hover:text-white transition-all">
                                 <FileText className="w-4 h-4 text-green-500"/> CSV
                             </button>
                             <button onClick={() => handleExport('xls')} className="px-3 py-2 bg-slate-900 border border-slate-700 hover:border-green-500 rounded text-xs flex items-center gap-2 text-slate-300 hover:text-white transition-all">
                                 <FileSpreadsheet className="w-4 h-4 text-green-500"/> XLS
                             </button>
                             <button onClick={() => handleExport('pdf')} className="px-3 py-2 bg-slate-900 border border-slate-700 hover:border-green-500 rounded text-xs flex items-center gap-2 text-slate-300 hover:text-white transition-all">
                                 <Printer className="w-4 h-4 text-green-500"/> PDF
                             </button>
                             <div className="w-[1px] h-8 bg-slate-800 mx-2"></div>
                             <button onClick={() => openSanctionModal()} className="px-4 py-2 bg-red-900/20 border border-red-500/50 hover:bg-red-900/40 rounded text-xs font-bold text-red-500 flex items-center gap-2 transition-all">
                                 <AlertTriangle className="w-4 h-4"/> ADD SANCTION
                             </button>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900 text-slate-400 text-xs font-mono uppercase">
                                <tr>
                                    <th className="p-4">Rank</th>
                                    <th className="p-4">Team</th>
                                    <th className="p-4 text-center">Place Pts</th>
                                    <th className="p-4 text-center">Kill Pts</th>
                                    <th className="p-4 text-center">Sanctions</th>
                                    <th className="p-4 text-right">Total Score</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                {dailyStandings.map((stat, i) => (
                                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4 font-mono text-cyan-500">#{i+1}</td>
                                        <td className="p-4 font-bold">{stat.team.name}</td>
                                        <td className="p-4 text-center text-slate-400">{stat.placePts}</td>
                                        <td className="p-4 text-center text-slate-400">{stat.killPts} ({stat.kills})</td>
                                        <td className="p-4 text-center">
                                            {stat.penaltyPts !== 0 ? (
                                                <span className={`text-xs px-2 py-1 rounded ${stat.penaltyPts > 0 ? 'bg-green-900/20 text-green-500' : 'bg-red-900/20 text-red-500'}`}>
                                                    {stat.penaltyPts > 0 ? '+' : ''}{stat.penaltyPts}
                                                </span>
                                            ) : <span className="text-slate-600">-</span>}
                                        </td>
                                        <td className="p-4 text-right font-bold font-mono text-xl text-white">{stat.total}</td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => openSanctionModal(stat.team.id)}
                                                className="text-slate-500 hover:text-red-500" title="Add Sanction"
                                            >
                                                <Edit3 className="w-4 h-4"/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'manage' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <TechCard title={tournament.type === 'scrim' ? `ROSTER FOR ${currentDayData?.date || 'TODAY'}` : "GLOBAL ROSTER"} icon={<Users className="w-5 h-5"/>}>
                         <div className="mb-4 text-xs text-slate-500 flex items-center gap-2">
                             {tournament.type === 'scrim' 
                                ? <><Calendar className="w-4 h-4 text-cyan-500"/> Managing slots specifically for: <span className="text-white font-bold">{currentDayData?.date || 'Selected Day'}</span></>
                                : "Update the global list of teams for the entire tournament."
                             }
                         </div>
                         <textarea 
                            value={manageTeamInput}
                            onChange={e => setManageTeamInput(e.target.value)}
                            placeholder="Paste team list here (e.g. 1. Legionaries)..."
                            className="w-full h-40 bg-slate-950 border border-slate-700 rounded p-4 text-xs font-mono text-white mb-4 focus:border-cyan-500 outline-none"
                         />
                         <TechButton onClick={handleUpdateTeams} variant="danger" className="w-full">
                             {tournament.type === 'scrim' ? `UPDATE ROSTER FOR ${currentDayData?.date || 'THIS DAY'}` : 'UPDATE GLOBAL ROSTER'}
                         </TechButton>
                     </TechCard>

                     <TechCard title="SCORING OVERWRITE" icon={<Settings className="w-5 h-5"/>}>
                         <textarea 
                            value={manageAiRule}
                            onChange={e => setManageAiRule(e.target.value)}
                            placeholder="e.g. 1st=20, 2nd=15... (AI will re-parse this)"
                            className="w-full h-40 bg-slate-950 border border-slate-700 rounded p-4 text-xs font-mono text-white mb-4 focus:border-cyan-500 outline-none"
                         />
                         <TechButton onClick={handleUpdateScoring} variant="danger" className="w-full">UPDATE SCORING</TechButton>
                     </TechCard>
                 </div>
            )}
        </div>

        {showSanctionModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-enter">
                    {/* Sanction Modal Content - Reusing existing structure */}
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                        <h3 className="font-tech text-xl text-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-500"/> SANCTION PROTOCOL
                        </h3>
                        <button onClick={() => setShowSanctionModal(false)}><X className="w-5 h-5 text-slate-500 hover:text-white"/></button>
                    </div>
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Target Team</label>
                            <select 
                                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-cyan-500 outline-none"
                                value={sanctionForm.teamId}
                                onChange={e => setSanctionForm({...sanctionForm, teamId: e.target.value})}
                            >
                                {activeTeams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                type="button"
                                onClick={() => setSanctionForm({...sanctionForm, type: 'deduction'})}
                                className={`p-4 rounded border flex flex-col items-center gap-2 transition-all ${sanctionForm.type === 'deduction' ? 'bg-red-900/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                            >
                                <TrendingDown className="w-6 h-6"/>
                                <span className="font-bold">PENALTY (-)</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setSanctionForm({...sanctionForm, type: 'bonus'})}
                                className={`p-4 rounded border flex flex-col items-center gap-2 transition-all ${sanctionForm.type === 'bonus' ? 'bg-green-900/20 border-green-500 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                            >
                                <TrendingUp className="w-6 h-6"/>
                                <span className="font-bold">BONUS (+)</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Points</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white text-center font-mono font-bold text-lg focus:border-cyan-500 outline-none"
                                    value={sanctionForm.points}
                                    onChange={e => setSanctionForm({...sanctionForm, points: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Reason / Infraction</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-cyan-500 outline-none placeholder-slate-700"
                                    placeholder="e.g. Late rotation, Rule 4.2"
                                    value={sanctionForm.reason}
                                    onChange={e => setSanctionForm({...sanctionForm, reason: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                        <button onClick={() => setShowSanctionModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">CANCEL</button>
                        <TechButton onClick={submitSanction} variant={sanctionForm.type === 'deduction' ? 'danger' : 'success'}>
                            CONFIRM {sanctionForm.type === 'deduction' ? 'PENALTY' : 'BONUS'}
                        </TechButton>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [view, setView] = useState<'auth' | 'admin' | 'dashboard' | 'setup'>('auth');
  const [showLicenseGate, setShowLicenseGate] = useState(false);

  useEffect(() => {
      const storedVersion = localStorage.getItem('bh_data_version');
      if (storedVersion !== DATA_VERSION) {
          localStorage.setItem('bh_data_version', DATA_VERSION);
      }
      setTournaments(DB.getTournaments());
      
      const sessionUser = localStorage.getItem('bh_session_user');
      if (sessionUser) {
          try {
              const u = JSON.parse(sessionUser);
              if (DB.getUsers().find(dbU => dbU.id === u.id)) {
                setUser(u);
                if (u.role === 'admin') setView('admin');
                else setView('dashboard');
              }
          } catch(e) {}
      }
  }, []);

  useEffect(() => {
    if (user) {
       localStorage.setItem('bh_session_user', JSON.stringify(user));
       if (user.role !== 'admin' && (user.licenseExpiry || 0) < Date.now()) {
           setShowLicenseGate(true);
       } else {
           setShowLicenseGate(false);
       }
    } else {
       localStorage.removeItem('bh_session_user');
    }
  }, [user]);

  const handleLogout = () => {
      setUser(null);
      setView('auth');
      setActiveTournamentId(null);
  };

  const handleDeleteTournament = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm("Delete this event permanently?")) {
          const updated = tournaments.filter(t => t.id !== id);
          DB.saveTournaments(updated);
          setTournaments(updated);
          if (activeTournamentId === id) setActiveTournamentId(null);
      }
  };

  if (!user) return <AuthScreen onLogin={u => { setUser(u); setView(u.role === 'admin' ? 'admin' : 'dashboard'); }} />;
  if (showLicenseGate) return <LicenseGate user={user} onValidated={setUser} onLogout={handleLogout} />;
  if (view === 'admin') return <AdminPanel onLogout={handleLogout} onEnterApp={() => setView('dashboard')} />;
  if (view === 'setup') return <SetupScreen user={user} onComplete={t => { 
      const updated = [...tournaments, t];
      DB.saveTournaments(updated);
      setTournaments(updated);
      setActiveTournamentId(t.id);
      setView('dashboard');
  }} onCancel={() => setView('dashboard')} />;

  if (activeTournamentId) {
      const t = tournaments.find(t => t.id === activeTournamentId);
      if (t) return <Dashboard tournament={t} onUpdate={updated => {
          const newTournaments = tournaments.map(curr => curr.id === updated.id ? updated : curr);
          DB.saveTournaments(newTournaments);
          setTournaments(newTournaments);
      }} onBack={() => setActiveTournamentId(null)} />;
  }

  const myTournaments = tournaments.filter(t => user.role === 'admin' || t.ownerId === user.id);

  return (
    <div className="min-h-screen bg-[#030712] p-8 text-white">
        <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
            <div>
                <h1 className="font-tech text-3xl">BLACK<span className="text-cyan-500">HACKS</span> MANAGER</h1>
                <p className="text-slate-500 text-sm">Welcome, {user.username}</p>
            </div>
            <div className="flex gap-4">
                {user.role === 'admin' && <button onClick={() => setView('admin')} className="px-3 py-1 bg-slate-800 rounded text-xs">ADMIN</button>}
                <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-red-500 text-xs font-bold"><LogOut className="w-4 h-4"/> LOGOUT</button>
            </div>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <button onClick={() => setView('setup')} className="h-64 bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center hover:border-cyan-500 hover:text-cyan-500 text-slate-500 transition-all">
                <Plus className="w-10 h-10 mb-4"/>
                <span className="font-tech font-bold">CREATE EVENT</span>
            </button>
            
            {myTournaments.map(t => (
                <TechCard key={t.id} className="h-64 cursor-pointer hover:border-cyan-500" onClick={() => setActiveTournamentId(t.id)}
                    rightElement={<button onClick={(e) => handleDeleteTournament(t.id, e)} className="text-slate-600 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>}
                >
                    <div className="text-center mt-4">
                        {t.type === 'scrim' ? <Swords className="w-10 h-10 text-cyan-500 mx-auto mb-4"/> : <Medal className="w-10 h-10 text-amber-500 mx-auto mb-4"/>}
                        <h3 className="font-bold text-lg line-clamp-2">{t.name}</h3>
                        <span className="text-xs text-slate-500 uppercase">{t.type}</span>
                        <div className="mt-4 text-xs text-slate-600">{t.teams.length} Teams | {t.days.length} Days</div>
                    </div>
                </TechCard>
            ))}
        </div>
        
        {myTournaments.length === 0 && (
            <div className="mt-12 text-center opacity-20 pointer-events-none">
                <Shield className="w-24 h-24 mx-auto mb-4"/>
                <p className="font-tech text-xl">NO ACTIVE OPERATIONS</p>
            </div>
        )}
    </div>
  );
};

export default App;