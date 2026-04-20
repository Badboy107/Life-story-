import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { MONETIZATION_RATES, PAYOUT_METHODS } from '../lib/constants';
import { 
  DollarSign, 
  History, 
  Settings, 
  CreditCard, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Loader2,
  Building2,
  Bitcoin,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';

export default function Payouts() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'request' | 'history' | 'settings'>('request');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [earningsStats, setEarningsStats] = useState({
    totalEarned: 0,
    withdrawn: 0,
    pending: 0,
    available: 0
  });
  
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [payoutSettings, setPayoutSettings] = useState<any>(null);
  
  // Form States
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');

  useEffect(() => {
    if (currentUser) {
      fetchPayoutData();
    }
  }, [currentUser]);

  const fetchPayoutData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // 1. Fetch Stories stats (to calculate total earned)
      const storiesQuery = query(collection(db, 'stories'), where('authorId', '==', currentUser.uid));
      const storiesSnap = await getDocs(storiesQuery);
      let totalLikes = 0;
      let totalComments = 0;
      storiesSnap.forEach(doc => {
        const data = doc.data();
        totalLikes += data.likesCount || 0;
        totalComments += data.commentsCount || 0;
      });
      
      const totalEarned = (totalLikes * MONETIZATION_RATES.PER_LIKE) + (totalComments * MONETIZATION_RATES.PER_COMMENT);

      // 2. Fetch Payout Requests
      const requestsQuery = query(collection(db, 'payout_requests'), where('userId', '==', currentUser.uid));
      const requestsSnap = await getDocs(requestsQuery);
      const history: any[] = [];
      let withdrawn = 0;
      let pending = 0;
      
      requestsSnap.forEach(doc => {
        const data = doc.data();
        history.push({ id: doc.id, ...data });
        if (data.status === 'completed') withdrawn += data.amount;
        if (data.status === 'pending') pending += data.amount;
      });
      
      setPayoutHistory(history.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setEarningsStats({
        totalEarned,
        withdrawn,
        pending,
        available: Math.max(0, totalEarned - withdrawn - pending)
      });

      // 3. Fetch Settings
      const settingsRef = doc(db, 'payout_settings', currentUser.uid);
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setPayoutSettings(data);
        setSelectedMethod(data.method || '');
        setPayoutDetails(data.details || '');
      }

    } catch (err) {
      console.error("Error fetching payout data", err);
      setError("Failed to load payout information.");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    
    if (amount > earningsStats.available) {
      setError("Insufficient balance.");
      return;
    }

    if (!selectedMethod || !payoutDetails) {
      setError("Please verify your payout settings first.");
      setTab('settings');
      return;
    }

    setSubmitting(true);
    setError('');
    
    try {
      await addDoc(collection(db, 'payout_requests'), {
        userId: currentUser.uid,
        amount,
        status: 'pending',
        method: selectedMethod,
        details: payoutDetails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setSuccess("Withdrawal request submitted successfully!");
      setWithdrawAmount('');
      fetchPayoutData();
    } catch (err) {
      console.error("Payout request failed", err);
      setError("Failed to submit payout request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    setSubmitting(true);
    setError('');
    
    try {
      const settingsRef = doc(db, 'payout_settings', currentUser.uid);
      const settingsData = {
        userId: currentUser.uid,
        method: selectedMethod,
        details: payoutDetails,
        updatedAt: serverTimestamp()
      };

      if (!payoutSettings) {
        await setDoc(settingsRef, {
          ...settingsData,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(settingsRef, settingsData);
      }
      
      setPayoutSettings(settingsData);
      setSuccess("Payout settings updated.");
    } catch (err) {
      console.error("Failed to save settings", err);
      setError("Failed to save payout settings.");
    } finally {
      setSubmitting(false);
    }
  };

  const setTab = (tab: 'request' | 'history' | 'settings') => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
  };

  const getMethodIcon = (methodId: string) => {
    switch (methodId) {
      case 'bank': return <Building2 className="w-5 h-5" />;
      case 'crypto': return <Bitcoin className="w-5 h-5" />;
      default: return <DollarSign className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium dark:text-gray-400">Loading payout portal...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-0 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center space-x-4">
          <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-200 dark:shadow-none">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Payout Portal</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Manage your story earnings</p>
          </div>
        </div>

        <div className="flex p-1 bg-gray-100 dark:bg-black border dark:border-zinc-800 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => setTab('request')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'request' ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Withdraw
          </button>
          <button 
            onClick={() => setTab('history')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            History
          </button>
          <button 
            onClick={() => setTab('settings')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Global Notifications */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex items-center space-x-3 text-red-600 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-4 rounded-xl flex items-center space-x-3 text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {activeTab === 'request' && (
            <div className="bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                <CreditCard className="w-5 h-5 mr-3 text-indigo-500" />
                Request Withdrawal
              </h2>
              
              <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 mb-8">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Available for Payout</p>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-4xl font-black text-indigo-900 dark:text-indigo-200">${earningsStats.available.toFixed(2)}</span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">USD</span>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-indigo-600/60 dark:text-indigo-400/60 uppercase tracking-widest mb-1">Total Earned</p>
                    <p className="text-lg font-black text-indigo-900/60 dark:text-indigo-200/60">${earningsStats.totalEarned.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {earningsStats.available < 10 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-100 dark:border-zinc-800 rounded-2xl px-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Minimum payout amount is $10.00</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-600 italic">Keep sharing stories to reach the goal!</p>
                </div>
              ) : (
                <form onSubmit={handleWithdraw} className="space-y-6">
                  <div>
                    <label className="block text-sm font-black text-gray-900 dark:text-white mb-2 uppercase tracking-wide">Withdrawal Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input 
                        type="number"
                        step="0.01"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition font-black text-xl"
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Estimated processing time: 3-5 business days</p>
                      <button 
                        type="button"
                        onClick={() => setWithdrawAmount(earningsStats.available.toString())}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black uppercase hover:underline"
                      >
                        Withdraw Max
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-zinc-900 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white dark:bg-zinc-800 rounded-lg text-indigo-600">
                        {selectedMethod ? getMethodIcon(selectedMethod) : <DollarSign className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{payoutSettings ? PAYOUT_METHODS.find(m => m.id === selectedMethod)?.name : 'No payout method set'}</p>
                        <p className="text-[10px] text-gray-500 font-medium truncate max-w-[150px] sm:max-w-[200px]">{payoutDetails || 'Update in settings'}</p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setTab('settings')}
                      className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-zinc-800 hover:shadow-sm"
                    >
                      Change
                    </button>
                  </div>

                  <button 
                    type="submit"
                    disabled={submitting || !withdrawAmount || !payoutSettings}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:text-gray-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center space-x-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                    <span>{submitting ? 'Processing request...' : 'Confirm Withdrawal'}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                <History className="w-5 h-5 mr-3 text-indigo-500" />
                Payout History
              </h2>
              
              {payoutHistory.length === 0 ? (
                <div className="text-center py-12">
                   <div className="bg-gray-50 dark:bg-black w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Clock className="w-8 h-8 text-gray-300 dark:text-zinc-800" />
                   </div>
                   <p className="text-gray-500 dark:text-gray-400 font-medium">No payout history found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {payoutHistory.map(item => (
                    <div key={item.id} className="group p-4 rounded-2xl border border-gray-100 dark:border-zinc-900 bg-gray-50/50 dark:bg-black/20 hover:bg-white dark:hover:bg-zinc-900 transition-all flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-xl ${
                          item.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' :
                          item.status === 'failed' ? 'bg-red-100 text-red-600 dark:bg-red-900/30' :
                          'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30'
                        }`}>
                          {item.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : 
                           item.status === 'failed' ? <XCircle className="w-5 h-5" /> : 
                           <Clock className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                             <span className="text-lg font-black text-gray-900 dark:text-white">${item.amount.toFixed(2)}</span>
                             <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                               item.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                               item.status === 'failed' ? 'bg-red-500/10 text-red-600' :
                               'bg-indigo-500/10 text-indigo-600'
                             }`}>
                               {item.status}
                             </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                            via {PAYOUT_METHODS.find(m => m.id === item.method)?.name} • {item.createdAt?.toDate ? format(item.createdAt.toDate(), 'MMM dd, yyyy') : 'Recently'}
                          </p>
                        </div>
                      </div>
                      <div className="hidden sm:block text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ID: {item.id.substring(0, 8)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                <Settings className="w-5 h-5 mr-3 text-indigo-500" />
                Payout Configuration
              </h2>
              
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div>
                  <label className="block text-sm font-black text-gray-900 dark:text-white mb-4 uppercase tracking-wide">Preferred Method</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {PAYOUT_METHODS.map(method => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethod(method.id)}
                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center space-y-2 ${
                          selectedMethod === method.id 
                            ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-500 text-indigo-700 dark:text-indigo-400 ring-2 ring-indigo-100 dark:ring-0' 
                            : 'border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {getMethodIcon(method.id)}
                        <span className="text-xs font-bold">{method.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black text-gray-900 dark:text-white mb-2 uppercase tracking-wide">
                    {selectedMethod === 'bank' ? 'Account Number / SWIFT / IBAN' : 
                     selectedMethod === 'crypto' ? 'Wallet Address (TRC20/ERC20)' : 
                     'Payment Email (PayPal/Stripe)'}
                  </label>
                  <input 
                    type="text"
                    value={payoutDetails}
                    onChange={(e) => setPayoutDetails(e.target.value)}
                    placeholder="Enter details..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition font-medium"
                  />
                  <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 font-medium italic italic">
                    Ensure these details are correct to avoid failed transactions or loss of funds.
                  </p>
                </div>

                <div className="pt-4">
                   <button 
                    type="submit"
                    disabled={submitting || !selectedMethod || !payoutDetails}
                    className="w-full sm:w-auto px-10 py-4 bg-gray-900 dark:bg-white dark:text-black text-white font-black rounded-2xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  >
                    {submitting ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right Sidebar - Summaries */}
        <div className="space-y-6">
           <div className="bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 p-6 shadow-sm">
             <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">Earnings Summary</h3>
             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Revenue</span>
                 <span className="text-sm font-black text-gray-900 dark:text-white">${earningsStats.totalEarned.toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Processed</span>
                 <span className="text-sm font-black text-green-600">-${earningsStats.withdrawn.toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Pending</span>
                 <span className="text-sm font-black text-indigo-600">-${earningsStats.pending.toFixed(2)}</span>
               </div>
               <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-between items-center">
                 <span className="text-sm font-bold text-gray-900 dark:text-white">Current Balance</span>
                 <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">${earningsStats.available.toFixed(2)}</span>
               </div>
             </div>
           </div>

           <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 dark:shadow-none relative overflow-hidden group">
              <Bitcoin className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 group-hover:rotate-12 transition-transform duration-500" />
              <h3 className="text-sm font-black uppercase tracking-widest mb-2">Help Center</h3>
              <p className="text-xs text-indigo-100 font-medium mb-4 leading-relaxed">Questions about your payouts? Check our monetization policy or contact support.</p>
              <button className="text-xs font-black uppercase bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors backdrop-blur-sm">
                Learn More
              </button>
           </div>
        </div>

      </div>
    </div>
  );
}
