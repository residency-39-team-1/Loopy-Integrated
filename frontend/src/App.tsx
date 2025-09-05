// src/App.tsx
import 'react-native-gesture-handler';
import '@react-native-firebase/app';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TaskProvider } from './contexts/TaskContext';

import DashboardScreen from './screens/DashboardScreen';
import LoginScreen from './screens/LoginScreen';

// Placeholder screens
import FlowboardScreen from './screens/FlowboardScreen';
import ChaosCatcherScreen from './screens/ChaosCatcherScreen';
import ProgressScreen from './screens/ProgressScreen';
import DailyResetScreen from './screens/DailyResetScreen';

const Stack = createNativeStackNavigator();

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
      <TaskProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Flowboard" component={FlowboardScreen} />
          <Stack.Screen name="ChaosCatcher" component={ChaosCatcherScreen} />
          <Stack.Screen name="Progress" component={ProgressScreen} />
          <Stack.Screen name="DailyReset" component={DailyResetScreen} />
        </Stack.Navigator>
      </TaskProvider>
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
          <RootNavigator />
        </NavigationContainer>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
