import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, getDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { Send, User as UserIcon } from 'lucide-react';
import { handleFirestoreError } from '../lib/utils';
import { Link } from 'react-router-dom';
import { createNotification } from '../lib/notifications';

interface StoryCommentsProps {
  storyId: string;
  onCommentAdded: () => void;
}

interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: any;
  authorProfile?: any;
}

export default function StoryComments({ storyId, onCommentAdded }: StoryCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    fetchComments();
  }, [storyId]);

  const fetchComments = async () => {
    try {
      const q = query(
        collection(db, 'stories', storyId, 'comments'),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);

      const commentsData: Comment[] = [];
      const userCache: Record<string, any> = {};

      for (const document of snap.docs) {
        const data = document.data();
        const authorId = data.authorId;
        let authorProfile = userCache[authorId];

        if (!authorProfile) {
          const authorDoc = await getDoc(doc(db, 'users', authorId));
          if (authorDoc.exists()) {
            authorProfile = authorDoc.data();
            userCache[authorId] = authorProfile;
          }
        }

        commentsData.push({
          id: document.id,
          ...data,
          authorProfile,
        } as Comment);
      }
      setComments(commentsData);
    } catch (error) {
      console.error("Error fetching comments", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || submitting) return;

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const commentRef = doc(collection(db, 'stories', storyId, 'comments'));
      const storyRef = doc(db, 'stories', storyId);

      batch.set(commentRef, {
        authorId: currentUser.uid,
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      batch.update(storyRef, {
        commentsCount: increment(1)
      });

      await batch.commit();

      const storySnap = await getDoc(storyRef);
      if (storySnap.exists()) {
        const storyAuthorId = storySnap.data().authorId;
        if (storyAuthorId !== currentUser.uid) {
          await createNotification(
            storyAuthorId,
            currentUser.uid,
            'comment',
            `${currentUser.displayName} commented on your story.`,
            `/story/${storyId}`
          );
        }
      }

      setNewComment('');
      onCommentAdded();
      await fetchComments();
    } catch (error) {
      handleFirestoreError(error, 'create', `stories/${storyId}/comments`, currentUser);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
      {loading ? (
        <div className="py-4 text-center text-sm text-gray-500">Loading comments...</div>
      ) : (
        <div className="space-y-4 mb-4 max-h-64 overflow-y-auto pr-2">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">No comments yet. Be the first to comment!</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="flex space-x-3">
                <Link to={`/profile/${comment.authorId}`} className="flex-shrink-0">
                  {comment.authorProfile?.photoURL ? (
                    <img src={comment.authorProfile.photoURL} alt="Profile" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )}
                </Link>
                <div className="flex-1 bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <Link to={`/profile/${comment.authorId}`} className="font-medium text-sm text-gray-900 dark:text-white hover:underline">
                      {comment.authorProfile?.displayName || 'Anonymous'}
                    </Link>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{comment.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          disabled={submitting}
          placeholder="Write a comment..."
          className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
        />
        <button
          type="submit"
          disabled={!newComment.trim() || submitting}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center space-x-2"
        >
          <span>{submitting ? 'Posting' : 'Post'}</span>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
