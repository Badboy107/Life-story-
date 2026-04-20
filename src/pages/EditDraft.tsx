import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError } from '../lib/utils';
import { Edit3, Save, Send, Image as ImageIcon, X, Loader2, Sparkles } from 'lucide-react';
import { suggestStoryContent, refineStoryContent } from '../services/geminiService';

const CATEGORIES = ['general', 'romantic', 'thriller', 'educational', 'motivational'];

export default function EditDraft() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<any | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id || !currentUser) return;
    
    const fetchDraft = async () => {
      try {
        const draftRef = doc(db, 'drafts', id);
        const draftSnap = await getDoc(draftRef);
        
        if (draftSnap.exists()) {
          const data = draftSnap.data();
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
          setError("Draft not found.");
        }
      } catch (err) {
        console.error("Error fetching draft", err);
        setError("Error loading draft data.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDraft();
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
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const saveToFirestore = async (isDraft: boolean) => {
    if (!title.trim() && !content.trim()) {
      setError('Title or content is required to save a draft.');
      return;
    }
    if (!isDraft && (!title.trim() || !content.trim())) {
      setError('Title and content are required to publish.');
      return;
    }
    if (!currentUser || !id) return;

    setIsSaving(true);
    setError('');

    try {
      let finalImageUrl = imagePreview; // Default to existing preview if it's a URL

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

      const draftRef = doc(db, 'drafts', id);
      
      const storyData: any = {
        authorId: currentUser.uid,
        title: title.trim(),
        content: content.trim(),
        category,
        updatedAt: serverTimestamp()
      };

      if (finalImageUrl) {
        storyData.imageUrl = finalImageUrl;
      } else {
        storyData.imageUrl = null;
      }

      if (isDraft) {
        // Just update the draft
        await updateDoc(draftRef, storyData);
        navigate(`/profile/${currentUser.uid}?tab=drafts`);
      } else {
        // Publish it: move to stories, delete from drafts
        const newStoryRef = doc(collection(db, 'stories'));
        
        // Populate standard story fields missed in drafts
        storyData.likesCount = 0;
        storyData.commentsCount = 0;
        storyData.viewsCount = 0;
        storyData.createdAt = serverTimestamp(); // New timestamp for publish time
        
        await setDoc(newStoryRef, storyData);
        await deleteDoc(draftRef);
        navigate('/');
      }
    } catch (err: any) {
      if (err.message) {
        setError(err.message);
      } else {
        setError(`Failed to ${isDraft ? 'save draft' : 'publish story'}. Please try again.`);
        handleFirestoreError(err, isDraft ? 'update' : 'create', isDraft ? 'drafts' : 'stories', currentUser);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!title.trim() && !content.trim()) {
      setError('Please enter at least a title or a category to get AI brainwaves!');
      return;
    }
    setAiLoading(true);
    setError('');
    const suggestion = await suggestStoryContent(title, category);
    if (suggestion) {
      setAiSuggestions(suggestion);
    } else {
      setError('AI is currently taking a coffee break. Please try again later.');
    }
    setAiLoading(false);
  };

  const applyAiSuggestion = () => {
    if (aiSuggestions) {
      setTitle(aiSuggestions.title);
      setContent(aiSuggestions.content);
      setAiSuggestions(null);
    }
  };

  const handleAiRefine = async () => {
    if (!content.trim()) {
      setError('Please write some content first for me to refine!');
      return;
    }
    setAiLoading(true);
    setError('');
    const refined = await refineStoryContent(content);
    if (refined) {
      setContent(refined);
    } else {
      setError('Failed to refine content. Please try again.');
    }
    setAiLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading draft...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 hidden sm:flex items-center space-x-3">
        <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-xl text-orange-600 dark:text-orange-400">
          <Edit3 className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Edit Draft</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-black rounded-xl p-6 border border-gray-200 dark:border-zinc-800 shadow-sm">
        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-zinc-900/50 rounded-2xl p-4 border border-blue-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <span className="font-bold text-sm">AI Story Assistant</span>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleAiSuggest}
                  disabled={aiLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>Suggest Idea</span>
                </button>
                {content && (
                  <button
                    type="button"
                    onClick={handleAiRefine}
                    disabled={aiLoading}
                    className="px-3 py-1.5 bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-zinc-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 disabled:opacity-50"
                  >
                    <span>Magic Refine</span>
                  </button>
                )}
              </div>
            </div>
            
            {aiSuggestions && (
              <div className="bg-white dark:bg-black rounded-xl p-4 border border-blue-100 dark:border-zinc-800 shadow-sm animate-in zoom-in-95 duration-200 mt-2">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-1">New Idea: {aiSuggestions.title}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-3">" {aiSuggestions.content} "</p>
                <div className="mb-4">
                   <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Outline</p>
                   <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                     {aiSuggestions.outline.map((o: string, idx: number) => (
                       <li key={idx}>{o}</li>
                     ))}
                   </ul>
                </div>
                <div className="flex space-x-2">
                  <button onClick={applyAiSuggestion} className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg transition">
                    Use this Idea
                  </button>
                  <button onClick={() => setAiSuggestions(null)} className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs transition">
                    Maybe later
                  </button>
                </div>
              </div>
            )}
            
            {!aiSuggestions && !aiLoading && !content && (
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Need a spark? Click "Suggest Idea" to see where the story could go!</p>
            )}
          </div>

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
              type="button"
              onClick={() => saveToFirestore(false)}
              disabled={isSaving}
              className="w-full sm:w-auto flex flex-1 items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-colors disabled:opacity-70 shadow-sm"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span>{isSaving ? 'Processing...' : 'Publish Draft'}</span>
            </button>
            <button
              type="button"
              onClick={() => saveToFirestore(true)}
              disabled={isSaving}
              className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 bg-orange-100 hover:bg-orange-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-orange-700 dark:text-orange-400 px-8 py-3 rounded-xl font-bold transition-colors disabled:opacity-70 text-center"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              <span>Update Draft</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
