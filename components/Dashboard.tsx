import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Shield, Wifi, Globe, ExternalLink, RefreshCw } from 'lucide-react';
import { getTechNews } from '../services/gemini';
import { NewsItem } from '../types';

const data = [
  { name: '00:00', traffic: 4000, attacks: 240 },
  { name: '04:00', traffic: 3000, attacks: 139 },
  { name: '08:00', traffic: 2000, attacks: 980 },
  { name: '12:00', traffic: 2780, attacks: 390 },
  { name: '16:00', traffic: 1890, attacks: 480 },
  { name: '20:00', traffic: 2390, attacks: 380 },
  { name: '24:00', traffic: 3490, attacks: 430 },
];

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; sub: string }> = ({ title, value, icon, sub }) => (
  <div className="bg-slate-900/50 p-4 rounded-lg border border-green-900/50 hover:border-green-500/50 transition-colors">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-slate-400 text-sm uppercase tracking-wider">{title}</h3>
      <div className="text-green-500">{icon}</div>
    </div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    <div className="text-xs text-green-600">{sub}</div>
  </div>
);

const Dashboard: React.FC = () => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);

  const fetchNews = async () => {
    setLoadingNews(true);
    const items = await getTechNews();
    setNews(items);
    setLoadingNews(false);
  };

  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <div className="h-full overflow-y-auto pr-2 pb-20">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">System Overview</h1>
        <p className="text-slate-400">Welcome back, Admin. All systems operational.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Traffic" value="2.4 PB" icon={<Activity className="w-5 h-5"/>} sub="+12% from last week" />
        <StatCard title="Threats Blocked" value="14,203" icon={<Shield className="w-5 h-5"/>} sub="99.9% efficiency" />
        <StatCard title="Active Nodes" value="482" icon={<Wifi className="w-5 h-5"/>} sub="All clusters healthy" />
        <StatCard title="Global Ping" value="24ms" icon={<Globe className="w-5 h-5"/>} sub="Optimal latency" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-slate-900/50 p-6 rounded-lg border border-green-900/50">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-green-500" />
            Network Traffic Analysis
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#475569" tick={{fill: '#475569'}} />
                <YAxis stroke="#475569" tick={{fill: '#475569'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#22c55e', color: '#fff' }}
                  itemStyle={{ color: '#4ade80' }}
                />
                <Line type="monotone" dataKey="traffic" stroke="#4ade80" strokeWidth={2} dot={false} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="attacks" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* News Feed */}
        <div className="bg-slate-900/50 p-6 rounded-lg border border-green-900/50 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center">
              <Globe className="w-5 h-5 mr-2 text-green-500" />
              Intel Feed
            </h3>
            <button 
              onClick={fetchNews} 
              disabled={loadingNews}
              className={`p-2 rounded-full hover:bg-slate-800 transition-all ${loadingNews ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-4 h-4 text-green-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
            {loadingNews ? (
              <div className="text-center text-slate-500 mt-10 animate-pulse">Scanning frequencies...</div>
            ) : news.length > 0 ? (
              news.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-950/50 border-l-2 border-green-500/50 hover:border-green-400 transition-all group">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                    <h4 className="text-sm font-semibold text-slate-200 group-hover:text-green-400 mb-1 transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-slate-500">{item.source}</span>
                      <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-green-500" />
                    </div>
                  </a>
                </div>
              ))
            ) : (
                <div className="text-center text-slate-500 mt-10">No intel gathered.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;