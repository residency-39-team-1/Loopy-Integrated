// src/navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';                       // ← 1. import hook

import TaskListScreen from '../screens/Tasks/TaskListScreen';
import FlowboardScreen from '../screens/FlowboardScreen';
import ChaosCatcherScreen from '../screens/ChaosCatcherScreen';

const Stack = createNativeStackNavigator();

/* ---------- 2. tiny sanity component ---------- */
const SanityCheck = () => {
  const n = useMemo(() => Math.random(), []);
  console.log('✅ useMemo returned:', n);   // numeric → hooks work
  return null;
};

const RootNavigator = () => (
  <NavigationContainer>
    <SanityCheck />     {/* ← 3. render once */}
    <Stack.Navigator>
      <Stack.Screen name="Tasks" component={TaskListScreen} />
      <Stack.Screen name="Flowboard" component={FlowboardScreen} />
      <Stack.Screen name="ChaosCatcher" component={ChaosCatcherScreen} options={{ title: 'Chaos Catcher' }} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default RootNavigator;