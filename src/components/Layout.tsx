import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  BookOpen, Home, Plus, User, LayoutDashboard, Search as SearchIcon, 
  Bell, MessageCircle, Wallet, Bookmark, Menu, X, LogOut, Sun, Moon, 
  Settings, ChevronRight, HelpCircle, Shield
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import MessageBadge from './MessageBadge';
import CallInterface from './CallInterface';
import { collection, query, where, onSnapshot, orderBy, Timestamp, Timestamp as FirestoreTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function Layout() {
  const { currentUser, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Close menu on route change
    setIsMenuOpen(false);
  }, [location.pathname]);

  if (!currentUser) {
    return <Outlet />; 
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-black text-white' : 'bg-gray-100 text-gray-900'} font-sans`}>
      {/* Side Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-[280px] sm:w-[320px] bg-white dark:bg-zinc-950 z-50 border-r border-gray-200 dark:border-zinc-800 shadow-2xl overflow-y-auto"
            >
              <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-zinc-900">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xl">
                    L
                  </div>
                  <span className="font-bold text-xl dark:text-white">Life Story</span>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 space-y-6">
                {/* User Section */}
                <div 
                  onClick={() => navigate(`/profile/${currentUser.uid}`)}
                  className="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl cursor-pointer transition"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800">
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-white">{currentUser.displayName || 'Me'}</p>
                    <p className="text-xs text-gray-500">View your profile</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>

                {/* Main Links */}
                <div className="space-y-1">
                  <MenuLink to="/dashboard" icon={LayoutDashboard} label="Professional Dashboard" />
                  <MenuLink to="/saved" icon={Bookmark} label="Saved Content" />
                  <MenuLink to="/payouts" icon={Wallet} label="Payments & Wallet" />
                  <MenuLink to="/add" icon={Plus} label="Create New Story" />
                </div>

                {/* Settings & Support */}
                <div className="pt-4 border-t border-gray-100 dark:border-zinc-900 space-y-1">
                  <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Settings & Support</h3>
                  <button 
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl transition text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="bg-gray-100 dark:bg-zinc-900 p-2 rounded-lg">
                        {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-indigo-600" />}
                      </div>
                      <span className="font-medium text-[15px]">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                    </div>
                  </button>
                  <MenuLink to="/notifications" icon={Settings} label="Notification Settings" />
                  <button className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl transition text-left">
                    <div className="bg-gray-100 dark:bg-zinc-900 p-2 rounded-lg"><HelpCircle className="w-5 h-5 text-gray-500" /></div>
                    <span className="font-medium text-[15px]">Help & Support</span>
                  </button>
                  <button className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl transition text-left">
                    <div className="bg-gray-100 dark:bg-zinc-900 p-2 rounded-lg"><Shield className="w-5 h-5 text-gray-500" /></div>
                    <span className="font-medium text-[15px]">Privacy Policy</span>
                  </button>
                </div>

                {/* Footer Action */}
                <button 
                  onClick={async () => {
                    if (confirm("DELETE ACCOUNT? \n\nThis will permanently delete your profile. This action cannot be undone.")) {
                      try {
                        await deleteDoc(doc(db, 'users', currentUser.uid));
                        await logout();
                        navigate('/login');
                      } catch (err) {
                        console.error("Delete failed", err);
                        alert("Could not delete account. Try again later.");
                      }
                    }
                  }}
                  className="w-full flex items-center space-x-3 p-3 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/10 rounded-xl transition text-left font-medium text-xs uppercase tracking-widest opacity-60 hover:opacity-100"
                >
                  <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg"><X className="w-4 h-4" /></div>
                  <span>Delete Account</span>
                </button>

                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition text-left font-bold"
                >
                  <div className="bg-red-100 dark:bg-red-950/30 p-2 rounded-lg"><LogOut className="w-5 h-5" /></div>
                  <span className="text-[15px]">Log Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-20 bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          
          {/* Top Row: Menu, Logo and FB-Style Action Icons */}
          <div className="flex items-center justify-between h-14">
            
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition"
                title="Main Menu"
              >
                <Menu className="w-6 h-6 text-gray-900 dark:text-white" />
              </button>
              
              <NavLink to="/" className="flex items-center space-x-0.5 text-indigo-600 dark:text-white">
                <span className="font-black text-2xl sm:text-3xl tracking-tight lowercase">life story</span>
              </NavLink>
            </div>

            {/* Right Side Icons (FB Style) */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <NavLink 
                to="/payouts" 
                className={({isActive}) => `hidden sm:flex p-2.5 rounded-full transition-colors ${isActive ? 'bg-indigo-100 dark:bg-zinc-900 text-indigo-600 dark:text-white' : 'bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-800'}`}
                title="Wallet & Payouts"
              >
                <Wallet className="w-5 h-5" />
              </NavLink>

              <NavLink 
                to="/add" 
                className={({isActive}) => `flex p-2 rounded-full transition-colors ${isActive ? 'bg-indigo-100 dark:bg-zinc-900 text-indigo-600 dark:text-white' : 'bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-800'}`}
                title="Create Story"
              >
                <div className="border-2 border-current rounded-lg p-0.5">
                  <Plus className="w-5 h-5" />
                </div>
              </NavLink>

              <NavLink 
                to="/search" 
                className={({isActive}) => `flex p-2.5 rounded-full transition-colors ${isActive ? 'bg-indigo-100 dark:bg-zinc-900 text-indigo-600 dark:text-white' : 'bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-800'}`}
                title="Search"
              >
                <SearchIcon className="w-5 h-5" />
              </NavLink>

              <NavLink 
                to="/messenger" 
                className={({isActive}) => `flex p-2.5 rounded-full transition-colors relative ${isActive ? 'bg-indigo-100 dark:bg-zinc-900 text-indigo-600 dark:text-white' : 'bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-800'}`}
                title="Messenger"
              >
                <MessageBadge />
              </NavLink>
            </div>
          </div>

          {/* Secondary Row: Navigation Tabs */}
          <div className="flex items-center justify-between mt-1 sm:mt-0 px-2 sm:px-0">
            <NavLink to="/" className={({isActive}) => `flex-1 py-3 flex justify-center border-b-[3px] transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
              <Home className={`w-[26px] h-[26px] ${location.pathname === '/' ? 'fill-current' : ''}`} />
            </NavLink>
            
            <NavLink to="/notifications" className={({isActive}) => `flex-1 py-3 flex justify-center border-b-[3px] transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
              <NotificationBell />
            </NavLink>

            <NavLink to="/dashboard" className={({isActive}) => `flex-1 py-3 flex justify-center border-b-[3px] transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
              <LayoutDashboard className={`w-[26px] h-[26px] ${location.pathname === '/dashboard' ? 'fill-current' : ''}`} />
            </NavLink>

            <NavLink to="/saved" className={({isActive}) => `flex-1 py-3 flex justify-center border-b-[3px] transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
              <Bookmark className={`w-[26px] h-[26px] ${location.pathname === '/saved' ? 'fill-current' : ''}`} />
            </NavLink>

            <NavLink to={`/profile/${currentUser.uid}`} className={({isActive}) => `flex-1 py-3 flex justify-center border-b-[3px] transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
              <User className={`w-[26px] h-[26px] ${location.pathname.startsWith('/profile') ? 'fill-current' : ''}`} />
            </NavLink>
          </div>

        </div>
      </header>

      <main className="max-w-4xl mx-auto px-0 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
      <CallInterface />
    </div>
  );
}

function MenuLink({ to, icon: Icon, label }: { to: string, icon: any, label: string }) {
  return (
    <NavLink 
      to={to} 
      className={({isActive}) => `flex items-center space-x-3 p-3 rounded-xl transition ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}
    >
      <div className={`p-2 rounded-lg ${to === '/dashboard' ? 'bg-blue-100 dark:bg-blue-900/30' : to === '/saved' ? 'bg-pink-100 dark:bg-pink-900/30' : to === '/payouts' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-zinc-900'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="font-semibold text-[15px]">{label}</span>
    </NavLink>
  );
}
