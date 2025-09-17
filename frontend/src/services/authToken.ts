// src/services/authToken.ts
import auth from '@react-native-firebase/auth';

/**
 * Returns the Firebase ID token for the currently signed-in user.
 * Throws if no user is signed in.
 */
export async function getIdToken(forceRefresh = false): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return user.getIdToken(forceRefresh);
}

/** Optional helpers if you need them elsewhere */
export function getCurrentUid(): string | null {
  return auth().currentUser?.uid ?? null;
}
