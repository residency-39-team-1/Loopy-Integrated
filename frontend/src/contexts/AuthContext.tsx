// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

WebBrowser.maybeCompleteAuthSession(); // required for Expo-Auth-Session

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

  /* ------------------------------------------------------------------ */
  /* 1.  Build the Expo-Google request                                  */
  /* ------------------------------------------------------------------ */
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      '39855210543-eqbv7f2ia13apocshc46opgtqec5sqld.apps.googleusercontent.com',
    scopes: ['openid', 'email', 'profile'],
  });

  /* ------------------------------------------------------------------ */
  /* 2.  Handle the Expo-Google response                                */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = auth.GoogleAuthProvider.credential(id_token);
      auth()
        .signInWithCredential(credential)
        .catch((e) => setError(e.message));
    } else if (response?.type === 'error') {
      setError(response.error?.message || 'Google sign-in error');
    }
  }, [response]);

  /* ------------------------------------------------------------------ */
  /* 3.  Firebase state listener (unchanged)                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        await firestore()
          .collection('users')
          .doc(u.uid)
          .set(
            {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              isAnonymous: u.isAnonymous,
              lastSignIn: firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .catch(console.warn);
      }
      setIsLoading(false);
    });
    return unsub;
  }, []);

  /* ------------------------------------------------------------------ */
  /* 4.  Public methods (same signature)                                */
  /* ------------------------------------------------------------------ */
  const signInWithGoogle = async () => {
    try {
      setError(null);
      setIsLoading(true);
      if (!request) throw new Error('Google request not loaded');
      const result = await promptAsync();
      if (result.type !== 'success') throw new Error('Cancelled');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const signInAsGuest = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await auth().signInAnonymously();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      await auth().signOut();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, signInAsGuest, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
};