import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 'like' | 'comment' | 'message' | 'follow';

export async function createNotification(
  recipientId: string,
  senderId: string,
  type: NotificationType,
  body: string,
  link: string
) {
  try {
    if (recipientId === senderId) return; // Don't notify yourself

    await addDoc(collection(db, 'notifications'), {
      recipientId,
      senderId,
      type,
      body,
      link,
      isRead: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}
