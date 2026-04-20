import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, getCountFromServer, writeBatch, increment, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { User as UserIcon, Heart, MessageCircle, Edit2, Camera, Loader2, Save, UserPlus, UserCheck, BookOpen, Share2, Settings as SettingsIcon, LogOut, Sun, Moon, Eye, Clock, Users, Bookmark, CheckCheck } from 'lucide-react';
import StoryComments from '../components/StoryComments';
import FollowListModal from '../components/FollowListModal';
import { createNotification } from '../lib/notifications';
import { Link } from 'react-router-dom';
import { handleFirestoreError, calculateReadingTime } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  coverPhotoUrl?: string;
  bio: string;
  createdAt: any;
}

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const toggleStoryExpand = (storyId: string) => {
    const next = new Set(expandedStories);
    if (next.has(storyId)) next.delete(storyId);
    else next.add(storyId);
    setExpandedStories(next);
  };
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editCoverPhotoUrl, setEditCoverPhotoUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const coverInputRef = React.useRef<HTMLInputElement>(null);

  // Follow states
  const [localFollowers, setLocalFollowers] = useState(0);
  const [localFollowing, setLocalFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followModal, setFollowModal] = useState<{ isOpen: boolean; type: 'followers' | 'following'; title: string }>({
    isOpen: false,
    type: 'followers',
    title: 'Followers'
  });

  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'drafts' ? 'drafts' : 'posts';
  const [activeTab, setActiveTab] = useState<'posts' | 'drafts' | 'about' | 'photos' | 'settings' | 'saved'>(defaultTab as 'posts');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Logout error", error);
    }
  };
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [savedStories, setSavedStories] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  useEffect(() => {
    // Reset tab if user changes
    if (searchParams.get('tab') === 'drafts') {
      setActiveTab('drafts');
    } else {
      setActiveTab('posts');
    }
  }, [id, searchParams]);

  useEffect(() => {
    if (id) {
      fetchProfileAndStories(id);
    }
  }, [id, currentUser]);

  useEffect(() => {
    if (activeTab === 'drafts' && currentUser && id === currentUser.uid && drafts.length === 0) {
      fetchDrafts();
    }
    if (activeTab === 'saved' && currentUser && id === currentUser.uid && savedStories.length === 0) {
      fetchSavedStories();
    }
  }, [activeTab, id, currentUser]);

  const fetchDrafts = async () => {
    if (!currentUser) return;
    setLoadingDrafts(true);
    try {
      const q = query(
        collection(db, 'drafts'),
        where('authorId', '==', currentUser.uid)
      );
      const draftsSnap = await getDocs(q);
      const userDrafts = draftsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      userDrafts.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setDrafts(userDrafts);
    } catch (error) {
      console.error("Error fetching drafts", error);
    } finally {
      setLoadingDrafts(false);
    }
  };

  const fetchSavedStories = async () => {
    if (!currentUser) return;
    setLoadingSaved(true);
    try {
      const savedQ = query(
        collection(db, `users/${currentUser.uid}/savedStories`),
        orderBy('savedAt', 'desc')
      );
      const snapshot = await getDocs(savedQ);
      
      const storiesData: any[] = [];
      for (const savedDoc of snapshot.docs) {
        const storyId = savedDoc.data().storyId;
        const storySnap = await getDoc(doc(db, 'stories', storyId));
        
        if (storySnap.exists()) {
          const data = storySnap.data();
          let authorProfile = null;
          
          if (data.authorId) {
            const authorDoc = await getDoc(doc(db, 'users', data.authorId));
            if (authorDoc.exists()) {
              authorProfile = authorDoc.data();
            }
          }

          storiesData.push({
            id: storySnap.id,
            ...data,
            authorProfile
          });
        }
      }
      setSavedStories(storiesData);
    } catch (err) {
      console.error("Error fetching saved stories:", err);
    } finally {
      setLoadingSaved(false);
    }
  };

  const fetchProfileAndStories = async (userId: string) => {
    setLoading(true);
    try {
      // 1. Fetch exact user profile
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        setProfile({ uid: userSnap.id, ...data } as UserProfile);
        setLocalFollowers(data.followersCount || 0);
        setLocalFollowing(data.followingCount || 0);
      }

      // 2. Fetch their stories
      const q = query(
        collection(db, 'stories'), 
        where('authorId', '==', userId)
      );
      const storiesSnap = await getDocs(q);
      const userStories = storiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      userStories.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setStories(userStories);
      
      const views = userStories.reduce((acc, story) => acc + (story.viewsCount || 0), 0);
      setTotalViews(views);

      // 3. Status checks
      try {
        // Check if current user is following
        if (currentUser && currentUser.uid !== userId) {
           const followRef = doc(db, `users/${userId}/followers`, currentUser.uid);
           const followDoc = await getDoc(followRef);
           setIsFollowing(followDoc.exists());
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("offline")) {
          console.warn("Could not fetch follow mechanics. They might not be configured.", err);
        }
      }
      
    } catch (error) {
      if (error instanceof Error && error.message.includes("offline")) {
        // Suppress offline errors gracefully
      } else {
        console.error("Error fetching profile", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async () => {
    if (!currentUser || !profile || followLoading) return;
    setFollowLoading(true);

    const wasFollowing = isFollowing;
    
    // Paths
    const followerRef = doc(db, `users/${profile.uid}/followers`, currentUser.uid);
    const followingRef = doc(db, `users/${currentUser.uid}/following`, profile.uid);
    const followedUserRef = doc(db, 'users', profile.uid);
    const currentUserRef = doc(db, 'users', currentUser.uid);

    // Optimistic UI updates
    setIsFollowing(!wasFollowing);
    setLocalFollowers(prev => wasFollowing ? prev - 1 : prev + 1);

    try {
      const batch = writeBatch(db);
      
      if (wasFollowing) {
        batch.delete(followerRef);
        batch.delete(followingRef);
        batch.update(followedUserRef, { followersCount: increment(-1) });
        batch.update(currentUserRef, { followingCount: increment(-1) });
      } else {
        const followData = {
          followerId: currentUser.uid,
          followedId: profile.uid,
          createdAt: serverTimestamp()
        };
        batch.set(followerRef, followData);
        batch.set(followingRef, followData);
        batch.update(followedUserRef, { followersCount: increment(1) });
        batch.update(currentUserRef, { followingCount: increment(1) });
      }
      
      await batch.commit();
      
      if (!wasFollowing) {
        await createNotification(
          profile.uid,
          currentUser.uid,
          'follow',
          `${currentUser.displayName} followed you!`,
          `/profile/${currentUser.uid}`
        );
      }
    } catch (error) {
      // Revert optimistic update
      setIsFollowing(wasFollowing);
      setLocalFollowers(prev => wasFollowing ? prev + 1 : prev - 1);
      handleFirestoreError(error, 'follow', `users/${profile.uid}/followers`, currentUser);
    } finally {
      setFollowLoading(false);
    }
  };

  const startEditing = () => {
    setEditName(profile?.displayName || '');
    setEditBio(profile?.bio || '');
    setEditPhotoUrl(profile?.photoURL || '');
    setEditCoverPhotoUrl(profile?.coverPhotoUrl || '');
    setIsEditing(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY;
      
      if (!apiKey) throw new Error("ImgBB API Key is missing. Please set VITE_IMGBB_API_KEY in your environment.");

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setEditPhotoUrl(data.data.url);
      } else {
        throw new Error(data.error?.message || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image. Please check API key and try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY;
      
      if (!apiKey) throw new Error("ImgBB API Key is missing. Please set VITE_IMGBB_API_KEY in your environment.");

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setEditCoverPhotoUrl(data.data.url);
      } else {
        throw new Error(data.error?.message || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image. Please check API key and try again.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile || !currentUser) return;
    
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: editName.trim(),
        bio: editBio.trim(),
        photoURL: editPhotoUrl,
        coverPhotoUrl: editCoverPhotoUrl
      });
      
      setProfile({
        ...profile,
        displayName: editName.trim(),
        bio: editBio.trim(),
        photoURL: editPhotoUrl,
        coverPhotoUrl: editCoverPhotoUrl
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile", error);
      alert("Failed to update profile.");
    }
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
        <p className="text-gray-500 font-medium">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800">
        <UserIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">User not found</h3>
      </div>
    );
  }

  const isOwnProfile = currentUser?.uid === profile.uid;

  return (
    <div className="max-w-3xl mx-auto pb-10">
      
      {/* Facebook-style Profile Header */}
      <div className="bg-white dark:bg-black rounded-b-xl border-x border-b border-gray-200 dark:border-zinc-800 shadow-sm mb-6">
        
        {/* Cover Photo */}
        <div className="h-48 sm:h-64 w-full bg-gradient-to-br from-blue-500 via-indigo-500 to-blue-700 relative overflow-hidden rounded-t-xl sm:rounded-none group">
          {isEditing ? (
            <div className="absolute inset-0">
               {editCoverPhotoUrl ? (
                 <img src={editCoverPhotoUrl} alt="Cover Preview" className="w-full h-full object-cover" />
               ) : (
                 <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>
               )}
               <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => coverInputRef.current?.click()}>
                  <div className="flex flex-col items-center text-white">
                    {uploadingCover ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Camera className="w-8 h-8 mb-2" /><span className="font-bold text-sm">Change Cover Photo</span></>}
                  </div>
               </div>
               <input type="file" ref={coverInputRef} accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverImageChange} disabled={uploadingCover} />
            </div>
          ) : (
            <>
              {profile.coverPhotoUrl ? (
                <img src={profile.coverPhotoUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]"></div>
              )}
            </>
          )}
        </div>

        <div className="px-4 sm:px-8 pb-4 relative">
          
          {!isEditing ? (
            <>
              {/* Avatar Container */}
              <div className="relative -mt-20 sm:-mt-24 mb-3 inline-block">
                <div className="p-1 bg-white dark:bg-black rounded-full shadow-sm">
                  {profile.photoURL ? (
                    <img src={profile.photoURL} alt={profile.displayName} className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white dark:border-black" />
                  ) : (
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-blue-50 dark:bg-zinc-900 border-4 border-white dark:border-black text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <UserIcon className="w-16 h-16 sm:w-20 sm:h-20" />
                    </div>
                  )}
                </div>
              </div>

              {/* User Info */}
              <div className="mb-4">
                <div className="flex items-center space-x-2">
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    {profile.displayName}
                  </h1>
                  <div className="bg-blue-500 text-white p-0.5 rounded-full" title="Verified Creator">
                    <CheckCheck className="w-4 h-4 sm:w-5 h-5" />
                  </div>
                </div>
                
                <div className="flex items-center space-x-1.5 mt-1 sm:mt-2 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
                   <div 
                     onClick={() => setFollowModal({ isOpen: true, type: 'followers', title: `${profile.displayName}'s Followers` })}
                     className="hover:underline cursor-pointer flex items-center space-x-1"
                   >
                     <span className="font-bold text-gray-900 dark:text-white">{localFollowers}</span>
                     <span className="font-medium">followers</span>
                   </div>
                   <span className="mx-1 font-normal text-gray-400">•</span>
                   <div 
                     onClick={() => setFollowModal({ isOpen: true, type: 'following', title: `Who ${profile.displayName} Follows` })}
                     className="hover:underline cursor-pointer flex items-center space-x-1"
                   >
                     <span className="font-bold text-gray-900 dark:text-white">{localFollowing}</span>
                     <span className="font-medium">following</span>
                   </div>
                </div>

                {profile.bio && (
                  <p className="mt-4 text-[15px] text-gray-800 dark:text-gray-200 leading-relaxed max-w-2xl whitespace-pre-wrap">
                    {profile.bio}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                {isOwnProfile ? (
                   <button 
                     onClick={startEditing} 
                     className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors border dark:border-zinc-800"
                   >
                     <Edit2 className="w-4 h-4" />
                     <span>Edit Profile</span>
                   </button>
                ) : (
                   <>
                     <button 
                       onClick={toggleFollow} 
                       disabled={followLoading} 
                       className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-2 font-semibold rounded-lg transition-colors disabled:opacity-70 ${isFollowing ? 'bg-gray-200 hover:bg-gray-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-900 dark:text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                     >
                        {isFollowing ? (
                          <><UserCheck className="w-5 h-5" /> <span>Following</span></>
                        ) : (
                          <><UserPlus className="w-5 h-5" /> <span>Follow</span></>
                        )}
                     </button>
                     <button 
                       onClick={() => navigate(`/messenger/${id}`)}
                       className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors border dark:border-zinc-800"
                     >
                       <MessageCircle className="w-4 h-4" />
                       <span>Message</span>
                     </button>
                   </>
                )}
              </div>

              {/* Facebook-style Tabs */}
              <div className="mt-6 border-t border-gray-200 dark:border-zinc-800 flex space-x-6 pt-1">
                <div 
                  onClick={() => setActiveTab('posts')}
                  className={`py-3 sm:py-4 px-2 font-bold text-[15px] mb-[-1px] cursor-pointer ${activeTab === 'posts' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                  Posts
                </div>
                {isOwnProfile && (
                  <div 
                    onClick={() => setActiveTab('drafts')}
                    className={`py-3 sm:py-4 px-2 font-bold text-[15px] mb-[-1px] cursor-pointer ${activeTab === 'drafts' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                  >
                    Drafts
                  </div>
                )}
                {isOwnProfile && (
                  <div 
                    onClick={() => setActiveTab('saved')}
                    className={`py-3 sm:py-4 px-2 font-bold text-[15px] mb-[-1px] cursor-pointer ${activeTab === 'saved' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                  >
                    Saved
                  </div>
                )}
                <div 
                  onClick={() => setActiveTab('about')}
                  className={`py-3 sm:py-4 px-2 font-semibold text-[15px] cursor-pointer ${activeTab === 'about' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                  About
                </div>
                <div 
                  onClick={() => setActiveTab('photos')}
                  className={`py-3 sm:py-4 px-2 font-semibold text-[15px] cursor-pointer hidden sm:block ${activeTab === 'photos' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                >
                  Photos
                </div>
                {isOwnProfile && (
                  <div 
                    onClick={() => setActiveTab('settings')}
                    className={`py-3 sm:py-4 px-2 font-semibold text-[15px] cursor-pointer ${activeTab === 'settings' ? 'border-b-[3px] border-blue-600 text-blue-600 dark:text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
                  >
                    Settings
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Editing State */
            <div className="pb-4 pt-12 sm:pt-4">
              <div className="flex items-end sm:-mt-24 mb-6">
                <div className="relative p-1 bg-white dark:bg-black rounded-full shadow-sm group cursor-pointer inline-block">
                  {editPhotoUrl ? (
                    <img src={editPhotoUrl} alt="Preview" className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white dark:border-black" />
                  ) : (
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-blue-50 dark:bg-zinc-900 border-4 border-white dark:border-black text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <UserIcon className="w-16 h-16 sm:w-20 sm:h-20" />
                    </div>
                  )}
                  <label className="absolute inset-1.5 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity z-10 text-white">
                    {uploadingImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <div className="flex flex-col items-center"><Camera className="w-6 h-6 mb-1" /><span className="text-[10px] sm:text-xs font-semibold">Update Profile Picture</span></div>}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} disabled={uploadingImage} />
                  </label>
                </div>
              </div>

              <div className="space-y-5 max-w-xl">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-medium"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none font-medium"
                    placeholder="Describe yourself..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  <button onClick={handleSaveProfile} disabled={uploadingImage} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold transition shadow-sm">
                    {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>Save</span>
                  </button>
                  <button onClick={() => setIsEditing(false)} className="w-full sm:w-auto px-8 py-2.5 rounded-lg font-bold text-gray-700 dark:text-gray-300 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 outline-none transition">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area (Posts Component Layout) */}
      <div className="flex flex-col sm:flex-row gap-6 px-4 sm:px-0">
        
        {/* Left Sidebar (Desktop mostly) - Intro / About Info */}
        <div className="w-full sm:w-1/3 hidden sm:flex flex-col gap-4">
           {!isEditing && (
             <div className="bg-white dark:bg-black rounded-xl p-5 border border-gray-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Intro</h2>
                <div className="space-y-4 mb-4">
                  {profile.bio && <p className="text-[15px] text-gray-800 dark:text-gray-200 text-center">{profile.bio}</p>}
                  
                  <div className="grid grid-cols-2 gap-2 pt-4 border-t border-gray-100 dark:border-zinc-900">
                    <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-zinc-900">
                      <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-none">{stories.length}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-500 mt-1">Stories</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-zinc-900">
                      <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-none">{totalViews.toLocaleString()}</p>
                      <p className="text-[10px] uppercase font-bold text-gray-500 mt-1">Views</p>
                    </div>
                  </div>
                </div>
                {isOwnProfile && (
                  <button onClick={startEditing} className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white py-2 rounded-lg font-semibold text-[15px] transition-colors">
                    Edit Bio
                  </button>
                )}
             </div>
           )}
        </div>

        {/* Right Content Area - Dynamic Content */}
        <div className="w-full sm:w-2/3">
                    {activeTab === 'drafts' ? (
             <>
                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-4 flex items-center justify-between">
                  <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">Your Drafts</h2>
                </div>
                {loadingDrafts ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                ) : drafts.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800">
                     <Edit2 className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-[17px] font-bold text-gray-900 dark:text-white">No drafts yet</p>
                    <Link to="/add" className="inline-block mt-3 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-semibold transition">Write a story</Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {drafts.map(draft => (
                      <article key={draft.id} className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm p-5 relative">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-xs font-semibold uppercase tracking-wider text-orange-500 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded">Draft</span>
                           <span className="text-sm text-gray-500">{draft.createdAt?.toDate ? formatDistanceToNow(draft.createdAt.toDate(), { addSuffix: true }) : ''}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{draft.title || 'Untitled Draft'}</h3>
                        <p className="text-[15px] text-gray-800 dark:text-gray-200 leading-normal line-clamp-3 mb-4">
                          {draft.content || 'No content yet...'}
                        </p>
                        <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-zinc-800">
                           <Link
                             to={`/edit-draft/${draft.id}`}
                             className="flex items-center space-x-1 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                           >
                              <Edit2 className="w-4 h-4" />
                              <span>Resume Editing</span>
                           </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
             </>
          ) : activeTab === 'posts' ? (
             <>
                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-4 flex items-center justify-between">
                  <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">Posts</h2>
                </div>
                
                {stories.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800">
                     <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-[17px] font-bold text-gray-900 dark:text-white">No posts available</p>
                  </div>
                ) : (
            <div className="space-y-4">
              {stories.map(story => (
                <article key={story.id} className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                  
                  {/* Post Header */}
                  <div className="p-4 sm:p-5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {profile.photoURL ? (
                        <img src={profile.photoURL} alt={profile.displayName} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-zinc-900 flex items-center justify-center text-blue-600">
                          <UserIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-[15px] text-gray-900 dark:text-white hover:underline cursor-pointer">{profile.displayName}</h4>
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-2 text-[13px] text-gray-500 font-medium whitespace-nowrap">
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
                    {isOwnProfile && (
                      <button 
                        onClick={() => window.location.href = `/edit/${story.id}`}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                        title="Edit Post"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Post Content */}
                  <div className="px-4 sm:px-5 pb-3">
                    <Link to={`/story/${story.id}`}>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 hover:underline">{story.title}</h3>
                    </Link>
                    <div className="relative">
                      <p className={`text-[15px] text-gray-800 dark:text-gray-200 leading-normal ${!expandedStories.has(story.id) ? 'line-clamp-4' : ''}`}>
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

                  {/* Post Image Container */}
                  {story.imageUrl && (
                    <div className="w-full bg-gray-100 dark:bg-black aspect-video border-y border-gray-200 dark:border-zinc-800">
                      <Link to={`/story/${story.id}`}>
                        <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
                      </Link>
                    </div>
                  )}
                  
                  {/* Post Stats */}
                  <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-b border-gray-200 dark:border-zinc-800">
                     <div className="flex items-center text-gray-500 dark:text-gray-400 text-[15px] hover:underline cursor-pointer">
                       <Heart className="w-4 h-4 mr-1.5 fill-current text-blue-600" />
                       {story.likesCount || 0}
                     </div>
                     <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400 text-[15px]">
                       <div className="flex items-center space-x-1">
                         <Eye className="w-4 h-4" />
                         <span>{story.viewsCount || 0}</span>
                       </div>
                       <div className="flex items-center hover:underline cursor-pointer" onClick={() => toggleComments(story.id)}>
                         {story.commentsCount || 0} comments
                       </div>
                     </div>
                  </div>

                  {/* Post Actions */}
                  <div className="px-2 py-1 flex items-center justify-around h-12 relative border-b border-gray-200 dark:border-zinc-800 mb-2">
                    <button className="flex-1 flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-400 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition py-2 text-[15px]">
                      <Heart className="w-5 h-5" />
                      <span className="hidden sm:inline">Like</span>
                    </button>
                    <button onClick={() => toggleComments(story.id)} className="flex-1 flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-400 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition py-2 text-[15px]">
                      <MessageCircle className="w-5 h-5" />
                      <span className="hidden sm:inline">Comment</span>
                    </button>
                    <div className="flex-1 flex justify-center items-center relative">
                      <button 
                         onClick={() => handleShare(story.id, story.title)}
                         className="flex-1 flex items-center justify-center space-x-2 text-gray-600 dark:text-gray-400 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition py-2 text-[15px] relative"
                      >
                        <Share2 className="w-5 h-5" />
                        <span className="hidden sm:inline">Share</span>
                      </button>
                      {copiedLink === story.id && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">Copied!</span>
                      )}
                    </div>
                  </div>

                  {/* Comments Section */}
                  {expandedComments.has(story.id) && (
                    <div className="px-4 pb-4">
                      <StoryComments storyId={story.id} onCommentAdded={() => handleCommentAdded(story.id)} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          </>
          ) : activeTab === 'saved' && isOwnProfile ? (
            <div className="space-y-4">
               <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-100 dark:bg-zinc-900 rounded-lg">
                      <Bookmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-[17px] font-black text-gray-900 dark:text-white uppercase tracking-tight">Saved Stories</h2>
                  </div>
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-zinc-900 px-3 py-1 rounded-full">{savedStories.length} Items</span>
               </div>

               {loadingSaved ? (
                  <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></div>
               ) : savedStories.length === 0 ? (
                  <div className="text-center py-16 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                    <Bookmark className="w-12 h-12 text-gray-200 dark:text-zinc-800 mx-auto mb-4" />
                    <p className="text-gray-900 dark:text-white font-bold">No saved stories</p>
                    <p className="text-sm text-gray-500 mt-1">Stories you bookmark will appear here for quick access.</p>
                  </div>
               ) : (
                  <div className="grid grid-cols-1 gap-4">
                     {savedStories.map(story => (
                        <Link 
                          key={story.id} 
                          to={`/story/${story.id}`}
                          className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition overflow-hidden group flex h-32 sm:h-36"
                        >
                          <div className="w-32 sm:w-40 h-full bg-gray-100 dark:bg-zinc-900 flex-shrink-0 relative">
                             {story.imageUrl ? (
                                <img src={story.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center p-3 text-center border-r dark:border-zinc-800">
                                   <span className="text-[10px] font-bold text-indigo-300 dark:text-indigo-700 uppercase leading-tight line-clamp-3">{story.title}</span>
                                </div>
                             )}
                          </div>
                          <div className="flex-1 p-3 sm:p-5 flex flex-col min-w-0">
                             <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition truncate text-base sm:text-lg">{story.title}</h3>
                             <div className="flex items-center space-x-2 mt-1 sm:mt-2">
                                <div className="flex items-center space-x-0.5 text-[10px] sm:text-xs text-gray-500">
                                   <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                   <span>{story.viewsCount || 0}</span>
                                </div>
                                <div className="flex items-center space-x-0.5 text-[10px] sm:text-xs text-gray-500">
                                   <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                   <span>{calculateReadingTime(story.content)} min</span>
                                </div>
                                <span className="text-[10px] sm:text-xs text-gray-400 truncate hidden sm:inline">• {story.createdAt?.toDate ? formatDistanceToNow(story.createdAt.toDate(), { addSuffix: true }) : ''}</span>
                             </div>
                             <div className="mt-auto flex items-center space-x-1.5">
                                <div className="p-0.5 bg-gray-100 dark:bg-zinc-900 rounded-full">
                                   {story.authorProfile?.photoURL ? (
                                      <img src={story.authorProfile.photoURL} alt="" className="w-5 h-5 rounded-full object-cover" />
                                   ) : (
                                      <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-gray-500"><UserIcon className="w-2.5 h-2.5" /></div>
                                   )}
                                </div>
                                <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 truncate">{story.authorProfile?.displayName || 'Anonymous'}</span>
                             </div>
                          </div>
                        </Link>
                     ))}
                  </div>
               )}
            </div>
          ) : activeTab === 'about' ? (
            <div className="space-y-6">
              <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-[17px] font-bold text-gray-900 dark:text-white mb-6 uppercase tracking-wider">About</h2>
                
                <div className="space-y-6">
                   <div>
                     <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-2">Biography</h3>
                     <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {profile.bio || "No biography provided."}
                     </p>
                   </div>

                   <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {isOwnProfile && (
                        <div>
                          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-1">Email</h3>
                          <p className="text-gray-900 dark:text-white font-medium">{profile.email}</p>
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-1">Joined</h3>
                        <p className="text-gray-900 dark:text-white font-medium">
                          {profile.createdAt?.toDate ? profile.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'}
                        </p>
                      </div>
                   </div>
                </div>
              </div>

              <div className="bg-white dark:bg-black rounded-xl p-5 border border-gray-200 dark:border-zinc-800 shadow-sm">
                 <h2 className="text-[17px] font-bold text-gray-900 dark:text-white mb-4">Account Stats</h2>
                 <div className="flex items-center justify-around text-center py-2">
                    <div>
                       <p className="text-2xl font-black text-blue-600 dark:text-blue-500">{stories.length}</p>
                       <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Stories</p>
                    </div>
                    <div className="w-px h-10 bg-gray-100 dark:bg-zinc-800"></div>
                    <div>
                       <p className="text-2xl font-black text-blue-600 dark:text-blue-500">{localFollowers}</p>
                       <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Followers</p>
                    </div>
                    <div className="w-px h-10 bg-gray-100 dark:bg-zinc-800"></div>
                    <div>
                       <p className="text-2xl font-black text-blue-600 dark:text-blue-500">{localFollowing}</p>
                       <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Following</p>
                    </div>
                 </div>
              </div>
            </div>
          ) : activeTab === 'photos' ? (
            <div>
              <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-6 flex items-center justify-between">
                <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">Photos</h2>
              </div>

              {stories.filter(s => s.imageUrl).length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                   <div className="bg-gray-100 dark:bg-zinc-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-8 h-8 text-gray-400 dark:text-zinc-700" />
                   </div>
                   <p className="text-gray-900 dark:text-white font-bold">No photos yet</p>
                   <p className="text-sm text-gray-500 mt-1">Photos from your stories will appear here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                   {stories.filter(s => s.imageUrl).map(story => (
                     <Link to={`/story/${story.id}`} key={story.id} className="aspect-square bg-gray-100 dark:bg-zinc-900 rounded-lg overflow-hidden border border-gray-100 dark:border-zinc-800 group relative">
                        <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                           <p className="text-white text-[11px] font-bold text-center line-clamp-3 leading-tight">{story.title}</p>
                        </div>
                     </Link>
                   ))}
                </div>
              )}
            </div>
          ) : activeTab === 'settings' && isOwnProfile ? (
             <div className="space-y-6">
                <div className="bg-white dark:bg-black rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-zinc-800 shadow-sm mb-4">
                  <h2 className="text-[17px] font-bold text-gray-900 dark:text-white uppercase tracking-wider">Account Settings</h2>
                </div>

                <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Display Mode</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark themes.</p>
                    </div>
                    <button 
                      onClick={toggleTheme}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition border dark:border-zinc-800"
                    >
                      {isDarkMode ? (
                        <>
                          <Sun className="w-4 h-4 text-orange-500" />
                          <span>Light Mode</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-4 h-4 text-indigo-600" />
                          <span>Dark Mode</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Profile Visibility</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Your profile is currently public.</p>
                    </div>
                    <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>

                  <div className="p-5 border-b border-gray-100 dark:border-zinc-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Login & Security</h3>
                    <button 
                      onClick={() => alert("Password reset link sent to your email.")}
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Change Password
                    </button>
                  </div>

                  <div className="p-5 bg-red-50/50 dark:bg-red-950/40">
                    <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Once you logout or delete your account, you will need to sign in again to access your stories.</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button 
                        onClick={handleLogout}
                        className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-white dark:bg-black border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-zinc-900 transition-all shadow-sm"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout from Account</span>
                      </button>
                      
                      <button 
                        disabled
                        className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-gray-100 dark:bg-zinc-900 text-gray-400 dark:text-zinc-700 font-bold rounded-xl cursor-not-allowed border dark:border-zinc-800"
                      >
                        Delete My Account
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-zinc-900/50 rounded-xl p-5 border border-blue-100 dark:border-zinc-800">
                  <div className="flex items-start space-x-3">
                    <SettingsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
                    <div>
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200">Pro Tip</h4>
                      <p className="text-sm text-blue-800 dark:text-blue-300">You can also manage your Gemini API keys in the AI Studio Settings menu to unlock smart story suggestions!</p>
                    </div>
                  </div>
                </div>
             </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-800">
               <p className="text-[17px] font-bold text-gray-900 dark:text-white">Coming Soon</p>
               <p className="text-sm text-gray-500 mt-2">This section is currently under construction.</p>
            </div>
          )}
        </div>
      </div>

      <FollowListModal
        isOpen={followModal.isOpen}
        onClose={() => setFollowModal(prev => ({ ...prev, isOpen: false }))}
        userId={profile.uid}
        type={followModal.type}
        title={followModal.title}
      />
    </div>
  );
}
