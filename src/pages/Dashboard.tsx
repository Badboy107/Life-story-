import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { BookOpen, Heart, MessageCircle, BarChart3, DollarSign, TrendingUp, Award, CreditCard, Eye, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { MONETIZATION_RATES } from '../lib/constants';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'monetization'>('overview');
  const [stats, setStats] = useState({
    totalStories: 0,
    totalLikes: 0,
    totalComments: 0,
    totalViews: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Monetization Constants from shared source
  const { LIKES_REQUIREMENT, STORIES_REQUIREMENT, PER_LIKE, PER_COMMENT, PER_VIEW_AD } = MONETIZATION_RATES;

  useEffect(() => {
    if (currentUser) {
      fetchDashboardData();
    }
  }, [currentUser]);

  const fetchDashboardData = async () => {
    if (!currentUser) return;
    
    try {
      const q = query(
        collection(db, 'stories'),
        where('authorId', '==', currentUser.uid)
      );
      
      const snapshot = await getDocs(q);
      const userStories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // In JS sort to avoid index creation requirement immediately
      userStories.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      
      let totalLikes = 0;
      let totalComments = 0;
      let totalViews = 0;
      const dataForChart: any[] = [];

      userStories.forEach((story: any) => {
        totalLikes += story.likesCount || 0;
        totalComments += story.commentsCount || 0;
        totalViews += story.viewsCount || 0;
        
        // Prepare chart data
        dataForChart.push({
          name: story.title.length > 10 ? story.title.substring(0, 10) + '...' : story.title,
          Likes: story.likesCount || 0,
          Comments: story.commentsCount || 0,
          Views: story.viewsCount || 0
        });
      });

      setStats({
        totalStories: userStories.length,
        totalLikes,
        totalComments,
        totalViews
      });
      setChartData(dataForChart.reverse().slice(-7));
      setStories(userStories);
      
    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const isEligible = stats.totalLikes >= LIKES_REQUIREMENT && stats.totalStories >= STORIES_REQUIREMENT;
  const estimatedEarnings = (stats.totalLikes * PER_LIKE) + (stats.totalComments * PER_COMMENT) + (isEligible ? (stats.totalViews * PER_VIEW_AD) : 0);

  const likesProgress = Math.min((stats.totalLikes / LIKES_REQUIREMENT) * 100, 100);
  const storiesProgress = Math.min((stats.totalStories / STORIES_REQUIREMENT) * 100, 100);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-gray-500 animate-pulse font-medium">Analyzing your story metrics...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-full">Creator Studio</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tracking-tighter">
            Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Welcome back, {currentUser?.displayName?.split(' ')[0] || 'Creator'}. Here is your performance overview.</p>
        </div>

        <div className="flex p-1 bg-gray-100/50 dark:bg-zinc-900/50 backdrop-blur-md border border-gray-200 dark:border-zinc-800 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveTab('overview')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              activeTab === 'overview' 
                ? "bg-white dark:bg-black text-gray-900 dark:text-white shadow-xl scale-[1.02]" 
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('monetization')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              activeTab === 'monetization' 
                ? "bg-white dark:bg-black text-gray-900 dark:text-white shadow-xl scale-[1.02]" 
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            Monetization
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content (Left) */}
          <div className="lg:col-span-8 space-y-8">
            {/* Massive Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={BookOpen} label="Stories" value={stats.totalStories} color="indigo" />
              <StatCard icon={Eye} label="Views" value={stats.totalViews} color="emerald" />
              <StatCard icon={Heart} label="Likes" value={stats.totalLikes} color="rose" />
              <StatCard icon={MessageCircle} label="Comments" value={stats.totalComments} color="orange" />
            </div>

            {/* Performance Chart */}
            <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] p-8 border border-gray-100 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-3xl opacity-50 -mr-32 -mt-32 transition-transform duration-1000 group-hover:scale-110"></div>
               
               <div className="relative z-10 flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Growth Analytics</h2>
                  <div className="flex items-center space-x-1.5 px-3 py-1 bg-gray-50 dark:bg-zinc-900/50 rounded-full border border-gray-100 dark:border-zinc-800">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Live Updates</span>
                  </div>
               </div>

               <div className="relative z-10 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="likesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.8}/>
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="name" 
                      stroke="#888888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(0,0,0,0.8)', 
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '20px', 
                        padding: '12px',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                      cursor={{fill: 'rgba(0,0,0,0.05)'}}
                    />
                    <Bar dataKey="Views" fill="rgba(99, 102, 241, 0.1)" radius={[10, 10, 0, 0]} barSize={40} />
                    <Bar dataKey="Likes" fill="url(#likesGradient)" radius={[10, 10, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Story Management Table */}
            <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Recent Content</h2>
                <Link to="/add" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-full transition-transform active:scale-95 shadow-lg shadow-indigo-500/20">
                  New Story
                </Link>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-zinc-900/30">
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Story Title</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reach</th>
                      <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-zinc-900/50">
                    {stories.slice(0, 5).map(story => (
                      <tr key={story.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/20 transition-colors group">
                        <td className="px-8 py-5">
                          <p className="font-bold text-gray-900 dark:text-white line-clamp-1">{story.title}</p>
                          <span className="text-[10px] text-gray-400 font-medium">{story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), {addSuffix: true}) : 'Just now'}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-gray-400 text-[11px] font-bold rounded-lg uppercase tracking-tight">
                            {story.category}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-sm font-bold text-gray-600 dark:text-gray-300">
                          <div className="flex items-center space-x-3">
                             <div className="flex items-center space-x-1">
                               <Eye className="w-3.5 h-3.5 text-indigo-500" />
                               <span>{story.viewsCount || 0}</span>
                             </div>
                             <div className="flex items-center space-x-1">
                               <Heart className="w-3.5 h-3.5 text-rose-500" />
                               <span>{story.likesCount || 0}</span>
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <Link 
                            to={`/stories/${story.id}`}
                            className="inline-flex items-center justify-center p-2 rounded-full bg-gray-100 dark:bg-zinc-900 text-gray-500 hover:text-indigo-600 dark:text-gray-400 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <TrendingUp className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar Insights (Right) */}
          <div className="lg:col-span-4 space-y-8">
            {/* Quick Tips */}
            <div className="bg-indigo-600 dark:bg-indigo-900/50 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
               <TrendingUp className="absolute -bottom-6 -right-6 w-32 h-32 opacity-10 rotate-12" />
               <h3 className="text-xl font-black mb-4 tracking-tight">Creator Tips</h3>
               <ul className="space-y-4">
                 <li className="flex items-start space-x-3 text-sm">
                   <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                   <p className="text-indigo-100 font-medium leading-relaxed">Engagement increases by <span className="text-white font-bold underline underline-offset-4 decoration-indigo-300">24%</span> when you respond to comments within the first hour.</p>
                 </li>
                 <li className="flex items-start space-x-3 text-sm">
                   <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                   <p className="text-indigo-100 font-medium leading-relaxed">Stories with emotional titles tend to get <span className="text-white font-bold underline underline-offset-4 decoration-indigo-300">3x more shares</span>.</p>
                 </li>
               </ul>
            </div>

            {/* Performance Ranking */}
            <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] p-8 border border-gray-100 dark:border-zinc-800 shadow-sm">
               <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6 tracking-tight">Global Ranking</h3>
               <div className="space-y-6">
                  <div className="flex items-center justify-between">
                     <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Global Percentile</span>
                     <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">Top 8%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '92%' }}
                        transition={{ duration: 1.5, delay: 0.5 }}
                        className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full"
                     />
                  </div>
                  <p className="text-xs text-gray-400 font-medium text-center">You are outperforming 92% of creators in the "Life Stories" category this month.</p>
               </div>
            </div>
          </div>
        </div>
      ) : (
        /* Monetization Tab */
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Status Hero */}
          <div className={cn(
            "p-10 rounded-[3rem] border relative overflow-hidden transition-all duration-500",
            isEligible 
              ? "bg-gradient-to-br from-green-600 to-emerald-800 border-green-500 shadow-2xl shadow-green-500/20" 
              : "bg-white dark:bg-zinc-950 border-gray-100 dark:border-zinc-800"
          )}>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="flex items-center space-x-6">
                <div className={cn(
                  "p-5 rounded-[2rem] shadow-xl",
                  isEligible ? "bg-white/20 text-white backdrop-blur-md" : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                )}>
                  <Award className="w-10 h-10" />
                </div>
                <div>
                   <span className={cn(
                     "text-[10px] font-black uppercase tracking-[0.2em] mb-1 block",
                     isEligible ? "text-green-100" : "text-indigo-600 dark:text-indigo-400"
                   )}>
                     Status Report
                   </span>
                   <h2 className={cn("text-3xl font-black tracking-tighter", isEligible ? "text-white" : "text-gray-900 dark:text-white")}>
                     {isEligible ? "Partner Program Active" : "Level Up Your Content"}
                   </h2>
                   <p className={cn("mt-2 font-medium max-w-sm leading-relaxed", isEligible ? "text-green-50" : "text-gray-500")}>
                     {isEligible 
                      ? "Your account is fully monetized. Keep sharing your life stories to maximize your daily earnings." 
                      : "You're on your way to becoming a professional storyteller. Meet the goals below to unlock revenue."}
                   </p>
                </div>
              </div>

              <div className="flex flex-col items-center">
                 <span className={cn("text-[10px] font-black uppercase tracking-widest mb-3", isEligible ? "text-green-100" : "text-gray-400")}>Estimated Revenue</span>
                 <div className="flex items-baseline space-x-1">
                    <span className={cn("text-5xl font-black tracking-tighter", isEligible ? "text-white" : "text-gray-900 dark:text-white")}>
                      ${estimatedEarnings.toFixed(2)}
                    </span>
                    <span className={cn("text-sm font-bold uppercase", isEligible ? "text-green-200" : "text-gray-400")}>usd</span>
                 </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* Progress Box */}
             <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] p-8 border border-gray-100 dark:border-zinc-800 shadow-sm space-y-8">
                <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Milestones</h3>
                
                <div className="space-y-8">
                  <ProgressItem title="Engagement (Likes)" current={stats.totalLikes} target={LIKES_REQUIREMENT} progress={likesProgress} color="rose" />
                  <ProgressItem title="Consistency (Stories)" current={stats.totalStories} target={STORIES_REQUIREMENT} progress={storiesProgress} color="indigo" />
                </div>
             </div>

             {/* Withdrawal Box */}
             <div className="bg-white dark:bg-zinc-950 rounded-[2.5rem] p-8 border border-gray-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div>
                   <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight mb-4">Payout Infrastructure</h3>
                   <div className="space-y-4">
                      <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-2xl flex items-start space-x-3">
                         <CreditCard className="w-5 h-5 text-indigo-500 mt-1" />
                         <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">Earnings are calculated daily</p>
                            <p className="text-xs text-gray-500 font-medium">Revenue is processed based on verified engagement metrics at 12:00 AM UTC.</p>
                         </div>
                      </div>
                      <p className="text-xs text-gray-400 font-medium px-2 leading-relaxed">
                        Once eligible, you can connect your bank account or PayPal to receive monthly payouts.
                      </p>
                   </div>
                </div>
                <Link 
                  to="/payouts"
                  className={cn(
                    "w-full py-4 px-6 text-center font-black uppercase tracking-widest text-xs rounded-2xl transition-all",
                    isEligible 
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/20 active:scale-95" 
                      : "bg-gray-100 dark:bg-zinc-900 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {isEligible ? "Access Payouts Control" : "Unlock Program First"}
                </Link>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: number, color: string }) {
  const colors: Record<string, string> = {
    indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/10",
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/10",
    rose: "text-rose-600 bg-rose-50 dark:bg-rose-900/10",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-900/10"
  };

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-[2rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-sm group hover:scale-[1.02] transition-all duration-300">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:rotate-6", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-gray-500 transition-colors">{label}</p>
      <p className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">{value.toLocaleString()}</p>
    </div>
  );
}

function ProgressItem({ title, current, target, progress, color }: { title: string, current: number, target: number, progress: number, color: string }) {
  const accentColor: Record<string, string> = {
    rose: "bg-rose-500",
    indigo: "bg-indigo-600",
    emerald: "bg-emerald-500"
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
           <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
           <p className="text-lg font-black text-gray-900 dark:text-white tracking-tighter">{current.toLocaleString()} <span className="text-gray-400 font-bold text-sm">/ {target.toLocaleString()}</span></p>
        </div>
        <span className="text-xl font-black text-gray-900 dark:text-white tracking-tighter">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-zinc-900 rounded-full h-3 overflow-hidden p-0.5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={cn("h-full rounded-full shadow-inner shadow-black/10", accentColor[color])}
        />
      </div>
    </div>
  );
}
