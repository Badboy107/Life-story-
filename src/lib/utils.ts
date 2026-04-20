import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error handling helper for Firestore
export function handleFirestoreError(error: any, operationType: string, path: string | null = null, currentUser: any = null) {
  if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
    const errorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: currentUser ? {
        userId: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        isAnonymous: currentUser.isAnonymous,
        providerInfo: currentUser.providerData
      } : null
    };
    console.error("Firestore Permission Error:", JSON.stringify(errorInfo, null, 2));
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
}

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  const time = Math.ceil(words / wordsPerMinute);
  return time;
}
