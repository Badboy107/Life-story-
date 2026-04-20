import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle } from 'lucide-react';

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="m8 13 4-4 4 4" />
    </svg>
  );
}

export default function MessageBadge() {
  const { currentUser } = useAuth();
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalUnseen = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        
        const unreadCount = data.unreadCount?.[currentUser.uid];
        
        if (typeof unreadCount === 'number') {
          totalUnseen += unreadCount;
        } 
        else {
          if (!data.lastMessageAt) return;
          
          if (!data.lastRead?.[currentUser.uid]) {
             totalUnseen += 1;
             return;
          }

          const lastReadDate = data.lastRead[currentUser.uid]?.toDate?.() || new Date(0);
          const lastMsgDate = data.lastMessageAt?.toDate?.() || new Date(0);
          
          if (lastReadDate < lastMsgDate) {
            totalUnseen += 1;
          }
        }
      });
      
      setUnseenCount(totalUnseen);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <div className="relative flex items-center justify-center">
      <svg 
        viewBox="0 0 24 24" 
        className="w-6 h-6 fill-current"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.453 5.497 3.731 7.153V22l3.418-1.875c.903.25 1.86.388 2.851.388 5.523 0 10-4.145 10-9.255C22 6.145 17.523 2 12 2zm1.091 12.392l-2.545-2.727-4.964 2.727 5.455-5.818 2.545 2.727 4.964-2.727-5.455 5.818z"/>
      </svg>
      {unseenCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-white dark:ring-black flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] shadow-sm transform scale-110">
          {unseenCount > 9 ? '9+' : unseenCount}
        </span>
      )}
    </div>
  );
}
