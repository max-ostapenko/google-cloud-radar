import { atom, map } from 'nanostores';
import {
  signInWithGoogle,
  signOutUser,
  onAuthChange,
  toggleUserReaction,
  listenToChange,
  listenToUserReactions,
  type ReactionType,
} from './firebase';

export interface User {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export interface CommentItem {
  id: string;
  slug: string;
  text: string;
  authorName: string;
  authorEmail?: string;
  authorPhoto?: string;
  createdAt: string;
}

export interface ReactionState {
  counts: {
    like_change: number;
    released: number;
    false_positive_or_duplicate: number;
  };
  userVotes: {
    like_change: boolean;
    released: boolean;
    false_positive_or_duplicate: boolean;
  };
}

export interface SharePayload {
  slug: string;
  title: string;
  service: string;
  api: string;
  summary: string;
  methods?: string[];
  isBreaking?: boolean;
  leadTimeDays?: number;
}

// ---------------------------------------------------------------------------
// 1. Auth Store
// ---------------------------------------------------------------------------
export const $authUser = atom<User | null>(null);

let authInitialized = false;
export function initAuthStore() {
  if (authInitialized || typeof window === 'undefined') return;
  authInitialized = true;
  onAuthChange((user) => {
    $authUser.set(user);
  });
}

export async function signIn(): Promise<User | null> {
  try {
    const user = await signInWithGoogle();
    if (user) {
      $authUser.set(user);
    }
    return user;
  } catch (err) {
    console.error('Sign-in error:', err);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await signOutUser();
    $authUser.set(null);
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}

// ---------------------------------------------------------------------------
// 2. Modals Store
// ---------------------------------------------------------------------------
export const $alertsModalOpen = atom<boolean>(false);
export const $shareModalData = atom<SharePayload | null>(null);

export function openAlertsModal() {
  $alertsModalOpen.set(true);
}

export function closeAlertsModal() {
  $alertsModalOpen.set(false);
}

export function openShareModal(data: SharePayload) {
  $shareModalData.set(data);
}

export function closeShareModal() {
  $shareModalData.set(null);
}

// ---------------------------------------------------------------------------
// 3. Reactions Store
// ---------------------------------------------------------------------------
export const $reactionsStore = map<Record<string, ReactionState>>({});

const activeChangeListeners = new Set<string>();

export function getSlugReactions(slug: string): ReactionState {
  const all = $reactionsStore.get();
  if (all[slug]) return all[slug];

  const defaultState: ReactionState = {
    counts: { like_change: 0, released: 0, false_positive_or_duplicate: 0 },
    userVotes: { like_change: false, released: false, false_positive_or_duplicate: false },
  };

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`gcp_radar_reactions_${slug}`);
      if (stored) {
        const votes = JSON.parse(stored);
        defaultState.userVotes = {
          like_change: Boolean(votes.like_change),
          released: Boolean(votes.released),
          false_positive_or_duplicate: Boolean(votes.false_positive_or_duplicate),
        };
      }
    } catch {}
  }

  return defaultState;
}

export function initReactionsForSlug(slug: string, initialCounts?: Record<string, number>) {
  if (typeof window === 'undefined') return;

  const current = getSlugReactions(slug);
  if (initialCounts) {
    current.counts = {
      like_change: initialCounts.like_change ?? current.counts.like_change ?? 0,
      released: initialCounts.released ?? current.counts.released ?? 0,
      false_positive_or_duplicate: initialCounts.false_positive_or_duplicate ?? current.counts.false_positive_or_duplicate ?? 0,
    };
  }
  $reactionsStore.setKey(slug, { ...current });

  // Listen to Firestore / local changes
  if (!activeChangeListeners.has(slug)) {
    activeChangeListeners.add(slug);
    listenToChange(slug, (data) => {
      if (data?.reaction_counts) {
        const existing = getSlugReactions(slug);
        const updatedCounts = {
          like_change: data.reaction_counts.like_change ?? existing.counts.like_change,
          released: data.reaction_counts.released ?? existing.counts.released,
          false_positive_or_duplicate: data.reaction_counts.false_positive_or_duplicate ?? existing.counts.false_positive_or_duplicate,
        };
        $reactionsStore.setKey(slug, {
          ...existing,
          counts: updatedCounts,
        });
      }
    });
  }

  const user = $authUser.get();
  if (user?.uid) {
    listenToUserReactions(slug, user.uid, (liveVotes) => {
      const existing = getSlugReactions(slug);
      $reactionsStore.setKey(slug, {
        ...existing,
        userVotes: {
          like_change: Boolean(liveVotes.like_change),
          released: Boolean(liveVotes.released),
          false_positive_or_duplicate: Boolean(liveVotes.false_positive_or_duplicate),
        },
      });
    });
  }
}

