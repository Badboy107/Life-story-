import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

export default function NotificationBell() {
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.docs.length);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <div className="relative pointer-events-none flex items-center justify-center">
      <Bell className="w-6 h-6 sm:w-7 sm:h-7" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-white dark:ring-black flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] shadow-sm transform scale-110">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
