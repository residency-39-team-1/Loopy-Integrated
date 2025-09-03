// src/screens/FlowboardScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { DraxProvider, DraxView } from 'react-native-drax';
import { listTasks, createTask, updateTask, type BackendTask } from '../services/api';

// ---- UI state (PRD: emotionally neutral) ----
export type UIState = 'Exploring' | 'Active' | 'Reviewing' | 'Complete';
const COLUMNS: UIState[] = ['Exploring', 'Active', 'Reviewing', 'Complete'];

// Backend ↔︎ UI state mappers
const toUIState = (s: BackendTask['state']): UIState => {
  switch (s) {
    case 'Exploring':
      return 'Exploring';
    case 'Planning':
      return 'Active';
    case 'Doing':
      return 'Reviewing';
    case 'Done':
    default:
      return 'Complete';
  }
};

const toBackendState = (s: UIState): BackendTask['state'] => {
  switch (s) {
    case 'Exploring':
      return 'Exploring';
    case 'Active':
      return 'Planning';
    case 'Reviewing':
      return 'Doing';
    case 'Complete':
      return 'Done';
  }
};

type Task = {
  id: string;
  title: string;
  state: UIState;
  ownerUid?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

export default function FlowboardScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState<Record<UIState, string>>({
    Exploring: '',
    Active: '',
    Reviewing: '',
    Complete: '',
  });

  // Initial load from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await listTasks({ orderBy: 'createdAt', limit: 200 });
        if (cancelled) return;
        setTasks(
          items.map((t) => ({
            id: t.id,
            title: t.title ?? '',
            state: toUIState(t.state),
            ownerUid: t.userId,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }))
        );
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by column
  const byColumn = useMemo(() => {
    const map: Record<UIState, Task[]> = { Exploring: [], Active: [], Reviewing: [], Complete: [] };
    for (const t of tasks) map[t.state].push(t);
    return map;
  }, [tasks]);

  // Create new task in a column
  const addQuick = async (col: UIState) => {
    const title = (quickTitle[col] ?? '').trim();
    if (!title) return;
    try {
      const created = await createTask({ title, state: toBackendState(col) });
      setTasks((prev) => [
        {
          id: created.id,
          title: created.title ?? title,
          state: col,
          ownerUid: created.userId,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...prev,
      ]);
      setQuickTitle((prev) => ({ ...prev, [col]: '' }));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert('Could not add task', String(e?.message ?? e));
    }
  };

  // Move a task between columns
  const moveTaskTo = useCallback(async (taskId: string, target: UIState) => {
    try {
      await updateTask(taskId, { state: toBackendState(target) });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: target } : t)));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Move failed', String(e?.message ?? e));
    }
  }, []);

  // Draggable task card
  const TaskCard = ({ item }: { item: Task }) => (
    <DraxView
      style={styles.card}
      draggingStyle={styles.cardDragging}
      dragReleasedStyle={styles.card}
      hoverDraggingStyle={styles.cardHover}
      payload={{ taskId: item.id }}
      longPressDelay={120}
      onDragStart={() => Haptics.selectionAsync()}
      draggable
    >
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title || '(untitled)'}
      </Text>
      <Text style={styles.cardHint}>drag to move</Text>
    </DraxView>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Loading Flowboard…</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Error: {err}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DraxProvider>
        <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
          {COLUMNS.map((col) => (
            <View key={col} style={styles.columnWrap}>
              <DraxView
                style={styles.column}
                receptive
                onReceiveDragDrop={async ({ dragged: { payload } }) => {
                  const taskId = (payload as any)?.taskId as string | undefined;
                  if (taskId) {
                    await moveTaskTo(taskId, col);
                  }
                }}
              >
                <Text style={styles.colTitle}>{col}</Text>

                {/* Quick Add */}
                <View style={styles.quickRow}>
                  <TextInput
                    placeholder={`New ${col.toLowerCase()}…`}
                    value={quickTitle[col]}
                    onChangeText={(v) => setQuickTitle((p) => ({ ...p, [col]: v }))}
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={() => addQuick(col)}
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={() => addQuick(col)}>
                    <Text style={styles.addBtnText}>＋</Text>
                  </TouchableOpacity>
                </View>

                {/* Column tasks */}
                <FlatList
                  data={byColumn[col]}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listPad}
                  renderItem={({ item }) => <TaskCard item={item} />}
                  ListEmptyComponent={<Text style={styles.empty}>No tasks here yet</Text>}
                />
              </DraxView>
            </View>
          ))}
        </ScrollView>
      </DraxProvider>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { marginTop: 8, opacity: 0.7 },
  error: { color: '#b00020', padding: 16, textAlign: 'center' },

  board: { paddingHorizontal: 12, paddingVertical: 12 },
  columnWrap: { width: 280, height: '100%', paddingHorizontal: 6 },
  column: {
    flex: 1,
    backgroundColor: '#f8f9fb',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  colTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  quickRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  input: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e3e6eb',
  },
  addBtn: {
    marginLeft: 8,
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e3e6eb',
  },
  addBtnText: { fontSize: 18, fontWeight: '700' },

  listPad: { paddingBottom: 24 },

  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eef1f5',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardDragging: { opacity: 0.75, transform: [{ scale: 1.03 }] },
  cardHover: { borderColor: '#c6d6ff', borderWidth: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardHint: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  empty: { textAlign: 'center', opacity: 0.6, paddingVertical: 12 },
});