export async function toggleReaction(slug: string, type: ReactionType) {
  let user = $authUser.get();
  if (!user) {
    try {
      user = await signIn();
    } catch (err) {
      console.log('User cancelled sign-in');
      return;
    }
  }
  if (!user) return;

  const currentState = getSlugReactions(slug);
  const isCurrent = Boolean(currentState.userVotes[type]);
  const nextVote = !isCurrent;
  const currentCount = currentState.counts[type] || 0;
  const nextCount = nextVote ? currentCount + 1 : Math.max(0, currentCount - 1);

  const updatedState: ReactionState = {
    counts: {
      ...currentState.counts,
      [type]: nextCount,
    },
    userVotes: {
      ...currentState.userVotes,
      [type]: nextVote,
    },
  };

  $reactionsStore.setKey(slug, updatedState);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`gcp_radar_reactions_${slug}`, JSON.stringify(updatedState.userVotes));
    } catch {}
  }

  await toggleUserReaction(slug, user, type, isCurrent).catch((err) => {
    console.error('Failed to sync reaction to Firestore:', err);
  });
}

// ---------------------------------------------------------------------------
// 4. Comments Store
// ---------------------------------------------------------------------------
export const $commentsStore = map<Record<string, CommentItem[]>>({});
export const $commentCounts = map<Record<string, number>>({});

export function initCommentsForSlug(slug: string, initialCount = 0) {
  if (typeof window === 'undefined') return;

  const storageKey = `gcp_radar_comments_${slug}`;
  let comments: CommentItem[] = [];

  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      comments = JSON.parse(cached);
    }
  } catch {}

  const currentComments = $commentsStore.get()[slug] || comments;
  $commentsStore.setKey(slug, currentComments);
  const count = Math.max(initialCount, currentComments.length);
  $commentCounts.setKey(slug, count);
}

export async function addComment(slug: string, text: string): Promise<CommentItem | null> {
  let user = $authUser.get();
  if (!user) {
    try {
      user = await signIn();
    } catch {
      return null;
    }
  }
  if (!user) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const newComment: CommentItem = {
    id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    slug,
    text: trimmed,
    authorName: user.displayName || 'Google Cloud Engineer',
    authorEmail: user.email || undefined,
    authorPhoto: user.photoURL || 'https://www.gstatic.com/images/branding/product/2x/avatar_square_blue_512dp.png',
    createdAt: new Date().toISOString(),
  };

  const existingComments = $commentsStore.get()[slug] || [];
  const updatedComments = [newComment, ...existingComments];

  $commentsStore.setKey(slug, updatedComments);
  $commentCounts.setKey(slug, updatedComments.length);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`gcp_radar_comments_${slug}`, JSON.stringify(updatedComments));
    } catch {}
  }

  return newComment;
}

// ---------------------------------------------------------------------------
// 5. Lifecycle Helper for Astro View Transitions
// ---------------------------------------------------------------------------
let currentCleanups: Array<() => void> = [];

export function autoCleanSubscribe(setupFn: () => Array<() => void> | void) {
  if (typeof window === 'undefined') return;

  // Clean up prior page's subscribers
  currentCleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch {}
  });
  currentCleanups = [];

  const cleanups = setupFn();
  if (Array.isArray(cleanups)) {
    currentCleanups.push(...cleanups);
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('astro:before-swap', () => {
    currentCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {}
    });
    currentCleanups = [];
  });
}
