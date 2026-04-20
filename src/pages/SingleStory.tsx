import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, increment, setDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, User, Loader2, Share2, ArrowLeft, Eye, Clock, Bookmark, BookmarkCheck, Flag, Maximize2, CheckCheck } from 'lucide-react';
import { handleFirestoreError, calculateReadingTime, cn } from '../lib/utils';
import StoryComments from '../components/StoryComments';
import { createNotification } from '../lib/notifications';
import { MONETIZATION_RATES } from '../lib/constants';
import { DollarSign, ExternalLink, Sparkles } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import AdSense from '../components/AdSense';

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

export default function SingleStory() {
  const { id } = useParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [relatedStories, setRelatedStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [expandedComments, setExpandedComments] = useState(true);
  const { currentUser } = useAuth();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showReported, setShowReported] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isMonetized, setIsMonetized] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0); // Scroll to top when id changes
    if (id) {
      fetchStory().then((fetchedStory) => {
        if (fetchedStory) {
          fetchRelatedStories(fetchedStory);
        }
      });
    }
  }, [id, currentUser]);

  const fetchStory = async () => {
    try {
      if (!id) return null;
      setLoading(true);
      
      const storyDoc = await getDoc(doc(db, 'stories', id));
      if (!storyDoc.exists()) {
        setStory(null);
        setLoading(false);
        return null;
      }

      const data = storyDoc.data() as Omit<Story, 'id'>;
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
        const likeDoc = await getDoc(doc(db, 'stories', id, 'likes', currentUser.uid));
        isLikedByMe = likeDoc.exists();

        const savedDoc = await getDoc(doc(db, `users/${currentUser.uid}/savedStories`, id));
        setIsSaved(savedDoc.exists());
      }

      const fetchedStory = {
        ...data,
        id: storyDoc.id,
        authorProfile,
        isLikedByMe
      };
      
      setStory(fetchedStory);
      
      // Check for monetization eligibility
      checkMonetization(fetchedStory.authorId);
      
      // Increment views count
      try {
        const storyRef = doc(db, 'stories', fetchedStory.id);
        await updateDoc(storyRef, { viewsCount: increment(1) });
      } catch (err) {
        console.error("Error incrementing views:", err);
      }

      return fetchedStory;
    } catch (error) {
      if (error instanceof Error && error.message.includes("offline")) {
         // Silently fail on offline
      } else {
        console.error("Error fetching story:", error);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedStories = async (currentStory: Story) => {
    setLoadingRelated(true);
    try {
      // Fetch up to 5 stories in the same category
      const q = query(
        collection(db, 'stories'),
        where('category', '==', currentStory.category),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      const related: Story[] = [];

      for (const docSnap of snapshot.docs) {
        if (docSnap.id === currentStory.id) continue; // Skip the currently viewed story
        if (related.length >= 3) break; // We only want to show 3 related stories
        
        const data = docSnap.data() as Omit<Story, 'id'>;
        let authorProfile = null;
        
        if (data.authorId) {
          const authorDoc = await getDoc(doc(db, 'users', data.authorId));
          if (authorDoc.exists()) {
            authorProfile = authorDoc.data();
          }
        }

        related.push({
          ...data,
          id: docSnap.id,
          authorProfile
        } as Story);
      }

      setRelatedStories(related);
    } catch (error) {
      console.error("Error fetching related stories:", error);
    } finally {
      setLoadingRelated(false);
    }
  };

  const checkMonetization = async (authorId: string) => {
    try {
      const q = query(collection(db, 'stories'), where('authorId', '==', authorId));
      const snap = await getDocs(q);
      const stories = snap.docs.map(doc => doc.data());
      
      const totalLikes = stories.reduce((acc, s) => acc + (s.likesCount || 0), 0);
      const totalStories = stories.length;
      
      if (totalLikes >= MONETIZATION_RATES.LIKES_REQUIREMENT && totalStories >= MONETIZATION_RATES.STORIES_REQUIREMENT) {
        setIsMonetized(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLike = async () => {
    if (!currentUser || !story) return;
    
    const currentlyLiked = !!story.isLikedByMe;

    // Optimistic UI Update
    setStory((current) => {
      if (!current) return current;
      return {
        ...current,
        isLikedByMe: !currentlyLiked,
        likesCount: currentlyLiked ? current.likesCount - 1 : current.likesCount + 1
      };
    });

    try {
      const storyRef = doc(db, 'stories', story.id);
      const likeRef = doc(db, 'stories', story.id, 'likes', currentUser.uid);

      if (currentlyLiked) {
        await deleteDoc(likeRef);
        await updateDoc(storyRef, { likesCount: increment(-1) });
      } else {
        await setDoc(likeRef, {
          userId: currentUser.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(storyRef, { likesCount: increment(1) });

        // Trigger notification
        if (story.authorId !== currentUser.uid) {
          await createNotification(
            story.authorId,
            currentUser.uid,
            'like',
            `${currentUser.displayName} liked your story: ${story.title}`,
            `/story/${story.id}`
          );
        }
      }
    } catch (error) {
      handleFirestoreError(error, 'like', `stories/${story.id}/likes`, currentUser);
      fetchStory(); // Revert on failure
    }
  };

  const handleSave = async () => {
    if (!currentUser || !story || saving) return;
    
    setSaving(true);
    const currentlySaved = isSaved;
    
    // Optimistic
    setIsSaved(!currentlySaved);

    try {
      const savedRef = doc(db, `users/${currentUser.uid}/savedStories`, story.id);
      
      if (currentlySaved) {
        await deleteDoc(savedRef);
      } else {
        await setDoc(savedRef, {
          storyId: story.id,
          savedAt: serverTimestamp()
        });
      }
    } catch (error) {
      setIsSaved(currentlySaved);
      handleFirestoreError(error, 'save', `users/${currentUser.uid}/savedStories`, currentUser);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!story) return;
    const url = `${window.location.origin}/story/${story.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: story.title,
          text: `Check out this story: ${story.title}`,
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
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCommentAdded = () => {
    if (!story) return;
    setStory({ ...story, commentsCount: (story.commentsCount || 0) + 1 });
  };

  const handleReport = async () => {
    if (!currentUser || !story || reporting) return;
    
    if (!confirm("Are you sure you want to report this story for inappropriate content?")) return;

    setReporting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        storyId: story.id,
        reporterId: currentUser.uid,
        authorId: story.authorId,
        reason: 'Inappropriate content',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setShowReported(true);
      setTimeout(() => setShowReported(false), 3000);
    } catch (error) {
      console.error("Error reporting:", error);
      alert("Failed to report story.");
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center py-20 min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading story...</p>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="text-center py-20 bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Story not found</h3>
        <Link to="/" className="text-indigo-600 mt-2 inline-block">Go back to Feed</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Helmet>
        <title>{story.title} | Life Stories</title>
        <meta name="description" content={story.content.substring(0, 160).replace(/[#*]/g, '') + '...'} />
        <meta property="og:title" content={story.title} />
        <meta property="og:description" content={story.content.substring(0, 160).replace(/[#*]/g, '') + '...'} />
        {story.imageUrl && <meta property="og:image" content={story.imageUrl} />}
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="keywords" content={`${story.category}, life stories, memoir, article, ${story.title.split(' ').join(', ')}`} />
      </Helmet>

      <div className="flex items-center justify-between mb-4">
        <Link to="/" className="inline-flex items-center space-x-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <button 
          onClick={() => setIsReadingMode(!isReadingMode)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isReadingMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-white dark:bg-black text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-800'}`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>{isReadingMode ? 'Disable Reading Mode' : 'Reading Mode'}</span>
        </button>
      </div>

      <article className={cn(
        "rounded-2xl transition-all duration-300 border shadow-sm",
        isReadingMode 
          ? "bg-stone-50 dark:bg-zinc-900/50 p-8 sm:p-12 border-stone-200 dark:border-zinc-800 ring-4 ring-stone-100 dark:ring-zinc-900/30" 
          : "bg-white dark:bg-black p-6 border-gray-100 dark:border-zinc-800"
      )}>
        <h1 className={cn(
          "font-bold text-gray-900 dark:text-white mb-2 leading-tight font-serif tracking-tight transition-all",
          isReadingMode ? "text-4xl sm:text-5xl lg:text-6xl text-center mb-4" : "text-3xl sm:text-4xl"
        )}>{story.title}</h1>

        <div className={cn(
          "flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-8 transition-all",
          isReadingMode ? "justify-center" : ""
        )}>
          <div className="flex items-center space-x-1.5">
            <Clock className="w-4 h-4" />
            <span>{calculateReadingTime(story.content)} min read</span>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1.5">
            <Eye className="w-4 h-4" />
            <span>{story.viewsCount || 0} views</span>
          </div>
        </div>
        
        <div className={cn("flex items-center space-x-4 mb-10 transition-all", isReadingMode ? "justify-center border-b border-stone-200 dark:border-zinc-800 pb-10" : "bg-gray-50 dark:bg-zinc-900/40 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800")}>
          <Link to={`/profile/${story.authorId}`} className="relative group">
            {story.authorProfile?.photoURL ? (
              <img src={story.authorProfile.photoURL} alt="Profile" className="w-16 h-16 rounded-full object-cover ring-4 ring-white dark:ring-black shadow-md transition-transform group-hover:scale-105" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-zinc-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 ring-4 ring-white dark:ring-black shadow-md">
                <User className="w-10 h-10" />
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-blue-600 w-5 h-5 rounded-full border-2 border-white dark:border-black flex items-center justify-center text-[10px] text-white shadow-sm" title="Verified Author">
              <CheckCheck className="w-3 h-3" />
            </div>
          </Link>
          <div className="flex flex-col">
            <Link to={`/profile/${story.authorId}`} className="text-xl font-black text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors tracking-tight">
              {story.authorProfile?.displayName || 'Anonymous Author'}
            </Link>
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 space-x-2">
              <span className="font-medium">Published {story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), { addSuffix: true }) : 'Just now'}</span>
            </div>
          </div>
        </div>
        
        {story.imageUrl && (
          <div className={cn("mb-8 rounded-xl overflow-hidden bg-gray-50 dark:bg-black border border-gray-100 dark:border-zinc-800 w-full transition-all", isReadingMode ? "max-w-4xl mx-auto shadow-xl" : "")}>
            <img src={story.imageUrl} alt={story.title} className="w-full h-auto object-cover max-h-[600px]" />
          </div>
        )}

        <p className={cn(
          "text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed transition-all duration-300",
          isReadingMode 
            ? "text-[20px] sm:text-[23px] font-serif max-w-2xl mx-auto tracking-wide leading-extra-relaxed" 
            : "text-[16px]"
        )}>
          {story.content}
        </p>

        {isMonetized && (
          <div className="space-y-4">
            {/* Real Google Ad Unit */}
            <AdSense adSlot="1234567890" adClient="ca-pub-XXXXXXXXXXXXXXXX" />
            
            {/* Native Promotion fallback/UI */}
            <div className="mb-6 p-6 rounded-3xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 overflow-hidden relative group">
               <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <DollarSign className="w-16 h-16 text-indigo-600 dark:text-indigo-400 rotate-12" />
               </div>
               
               <div className="relative z-10">
                  <div className="flex items-center space-x-2 mb-3">
                     <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-md">Sponsored</span>
                     <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Story Partner</span>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                     <div className="w-full sm:w-24 h-24 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center p-2 flex-shrink-0">
                        <Sparkles className="w-8 h-8 text-indigo-500" />
                     </div>
                     <div className="flex-1 text-center sm:text-left">
                        <h4 className="font-black text-xs sm:text-base text-gray-900 dark:text-white mb-1">Discover Life Premium</h4>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-medium mb-3">Get unlimited access to best-selling memoirs and community-exclusive stories.</p>
                        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center space-x-2 mx-auto sm:mx-0 shadow-lg shadow-indigo-500/20">
                          <span>Learn More</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                     </div>
                  </div>
               </div>
               <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-900/20 text-[9px] text-indigo-400 dark:text-indigo-500 font-bold text-center">
                  This ad supports {story.authorProfile?.displayName?.split(' ')[0] || 'the author'} through our Partner Program.
               </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center space-x-6 border-t border-gray-100 dark:border-zinc-800 pt-4">
          <button 
            onClick={handleLike}
            className={`flex items-center space-x-2 text-[15px] font-medium transition-colors ${story.isLikedByMe ? 'text-red-500' : 'text-gray-500 dark:text-gray-400 hover:text-red-500'}`}
          >
            <Heart className={`w-5 h-5 ${story.isLikedByMe ? 'fill-current' : ''}`} />
            <span>{story.likesCount || 0}</span>
          </button>
          <button 
            onClick={() => setExpandedComments(!expandedComments)}
            className="flex items-center space-x-2 text-[15px] font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span>{story.commentsCount || 0}</span>
          </button>
          
          <div className="flex-1"></div>

          <button 
            onClick={handleShare}
            className="flex items-center space-x-2 text-[15px] font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors relative"
          >
            <Share2 className="w-5 h-5" />
            <span className="hidden sm:inline">Share</span>
            {copiedLink && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded">Copied!</span>
            )}
          </button>

          <button 
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center space-x-2 text-[15px] font-medium transition-colors ${isSaved ? 'text-indigo-600' : 'text-gray-500 dark:text-gray-400 hover:text-indigo-500'}`}
          >
            {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
            <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          <button 
            onClick={handleReport}
            className="flex items-center space-x-2 text-[15px] font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors relative"
          >
            <Flag className={`w-5 h-5 ${reporting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Report</span>
            {showReported && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">Reported!</span>
            )}
          </button>
        </div>

        {expandedComments && (
          <div className="mt-4">
            <StoryComments storyId={story.id} onCommentAdded={handleCommentAdded} />
          </div>
        )}
      </article>

      {/* Related Stories Section */}
      {!loadingRelated && relatedStories.length > 0 && (
        <div className="mt-12 pt-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Related Stories</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {relatedStories.map((relStory) => (
              <Link 
                to={`/story/${relStory.id}`} 
                key={relStory.id} 
                className="bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col group"
              >
                {relStory.imageUrl ? (
                  <div className="aspect-video bg-gray-100 dark:bg-black overflow-hidden">
                     <img src={relStory.imageUrl} alt={relStory.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="aspect-video bg-indigo-50 dark:bg-zinc-900 flex items-center justify-center p-6 text-center">
                     <span className="text-indigo-300 dark:text-indigo-700 font-medium text-sm line-clamp-3 leading-relaxed">{relStory.title}</span>
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-500 mb-2">{relStory.category}</span>
                  <h4 className="font-bold text-gray-900 dark:text-white text-[15px] leading-tight line-clamp-2 mb-4 flex-1 group-hover:underline decoration-2 underline-offset-2">{relStory.title}</h4>
                  
                  <div className="flex items-center space-x-2 mt-auto border-t border-gray-100 dark:border-zinc-800 pt-3">
                    {relStory.authorProfile?.photoURL ? (
                      <img src={relStory.authorProfile.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center"><User className="w-3 h-3 text-gray-500" /></div>
                    )}
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate w-full">{relStory.authorProfile?.displayName || 'Anonymous'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
