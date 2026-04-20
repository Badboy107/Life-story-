import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Heart, MessageCircle, UserPlus, Check, Trash2, Loader2, MoreHorizontal, User, Search, Settings } from 'lucide-react';
import { formatDistanceToNow, isAfter, subHours } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'message' | 'follow';
  body: string;
  senderId: string;
  isRead: boolean;
  createdAt: any;
  link?: string;
}

interface SenderProfile {
  displayName: string;
  photoURL: string;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderProfile>>({});
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      
      setNotifications(data);
      setLoading(false);

      // Fetch unique sender profiles
      const uniqueSenderIds = Array.from(new Set(data.map(n => n.senderId)));
      const newSenders: Record<string, SenderProfile> = { ...senders };
      
      for (const senderId of uniqueSenderIds) {
        if (!newSenders[senderId]) {
          const senderDoc = await getDoc(doc(db, 'users', senderId));
          if (senderDoc.exists()) {
            newSenders[senderId] = senderDoc.data() as SenderProfile;
          }
        }
      }
      setSenders(newSenders);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const markAsRead = async (id: string) => {
    try {
      const notifRef = doc(db, 'notifications', id);
      await updateDoc(notifRef, { isRead: true });
    } catch (error) {
      console.error("Error marking as read", error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error("Error deleting notification", error);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    });
    
    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all read", error);
    }
  };

  const getBadgeIcon = (type: string) => {
    switch (type) {
      case 'like': 
        return (
          <div className="bg-pink-500 p-1 rounded-full ring-2 ring-white dark:ring-black">
            <Heart className="w-2.5 h-2.5 text-white fill-current" />
          </div>
        );
      case 'comment': 
        return (
          <div className="bg-blue-500 p-1 rounded-full ring-2 ring-white dark:ring-black">
            <MessageCircle className="w-2.5 h-2.5 text-white" />
          </div>
        );
      case 'follow': 
        return (
          <div className="bg-indigo-600 p-1.5 rounded-full ring-2 ring-white dark:ring-black">
            <UserPlus className="w-3 h-3 text-white" />
          </div>
        );
      case 'message': 
        return (
          <div className="bg-green-500 p-1.5 rounded-full ring-2 ring-white dark:ring-black">
            <MessageCircle className="w-3 h-3 text-white" />
          </div>
        );
      default: 
        return (
          <div className="bg-gray-500 p-1.5 rounded-full ring-2 ring-white dark:ring-black">
            <Bell className="w-3 h-3 text-white" />
          </div>
        );
    }
  };

  const renderNotificationItem = (notification: Notification) => {
    const sender = senders[notification.senderId];
    const timeStr = notification.createdAt?.toDate 
      ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: false })
          .replace('about ', '')
          .replace(' hours', 'h')
          .replace(' hour', 'h')
          .replace(' minutes', 'm')
          .replace(' minute', 'm')
          .replace(' seconds', 's')
          .replace(' days', 'd')
          .replace(' day', 'd')
      : '';

    return (
      <div 
        key={notification.id}
        className={`group flex items-start p-3 sm:p-4 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors relative cursor-pointer ${!notification.isRead ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
        onClick={() => {
          if (notification.link) {
            markAsRead(notification.id);
            navigate(notification.link);
          }
        }}
      >
        <div className="relative flex-shrink-0 mr-3">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800">
            {sender?.photoURL ? (
              <img src={sender.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <User className="w-8 h-8" />
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-0.5">
            {getBadgeIcon(notification.type)}
          </div>
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <div className="flex flex-col">
            <p className="text-[15px] sm:text-base leading-tight text-gray-900 dark:text-gray-100">
              <span className="font-bold text-gray-900 dark:text-white mr-1">
                {sender?.displayName || 'Anonymous'}
              </span>
              <span className={notification.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white font-medium'}>
                {notification.body.replace(sender?.displayName || '', '').trim()}
              </span>
            </p>
            <span className={`text-[13px] mt-1 ${!notification.isRead ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
              {timeStr}
            </span>
          </div>

          {notification.type === 'follow' && (
            <div className="flex space-x-2 mt-3">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/profile/${notification.senderId}`);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-6 rounded-lg text-sm flex-1 sm:flex-none transition"
              >
                View Profile
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(notification.id);
                }}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white font-bold py-1.5 px-6 rounded-lg text-sm flex-1 sm:flex-none transition"
              >
                Delete
              </button>
            </div>
          )}
          
          {(notification.type === 'comment' || notification.type === 'like') && (
            <div className="mt-3 flex space-x-2">
               <button 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-6 rounded-lg text-sm flex-1 sm:flex-none transition"
              >
                View Story
              </button>
            </div>
          )}
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            // In a real app we'd show a menu, for now just allow deleting
            deleteNotification(notification.id);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-full text-gray-500 opacity-0 group-hover:opacity-100 transition"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
        
        {!notification.isRead && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-600 rounded-full"></div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const yesterday = subHours(new Date(), 24);
  const newNotifs = notifications.filter(n => !n.isRead || (n.createdAt?.toDate && isAfter(n.createdAt.toDate(), yesterday)));
  const earlierNotifs = notifications.filter(n => n.isRead && (n.createdAt?.toDate && !isAfter(n.createdAt.toDate(), yesterday)));

  return (
    <div className="max-w-[680px] mx-auto bg-white dark:bg-black min-h-screen sm:border-x border-gray-200 dark:border-zinc-800 pb-20">
      <div className="p-4 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-10 border-b border-gray-100 dark:border-zinc-900">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Notifications</h1>
        <div className="flex items-center space-x-3">
          <button className="p-2 bg-gray-100 dark:bg-zinc-900 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800 transition">
            <Search className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <button className="p-2 bg-gray-100 dark:bg-zinc-900 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800 transition">
            <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <button 
            onClick={markAllRead}
            className="p-2 bg-gray-100 dark:bg-zinc-900 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800 transition"
            title="Mark all as read"
          >
            <Check className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="">
        {notifications.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <Bell className="w-16 h-16 text-gray-200 dark:text-zinc-800 mb-4" />
            <h3 className="text-xl font-bold text-gray-400 dark:text-zinc-700">No notifications</h3>
          </div>
        ) : (
          <>
            {newNotifs.length > 0 && (
              <div className="pb-2">
                <h2 className="px-4 py-3 text-lg font-bold text-gray-900 dark:text-white">New</h2>
                {newNotifs.map(renderNotificationItem)}
              </div>
            )}

            {earlierNotifs.length > 0 && (
              <div className="pb-2">
                <h2 className="px-4 py-3 text-lg font-bold text-gray-900 dark:text-white">Earlier</h2>
                {earlierNotifs.map(renderNotificationItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
