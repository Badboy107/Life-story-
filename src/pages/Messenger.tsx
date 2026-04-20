import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  deleteDoc,
  limit,
  Timestamp,
  increment
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Send, User as UserIcon, Loader2, ArrowLeft, MoreVertical, Search, Phone, Video, MessageCircle, CheckCheck, Trash2, Camera, Sparkles, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../lib/notifications';

// Helper to generate a consistent conversation ID for 1-to-1 chats
const getConversationId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
}

interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  updatedAt: any;
  otherUser?: any; // Fetched profile of the other person
  lastRead?: Record<string, any>;
  typing?: Record<string, boolean>;
}

export default function Messenger() {
  const { id: otherUserId } = useParams<{ id: string }>(); // Context: chatting with a specific user from profile
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMutualFollow, setIsMutualFollow] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check for mutual follow (friendship)
  useEffect(() => {
    if (!currentUser || !activeConv?.otherUser?.uid) {
      setIsMutualFollow(false);
      return;
    }

    const checkMutual = async () => {
      const otherId = activeConv.otherUser.uid;
      
      // Check if I follow them
      const iFollowRef = doc(db, `users/${currentUser.uid}/following`, otherId);
      const iFollowSnap = await getDoc(iFollowRef);
      
      // Check if they follow me
      const theyFollowRef = doc(db, `users/${otherId}/following`, currentUser.uid);
      const theyFollowSnap = await getDoc(theyFollowRef);
      
      setIsMutualFollow(iFollowSnap.exists() && theyFollowSnap.exists());
    };

    checkMutual();
  }, [activeConv?.id, currentUser?.uid]);

  // 1. Fetch user's conversations
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convPromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const otherId = data.participants.find((p: string) => p !== currentUser.uid);
        
        let otherUser = null;
        if (otherId) {
          const userSnap = await getDoc(doc(db, 'users', otherId));
          if (userSnap.exists()) {
            otherUser = { uid: userSnap.id, ...userSnap.data() };
          }
        }

        return {
          id: docSnap.id,
          ...data,
          otherUser
        } as Conversation;
      });
      
      const convs = await Promise.all(convPromises);
      setConversations(convs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 2. Handle specific chat routing
  useEffect(() => {
    if (!currentUser || !otherUserId) {
        // If no otherUserId in URL, reset activeConv if needed
        if (!otherUserId) setActiveConv(null);
        return;
    };

    const convId = getConversationId(currentUser.uid, otherUserId);
    
    // Check if this conversation exists in state
    const existing = conversations.find(c => c.id === convId);
    if (existing) {
      setActiveConv(existing);
    } else {
      // If not in standard list, fetch specifically or create placeholders
      const fetchSpecific = async () => {
        const convSnap = await getDoc(doc(db, 'conversations', convId));
        if (convSnap.exists()) {
          const data = convSnap.data();
          const userSnap = await getDoc(doc(db, 'users', otherUserId));
          setActiveConv({
             id: convSnap.id,
             ...data,
             otherUser: userSnap.exists() ? { uid: userSnap.id, ...userSnap.data() } : null
          } as Conversation);
        } else {
          // Create a "virtual" conversation for UI before first message
          const userSnap = await getDoc(doc(db, 'users', otherUserId));
          if (userSnap.exists()) {
            setActiveConv({
              id: convId,
              participants: [currentUser.uid, otherUserId],
              updatedAt: serverTimestamp(),
              otherUser: { uid: userSnap.id, ...userSnap.data() },
              isNew: true
            } as any);
          }
        }
      };
      fetchSpecific();
    }
  }, [otherUserId, conversations, currentUser]);

  // 3. Listen for messages in active conversation
  useEffect(() => {
    if (!activeConv || (activeConv as any).isNew) {
        setMessages([]);
        return;
    }

    // Mark as read when entering
    const markAsRead = async () => {
      if (currentUser && activeConv) {
        const convRef = doc(db, 'conversations', activeConv.id);
        await updateDoc(convRef, { 
          [`lastRead.${currentUser.uid}`]: serverTimestamp(),
          [`unreadCount.${currentUser.uid}`]: 0 
        }).catch(() => {});
      }
    };
    markAsRead();

    const q = query(
      collection(db, 'conversations', activeConv.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs);
      markAsRead();
      setTimeout(scrollToBottom, 50);
    });

    return () => unsubscribe();
  }, [activeConv?.id, currentUser?.uid]);

  // 4. Typing indicators
  useEffect(() => {
    if (!activeConv || !currentUser || (activeConv as any).isNew) return;

    const convRef = doc(db, 'conversations', activeConv.id);
    let typingTimeout: any;

    if (newMessage.length > 0) {
      updateDoc(convRef, { [`typing.${currentUser.uid}`]: true }).catch(() => {});
      
      typingTimeout = setTimeout(() => {
        updateDoc(convRef, { [`typing.${currentUser.uid}`]: false }).catch(() => {});
      }, 3000);
    } else {
      updateDoc(convRef, { [`typing.${currentUser.uid}`]: false }).catch(() => {});
    }

    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [newMessage, activeConv?.id, currentUser?.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !activeConv) return;

    setSending(true);
    const text = newMessage.trim();
    setNewMessage('');

    try {
      const convRef = doc(db, 'conversations', activeConv.id);
      
      // Ensure conversation exists
      const convSnap = await getDoc(convRef);
      const receiverId = activeConv.participants.find(p => p !== currentUser.uid);

      if (!convSnap.exists()) {
        await setDoc(convRef, {
          participants: activeConv.participants,
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastRead: { [currentUser.uid]: serverTimestamp() },
          unreadCount: { 
            [currentUser.uid]: 0,
            [receiverId || '']: 1 
          },
          typing: { [currentUser.uid]: false }
        });
      } else {
        await updateDoc(convRef, {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          [`lastRead.${currentUser.uid}`]: serverTimestamp(),
          [`unreadCount.${receiverId}`]: increment(1),
          [`typing.${currentUser.uid}`]: false
        });
      }

      // Add message
      await addDoc(collection(db, 'conversations', activeConv.id, 'messages'), {
        senderId: currentUser.uid,
        text,
        createdAt: serverTimestamp()
      });

      // Trigger notification
      if (otherUserId) {
        await createNotification(
          otherUserId,
          currentUser.uid,
          'message',
          `${currentUser.displayName} sent you a message: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
          `/messenger/${currentUser.uid}`
        );
      }

    } catch (error) {
      console.error("Error sending message", error);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeConv) return;
    if (window.confirm("Delete this message?")) {
      try {
        await deleteDoc(doc(db, 'conversations', activeConv.id, 'messages', messageId));
      } catch (err) {
        console.error("Error deleting message", err);
      }
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!activeConv) return;
    try {
      const msgRef = doc(db, 'conversations', activeConv.id, 'messages', messageId);
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) return;

      const currentReactions = msgSnap.data().reactions || {};
      const newReactions = { ...currentReactions };
      
      // Toggle logic: if user already reacted with this, remove it? 
      // For simplicity, just increment count or set it.
      newReactions[emoji] = (newReactions[emoji] || 0) + 1;

      await updateDoc(msgRef, { reactions: newReactions });
    } catch (err) {
      console.error("Error reacting", err);
    }
  };

  const handleSetBackground = async () => {
    if (!activeConv) return;
    const url = prompt("Enter a background image URL (e.g., direct link to a photo):");
    if (url === null) return;

    try {
      const convRef = doc(db, 'conversations', activeConv.id);
      await updateDoc(convRef, { 
        'theme.backgroundUrl': url,
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error("Error setting background", err);
    }
  };

  const isOtherUserTyping = activeConv?.typing?.[otherUserId || ''] === true;
  const hasOtherUserRead = () => {
    if (!activeConv?.lastRead?.[otherUserId || ''] || !activeConv.lastMessageAt) return false;
    const lastReadTS = activeConv.lastRead[otherUserId || ''];
    const lastMsgTS = activeConv.lastMessageAt;
    
    const readDate = lastReadTS instanceof Timestamp ? lastReadTS.toDate() : (lastReadTS?.toDate?.() || new Date(0));
    const msgDate = lastMsgTS instanceof Timestamp ? lastMsgTS.toDate() : (lastMsgTS?.toDate?.() || new Date(0));
    
    return readDate >= msgDate;
  };

  const initiateCall = (type: 'audio' | 'video') => {
    if (!activeConv?.otherUser || !currentUser) return;
    
    // Dispatch custom event to trigger CallInterface
    window.dispatchEvent(new CustomEvent('start-call', {
      detail: {
        userId: activeConv.otherUser.uid,
        userName: activeConv.otherUser.displayName,
        userAvatar: activeConv.otherUser.photoURL,
        type
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white dark:bg-black rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 shadow-sm relative">
      
      {/* Sidebar: Conversations List */}
      <div className={cn(
        "w-full md:w-80 border-r border-gray-200 dark:border-zinc-800 flex flex-col transition-all",
        activeConv ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b border-gray-200 dark:border-zinc-800">
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Chats</h2>
          <div className="bg-gray-100 dark:bg-zinc-900 rounded-lg px-3 py-2 flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search Messenger" 
              className="bg-transparent border-none outline-none text-sm w-full text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stories Bar */}
          <div className="px-2 py-3 flex space-x-3 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-zinc-800 bg-white/50 dark:bg-black/50 backdrop-blur-md sticky top-0 z-10">
            <div className="flex flex-col items-center space-y-1 min-w-[64px] group cursor-pointer">
              <div className="w-14 h-14 rounded-full border border-dashed border-gray-300 dark:border-zinc-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                <Link to="/add-story" className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center text-gray-500 group-hover:text-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 shadow-inner">
                   <span className="text-xl font-bold">+</span>
                </Link>
              </div>
              <span className="text-[10px] font-medium text-gray-400">Your Story</span>
            </div>
            {conversations.slice(0, 8).map(conv => (
              <div key={conv.id} className="flex flex-col items-center space-y-1 min-w-[64px] cursor-pointer group">
                <div className="relative p-0.5 rounded-full border-2 border-blue-600 group-active:scale-95 transition-transform">
                  {conv.otherUser?.photoURL ? (
                    <img src={conv.otherUser.photoURL} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-black" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-zinc-900 flex items-center justify-center ring-2 ring-white dark:ring-black">
                       <UserIcon className="w-6 h-6 text-indigo-400" />
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-black rounded-full shadow-sm ring-1 ring-black/5"></div>
                </div>
                <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white truncate w-14 text-center">
                  {conv.otherUser?.displayName?.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>

          {conversations.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-gray-500">No conversations yet.</p>
            </div>
          ) : (
            conversations.map(conv => {
                const unreadCount = conv.unreadCount?.[currentUser?.uid || ''] || 0;
                const isUnread = unreadCount > 0 || (
                    !conv.unreadCount && 
                    conv.lastMessageAt && 
                    (!conv.lastRead?.[currentUser?.uid || ''] || (conv.lastRead[currentUser?.uid || ''].toDate?.() || 0) < (conv.lastMessageAt.toDate?.() || 0))
                );

                return (
                    <div 
                      key={conv.id}
                      onClick={() => {
                        navigate(`/messenger/${conv.otherUser?.uid}`);
                        // Immediate reset attempt for better UX
                        if (currentUser) {
                          updateDoc(doc(db, 'conversations', conv.id), {
                            [`unreadCount.${currentUser.uid}`]: 0,
                            [`lastRead.${currentUser.uid}`]: serverTimestamp()
                          }).catch(() => {});
                        }
                      }}
                      className={cn(
                        "p-3 flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900 transition-all border-l-4",
                        activeConv?.id === conv.id ? "bg-gray-100 dark:bg-zinc-900 border-blue-600" : "border-transparent",
                        isUnread ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                      )}
                    >
                      <div className="relative">
                        {conv.otherUser?.photoURL ? (
                          <img src={conv.otherUser.photoURL} alt="" className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-gray-500">
                            <UserIcon className="w-6 h-6" />
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={cn("truncate", isUnread ? "font-black text-gray-900 dark:text-white" : "font-bold text-gray-700 dark:text-gray-300")}>
                            {conv.otherUser?.displayName || 'Anonymous'}
                          </p>
                          <span className="text-[10px] text-gray-500">
                            {conv.lastMessageAt?.toDate ? formatDistanceToNow(conv.lastMessageAt.toDate(), { addSuffix: false }) : ''}
                          </span>
                        </div>
                        <p className={cn("text-sm truncate", isUnread ? "font-bold text-blue-600 dark:text-blue-400" : "text-gray-500")}>
                          {conv.lastMessage || 'Start a conversation'}
                        </p>
                      </div>
                      {isUnread && (
                         <div className="flex flex-col items-end">
                            <div className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center">
                               {unreadCount || 1}
                            </div>
                         </div>
                      )}
                    </div>
                )
            })
          )}
        </div>
      </div>

      {/* Main: Chat Window */}
      <div className={cn(
        "flex-1 flex flex-col bg-white dark:bg-black",
        !activeConv ? "hidden md:flex items-center justify-center bg-gray-50 dark:bg-zinc-950" : "flex"
      )}>
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="p-3 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center space-x-3">
                <button onClick={() => navigate('/messenger')} className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Link to={`/profile/${activeConv.otherUser?.uid}`} className="relative group">
                  {activeConv.otherUser?.photoURL ? (
                    <img src={activeConv.otherUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-gray-500">
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
                </Link>
                <div>
                  <Link to={`/profile/${activeConv.otherUser?.uid}`} className="font-bold text-gray-900 dark:text-white hover:underline block leading-tight">
                    {activeConv.otherUser?.displayName || 'Anonymous'}
                  </Link>
                  <span className="text-xs text-green-500 font-medium">
                    {isOtherUserTyping ? (
                        <span className="animate-pulse">Typing...</span>
                    ) : (
                        "Active now"
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-3 text-blue-600">
                {isMutualFollow && (
                  <>
                    <button 
                      onClick={() => initiateCall('audio')}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => initiateCall('video')}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button 
                  onClick={handleSetBackground}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition text-blue-600"
                  title="Update Chat Theme"
                >
                  <Sparkles className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition text-gray-400"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-4 relative"
              style={activeConv?.theme?.backgroundUrl ? { 
                backgroundImage: `url(${activeConv.theme.backgroundUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {}}
            >
              {/* Overlay for readability if background exists */}
              {activeConv?.theme?.backgroundUrl && (
                <div className="absolute inset-0 bg-black/20 dark:bg-black/40 pointer-events-none"></div>
              )}
              
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50 relative z-10 text-blue-600 dark:text-blue-500">
                       <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-zinc-900/50 flex items-center justify-center mb-4">
                          <svg 
                            viewBox="0 0 24 24" 
                            className="w-10 h-10 fill-current"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.453 5.497 3.731 7.153V22l3.418-1.875c.903.25 1.86.388 2.851.388 5.523 0 10-4.145 10-9.255C22 6.145 17.523 2 12 2zm1.091 12.392l-2.545-2.727-4.964 2.727 5.455-5.818 2.545 2.727 4.964-2.727-5.455 5.818z"/>
                          </svg>
                       </div>
                       <p className="text-sm font-medium">No messages yet. Say hi!</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const isMe = msg.senderId === currentUser?.uid;
                      const isLast = i === messages.length - 1;
                      const reactions = msg.reactions || {};
                      
                      return (
                        <motion.div 
                          key={msg.id} 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className={cn(
                            "flex flex-col group relative z-10",
                            isMe ? "ml-auto items-end" : "items-start"
                          )}
                        >
                          <div className={cn("flex items-center space-x-2", isMe ? "flex-row-reverse space-x-reverse" : "flex-row")}>
                             <div className={cn(
                                "relative px-4 py-2 rounded-2xl text-[15px] shadow-sm max-w-sm break-words",
                                isMe 
                                  ? "bg-blue-600 text-white rounded-tr-none" 
                                  : "bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 rounded-tl-none"
                              )}>
                                 {msg.imageUrl ? (
                                    <img 
                                      src={msg.imageUrl} 
                                      alt="Sent image" 
                                      className="rounded-lg max-w-full h-auto max-h-60 object-cover cursor-pointer hover:opacity-90 transition"
                                      onClick={() => window.open(msg.imageUrl, '_blank')}
                                    />
                                 ) : (
                                    msg.text
                                 )}

                                 {/* Reaction display */}
                                 {Object.keys(reactions).length > 0 && (
                                   <div className={cn(
                                     "absolute -bottom-3 flex -space-x-1",
                                     isMe ? "right-2" : "left-2"
                                   )}>
                                     {Object.entries(reactions).map(([reaction, count]) => (
                                       <span key={reaction} className="bg-white dark:bg-zinc-800 rounded-full px-1.5 py-0.5 text-xs shadow-sm border border-gray-100 dark:border-zinc-700">
                                         {reaction}
                                       </span>
                                     ))}
                                   </div>
                                 )}
                              </div>

                              {/* Action buttons (Trash and React) */}
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    const reaction = prompt("Enter an emoji to react:");
                                    if (reaction) handleReact(msg.id, reaction);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                                  title="React"
                                >
                                   <Sparkles className="w-3.5 h-3.5" />
                                </button>
                                {isMe && (
                                  <button 
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Delete"
                                  >
                                     <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                          </div>
                          
                          <div className={cn("flex items-center space-x-1 mt-1 px-1", isMe ? "justify-end" : "justify-start")}>
                             <span className="text-[10px] text-gray-500">
                                {msg.createdAt?.toDate ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true }) : 'Sending...'}
                             </span>
                             {isMe && isLast && hasOtherUserRead() && (
                                <div className="flex items-center space-x-1">
                                   <span className="text-[9px] text-blue-500 font-bold uppercase tracking-wider">Seen</span>
                                   <CheckCheck className="w-3 h-3 text-blue-500" />
                                </div>
                             )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
              </AnimatePresence>
              {isOtherUserTyping && (
                <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex space-x-1.5 items-center text-gray-400 ml-1"
                >
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-300"></div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-black border-t border-gray-200 dark:border-zinc-800 flex items-center space-x-2">
              <button 
                type="button"
                onClick={() => document.getElementById('msg-image-input')?.click()}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition"
                disabled={sending}
              >
                <Camera className="w-5 h-5" />
                <input 
                   id="msg-image-input"
                   type="file" 
                   accept="image/*" 
                   className="hidden" 
                   onChange={async (e) => {
                     const file = e.target.files?.[0];
                     if (!file || !activeConv || !currentUser) return;
                     
                     setSending(true);
                     try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY;
                        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
                           method: 'POST',
                           body: formData,
                        });
                        const data = await response.json();
                        if (data.success) {
                           const receiverId = activeConv.participants.find(p => p !== currentUser.uid);

                           // Send image as message
                           const msgRef = collection(db, `conversations/${activeConv.id}/messages`);
                           await addDoc(msgRef, {
                              senderId: currentUser.uid,
                              text: '',
                              imageUrl: data.data.url,
                              createdAt: serverTimestamp()
                           });
                           await updateDoc(doc(db, 'conversations', activeConv.id), {
                              lastMessage: '📷 Sent an image',
                              lastMessageAt: serverTimestamp(),
                              updatedAt: serverTimestamp(),
                              [`lastRead.${currentUser.uid}`]: serverTimestamp(),
                              [`unreadCount.${currentUser.uid}`]: 0,
                              [`unreadCount.${receiverId}`]: increment(1)
                           });
                        }
                     } catch (err) {
                        console.error("Img upload failed", err);
                     } finally {
                        setSending(false);
                     }
                   }}
                />
              </button>

              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Aa"
                className="flex-1 bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-blue-600 transition"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim() || sending}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition shadow-md"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-10 text-center opacity-60">
             <div className="w-24 h-24 rounded-full bg-blue-50 dark:bg-zinc-900 flex items-center justify-center mb-6">
                <MessageCircle className="w-12 h-12 text-blue-600" />
             </div>
             <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">No conversation selected</h3>
             <p className="text-gray-500 max-w-sm">Select a person from the left sidebar or start a new chat from their profile to begin messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}
