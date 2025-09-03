// src/screens/DashboardScreen.tsx
import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../contexts/TaskContext';

export default function DashboardScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const { tasks } = useTasks();

  const activeTasks = tasks.filter((t) => t.state !== 'Done').length;
  const doneTasks = tasks.filter((t) => t.state === 'Done').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Greeting */}
      <View style={styles.topBar}>
        <Text style={styles.title}>
          hello, {user?.displayName?.split(' ')[0] || 'friend'}
        </Text>
      </View>

      {/* Task stats */}
      <View style={styles.stats}>
        <Text style={styles.stat}>{activeTasks} active</Text>
        <Text style={styles.stat}>•</Text>
        <Text style={styles.stat}>{doneTasks} done</Text>
      </View>

      {/* Feature grid */}
      <View style={styles.grid}>
        {/* Tasks button */}
        <TouchableOpacity
          style={[styles.tile, styles.primary]}
          onPress={() => navigation.navigate('TaskList')}
        >
          <Text style={styles.emoji}>📝</Text>
          <Text style={styles.tileText}>Tasks</Text>
        </TouchableOpacity>

        {/* Flowboard button */}
        <TouchableOpacity
          style={[styles.tile, styles.secondary]}
          onPress={() => navigation.navigate('Flowboard')}
        >
          <Text style={styles.emoji}>🎯</Text>
          <Text style={styles.tileText}>Flowboard</Text>
        </TouchableOpacity>

        {/* Chaos Catcher button */}
        <TouchableOpacity
          style={[styles.tile, styles.tertiary]}
          onPress={() => navigation.navigate('ChaosCatcher')}
        >
          <Text style={styles.emoji}>🌪️</Text>
          <Text style={styles.tileText}>Chaos</Text>
        </TouchableOpacity>

        {/* Progress button */}
        <TouchableOpacity
          style={[styles.tile, styles.quaternary]}
          onPress={() => navigation.navigate('Progress')}
        >
          <Text style={styles.emoji}>🏆</Text>
          <Text style={styles.tileText}>Progress</Text>
        </TouchableOpacity>
      </View>

      {/* Logout button */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={signOut} style={styles.navBtn}>
          <Text style={styles.navText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 60 },
  topBar: { marginBottom: 16 },
  title: { fontSize: 18, color: '#333', fontWeight: '500' },

  stats: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  stat: { fontSize: 14, color: '#666' },

  grid: { gap: 12 },
  tile: {
    height: 100,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },

  primary: { backgroundColor: '#E3F2FD' },
  secondary: { backgroundColor: '#F3E5F5' },
  tertiary: { backgroundColor: '#FFF3E0' },
  quaternary: { backgroundColor: '#E8F5E8' },

  emoji: { fontSize: 28, marginBottom: 6 },
  tileText: { fontSize: 16, fontWeight: '600', color: '#333' },

  navRow: { marginTop: 'auto', paddingVertical: 16 },
  navBtn: { paddingVertical: 12, alignItems: 'center' },
  navText: { fontSize: 15, color: '#6B46C1', fontWeight: '500' },
});
