import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError } from '../lib/utils';
import { BookOpen, Send, Image as ImageIcon, X, Sparkles, Loader2 } from 'lucide-react';
import { suggestStoryContent, refineStoryContent } from '../services/geminiService';

const CATEGORIES = ['general', 'romantic', 'thriller', 'educational', 'motivational'];

export default function AddStory() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<any | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

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
    if (!currentUser) return;

    setIsLoading(true);
    setError('');

    try {
      let finalImageUrl = '';

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

      const collectionName = isDraft ? 'drafts' : 'stories';
      const storyRef = doc(collection(db, collectionName));
      
      const storyData: any = {
        authorId: currentUser.uid,
        title: title.trim(),
        content: content.trim(),
        category,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (finalImageUrl) {
        storyData.imageUrl = finalImageUrl;
      }

      await setDoc(storyRef, storyData);
      
      if (isDraft) {
        navigate(`/profile/${currentUser.uid}?tab=drafts`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      if (err.message) {
        setError(err.message);
      } else {
        setError(`Failed to ${isDraft ? 'save draft' : 'publish story'}. Please try again.`);
        handleFirestoreError(err, 'create', isDraft ? 'drafts' : 'stories', currentUser);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    saveToFirestore(false);
  };

  const handleSaveDraft = (e: React.MouseEvent) => {
    e.preventDefault();
    saveToFirestore(true);
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

  const autoFormatContent = () => {
    if (!content.trim()) return;
    // Capitalize first letter if not capitalized
    let formatted = content.trim();
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    
    // Replace double spaces
    formatted = formatted.replace(/  +/g, ' ');
    
    setContent(formatted);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 hidden sm:flex items-center space-x-3">
        <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Write a Story</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handlePublish} className="bg-white dark:bg-black rounded-2xl p-6 border border-gray-200 dark:border-zinc-800 shadow-sm">
        <div className="space-y-6">
          <div className="bg-indigo-50 dark:bg-zinc-900/50 rounded-2xl p-4 border border-indigo-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <span className="font-bold text-sm">AI Story Assistant</span>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleAiSuggest}
                  disabled={aiLoading}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>Suggest Idea</span>
                </button>
                {content && (
                  <button
                    type="button"
                    onClick={handleAiRefine}
                    disabled={aiLoading}
                    className="px-3 py-1.5 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-zinc-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 disabled:opacity-50"
                  >
                    <span>Magic Refine</span>
                  </button>
                )}
              </div>
            </div>
            
            {aiSuggestions && (
              <div className="bg-white dark:bg-black rounded-xl p-4 border border-indigo-100 dark:border-zinc-800 shadow-sm animate-in zoom-in-95 duration-200 mt-2">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-1">New Idea: {aiSuggestions.title}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-3">" {aiSuggestions.content} "</p>
                <div className="mb-4">
                   <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Outline</p>
                   <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
                     {aiSuggestions.outline.map((o: string, idx: number) => (
                       <li key={idx}>{o}</li>
                     ))}
                   </ul>
                </div>
                <div className="flex space-x-2">
                  <button onClick={applyAiSuggestion} className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-lg transition">
                    Use this Idea
                  </button>
                  <button onClick={() => setAiSuggestions(null)} className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs transition">
                    Maybe later
                  </button>
                </div>
              </div>
            )}
            
            {!aiSuggestions && !aiLoading && !content && (
              <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Enter a title and category, then click "Suggest Idea" to get some inspiration!</p>
            )}
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Story Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              placeholder="Give your story a catchy title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cover Image (Optional)
            </label>
            
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 aspect-video bg-gray-50 dark:bg-black">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition"
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
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Click to upload an image</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PNG, JPG, WEBP up to 5MB</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition appearance-none cursor-pointer"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="dark:bg-black capitalize">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              The Story
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={autoFormatContent}
              disabled={isLoading}
              rows={12}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-y"
              placeholder="Start typing your story here..."
            />
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isLoading ? 'Processing...' : 'Publish Story'}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 px-8 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <span>Save as Draft</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
