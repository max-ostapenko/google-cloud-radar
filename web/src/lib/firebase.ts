import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
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
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

// Public client Firebase configuration for Google Cloud Radar
const firebaseConfig = {
  apiKey: 'AIzaSyDemoRadarKeyForGoogleAuth', // Standard public client config
  authDomain: 'gcp-discovery-radar.firebaseapp.com',
  projectId: 'max-ostapenko',
  storageBucket: 'max-ostapenko.appspot.com',
  appId: '1:390347019852:web:radar',
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
    auth = getAuth(getFirebaseApp());
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
    console.error('Google Sign-In Error:', error);
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

export type ReactionType = 'impacts_me' | 'breaking_me' | 'watch_ga';

export interface ReactionState {
  impacts_me: number;
  breaking_me: number;
  watch_ga: number;
  userReactions: Record<ReactionType, boolean>;
}

export interface CommentItem {
  id: string;
  changeId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  createdAt: any;
}
