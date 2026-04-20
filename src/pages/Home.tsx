import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, increment, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, User, BookOpen, Share2, Plus, Image as ImageIcon, Loader2, Eye, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { handleFirestoreError, calculateReadingTime } from '../lib/utils';
import StoryComments from '../components/StoryComments';

interface Story {
  id: string;
  authorId: string;
  title: string;
  content: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
  updatedAt: any;
  imageUrl?: string;
  authorProfile?: any;
  isLikedByMe?: boolean;
  viewsCount: number;
}

export default function Home() {
  const [stories, setStories] = useState<Story[]>([]);
  const [trending, setTrending] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'following'>('all');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const toggleComments = (storyId: string) => {
    const next = new Set(expandedComments);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setExpandedComments(next);
  };

  const toggleStoryExpand = (storyId: string) => {
    const next = new Set(expandedStories);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setExpandedStories(next);
  };

  const handleCommentAdded = (storyId: string) => {
    setStories(current => current.map(s => 
      s.id === storyId ? { ...s, commentsCount: (s.commentsCount || 0) + 1 } : s
    ));
  };

  useEffect(() => {
    if (activeTab === 'all') {
      fetchStories();
    } else {
      fetchFollowingStories();
    }
    fetchTrending();
  }, [currentUser, activeTab]); 

  const fetchStories = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      await processStories(snapshot.docs);
    } catch (error) {
      console.error("Error fetching stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowingStories = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const followingSnap = await getDocs(collection(db, 'users', currentUser.uid, 'following'));
      const followingIds = followingSnap.docs.map(doc => doc.id);
      
      if (followingIds.length === 0) {
        setStories([]);
        setLoading(false);
        return;
      }

      // Limit to 30 for Firestore 'in' query
      const chunkedIds = followingIds.slice(0, 30);
      const q = query(
        collection(db, 'stories'), 
        where('authorId', 'in', chunkedIds),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      await processStories(snapshot.docs);
    } catch (error) {
      console.error("Error fetching following stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const processStories = async (docs: any[]) => {
    const storiesData: Story[] = [];
    for (const document of docs) {
      const data = document.data() as Omit<Story, 'id'>;
      let authorProfile = null;
      let isLikedByMe = false;

      // Fetch author profile
      if (data.authorId) {
        const authorDoc = await getDoc(doc(db, 'users', data.authorId));
        if (authorDoc.exists()) {
          authorProfile = authorDoc.data();
        }
      }
      
      // Check if I liked it
      if (currentUser) {
        const likeDoc = await getDoc(doc(db, 'stories', document.id, 'likes', currentUser.uid));
        isLikedByMe = likeDoc.exists();
      }

      storiesData.push({
        ...data,
        id: document.id,
        authorProfile,
        isLikedByMe
      });
    }
    setStories(storiesData);
  };

  const fetchTrending = async () => {
    setLoadingTrending(true);
    try {
      const q = query(collection(db, 'stories'), orderBy('viewsCount', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      const trendingData: Story[] = [];
      for (const document of snapshot.docs) {
        const data = document.data() as Story;
        trendingData.push({ ...data, id: document.id });
      }
      setTrending(trendingData);
    } catch (error) {
      console.error("Error fetching trending:", error);
    } finally {
      setLoadingTrending(false);
    }
  };

  const handleLike = async (storyId: string, currentlyLiked: boolean) => {
    if (!currentUser) return;
    
    // Optimistic UI Update
    setStories(current => current.map(s => {
      if (s.id === storyId) {
        return {
          ...s,
          isLikedByMe: !currentlyLiked,
          likesCount: currentlyLiked ? Math.max(0, s.likesCount - 1) : (s.likesCount || 0) + 1
        };
      }
      return s;
    }));

    try {
      const storyRef = doc(db, 'stories', storyId);
      const likeRef = doc(db, 'stories', storyId, 'likes', currentUser.uid);

      if (currentlyLiked) {
        await deleteDoc(likeRef);
        await updateDoc(storyRef, { likesCount: increment(-1) });
      } else {
        await setDoc(likeRef, {
          userId: currentUser.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(storyRef, { likesCount: increment(1) });
      }
    } catch (error) {
      handleFirestoreError(error, 'like', `stories/${storyId}/likes`, currentUser);
      // Optional: reload stories on error to sync state
      // fetchStories(); 
    }
  };

  const handleShare = async (storyId: string, title: string) => {
    const url = `${window.location.origin}/story/${storyId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Check out this story: ${title}`,
          url: url,
        });
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('cancel'))) {
          // User canceled the share, safely ignore
          return;
        }
        console.error("Error sharing:", err);
      }
    } else {
      navigator.clipboard.writeText(url);
      setCopiedLink(storyId);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading your feed...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto space-y-4">
      
      {/* What's on your mind? (FB Style) */}
      <div className="bg-white dark:bg-black rounded-xl p-4 shadow-sm border border-gray-200 dark:border-zinc-800">
        <div className="flex items-center space-x-2">
          <Link to={`/profile/${currentUser?.uid}`}>
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt="ME" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                <User className="w-6 h-6" />
              </div>
            )}
          </Link>
          <div 
            onClick={() => navigate('/add')}
            className="flex-1 bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-full px-4 py-2.5 text-gray-500 dark:text-gray-400 cursor-pointer transition-colors text-[15px] sm:text-base"
          >
            What's on your mind?
          </div>
          <button onClick={() => navigate('/add')} className="p-2 text-green-500 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition-colors">
            <ImageIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Trending Section */}
      <div className="bg-white dark:bg-black rounded-xl p-4 shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-900 dark:text-white flex items-center space-x-2 italic">
            <span className="text-blue-600">★</span>
            <span>Trending Stories</span>
          </h3>
          <Link to="/search" className="text-xs font-bold text-blue-600 hover:underline px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full">Explore all</Link>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
          {loadingTrending ? (
            <div className="flex space-x-4">
              {[1,2,3].map(i => <div key={i} className="w-32 h-20 bg-gray-100 dark:bg-zinc-900 animate-pulse rounded-lg"></div>)}
            </div>
          ) : trending.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No trending stories yet.</p>
          ) : (
            trending.map((story, i) => (
              <Link 
                key={story.id} 
                to={`/story/${story.id}`}
                className="flex-shrink-0 w-48 bg-gray-50 dark:bg-zinc-900 rounded-lg p-3 group border border-gray-100 dark:border-zinc-800 hover:border-blue-500/30 transition-all flex items-start space-x-3 relative"
              >
                <span className="text-2xl font-black text-gray-200 dark:text-zinc-800 italic absolute -bottom-1 right-2 group-hover:text-blue-100 dark:group-hover:text-blue-900/20 transition-colors pointer-events-none">#{i+1}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors mb-2 italic">
                    {story.title}
                  </h4>
                  <div className="flex items-center space-x-2 text-[10px] text-gray-500 font-medium">
                    <span className="flex items-center space-x-0.5"><Eye className="w-3 h-3" /> <span>{story.viewsCount || 0}</span></span>
                    <span>•</span>
                    <span className="capitalize">{story.category}</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Feed Tabs */}
      <div className="flex items-center h-12 bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 mb-4 px-2">
        <button 
          onClick={() => setActiveTab('all')}
          className={`flex-1 h-10 rounded-lg font-bold text-sm transition-all ${activeTab === 'all' ? 'bg-gray-100 dark:bg-zinc-900 text-blue-600 dark:text-white shadow-inner' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}
        >
          For You
        </button>
        <button 
          onClick={() => setActiveTab('following')}
          className={`flex-1 h-10 rounded-lg font-bold text-sm transition-all ${activeTab === 'following' ? 'bg-gray-100 dark:bg-zinc-900 text-blue-600 dark:text-white shadow-inner' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}
        >
          Following
        </button>
      </div>

      {/* Horizontal Stories Section (FB Style) */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide py-1">
        
        {/* Create Story card */}
        <div 
          onClick={() => navigate('/add')}
          className="flex-shrink-0 w-28 sm:w-32 h-44 sm:h-52 bg-white dark:bg-black rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 shadow-sm relative group cursor-pointer"
        >
          <div className="h-3/4 overflow-hidden">
             {currentUser?.photoURL ? (
               <img src={currentUser.photoURL} alt="Me" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
             ) : (
               <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
                 <User className="w-12 h-12" />
               </div>
             )}
          </div>
          <div className="h-1/4 flex flex-col items-center justify-end pb-2">
             <div className="absolute top-[70%] left-1/2 -translate-x-1/2 p-1 bg-white dark:bg-black rounded-full shadow-md">
                <div className="bg-blue-600 text-white p-1 rounded-full">
                  <Plus className="w-5 h-5" />
                </div>
             </div>
             <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-white">Create story</span>
          </div>
        </div>

        {/* Dynamic Stories (from latest posts) */}
        {stories.filter(s => s.imageUrl).slice(0, 8).map(story => (
          <Link 
            key={story.id} 
            to={`/story/${story.id}`}
            className="flex-shrink-0 w-28 sm:w-32 h-44 sm:h-52 rounded-xl overflow-hidden shadow-sm relative group cursor-pointer border border-gray-200 dark:border-zinc-800 bg-gray-100 dark:bg-zinc-900"
          >
            <img 
              src={story.imageUrl} 
              alt={story.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
            />
            {/* Overlay for Author Avatar */}
            <div className="absolute top-2 left-2 p-0.5 bg-blue-600 rounded-full">
              {story.authorProfile?.photoURL ? (
                <img src={story.authorProfile.photoURL} alt="Author" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-white dark:border-black" />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 border-2 border-white dark:border-black">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            {/* Gradient shadow for text visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
            <div className="absolute bottom-2 left-2 right-2">
              <span className="text-[11px] sm:text-xs font-bold text-white line-clamp-1">{story.authorProfile?.displayName || 'Anonymous'}</span>
            </div>
          </Link>
        ))}
      </div>

      {stories.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No stories yet</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Be the first to share your life story.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map(story => (
            <article key={story.id} className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              
              {/* Post Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Link to={`/profile/${story.authorId}`}>
                    {story.authorProfile?.photoURL ? (
                      <img src={story.authorProfile.photoURL} alt="Author" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-zinc-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </Link>
                  <div>
                    <Link to={`/profile/${story.authorId}`} className="font-bold text-[15px] text-gray-900 dark:text-white hover:underline">
                      {story.authorProfile?.displayName || 'Anonymous'}
                    </Link>
                    <div className="text-[13px] text-gray-500 dark:text-gray-400 font-medium flex flex-wrap items-center gap-y-1 gap-x-2">
                       <span>{story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), { addSuffix: true }) : 'Just now'}</span>
                       <span>•</span>
                       <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{calculateReadingTime(story.content)} min read</span>
                       </div>
                       <span>•</span>
                       <span className="capitalize">{story.category}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Post Text Content */}
              <div className="px-4 pb-3">
                <Link to={`/story/${story.id}`}>
                   <h2 className="text-[17px] font-bold text-gray-900 dark:text-white mb-1 hover:underline">{story.title}</h2>
                </Link>
                <div className="relative">
                  <p className={`text-[15px] text-gray-800 dark:text-gray-200 leading-normal ${!expandedStories.has(story.id) ? 'line-clamp-5' : ''}`}>
                    {story.content}
                  </p>
                  {story.content.length > 200 && !expandedStories.has(story.id) && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleStoryExpand(story.id);
                      }}
                      className="text-blue-600 dark:text-blue-400 font-semibold text-[15px] hover:underline mt-1"
                    >
                      ... Read more
                    </button>
                  )}
                  {expandedStories.has(story.id) && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleStoryExpand(story.id);
                      }}
                      className="text-blue-600 dark:text-blue-400 font-semibold text-[15px] hover:underline mt-1 block"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
              
              {/* Post Image */}
              {story.imageUrl && (
                <div className="w-full bg-gray-100 dark:bg-black aspect-video border-y border-gray-100 dark:border-zinc-800">
                  <Link to={`/story/${story.id}`}>
                    <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover" />
                  </Link>
                </div>
              )}

              {/* Stats Bar */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
                <div className="flex items-center text-gray-500 dark:text-gray-400 text-[14px]">
                  <div className="bg-blue-600 rounded-full p-1 mr-1.5 shadow-sm">
                    <Heart className="w-3 h-3 text-white fill-current" />
                  </div>
                  {story.likesCount || 0}
                </div>
                <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400 text-[14px]">
                  <div className="flex items-center space-x-1">
                    <Eye className="w-4 h-4" />
                    <span>{story.viewsCount || 0}</span>
                  </div>
                  <div 
                    onClick={() => toggleComments(story.id)}
                    className="hover:underline cursor-pointer"
                  >
                    {story.commentsCount || 0} comments
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-2 py-1 flex items-center h-11">
                <button 
                  onClick={() => handleLike(story.id, !!story.isLikedByMe)}
                  className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <Heart className={`w-5 h-5 ${story.isLikedByMe ? 'text-blue-600 fill-current' : 'text-gray-600 dark:text-gray-400'}`} />
                  <span className={`text-[15px] font-semibold ${story.isLikedByMe ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'}`}>Like</span>
                </button>
                <button 
                  onClick={() => toggleComments(story.id)}
                  className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-[15px] font-semibold text-gray-600 dark:text-gray-400">Comment</span>
                </button>
                <div className="flex-1 relative">
                  <button 
                    onClick={() => handleShare(story.id, story.title)}
                    className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <Share2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="text-[15px] font-semibold text-gray-600 dark:text-gray-400">Share</span>
                  </button>
                  {copiedLink === story.id && (
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded shadow-lg z-10">Copied!</span>
                  )}
                </div>
              </div>

              {/* Expandable Comments */}
              {expandedComments.has(story.id) && (
                <div className="px-4 pb-4">
                  <StoryComments storyId={story.id} onCommentAdded={() => handleCommentAdded(story.id)} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
