import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, increment, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, User, Search as SearchIcon, Share2, SlidersHorizontal } from 'lucide-react';
import { handleFirestoreError } from '../lib/utils';
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
}

const CATEGORIES = ['general', 'romantic', 'thriller', 'educational', 'motivational'];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const categoryParam = searchParams.get('category') || '';
  const authorParam = searchParams.get('author') || '';
  const sortParam = searchParams.get('sort') || 'newest';
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  
  const [localQuery, setLocalQuery] = useState(queryParam);
  const [localCategory, setLocalCategory] = useState(categoryParam);
  const [localAuthor, setLocalAuthor] = useState(authorParam);
  const [localSort, setLocalSort] = useState(sortParam);
  const [localStartDate, setLocalStartDate] = useState(startDateParam);
  const [localEndDate, setLocalEndDate] = useState(endDateParam);
  
  const [showFilters, setShowFilters] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [recommendedAuthors, setRecommendedAuthors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAuthors, setLoadingAuthors] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendedAuthors();
  }, []);

  const fetchRecommendedAuthors = async () => {
    setLoadingAuthors(true);
    try {
      const q = query(collection(db, 'users'), limit(5));
      const snap = await getDocs(q);
      setRecommendedAuthors(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching recommended", err);
    } finally {
      setLoadingAuthors(false);
    }
  };

  const toggleStoryExpand = (storyId: string) => {
    const next = new Set(expandedStories);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setExpandedStories(next);
  };
  
  const { currentUser } = useAuth();

  useEffect(() => {
    setLocalQuery(queryParam);
    setLocalCategory(categoryParam);
    setLocalAuthor(authorParam);
    setLocalSort(sortParam);
    setLocalStartDate(startDateParam);
    setLocalEndDate(endDateParam);
    
    if (queryParam.trim() || categoryParam.trim() || authorParam.trim() || startDateParam || endDateParam || sortParam !== 'newest') {
      executeSearch();
      // If there are advanced filters active, show the filter panel
      if (categoryParam || authorParam || startDateParam || endDateParam || sortParam !== 'newest') {
        setShowFilters(true);
      }
    } else {
      setStories([]);
    }
  }, [queryParam, categoryParam, authorParam, startDateParam, endDateParam, sortParam]);

  const executeSearch = async () => {
    setLoading(true);
    try {
      // Fetch reasonably recent stories (limit to 150 for broader advanced search if needed, but keeping 100 for cost limits)
      const sortField = sortParam === 'likes' ? 'likesCount' : sortParam === 'views' ? 'viewsCount' : 'createdAt';
      const qRef = query(collection(db, 'stories'), orderBy(sortField, 'desc'), limit(150));
      const snapshot = await getDocs(qRef);
      
      const lowerQ = queryParam.toLowerCase().trim();
      
      let filteredData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const storiesData: Story[] = [];
      const userCache: Record<string, any> = {};

      for (const data of filteredData) {
        let authorProfile = userCache[data.authorId];

        // Fetch author profile
        if (!authorProfile && data.authorId) {
          const authorDoc = await getDoc(doc(db, 'users', data.authorId));
          if (authorDoc.exists()) {
            authorProfile = authorDoc.data();
            userCache[data.authorId] = authorProfile;
          }
        }
        
        // --- Client-Side Filtering ---
        
        // 1. Text Query Matching
        if (lowerQ) {
          const titleMatch = data.title?.toLowerCase().includes(lowerQ);
          const contentMatch = data.content?.toLowerCase().includes(lowerQ);
          const catMatch = data.category?.toLowerCase().includes(lowerQ);
          if (!titleMatch && !contentMatch && !catMatch) {
            continue; // Skip if it doesn't match query
          }
        }

        // 2. Category Filter
        if (categoryParam && data.category !== categoryParam) {
          continue;
        }

        // 3. Author Name Filter (Exact Match)
        if (authorParam) {
          const authorName = authorProfile?.displayName || 'Anonymous';
          if (authorName.toLowerCase().trim() !== authorParam.toLowerCase().trim()) {
            continue;
          }
        }

        // 4. Date Filters
        if (data.createdAt) {
          const storyDate = data.createdAt.toDate();
          if (startDateParam) {
            const startStr = new Date(startDateParam);
            startStr.setHours(0, 0, 0, 0);
            if (storyDate < startStr) continue;
          }
          if (endDateParam) {
            const endStr = new Date(endDateParam);
            endStr.setHours(23, 59, 59, 999);
            if (storyDate > endStr) continue;
          }
        }

        let isLikedByMe = false;
        // Check if I liked it
        if (currentUser) {
          const likeDoc = await getDoc(doc(db, 'stories', data.id, 'likes', currentUser.uid));
          isLikedByMe = likeDoc.exists();
        }

        storiesData.push({
          ...data,
          authorProfile,
          isLikedByMe
        } as Story);
      }
      
      setStories(storiesData);
    } catch (error) {
      if (error instanceof Error && error.message.includes("offline")) {
        // Suppress offline warning
      } else {
        console.error("Error executing search:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (localQuery.trim()) params.q = localQuery.trim();
    if (localCategory) params.category = localCategory;
    if (localAuthor.trim()) params.author = localAuthor.trim();
    if (localSort !== 'newest') params.sort = localSort;
    if (localStartDate) params.startDate = localStartDate;
    if (localEndDate) params.endDate = localEndDate;
    setSearchParams(params);
  };

  const clearFilters = () => {
    setLocalCategory('');
    setLocalAuthor('');
    setLocalSort('newest');
    setLocalStartDate('');
    setLocalEndDate('');
    
    // Only keep the search query if it exists
    const params: Record<string, string> = {};
    if (localQuery.trim()) {
      params.q = localQuery.trim();
    }
    setSearchParams(params);
  };

  const toggleComments = (storyId: string) => {
    const next = new Set(expandedComments);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setExpandedComments(next);
  };

  const handleCommentAdded = (storyId: string) => {
    setStories(current => current.map(s => 
      s.id === storyId ? { ...s, commentsCount: (s.commentsCount || 0) + 1 } : s
    ));
  };

  const handleLike = async (storyId: string, currentlyLiked: boolean) => {
    if (!currentUser) return;
    
    setStories(current => current.map(s => {
      if (s.id === storyId) {
        return {
          ...s,
          isLikedByMe: !currentlyLiked,
          likesCount: currentlyLiked ? s.likesCount - 1 : s.likesCount + 1
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
      executeSearch(); 
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

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Search</h1>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-black dark:border-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-900'}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Advanced Filters</span>
          </button>
        </div>
        
        <form onSubmit={handleSearchSubmit} className="max-w-3xl space-y-4">
          <div className="relative">
            <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search by keyword..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition shadow-sm"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition hidden sm:block"
            >
              Search
            </button>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="bg-white dark:bg-black p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Category</label>
                  <select 
                    value={localCategory}
                    onChange={(e) => setLocalCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition appearance-none capitalize"
                  >
                    <option value="" className="dark:bg-black">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat} className="dark:bg-black">{cat}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Exact Author Name</label>
                  <input 
                    type="text"
                    value={localAuthor}
                    onChange={(e) => setLocalAuthor(e.target.value)}
                    placeholder="Enter full display name"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Sort By</label>
                  <select 
                    value={localSort}
                    onChange={(e) => setLocalSort(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition appearance-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="likes">Most Liked</option>
                    <option value="views">Most Viewed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Start Date</label>
                  <input 
                    type="date"
                    value={localStartDate}
                    onChange={(e) => setLocalStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">End Date</label>
                  <input 
                    type="date"
                    value={localEndDate}
                    onChange={(e) => setLocalEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-3 mt-5 pt-5 border-t border-gray-100 dark:border-zinc-800">
                <button 
                  type="button" 
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
                >
                  Clear All
                </button>
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-medium transition shadow-sm"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
          
          {/* Mobile search button since it's hidden in the absolute container on mobile */}
          <button 
            type="submit"
            className="w-full sm:hidden bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition"
          >
            Search
          </button>
        </form>
      </div>

      {/* Recommended Authors Section */}
      {!loading && !queryParam && !categoryParam && recommendedAuthors.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recommended Authors</h2>
            <Link to="/discover" className="text-sm font-bold text-blue-600 hover:underline">See All</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedAuthors.map((author) => (
              <Link 
                to={`/profile/${author.uid}`} 
                key={author.uid}
                className="flex items-center p-4 bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition group"
              >
                <div className="relative">
                  {author.photoURL ? (
                    <img src={author.photoURL} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-50 dark:ring-zinc-900" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-zinc-900 flex items-center justify-center text-blue-600">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-green-500 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-black"></div>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">{author.displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{author.followersCount || 0} followers • {author.followingCount || 0} following</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10 dark:text-gray-300">Searching...</div>
      ) : (queryParam || categoryParam || authorParam || startDateParam || endDateParam) ? (
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">
            {stories.length} results found
            {queryParam && <span> for "<span className="font-bold text-gray-900 dark:text-white">{queryParam}</span>"</span>}
            {categoryParam && <span> in category "<span className="font-bold text-gray-900 dark:text-white capitalize">{categoryParam}</span>"</span>}
          </h2>

          {stories.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 inset-x-0">
              <SearchIcon className="w-12 h-12 text-gray-300 dark:text-zinc-800 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">No stories found</h3>
              <p className="mt-1 text-gray-500 dark:text-gray-400">Try adjusting your keywords or category.</p>
            </div>
          ) : (
            stories.map(story => (
              <article key={story.id} className="bg-white dark:bg-black rounded-2xl p-6 border border-gray-100 dark:border-zinc-800 shadow-sm transition hover:shadow-md">
                <div className="flex items-center space-x-3 mb-4">
                  <Link to={`/profile/${story.authorId}`}>
                    {story.authorProfile?.photoURL ? (
                      <img src={story.authorProfile.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-zinc-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </Link>
                  <div>
                    <Link to={`/profile/${story.authorId}`} className="font-medium text-gray-900 dark:text-white hover:underline">
                      {story.authorProfile?.displayName || 'Anonymous'}
                    </Link>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                      <span>{story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), { addSuffix: true }) : 'Just now'}</span>
                      <span>•</span>
                      <span className="capitalize px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded-full text-[10px] uppercase tracking-wider font-semibold">
                        {story.category}
                      </span>
                    </div>
                  </div>
                </div>
                
                <Link to={`/story/${story.id}`}>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 hover:underline">{story.title}</h2>
                </Link>
                
                {story.imageUrl && (
                  <div className="mb-4 mt-3 rounded-xl overflow-hidden aspect-video bg-gray-50 dark:bg-black border border-gray-100 dark:border-zinc-800">
                    <Link to={`/story/${story.id}`}>
                      <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
                    </Link>
                  </div>
                )}
                
                <div className="relative">
                  <p className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed ${!expandedStories.has(story.id) ? 'line-clamp-4' : ''}`}>
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

                <div className="mt-6 flex items-center space-x-6 border-t border-gray-100 dark:border-zinc-800 pt-4">
                  <button 
                    onClick={() => handleLike(story.id, !!story.isLikedByMe)}
                    className={`flex items-center space-x-2 text-sm font-medium transition-colors ${story.isLikedByMe ? 'text-red-500' : 'text-gray-500 dark:text-gray-400 hover:text-red-500'}`}
                  >
                    <Heart className={`w-5 h-5 ${story.isLikedByMe ? 'fill-current' : ''}`} />
                    <span>{story.likesCount || 0}</span>
                  </button>
                  <button 
                    onClick={() => toggleComments(story.id)}
                    className="flex items-center space-x-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>{story.commentsCount || 0}</span>
                  </button>
                  
                  <div className="flex-1"></div>

                  <div className="relative">
                    <button 
                      onClick={() => handleShare(story.id, story.title)}
                      className="flex items-center space-x-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    {copiedLink === story.id && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-zinc-800">Copied!</span>
                    )}
                  </div>
                </div>

                {expandedComments.has(story.id) && (
                  <StoryComments storyId={story.id} onCommentAdded={() => handleCommentAdded(story.id)} />
                )}
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <SearchIcon className="w-16 h-16 text-gray-200 dark:text-gray-800 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-400 dark:text-gray-600">Enter a keyword to start searching</h3>
        </div>
      )}
    </div>
  );
}
