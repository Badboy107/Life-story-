import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError } from '../lib/utils';
import { Edit3, Save, Image as ImageIcon, X, Loader2 } from 'lucide-react';

const CATEGORIES = ['general', 'romantic', 'thriller', 'educational', 'motivational'];

export default function EditStory() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id || !currentUser) return;
    
    const fetchStory = async () => {
      try {
        const storyRef = doc(db, 'stories', id);
        const storySnap = await getDoc(storyRef);
        
        if (storySnap.exists()) {
          const data = storySnap.data();
          if (data.authorId !== currentUser.uid) {
            navigate('/profile/' + currentUser.uid); // Redirect if not author
            return;
          }
          setTitle(data.title || '');
          setContent(data.content || '');
          setCategory(data.category || 'general');
          if (data.imageUrl) {
            setImagePreview(data.imageUrl); // Existing image URL
          }
        } else {
          setError("Story not found.");
        }
      } catch (err) {
        console.error("Error fetching story", err);
        setError("Error loading story data.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStory();
  }, [id, currentUser, navigate]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('Image size should be less than 5MB');
        return;
      }
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null); // This means deleting existing image completely upon save if new image isn't selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.');
      return;
    }
    if (!currentUser || !id) return;

    setIsSaving(true);
    setError('');

    try {
      let finalImageUrl = imagePreview; // Default to existing preview if it's a URL

      // Only upload a new image if `image` state (File) is truthy
      if (image) {
        const apiKey = (import.meta as any).env.VITE_IMGBB_API_KEY;
        if (!apiKey) {
          throw new Error("ImgBB API key is missing. Please add VITE_IMGBB_API_KEY to your Secrets.");
        }

        const formData = new FormData();
        formData.append('image', image);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        
        if (data.success) {
          finalImageUrl = data.data.url;
        } else {
          throw new Error(data.error?.message || "Failed to upload image to ImgBB");
        }
      }

      const storyRef = doc(db, 'stories', id);
      
      const storyData: any = {
        title: title.trim(),
        content: content.trim(),
        category,
        updatedAt: serverTimestamp()
      };

      if (finalImageUrl) {
        storyData.imageUrl = finalImageUrl;
      } else {
        // If image was removed
        storyData.imageUrl = null; // or empty string depending on how it's handled
      }

      await updateDoc(storyRef, storyData);
      navigate(`/profile/${currentUser.uid}`);
    } catch (err: any) {
      if (err.message) {
        setError(err.message);
      } else {
        setError('Failed to update story. Please try again.');
        handleFirestoreError(err, 'update', 'stories', currentUser);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading story...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 hidden sm:flex items-center space-x-3">
        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-xl text-blue-600 dark:text-blue-400">
          <Edit3 className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Edit Story</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6 text-sm font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-black rounded-xl p-6 border border-gray-200 dark:border-zinc-800 shadow-sm">
        <div className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Story Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-medium"
              placeholder="Give your story a catchy title"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Cover Image (Optional)
            </label>
            
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-300 dark:border-zinc-700 aspect-video bg-gray-50 dark:bg-black">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-sm transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition relative"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/jpeg, image/png, image/webp"
                  className="hidden"
                />
                <ImageIcon className="w-8 h-8 text-gray-400 mb-3" />
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">Click to upload an image</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">PNG, JPG, WEBP up to 5MB</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isSaving}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition appearance-none cursor-pointer font-medium"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="dark:bg-black capitalize">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="content" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              The Story
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSaving}
              rows={12}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-black text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-y font-medium"
              placeholder="Start typing your story here..."
            />
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-zinc-800 flex gap-3 flex-col sm:flex-row">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto flex flex-1 items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-colors disabled:opacity-70 shadow-sm"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/profile/${currentUser?.uid}`)}
              disabled={isSaving}
              className="w-full sm:w-auto flex-1 items-center justify-center space-x-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white px-8 py-3 rounded-xl font-bold transition-colors disabled:opacity-70 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
