import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc, limit, startAfter } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { X, User as UserIcon, Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface FollowListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following';
  title: string;
}

interface FollowUser {
  uid: string;
  displayName: string;
  photoURL: string;
  bio?: string;
}

export default function FollowListModal({ isOpen, onClose, userId, type, title }: FollowListModalProps) {
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
      setUsers([]);
      setLastDoc(null);
    }
  }, [isOpen, userId, type]);

  const fetchUsers = async (loadMore = false) => {
    setLoading(true);
    try {
      const collectionPath = `users/${userId}/${type}`;
      const q = loadMore && lastDoc 
        ? query(collection(db, collectionPath), limit(20), startAfter(lastDoc))
        : query(collection(db, collectionPath), limit(20));

      const snapshot = await getDocs(q);
      const userRefs = snapshot.docs.map(d => {
          // The ID of the document in the subcollection is the UID of the follower/followed
          return d.id;
      });

      const userPromises = userRefs.map(async (uid) => {
        const uSnap = await getDoc(doc(db, 'users', uid));
        if (uSnap.exists()) {
          return { uid: uSnap.id, ...uSnap.data() } as FollowUser;
        }
        return null;
      });

      const resolvedUsers = (await Promise.all(userPromises)).filter(u => u !== null) as FollowUser[];
      
      if (loadMore) {
        setUsers(prev => [...prev, ...resolvedUsers]);
      } else {
        setUsers(resolvedUsers);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 20);
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-zinc-800"
      >
        <div className="p-4 border-b border-gray-100 dark:border-zinc-900 flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center">
              <UserIcon className="w-12 h-12 text-gray-300 dark:text-zinc-800 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No {type} yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((user) => (
                <Link 
                  to={`/profile/${user.uid}`} 
                  key={user.uid}
                  onClick={onClose}
                  className="flex items-center p-3 space-x-3 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-xl transition-all group"
                >
                  <div className="relative">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-12 h-12 rounded-full object-cover border border-gray-100 dark:border-zinc-800" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center text-gray-400">
                        <UserIcon className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                      {user.displayName}
                    </p>
                    {user.bio && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{user.bio}</p>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}

              {hasMore && (
                <button 
                  onClick={() => fetchUsers(true)}
                  disabled={loading}
                  className="w-full py-3 text-sm font-bold text-blue-600 hover:text-blue-700 transition"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
