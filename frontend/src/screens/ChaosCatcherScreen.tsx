// src/screens/ChaosCatcherScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { 
  createChaos, 
  listChaos, 
  updateChaos, 
  deleteChaos, 
  type ChaosEntry 
} from '../services/chaos';

export default function ChaosCatcherScreen({ navigation }: { navigation: any }) {
  const [entries, setEntries] = useState<ChaosEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick capture state
  const [quickText, setQuickText] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editEntry, setEditEntry] = useState<ChaosEntry | null>(null);
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter state
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Load entries
  const refreshEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { limit: 100 };
      if (showPinnedOnly) params.pinned = true;
      if (selectedTag) params.tag = selectedTag;
      
      const data = await listChaos(params);
      setEntries(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }, [showPinnedOnly, selectedTag]);

  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  // Quick capture
  const handleQuickCapture = async () => {
    const text = quickText.trim();
    if (!text) {
      Alert.alert('Empty thought', 'Please enter some text to capture.');
      return;
    }

    try {
      setIsCapturing(true);
      const newEntry = await createChaos({ 
        text,
        tags: [],
        context: { source: 'quickCapture' }
      });
      
      setEntries(prev => [newEntry, ...prev]);
      setQuickText('');
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e: any) {
      Alert.alert('Capture failed', e?.message || 'Could not save your thought');
    } finally {
      setIsCapturing(false);
    }
  };

  // Pin/unpin entry
  const togglePin = async (entry: ChaosEntry) => {
    try {
      const updated = await updateChaos(entry.id, { pinned: !entry.pinned });
      setEntries(prev => 
        prev.map(e => e.id === entry.id ? updated : e)
      );
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e: any) {
      Alert.alert('Update failed', e?.message || 'Could not update entry');
    }
  };

  // Edit entry
  const openEditModal = (entry: ChaosEntry) => {
    setEditEntry(entry);
    setEditText(entry.text);
    setEditTags(entry.tags.join(', '));
    setEditVisible(true);
  };

  const submitEdit = async () => {
    if (!editEntry) return;
    const text = editText.trim();
    if (!text) {
      Alert.alert('Empty text', 'Please enter some text.');
      return;
    }

    try {
      setSaving(true);
      const tags = editTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const updated = await updateChaos(editEntry.id, { text, tags });
      setEntries(prev => 
        prev.map(e => e.id === editEntry.id ? updated : e)
      );
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  // Delete entry
  const confirmDelete = (entry: ChaosEntry) => {
    Alert.alert(
      'Archive Entry',
      `Move "${entry.text.slice(0, 50)}..." to archive?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChaos(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              
              if (Platform.OS !== 'web') {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              
              // Show archive confirmation
              Alert.alert('Archived', 'Entry moved to archive');
            } catch (e: any) {
              Alert.alert('Archive failed', e?.message || 'Could not archive entry');
            }
          },
        },
      ]
    );
  };

  // Get unique tags for filtering
  const allTags = Array.from(
    new Set(entries.flatMap(e => e.tags))
  ).sort();

  // Render chaos entry
  const renderEntry = ({ item }: { item: ChaosEntry }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <TouchableOpacity
          style={styles.pinButton}
          onPress={() => togglePin(item)}
        >
          <Text style={styles.pinIcon}>
            {item.pinned ? '📌' : '📍'}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.entryDate}>
          {new Date(item.capturedAt).toLocaleDateString()}
        </Text>
        
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => openEditModal(item)}
        >
          <Text style={styles.moreIcon}>⋯</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.entryText}>{item.text}</Text>

      {item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => confirmDelete(item)}
      >
        <Text style={styles.deleteText}>Archive</Text>
      </TouchableOpacity>
    </View>
  );

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshEntries}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
        
        {/* Bottom dock */}
        <View style={styles.bottomDock}>
          <TouchableOpacity
            style={styles.dockButton}
            onPress={() => navigation.navigate('Flowboard')}
          >
            <Text style={styles.dockIcon}>🎯</Text>
            <Text style={styles.dockLabel}>Flowboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockButton}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.dockIcon}>🏠</Text>
            <Text style={styles.dockLabel}>Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dockButton, styles.dockButtonActive]}
            onPress={() => {}} // Already on chaos
          >
            <Text style={styles.dockIcon}>🌪️</Text>
            <Text style={[styles.dockLabel, styles.dockLabelActive]}>Chaos</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

    return (
      <SafeAreaView style={styles.container}>
    <LoadingOverlay visible={loading} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Chaos Catcher</Text>
        <TouchableOpacity style={styles.filterButton} onPress={refreshEntries}>
          <Text style={styles.filterIcon}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Quick capture */}
      <View style={styles.captureSection}>
        <TextInput
          value={quickText}
          onChangeText={setQuickText}
          placeholder="Capture a thought, idea, or random thing..."
          style={styles.captureInput}
          multiline
          returnKeyType="done"
          onSubmitEditing={handleQuickCapture}
        />
        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
          onPress={handleQuickCapture}
          disabled={isCapturing}
        >
          <Text style={styles.captureButtonText}>
            {isCapturing ? '...' : 'Capture'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <TouchableOpacity
          style={[styles.filterChip, showPinnedOnly && styles.filterChipActive]}
          onPress={() => setShowPinnedOnly(!showPinnedOnly)}
        >
          <Text style={[styles.filterChipText, showPinnedOnly && styles.filterChipTextActive]}>
            📌 Pinned
          </Text>
        </TouchableOpacity>

        <FlatList
          horizontal
          data={allTags}
          keyExtractor={item => item}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: tag }) => (
            <TouchableOpacity
              style={[styles.filterChip, selectedTag === tag && styles.filterChipActive]}
              onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >
              <Text style={[styles.filterChipText, selectedTag === tag && styles.filterChipTextActive]}>
                #{tag}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Entries list */}
      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.entriesList}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={refreshEntries}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No chaos captured yet</Text>
            <Text style={styles.emptySubtext}>Use the box above to capture your first thought</Text>
          </View>
        }
      />

      {/* Bottom dock */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('Flowboard')}
        >
          <Text style={styles.dockIcon}>🎯</Text>
          <Text style={styles.dockLabel}>Flowboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.dockIcon}>🏠</Text>
          <Text style={styles.dockLabel}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockButton, styles.dockButtonActive]}
          onPress={() => {}} // Already on chaos
        >
          <Text style={styles.dockIcon}>🌪️</Text>
          <Text style={[styles.dockLabel, styles.dockLabelActive]}>Chaos</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Modal */}
      <Modal animationType="slide" transparent visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Entry</Text>
              
              <TextInput
                value={editText}
                onChangeText={setEditText}
                placeholder="Your thought..."
                style={[styles.input, styles.textInput]}
                multiline
                autoFocus
              />
              
              <TextInput
                value={editTags}
                onChangeText={setEditTags}
                placeholder="Tags (comma separated)"
                style={styles.input}
              />
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  onPress={() => setEditVisible(false)} 
                  style={styles.cancelButton} 
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={submitEdit} 
                  style={styles.saveButton} 
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  filterButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterIcon: { fontSize: 18 },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  retryButton: { backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Quick capture
  captureSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  captureInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    minHeight: 50,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  captureButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  captureButtonDisabled: { opacity: 0.6 },
  captureButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Filters
  filtersSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
  },
  filterChip: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#F59E0B' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterChipTextActive: { color: '#fff' },

  // Entries list
  entriesList: { padding: 16, paddingBottom: 100 },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinButton: { marginRight: 8 },
  pinIcon: { fontSize: 16 },
  entryDate: { flex: 1, fontSize: 12, color: '#9ca3af' },
  moreButton: { padding: 4 },
  moreIcon: { fontSize: 16, color: '#6b7280' },
  entryText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  deleteText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 18, color: '#9ca3af', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#d1d5db', textAlign: 'center' },

  // Bottom dock (same as other screens)
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

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textInput: { minHeight: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
