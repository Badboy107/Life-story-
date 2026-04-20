import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bookmark, Loader2, User, Eye, Clock, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { calculateReadingTime } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Story {
  id: string;
  authorId: string;
  title: string;
  content: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
  imageUrl?: string;
  authorProfile?: any;
  viewsCount: number;
}

export default function SavedStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      fetchSavedStories();
    }
  }, [currentUser]);

  const fetchSavedStories = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const savedQ = query(
        collection(db, `users/${currentUser.uid}/savedStories`),
        orderBy('savedAt', 'desc')
      );
      const snapshot = await getDocs(savedQ);
      
      const storiesData: Story[] = [];
      for (const savedDoc of snapshot.docs) {
        const storyId = savedDoc.data().storyId;
        const storySnap = await getDoc(doc(db, 'stories', storyId));
        
        if (storySnap.exists()) {
          const data = storySnap.data() as Omit<Story, 'id'>;
          let authorProfile = null;
          
          if (data.authorId) {
            const authorDoc = await getDoc(doc(db, 'users', data.authorId));
            if (authorDoc.exists()) {
              authorProfile = authorDoc.data();
            }
          }

          storiesData.push({
            ...data,
            id: storySnap.id,
            authorProfile
          });
        }
      }
      setStories(storiesData);
    } catch (error) {
      console.error("Error fetching saved stories:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading your bookmarks...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-full transition">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-2">
            <Bookmark className="w-8 h-8 text-indigo-600 fill-current" />
            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Saved Stories</h1>
          </div>
        </div>
      </div>

      {stories.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-black rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
          <Bookmark className="w-12 h-12 text-gray-200 dark:text-zinc-800 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">No stories saved yet</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Bookmark stories you love to read them later.</p>
          <Link to="/" className="mt-6 inline-block text-indigo-600 font-bold hover:underline">Browse Stories</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {stories.map(story => (
            <Link 
              key={story.id} 
              to={`/story/${story.id}`}
              className="bg-white dark:bg-black rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition overflow-hidden group flex flex-col sm:flex-row h-full sm:h-48"
            >
              <div className="w-full sm:w-48 h-48 sm:h-auto bg-gray-100 dark:bg-zinc-900 relative">
                {story.imageUrl ? (
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-6 text-center">
                    <span className="text-indigo-300 dark:text-indigo-700 font-bold text-sm line-clamp-3">{story.title}</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur-md rounded text-[10px] text-white font-bold uppercase tracking-widest">
                  {story.category}
                </div>
              </div>
              
              <div className="flex-1 p-5 flex flex-col">
                <h4 className="font-black text-gray-900 dark:text-white text-lg leading-tight line-clamp-2 mb-2 group-hover:text-indigo-600 transition-colors">
                  {story.title}
                </h4>
                
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{story.viewsCount || 0}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{calculateReadingTime(story.content)} min</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), { addSuffix: true }) : ''}
                  </span>
                </div>

                <div className="mt-auto flex items-center space-x-2">
                  <div className="p-0.5 bg-gray-100 dark:bg-zinc-900 rounded-full">
                    {story.authorProfile?.photoURL ? (
                      <img src={story.authorProfile.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-zinc-900 flex items-center justify-center text-indigo-500">
                        <User className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">
                    {story.authorProfile?.displayName || 'Anonymous'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
