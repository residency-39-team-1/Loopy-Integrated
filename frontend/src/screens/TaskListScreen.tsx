// src/screens/TaskListScreen.tsx (complete replacement)
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import type { Task } from '../types/task';
import TaskServiceHttp from '../services/TaskServiceHttp';
import LoadingOverlay from '../components/LoadingOverlay';
import Celebration from '../components/Celebration';

const TaskService = TaskServiceHttp;
const STATE_ORDER: Task['state'][] = ['Exploring', 'Planning', 'Doing', 'Done'];

export default function TaskListScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();

  // state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // add modal
  const [addVisible, setAddVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // celebration
  const [celebrate, setCelebrate] = useState(false);

  const greeting = user?.isAnonymous ? 'Guest User' : user?.displayName || user?.email || 'User';

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const items = await TaskService.list(user.uid);
      setTasks(items);
    } catch (e: any) {
      setError(e?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const nextState = (s: Task['state']): Task['state'] => {
    const i = STATE_ORDER.indexOf(s);
    return STATE_ORDER[(i + 1) % STATE_ORDER.length];
  };

  // create task
  const openAddModal = () => {
    setNewTitle('');
    setNewNotes('');
    setAddVisible(true);
  };

  const submitNewTask = async () => {
    const title = newTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    try {
      setSaving(true);
      const t = await TaskService.create(user?.uid || '', {
        title,
        notes: newNotes.trim() || undefined,
        state: 'Exploring',
      });
      setTasks(prev => [t, ...prev]);
      setAddVisible(false);
      setCelebrate(true);
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // update task state
  const toggleTaskState = async (t: Task) => {
    const to = nextState(t.state);
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, state: to } : x)));
    try {
      const updated = await TaskService.update(t.id, { state: to });
      setTasks(prev => prev.map(x => (x.id === t.id ? updated : x)));
    } catch (e: any) {
      setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, state: t.state } : x)));
      Alert.alert('Update failed', e?.message || 'Unknown error');
    }
  };

  // edit task
  const openEditModal = (t: Task) => {
    setEditingTask(t);
    setEditTitle(t.title);
    setEditNotes(t.notes || '');
    setEditVisible(true);
  };

  const submitEdit = async () => {
    if (!editingTask) return;
    const title = editTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    try {
      setEditing(true);
      setTasks(prev =>
        prev.map(x => (x.id === editingTask.id ? { ...x, title, notes: editNotes.trim() || undefined } : x))
      );
      const updated = await TaskService.update(editingTask.id, {
        title,
        notes: editNotes.trim() || undefined,
      });
      setTasks(prev => prev.map(x => (x.id === editingTask.id ? updated : x)));
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Unknown error');
      load();
    } finally {
      setEditing(false);
    }
  };

  // delete task
  const confirmDelete = (t: Task) => {
    Alert.alert('Delete task', `Delete “${t.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prev = tasks;
          setTasks(cur => cur.filter(x => x.id !== t.id));
          try {
            await TaskService.remove(t.id);
          } catch (e: any) {
            setTasks(prev);
            Alert.alert('Delete failed', e?.message || 'Unknown error');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Task }) => (
    <View style={styles.taskItem}>
      <TouchableOpacity style={{ flex: 1, paddingRight: 8 }} onPress={() => toggleTaskState(item)}>
        <Text style={styles.taskText}>{item.title}</Text>
        {item.notes ? <Text style={styles.notesText} numberOfLines={1}>{item.notes}</Text> : null}
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.smallBtn, styles.editBtn]} onPress={() => openEditModal(item)}>
          <Text style={styles.smallBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.smallBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
          <Text style={styles.smallBtnText}>Delete</Text>
        </TouchableOpacity>
        <Text style={styles.statePill}>{item.state}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to LOOPY!</Text>
        <Text style={styles.subtitle}>{greeting}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>Your Tasks</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Text style={styles.addBtnText}>＋ New</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
         <View style={styles.loadingContainer}>
           <ActivityIndicator size="large" color="#4285F4" />
           <Text style={styles.loadingText}>Loading your gentle reminders...</Text>
          </View>
        ) : error ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : tasks.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No tasks yet. Tap "＋ New" to add your first task.</Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>

      {/* Back to Dashboard */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Dashboard')}>
        <Text style={styles.backButtonText}>← Back to Home</Text>
      </TouchableOpacity>

      {/* Add Task Modal */}
      <Modal animationType="slide" transparent visible={addVisible} onRequestClose={() => setAddVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Task</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g., Finish math worksheet"
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitNewTask}
              />
              <TextInput
                value={newNotes}
                onChangeText={setNewNotes}
                placeholder="Add details…"
                style={[styles.input, { height: 80, marginTop: 12 }]}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setAddVisible(false)} style={[styles.modalBtn, styles.cancelBtn]} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitNewTask} style={[styles.modalBtn, styles.addBtnSolid, saving && { opacity: 0.6 }]} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Add</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Task Modal */}
      <Modal animationType="slide" transparent visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Task title"
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitEdit}
              />
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add details…"
                style={[styles.input, { height: 80, marginTop: 12 }]}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setEditVisible(false)} style={[styles.modalBtn, styles.cancelBtn]} disabled={editing}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitEdit} style={[styles.modalBtn, styles.addBtnSolid, editing && { opacity: 0.6 }]} disabled={editing}>
                  {editing ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Overlays */}
      <LoadingOverlay visible={loading || refreshing || saving || editing} />
      <Celebration visible={celebrate} onDone={() => setCelebrate(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 4 },
  content: { flex: 1, padding: 20 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666'
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  addBtn: { backgroundColor: '#4285F4', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700' },

  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  placeholderText: { color: '#999', fontSize: 14, marginTop: 12 },

  errorText: { color: '#ff5252', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#4285F4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },

  taskItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskText: { fontSize: 16, color: '#222', fontWeight: '600' },
  notesText: { fontSize: 12, color: '#777', marginTop: 4 },

  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  editBtn: { backgroundColor: '#E3F2FD' },
  deleteBtn: { backgroundColor: '#FFEBEE' },
  smallBtnText: { color: '#222', fontWeight: '700' },
  statePill: {
    marginLeft: 6,
    backgroundColor: '#eee',
    color: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
  },

  backButton: {
    margin: 20,
    padding: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center'
  },
  backButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600'
  },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12 },
  input: { backgroundColor: '#f6f6f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#222' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  cancelBtn: { backgroundColor: '#eee' },
  cancelText: { color: '#333', fontWeight: '600' },
  addBtnSolid: { backgroundColor: '#4285F4' },
});