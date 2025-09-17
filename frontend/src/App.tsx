// src/App.tsx
import 'react-native-gesture-handler';
import '@react-native-firebase/app';
import React, { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';
import { PlantProvider, usePlant } from './contexts/PlantContext';
import { getPlantState } from './api/dopamine';

import DashboardScreen from './screens/DashboardScreen';
import LoginScreen from './screens/LoginScreen';
import FlowboardScreen from './screens/FlowboardScreen';
import ChaosCatcherScreen from './screens/ChaosCatcherScreen';
import ProgressScreen from './screens/ProgressScreen';
import ArchiveScreen from './screens/ArchiveScreen';

function SanityCheck() {
  const n = useMemo(() => Math.random(), []);
  console.log('✅ useMemo returned:', n);
  return null;
}

const Stack = createNativeStackNavigator();

/** Loads the latest plant state after a user is authenticated. */
function PlantBootstrap() {
  const { user } = useAuth();
  const { setPlant } = usePlant();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getPlantState();
        if (!cancelled) setPlant(res.plant);
      } catch {
        // it's okay if there's no plant yet (not initialized); stay silent
      }
    }
    if (user) load();
    return () => { cancelled = true; };
  }, [user, setPlant]);

  return null;
}

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  if (user) {
    return (
      <PlantProvider>
        <TaskProvider>
          {/* bootstrap the plant state once after login */}
          <PlantBootstrap />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen
              name="Flowboard"
              component={FlowboardScreen}
              options={{ animation: 'slide_from_left' }}
            />
            <Stack.Screen
              name="ChaosCatcher"
              component={ChaosCatcherScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Progress"
              component={ProgressScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Archive"
              component={ArchiveScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </Stack.Navigator>
        </TaskProvider>
      </PlantProvider>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer>
          <SanityCheck />
          <RootNavigator />
        </NavigationContainer>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
