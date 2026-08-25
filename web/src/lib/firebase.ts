import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
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
  authDomain: 'google-cloud-radar.com',
  projectId: 'gcp-cloud-radar',
  storageBucket: 'gcp-cloud-radar.firebasestorage.app',
  appId: '1:751333758884:web:de973a9e1464cd58c19331',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.local')
  );
}

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
      auth = initializeAuth(firebaseApp, {
        persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
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

// Local Mock User Storage Key
const LOCAL_DEV_USER_KEY = 'gcp_radar_dev_user';

export async function signInWithGoogle(): Promise<User | null> {
  // If in local development, support direct local dev sign-in without hitting prod auth blocks
  if (isLocalEnvironment()) {
    const mockUser: any = {
      uid: 'dev-user-local',
      displayName: 'Canary Sentinel (Borg Unit 42)',
      email: 'borg.sentinel42@googlecloudradar.internal',
      photoURL: 'https://www.gstatic.com/images/branding/product/2x/avatar_square_blue_512dp.png',
    };
    try {
      localStorage.setItem(LOCAL_DEV_USER_KEY, JSON.stringify(mockUser));
      window.dispatchEvent(new CustomEvent('radar_auth_change', { detail: mockUser }));
      return mockUser;
    } catch {
      return mockUser;
    }
  }

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
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  if (isLocalEnvironment()) {
    try {
      localStorage.removeItem(LOCAL_DEV_USER_KEY);
      window.dispatchEvent(new CustomEvent('radar_auth_change', { detail: null }));
    } catch {}
    return;
  }

  const authInstance = getFirebaseAuth();
  await signOut(authInstance);
}

export function onAuthChange(callback: (user: User | null) => void) {
  if (isLocalEnvironment()) {
    const checkLocalUser = () => {
      try {
        const saved = localStorage.getItem(LOCAL_DEV_USER_KEY);
        callback(saved ? JSON.parse(saved) : null);
      } catch {
        callback(null);
      }
    };

    checkLocalUser();
    const handleAuthEvent = (e: any) => callback(e.detail);
    window.addEventListener('radar_auth_change', handleAuthEvent);
    return () => window.removeEventListener('radar_auth_change', handleAuthEvent);
  }

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
 * Toggle user impact reaction with local fallback & atomic counter
 */
export async function toggleUserReaction(
  changeId: string,
  user: User | any,
  type: ReactionType,
  currentValue: boolean
): Promise<boolean> {
  const nextValue = !currentValue;
  const storageKey = `gcp_radar_reactions_${changeId}`;

  // Always update local storage reaction map
  try {
    const userVotes = JSON.parse(localStorage.getItem(storageKey) || '{}');
    userVotes[type] = nextValue;
    localStorage.setItem(storageKey, JSON.stringify(userVotes));
  } catch {}

  // If local environment, return immediately without calling prod Firestore
  if (isLocalEnvironment()) {
    return nextValue;
  }

  try {
    const dbInstance = getFirebaseDb();
    const reactionDocRef = doc(dbInstance, 'changes', changeId, 'reactions', user.uid);
    const changeDocRef = doc(dbInstance, 'changes', changeId);
    const delta = nextValue ? 1 : -1;

    await setDoc(
      reactionDocRef,
      {
        user_id: user.uid,
        [type]: nextValue,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(changeDocRef, {
      [`reaction_counts.${type}`]: increment(delta),
    }).catch(() => {});

    return nextValue;
  } catch (err) {
    console.warn('Firestore reaction sync fallback (offline/permission):', err);
    return nextValue;
  }
}

/**
 * Listen to live comments (local storage event loop in dev; Firestore in prod)
 */
export function listenToComments(
  changeId: string,
  callback: (comments: CommentItem[]) => void
) {
  const localCommentsKey = `gcp_radar_comments_${changeId}`;

  const loadLocalComments = (): CommentItem[] => {
    try {
      const stored = localStorage.getItem(localCommentsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // In local development, deliver instant local comments and listen to broadcast updates
  if (isLocalEnvironment()) {
    callback(loadLocalComments());

    const handleLocalUpdate = (e: any) => {
      if (e.detail?.changeId === changeId) {
        callback(loadLocalComments());
      }
    };

    window.addEventListener('radar_comments_update', handleLocalUpdate);
    return () => window.removeEventListener('radar_comments_update', handleLocalUpdate);
  }

  // In production, connect to Firestore with graceful fallback to local storage
  try {
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
        console.warn('Comments listener fallback (using local cache):', err);
        callback(loadLocalComments());
      }
    );
  } catch (err) {
    console.warn('Firestore offline; serving local comments:', err);
    callback(loadLocalComments());
    return () => {};
  }
}

/**
 * Post a new discussion comment
 */
export async function addComment(
  changeId: string,
  user: User | any,
  content: string
): Promise<CommentItem> {
  const localCommentsKey = `gcp_radar_comments_${changeId}`;
  const newComment: CommentItem = {
    id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    change_id: changeId,
    author_id: user.uid || 'dev-user',
    author_name: user.displayName || 'Google Cloud Engineer',
    author_photo: user.photoURL || '',
    content: content.trim(),
    created_at: new Date().toISOString(),
  };

  // 1. Save to local storage for instant responsiveness
  try {
    const existing = JSON.parse(localStorage.getItem(localCommentsKey) || '[]');
    existing.unshift(newComment);
    localStorage.setItem(localCommentsKey, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('radar_comments_update', { detail: { changeId } }));
  } catch (e) {
    console.warn('Could not cache comment to localStorage:', e);
  }

  // 2. If in local development, return immediately
  if (isLocalEnvironment()) {
    return newComment;
  }

  // 3. In production, sync to Firestore
  try {
    const dbInstance = getFirebaseDb();
    const commentsCol = collection(dbInstance, 'changes', changeId, 'comments');
    const changeDocRef = doc(dbInstance, 'changes', changeId);

    const docRef = await addDoc(commentsCol, {
      change_id: changeId,
      author_id: user.uid,
      author_name: user.displayName || 'Google Cloud Engineer',
      author_photo: user.photoURL || '',
      content: content.trim(),
      created_at: serverTimestamp(),
    });

    await updateDoc(changeDocRef, {
      comments_count: increment(1),
    }).catch(() => {});

    newComment.id = docRef.id;
    return newComment;
  } catch (err) {
    console.warn('Saved comment locally; Firestore sync failed:', err);
    return newComment;
  }
}

/**
 * Delete a discussion comment
 */
export async function deleteComment(
  changeId: string,
  commentId: string
): Promise<void> {
  const localCommentsKey = `gcp_radar_comments_${changeId}`;

  // 1. Update local storage
  try {
    const existing = JSON.parse(localStorage.getItem(localCommentsKey) || '[]');
    const filtered = existing.filter((c: CommentItem) => c.id !== commentId);
    localStorage.setItem(localCommentsKey, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('radar_comments_update', { detail: { changeId } }));
  } catch {}

  // 2. In local development, stop here
  if (isLocalEnvironment()) {
    return;
  }

  // 3. In production, sync with Firestore
  try {
    const dbInstance = getFirebaseDb();
    const commentDocRef = doc(dbInstance, 'changes', changeId, 'comments', commentId);
    const changeDocRef = doc(dbInstance, 'changes', changeId);

    await deleteDoc(commentDocRef);
    await updateDoc(changeDocRef, {
      comments_count: increment(-1),
    }).catch(() => {});
  } catch (err) {
    console.warn('Deleted locally; Firestore delete failed:', err);
  }
}
