// src/screens/DashboardScreen.tsx
import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import PlantCard from '../components/PlantCard'; // <-- add

export default function DashboardScreen({ navigation }: { navigation: any }) {
  const { user, signOut } = useAuth();
  const [settingsVisible, setSettingsVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Loopy title and settings */}
      <View style={styles.header}>
        <Text style={styles.loopyTitle}>Loopy</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setSettingsVisible(true)}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* User greeting */}
      <View style={styles.greetingSection}>
        <Text style={styles.greeting}>
          hello, {user?.displayName?.split(' ')[0] || 'friend'}
        </Text>
      </View>

      {/* Middle section - Dopamine Plant */}
      <View style={styles.middleSection}>
        <PlantCard />
      </View>

      {/* Bottom navigation dock */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('Flowboard')}
        >
          <Text style={styles.dockIcon}>🎯</Text>
          <Text style={styles.dockLabel}>Flowboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockButton, styles.dockButtonActive]}
          onPress={() => {}} // Already on dashboard
        >
          <Text style={styles.dockIcon}>🏠</Text>
          <Text style={[styles.dockLabel, styles.dockLabelActive]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('ChaosCatcher')}
        >
          <Text style={styles.dockIcon}>🌪️</Text>
          <Text style={styles.dockLabel}>Chaos</Text>
        </TouchableOpacity>
      </View>

      {/* Settings Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={settingsVisible}
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSettingsVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.settingsModal}>
                <Text style={styles.settingsTitle}>Settings</Text>

                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setSettingsVisible(false);
                    navigation.navigate('Archive');
                  }}
                >
                  <Text style={styles.settingsOptionIcon}>📦</Text>
                  <Text style={styles.settingsOptionText}>Archive</Text>
                  <Text style={styles.settingsOptionSubtext}>View archived items</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.settingsOption}
                  onPress={() => {
                    setSettingsVisible(false);
                    signOut();
                  }}
                >
                  <Text style={styles.settingsOptionIcon}>🚪</Text>
                  <Text style={styles.settingsOptionText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafbfc' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  loopyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 20 },

  // Greeting section
  greetingSection: { paddingHorizontal: 20, paddingVertical: 16 },
  greeting: { fontSize: 18, color: '#333', fontWeight: '500' },

  // Middle section
  middleSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  // Bottom dock navigation
  bottomDock: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 5,
  },
  dockButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  dockButtonActive: { backgroundColor: '#f3f4f6' },
  dockIcon: { fontSize: 24, marginBottom: 4 },
  dockLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dockLabelActive: { color: '#374151', fontWeight: '600' },

  // Settings modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  settingsModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 300,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  settingsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingsOptionIcon: { fontSize: 20, marginRight: 16, width: 24, textAlign: 'center' },
  settingsOptionText: { fontSize: 16, fontWeight: '500', color: '#374151', flex: 1 },
  settingsOptionSubtext: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
});
