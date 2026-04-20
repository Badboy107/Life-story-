import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen } from 'lucide-react';

export default function Login() {
  const { currentUser, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (error) {
      console.error('Failed to log in', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
          <BookOpen className="w-16 h-16" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Life Story
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Share your journey, discover lives.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-black py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-gray-100 dark:border-zinc-800">
          <button
            onClick={handleLogin}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Sign in with Google
          </button>
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-black text-gray-500">
                  Secure access
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
