import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TaskListScreen from '../screens/Tasks/TaskListScreen';
import FlowboardScreen from '../screens/FlowboardScreen';

const Stack = createNativeStackNavigator();

const RootNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Tasks" component={TaskListScreen} />
      <Stack.Screen name="Flowboard" component={FlowboardScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default RootNavigator;