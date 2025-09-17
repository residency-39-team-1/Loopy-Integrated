import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SafeAreaView, View, Text, Alert, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTasks } from '../contexts/TaskContext';
import { createTask, updateTask, deleteTask, type BackendTask } from '../services/api';
import * as ArchiveService from '../services/archive';
import Celebration from '../components/Celebration';
import { type TaskState } from '../types/task';
import {
  AddTaskModal,
  EditTaskModal,
  TaskOverlay,
  BottomDock,
  Column,
  TaskCard,
  DragContext,
} from './FlowboardComponents';
import styles from './FlowboardScreen.styles';

// dopamine API + Plant context
import { notifyTaskComplete, getPlantState } from '../api/dopamine';
import { usePlant } from '../contexts/PlantContext';
import { useAuth } from '../contexts/AuthContext';

/* ------------------------------------------------------------------ */
/* Column colours helper                                              */
/* ------------------------------------------------------------------ */
const COLUMN_COLORS = {
  Exploring: '#8B5CF6',
  Active:    '#3B82F6',
  Reviewing: '#F59E0B',
  Complete:  '#10B981',
} as const;

/* ------------------------------------------------------------------ */
/* Types & constants                                                  */
/* ------------------------------------------------------------------ */
type UIState = 'Exploring' | 'Active' | 'Reviewing' | 'Complete';
const COLUMNS: UIState[] = ['Exploring', 'Active', 'Reviewing', 'Complete'];

const toUIState = (s: BackendTask['state'] | TaskState): UIState => {
  switch (s) {
    case 'Exploring': return 'Exploring';
    case 'Planning':  return 'Active';
    case 'Doing':     return 'Reviewing';
    case 'Done':      return 'Complete';
    case 'Active':    return 'Active';
    case 'Reviewing': return 'Reviewing';
    case 'Complete':  return 'Complete';
    default:          return 'Exploring';
  }
};
const toBackendState = (s: UIState): BackendTask['state'] => {
  switch (s) {
    case 'Exploring': return 'Exploring';
    case 'Active':    return 'Planning';
    case 'Reviewing': return 'Doing';
    case 'Complete':  return 'Done';
  }
};

