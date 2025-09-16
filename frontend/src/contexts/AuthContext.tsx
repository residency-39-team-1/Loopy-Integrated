// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Configure Google Sign-In once
  useEffect(() => {
    GoogleSignin.configure({
      // Prefer env var if provided; fallback to your known client ID
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        '39855210543-eqbv7f2ia13apocshc46opgtqec5sqld.apps.googleusercontent.com',
      scopes: ['openid', 'email', 'profile'],
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
  }, []);

  // Firebase auth state listener
  useEffect(() => {
  const unsubscribe = onAuthStateChanged(getAuth(), async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // upsert user profile
        await setDoc(
          doc(collection(getFirestore(), 'users'), firebaseUser.uid),
          {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            isAnonymous: firebaseUser.isAnonymous,
            lastSignIn: serverTimestamp(),
          },
          { merge: true }
        ).catch(console.error);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  // Keep user doc fresh on user changes
  useEffect(() => {
    if (!user) return;
    setDoc(
      doc(collection(getFirestore(), 'users'), user.uid),
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        lastSignIn: serverTimestamp(),
      },
      { merge: true }
    ).catch(console.error);
  }, [user]);

  // --- Public methods --------------------------------------------------------

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setIsLoading(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Handle both old and new Google Sign-In response formats
      const result = await GoogleSignin.signIn();
      const idToken = (result as any).idToken || (result as any).data?.idToken;
      if (!idToken) throw new Error('No ID token received');

  const credential = GoogleAuthProvider.credential(idToken);
  await getAuth().signInWithCredential(credential);

      console.log('✅ Google sign-in complete');
    } catch (err: any) {
      const code = err?.code || err?.statusCode;
      if (code === statusCodes.SIGN_IN_CANCELLED) setError('Cancelled');
      else if (code === statusCodes.IN_PROGRESS) setError('Sign-in already in progress');
      else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) setError('Google Play Services not available');
      else setError(err?.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const signInAsGuest = async () => {
    try {
      setError(null);
      setIsLoading(true);
  await getAuth().signInAnonymously();
    } catch (err: any) {
      setError(err?.message || 'Guest sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
  const current = getAuth().currentUser;
      if (current && !current.isAnonymous) {
        try {
          await GoogleSignin.signOut();
        } catch {
          /* ignore */
        }
      }
  await getAuth().signOut();
    } catch (err: any) {
      setError(err?.message || 'Sign-out failed');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signInWithGoogle,
        signInAsGuest,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};