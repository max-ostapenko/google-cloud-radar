import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  type Firestore,
} from 'firebase/firestore';

// Public client Firebase configuration for Google Cloud Radar
const firebaseConfig = {
  apiKey: 'AIzaSyB-3ItxZ_RVn5Epqb407jvsOLTGT_dnM6I',
  authDomain: 'gcp-cloud-radar.firebaseapp.com',
  projectId: 'gcp-cloud-radar',
  storageBucket: 'gcp-cloud-radar.firebasestorage.app',
  appId: '1:751333758884:web:de973a9e1464cd58c19331',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

export function getFirebaseApp() {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    try {
      // Configure robust fallback persistence to prevent "Database is closing/hidden" IndexedDB errors
      auth = initializeAuth(firebaseApp, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      });
    } catch {
      auth = getAuth(firebaseApp);
    }
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp(), 'radar');
  }
  return db;
}

// Google Sign-In Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const authInstance = getFirebaseAuth();
    const result = await signInWithPopup(authInstance, googleProvider);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.log('Sign-in popup closed by user.');
      return null;
    }
    console.error('Google Sign-In Error:', error.code, error.message);
    if (error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed') {
      console.warn(
        'Google Sign-in Provider is not yet enabled in Firebase Console. Enable it at: https://console.firebase.google.com/project/gcp-cloud-radar/authentication/providers'
      );
    }
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  const authInstance = getFirebaseAuth();
  await signOut(authInstance);
}

export function onAuthChange(callback: (user: User | null) => void) {
  const authInstance = getFirebaseAuth();
  return onAuthStateChanged(authInstance, callback);
}

export type ReactionType = 'impacts_prod' | 'breaking_me' | 'watch_ga';

export interface ReactionState {
  impacts_prod: number;
  breaking_me: number;
  watch_ga: number;
  userReactions: Record<ReactionType, boolean>;
}

export interface CommentItem {
  id: string;
  change_id: string;
  author_id: string;
  author_name: string;
  author_photo?: string;
  content: string;
  created_at: any;
}

/**
 * Toggle user impact reaction with atomic aggregate counter update
 */
export async function toggleUserReaction(
  changeId: string,
  user: User,
  type: ReactionType,
  currentValue: boolean
): Promise<boolean> {
  const dbInstance = getFirebaseDb();
  const reactionDocRef = doc(dbInstance, 'changes', changeId, 'reactions', user.uid);
  const changeDocRef = doc(dbInstance, 'changes', changeId);
  const nextValue = !currentValue;
  const delta = nextValue ? 1 : -1;

  try {
    // 1. Record user's vote state in subcollection
    await setDoc(
      reactionDocRef,
      {
        user_id: user.uid,
        [type]: nextValue,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    // 2. Increment aggregate counter on parent change doc
    await updateDoc(changeDocRef, {
      [`reaction_counts.${type}`]: increment(delta),
    }).catch(() => {
      // If doc didn't have map initialized, fallback cleanly
    });

    return nextValue;
  } catch (err) {
    console.error('Failed to update reaction:', err);
    return currentValue;
  }
}

/**
 * Listen to live real-time comments on a change permalink
 */
export function listenToComments(
  changeId: string,
  callback: (comments: CommentItem[]) => void
) {
  const dbInstance = getFirebaseDb();
  const commentsCol = collection(dbInstance, 'changes', changeId, 'comments');
  const q = query(commentsCol, orderBy('created_at', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: CommentItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          change_id: changeId,
          author_id: data.author_id || data.authorId || '',
          author_name: data.author_name || data.authorName || 'Google Cloud Engineer',
          author_photo: data.author_photo || data.authorPhoto || '',
          content: data.content || '',
          created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(),
        };
      });
      callback(items);
    },
    (err) => {
      console.warn('Comments listener fallback (Firestore offline or emulator mode):', err);
    }
  );
}

/**
 * Post a new discussion comment
 */
export async function addComment(
  changeId: string,
  user: User,
  content: string
): Promise<CommentItem | null> {
  const dbInstance = getFirebaseDb();
  const commentsCol = collection(dbInstance, 'changes', changeId, 'comments');
  const changeDocRef = doc(dbInstance, 'changes', changeId);

  try {
    const docRef = await addDoc(commentsCol, {
      change_id: changeId,
      author_id: user.uid,
      author_name: user.displayName || 'Google Cloud Engineer',
      author_photo: user.photoURL || '',
      content: content.trim(),
      created_at: serverTimestamp(),
    });

    // Increment comments counter on parent
    await updateDoc(changeDocRef, {
      comments_count: increment(1),
    }).catch(() => {});

    return {
      id: docRef.id,
      change_id: changeId,
      author_id: user.uid,
      author_name: user.displayName || 'Google Cloud Engineer',
      author_photo: user.photoURL || '',
      content: content.trim(),
      created_at: new Date(),
    };
  } catch (err) {
    console.error('Error adding comment:', err);
    throw err;
  }
}

/**
 * Delete a discussion comment
 */
export async function deleteComment(
  changeId: string,
  commentId: string
): Promise<void> {
  const dbInstance = getFirebaseDb();
  const commentDocRef = doc(dbInstance, 'changes', changeId, 'comments', commentId);
  const changeDocRef = doc(dbInstance, 'changes', changeId);

  await deleteDoc(commentDocRef);
  await updateDoc(changeDocRef, {
    comments_count: increment(-1),
  }).catch(() => {});
}