type UITask = {
  id: string;
  title: string;
  notes?: string;
  state: UIState;
};

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */
export default function FlowboardScreen({ navigation }: { navigation: any }) {
  const { tasks: contextTasks, isLoading, error, refresh } = useTasks();
  const { setPlant } = usePlant(); // publish latest plant state after completions
  const { user } = useAuth();

  // Refresh tasks when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const [optimisticTasks, setOptimisticTasks] = useState<UITask[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [overlayTask, setOverlayTask] = useState<UITask | null>(null);
  const [exploringCollapsed, setExploringCollapsed] = useState(true);
  const pendingMoves = useRef(new Set<string>()).current;

  /* ---------- modals ---------- */
  const [addVisible, setAddVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newState, setNewState] = useState<UIState>('Exploring');
  const [editTask, setEditTask] = useState<UITask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  /* ---------- drag context ---------- */
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const dropZonesRef = useRef(new Map<string, any>());
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useRef(0);
  const autoScrollInterval = useRef<number | NodeJS.Timeout | null>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const checkDropZone = useCallback((x: number, y: number) => {
    for (const [state, zone] of dropZonesRef.current.entries()) {
      if (zone && 
          x >= zone.x && 
          x <= zone.x + zone.width && 
          y >= zone.y && 
          y <= zone.y + zone.height) {
        return state;
      }
    }
    return null;
  }, []);

  const registerDropZone = useCallback((state: string, zone: any) => {
    dropZonesRef.current.set(state, zone);
  }, []);

  const unregisterDropZone = useCallback((state: string) => {
    dropZonesRef.current.delete(state);
  }, []);

  // Auto-scroll functionality
  const startAutoScroll = useCallback((direction: 'up' | 'down', speedMultiplier: number = 1) => {
    if (autoScrollInterval.current) return;
    
    const scrollStep = () => {
      if (flatListRef.current) {
        const baseScrollAmount = direction === 'up' ? -15 : 15;
        const scrollAmount = baseScrollAmount * Math.min(speedMultiplier, 2);
        const newScrollY = Math.max(0, Math.min(contentHeight - 600, scrollY.current + scrollAmount));
        
        if (newScrollY !== scrollY.current && 
            ((direction === 'up' && newScrollY < scrollY.current) || 
             (direction === 'down' && newScrollY > scrollY.current))) {
          flatListRef.current.scrollToOffset({
            offset: newScrollY,
            animated: false
          });
          
          // Update scroll position immediately
          scrollY.current = newScrollY;
          
          // Continue scrolling if still in auto-scroll zone
          autoScrollInterval.current = requestAnimationFrame(scrollStep);
        } else {
          autoScrollInterval.current = null;
        }
      } else {
        autoScrollInterval.current = null;
      }
    };
    
    autoScrollInterval.current = requestAnimationFrame(scrollStep);
  }, [contentHeight]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollInterval.current) {
      if (typeof autoScrollInterval.current === 'number') {
        cancelAnimationFrame(autoScrollInterval.current);
      } else {
        clearTimeout(autoScrollInterval.current);
      }
      autoScrollInterval.current = null;
    }
  }, []);

  // Cleanup auto-scroll on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  const handleScroll = useCallback((event: any) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleContentSizeChange = useCallback((width: number, height: number) => {
    setContentHeight(height);
  }, []);

  /* ---------- derived data ---------- */
  const tasks = useMemo(() => {
    const mapped: UITask[] = contextTasks
      .filter(t => !t.isArchived) // Filter out archived tasks
      .map((t) => ({
        id: t.id,
        title: t.title ?? '',
        notes: t.notes,
        state: toUIState(t.state),
      }));
    if (optimisticTasks.length === 0 && mapped.length > 0) {
      setOptimisticTasks(mapped);
      return mapped;
    }
    return optimisticTasks.length ? optimisticTasks : mapped;
  }, [contextTasks, optimisticTasks]);

  const byColumn = useMemo(() => {
    const map: Record<UIState, UITask[]> = { Exploring: [], Active: [], Reviewing: [], Complete: [] };
    tasks.forEach((t) => map[t.state].push(t));
    return map;
  }, [tasks]);

  /* ---------- helpers ---------- */
  const haptic = async (type: 'light' | 'medium' | 'heavy' | 'error' = 'light') => {
    if (Platform.OS === 'web') return;
    const { ImpactFeedbackStyle, NotificationFeedbackType, impactAsync, notificationAsync } = await import('expo-haptics');
    switch (type) {
      case 'error':
        await notificationAsync(NotificationFeedbackType.Error);
        break;
      case 'light':
        await impactAsync(ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await impactAsync(ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await impactAsync(ImpactFeedbackStyle.Heavy);
        break;
    }
  };

  /* ---------- move task (debounced per task) ---------- */
  const moveTaskTo = useCallback(
    async (taskId: string, target: UIState) => {
      const key = `${taskId}-${target}`;
      if (pendingMoves.has(key)) return;
      const originalTask = tasks.find((t) => t.id === taskId);
      if (!originalTask || originalTask.state === target) return;
      pendingMoves.add(key);

      setOptimisticTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: target } : t)));

      try {
        // 1) Persist task state
        await updateTask(taskId, { state: toBackendState(target) });
        await haptic('light');

        // 2) If moved to Complete, notify plant + refresh context
        if (target === 'Complete' && user?.uid) {
          try {
            const resp = await notifyTaskComplete(user.uid, taskId, 1);
            if (resp?.plant) {
              setPlant(resp.plant);
            } else {
              const latest = await getPlantState(user.uid);
              setPlant(latest.plant);
            }
          } catch (err: any) {
            console.log('dopamine update error:', err?.message || err);
          }
          setCelebrate(true);
        }
      } catch (e: any) {
        // rollback on error
        setOptimisticTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: originalTask.state } : t)));
        await haptic('error');
        Alert.alert('Move failed', String(e?.message ?? e));
      } finally {
        pendingMoves.delete(key);
      }
    },
    [tasks, pendingMoves, user?.uid, setPlant]
  );

  /* ---------- add task ---------- */
  const openAddModal = () => {
    setNewTitle('');
    setNewNotes('');
    setNewState('Exploring');
    setAddVisible(true);
  };
  const submitNewTask = async () => {
    const title = newTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    const tempId = `temp-${Date.now()}`;
    const optTask: UITask = { id: tempId, title, notes: newNotes.trim() || undefined, state: newState };
    try {
      setSaving(true);
      setOptimisticTasks((prev) => [optTask, ...prev]);
      const created = await createTask({ title, notes: newNotes.trim() || undefined, state: toBackendState(newState) });
      setOptimisticTasks((prev) => prev.map((t) => (t.id === tempId ? { ...created, state: toUIState(created.state) } : t)));
      setAddVisible(false);
      setNewTitle('');
      setNewNotes('');
      await haptic('medium');
    } catch (e: any) {
      setOptimisticTasks((prev) => prev.filter((t) => t.id !== tempId));
      Alert.alert('Could not add task', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  /* ---------- edit task ---------- */
  const openEditModal = (task: UITask) => {
    setEditTask(task);
    setEditTitle(task.title);
    setEditNotes(task.notes || '');
    setEditVisible(true);
    setOverlayTask(null);
  };
  const submitEdit = async () => {
    if (!editTask) return;
    const title = editTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    const original = editTask;
    const updated = { ...editTask, title, notes: editNotes.trim() || undefined };
    try {
      setSaving(true);
      setOptimisticTasks((prev) => prev.map((t) => (t.id === editTask.id ? updated : t)));
      await updateTask(editTask.id, { title, notes: editNotes.trim() || undefined });
      setEditVisible(false);
    } catch (e: any) {
      setOptimisticTasks((prev) => prev.map((t) => (t.id === editTask.id ? original : t)));
      Alert.alert('Save failed', e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- delete task ---------- */
  const confirmDelete = (task: UITask) => {
    Alert.alert('Delete task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setOptimisticTasks((prev) => prev.filter((t) => t.id !== task.id));
            // Archive by setting isArchived flag instead of deleting
            await updateTask(task.id, { isArchived: true });
            setOverlayTask(null);
            await haptic('light');
          } catch (e: any) {
            setOptimisticTasks((prev) => [...prev, task]);
            Alert.alert('Archive failed', e?.message || 'Unknown error');
          }
        },
      },
    ]);
  };

  /* ---------- bulk helpers ---------- */
  const bulkMoveTasks = async (fromState: UIState, toState: UIState) => {
    const toMove = byColumn[fromState];
    if (!toMove.length) return;
    try {
      setBulkLoading(true);
      setOptimisticTasks((prev) => prev.map((t) => (toMove.find((m) => m.id === t.id) ? { ...t, state: toState } : t)));
      await Promise.all(toMove.map((t) => updateTask(t.id, { state: toBackendState(toState) })));

      // If moving to Complete in bulk, notify plant once
      if (toState === 'Complete' && user?.uid) {
        try {
          const resp = await notifyTaskComplete(user.uid);
          if (resp?.plant) setPlant(resp.plant);
        } catch (e) {
          // non-fatal
        }
      }

      await refresh();
      await haptic('medium');
      if (toState === 'Complete') setCelebrate(true);
    } catch (error: any) {
      setOptimisticTasks((prev) => prev.map((t) => (toMove.find((m) => m.id === t.id) ? { ...t, state: fromState } : t)));
      Alert.alert('Bulk move failed', error?.message || 'Failed to move tasks');
    } finally {
      setBulkLoading(false);
    }
  };

  const archiveAllComplete = async () => {
    const toArchive = byColumn.Complete;
    if (!toArchive.length) return;
    Alert.alert(
      'Archive All Complete',
      `Archive ${toArchive.length} completed tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              setBulkLoading(true);
              setOptimisticTasks((prev) => prev.filter((t) => !toArchive.find((a) => a.id === t.id)));
              // Archive by setting isArchived flag instead of deleting
              await Promise.all(toArchive.map(task => updateTask(task.id, { isArchived: true })));
              await refresh();
              await haptic('medium');
            } catch (error: any) {
              setOptimisticTasks((prev) => [...prev, ...toArchive]);
              Alert.alert('Archive failed', error?.message || 'Failed to archive tasks');
            } finally {
              setBulkLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRestart = async () => {
    Alert.alert(
      'Restart Workflow',
      'This will:\n• Archive all Complete tasks\n• Move Reviewing → Complete\n• Move Active → Exploring',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          onPress: async () => {
            try {
              setBulkLoading(true);
              if (byColumn.Complete.length) await archiveAllComplete();
              if (byColumn.Reviewing.length) await bulkMoveTasks('Reviewing', 'Complete');
              if (byColumn.Active.length) await bulkMoveTasks('Active', 'Exploring');
              await refresh();
              await haptic('heavy');
            } catch (error: any) {
              Alert.alert('Restart failed', error?.message || 'Failed to restart workflow');
            } finally {
              setBulkLoading(false);
            }
          },
        },
      ]
    );
  };

  /* ---------- render ---------- */
  if (error)
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
        <BottomDock navigation={navigation} />
      </SafeAreaView>
    );

  const byColumnKeys = COLUMNS.map((c) => ({ key: c, tasks: byColumn[c] }));

  return (
    <DragContext.Provider value={{ 
      taskId: draggingTaskId, 
      setTaskId: setDraggingTaskId,
      checkDropZone,
      registerDropZone,
      unregisterDropZone,
      startAutoScroll,
      stopAutoScroll
    }}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Flowboard</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={[styles.restartButton, bulkLoading && styles.buttonDisabled]} onPress={handleRestart} disabled={bulkLoading}>
              <Text style={styles.restartButtonText}>Restart</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, bulkLoading && styles.buttonDisabled]} onPress={openAddModal} disabled={bulkLoading}>
              <Text style={styles.addButtonText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Columns */}
        <FlatList
          ref={flatListRef}
          data={byColumnKeys}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.board}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
          scrollEnabled={!draggingTaskId}
          renderItem={({ item }) => (
            <Column
              state={item.key}
              count={item.tasks.length}
              collapsed={item.key === 'Exploring' && exploringCollapsed}
              onToggle={() => item.key === 'Exploring' && setExploringCollapsed((c) => !c)}
              onReceive={(taskId) => moveTaskTo(taskId, item.key)}
            >
              <FlatList
                data={item.tasks}
                keyExtractor={(t) => t.id}
                scrollEnabled={!draggingTaskId}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: task }) => (
                  <View style={styles.taskRow}>
                    <TaskCard
                      item={{ ...task, stateColor: COLUMN_COLORS[task.state as keyof typeof COLUMN_COLORS] }}
                      onDragEnd={(target) => moveTaskTo(task.id, target)}
                    />
                    <TouchableOpacity
                      style={styles.sandwichMenu}
                      onPress={() => setOverlayTask(task)}
                      disabled={!!draggingTaskId}
                    >
                      <Text style={styles.sandwichMenuIcon}>☰</Text>
                    </TouchableOpacity>
                  </View>
                )}
                onScroll={handleScroll}
              />
            </Column>
          )}
        />

        {/* Dock */}
        <BottomDock navigation={navigation} />

        {/* Modals & overlays */}
        <TaskOverlay task={overlayTask} onClose={() => setOverlayTask(null)} onEdit={openEditModal} onDelete={confirmDelete} />
        <AddTaskModal
          visible={addVisible}
          onClose={() => setAddVisible(false)}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newNotes={newNotes}
          setNewNotes={setNewNotes}
          newState={newState}
          setNewState={setNewState}
          onSubmit={submitNewTask}
          saving={saving}
        />
        <EditTaskModal
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          onSubmit={submitEdit}
          saving={saving}
        />

        <Celebration visible={celebrate} onDone={() => setCelebrate(false)} />
      </SafeAreaView>
    </DragContext.Provider>
  );
}
