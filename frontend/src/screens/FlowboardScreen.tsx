// src/screens/FlowboardScreen.tsx
import React, { useState, useCallback, useMemo, useRef } from 'react';
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
import { DraxProvider, DraxView } from 'react-native-drax';
import { createTask, updateTask, deleteTask, type BackendTask } from '../services/api';
import { useTasks } from '../contexts/TaskContext';
import LoadingOverlay from '../components/LoadingOverlay';
import Celebration from '../components/Celebration';
import { type TaskState } from '../types/task';

// PRD-compliant, emotionally-neutral states
type UIState = 'Exploring' | 'Active' | 'Reviewing' | 'Complete';
const COLUMNS: UIState[] = ['Exploring', 'Active', 'Reviewing', 'Complete'];

// Swapped & cohesive palette
const COLUMN_COLORS = {
  Exploring: '#8B5CF6', // gentle lavender
  Active:    '#3B82F6', // calm blue
  Reviewing: '#F59E0B', // warm amber
  Complete:  '#10B981', // fresh green
};

// State mappers
const toUIState = (s: BackendTask['state'] | TaskState): UIState => {
  switch (s) {
    case 'Exploring': return 'Exploring';
    case 'Planning':  return 'Active';
    case 'Doing':     return 'Reviewing';
    case 'Done':      return 'Complete';
    // Handle TaskState values (if they're already UI states)
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

export default function FlowboardScreen({ navigation }: { navigation: any }) {
  const { tasks: contextTasks, isLoading, error, refresh } = useTasks();
  const [optimisticTasks, setOptimisticTasks] = useState<UITask[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  
  // Task overlay state
  const [overlayTask, setOverlayTask] = useState<UITask | null>(null);
  
  // Exploring column collapsed state
  const [exploringCollapsed, setExploringCollapsed] = useState(true);

  // Prevent duplicate move operations
  const pendingMoves = useRef(new Set<string>()).current;

  // Modals
  const [addVisible, setAddVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newState, setNewState] = useState<UIState>('Exploring');
  const [editTask, setEditTask] = useState<UITask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Convert context tasks to flowboard tasks and keep optimistic updates
  const tasks = useMemo(() => {
    const contextMapped: UITask[] = contextTasks.map(t => ({
      id: t.id,
      title: t.title ?? '',
      notes: t.notes,
      state: toUIState(t.state),
    }));
    
    // If optimistic tasks is empty, use context tasks
    if (optimisticTasks.length === 0 && contextMapped.length > 0) {
      setOptimisticTasks(contextMapped);
      return contextMapped;
    }
    
    // Otherwise use optimistic tasks for immediate updates
    return optimisticTasks.length > 0 ? optimisticTasks : contextMapped;
  }, [contextTasks, optimisticTasks]);

  // Group by column
  const byColumn = useMemo(() => {
    const map: Record<UIState, UITask[]> = { Exploring: [], Active: [], Reviewing: [], Complete: [] };
    tasks.forEach(t => map[t.state].push(t));
    return map;
  }, [tasks]);

  // Move task
  const moveTaskTo = useCallback(async (taskId: string, target: UIState) => {
    // Prevent duplicate moves for the same task
    const moveKey = `${taskId}-${target}`;
    if (pendingMoves.has(moveKey)) {
      console.log('Duplicate move prevented for task:', taskId, 'to:', target);
      return;
    }

    const originalTask = tasks.find(t => t.id === taskId);
    if (!originalTask) return;

    // Skip if task is already in the target state
    if (originalTask.state === target) {
      console.log('Task already in target state:', taskId, target);
      return;
    }

    pendingMoves.add(moveKey);

    // Optimistic update - immediately move task in UI
    setOptimisticTasks(prev => 
      prev.map(t => t.id === taskId ? { ...t, state: target } : t)
    );

    try {
      await updateTask(taskId, { state: toBackendState(target) });
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (target === 'Complete') setCelebrate(true);
    } catch (e: any) {
      // Revert optimistic update on error
      setOptimisticTasks(prev => 
        prev.map(t => t.id === taskId ? { ...t, state: originalTask.state } : t)
      );
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert('Move failed', String(e?.message ?? e));
    } finally {
      pendingMoves.delete(moveKey);
    }
  }, [tasks, pendingMoves]);

  // Create task
  const openAddModal = () => {
    setNewTitle('');
    setNewNotes('');
    setNewState('Exploring');
    setAddVisible(true);
  };

  const submitNewTask = async () => {
    const title = newTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    
    // Create temporary ID for optimistic update
    const tempId = `temp-${Date.now()}`;
    const newTask: UITask = {
      id: tempId,
      title,
      notes: newNotes.trim() || undefined,
      state: newState,
    };

    try {
      setSaving(true);
      
      // Optimistic update - immediately add task to UI
      setOptimisticTasks(prev => [newTask, ...prev]);
      
      const created = await createTask({ 
        title, 
        notes: newNotes.trim() || undefined, 
        state: toBackendState(newState) 
      });
      
      // Replace temp task with real task
      setOptimisticTasks(prev => 
        prev.map(t => t.id === tempId ? {
          id: created.id,
          title: created.title ?? title,
          notes: created.notes,
          state: toUIState(created.state),
        } : t)
      );
      
      setAddVisible(false);
      setNewTitle('');
      setNewNotes('');
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e: any) {
      // Remove optimistic task on error
      setOptimisticTasks(prev => prev.filter(t => t.id !== tempId));
      Alert.alert('Could not add task', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  // Edit task
  const openEditModal = (task: UITask) => {
    setEditTask(task);
    setEditTitle(task.title);
    setEditNotes(task.notes || '');
    setEditVisible(true);
    setOverlayTask(null); // Close overlay when opening edit modal
  };

  const submitEdit = async () => {
    if (!editTask) return;
    const title = editTitle.trim();
    if (!title) return Alert.alert('Title required', 'Please enter a task title.');
    
    const originalTask = editTask;
    const updatedTask = {
      ...editTask,
      title,
      notes: editNotes.trim() || undefined,
    };

    try {
      setSaving(true);
      
      // Optimistic update - immediately update task in UI
      setOptimisticTasks(prev => 
        prev.map(t => t.id === editTask.id ? updatedTask : t)
      );
      
      await updateTask(editTask.id, { 
        title, 
        notes: editNotes.trim() || undefined 
      });
      
      setEditVisible(false);
    } catch (e: any) {
      // Revert optimistic update on error
      setOptimisticTasks(prev => 
        prev.map(t => t.id === editTask.id ? originalTask : t)
      );
      Alert.alert('Save failed', e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // Delete task
  const confirmDelete = (task: UITask) => {
    Alert.alert('Delete task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Optimistic update - immediately remove task from UI
            setOptimisticTasks(prev => prev.filter(t => t.id !== task.id));
            
            await deleteTask(task.id);
            setOverlayTask(null); // Close overlay after delete
            if (Platform.OS !== 'web') {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          } catch (e: any) {
            // Revert optimistic update on error - add task back
            setOptimisticTasks(prev => [...prev, task]);
            Alert.alert('Delete failed', e?.message || 'Unknown error');
          }
        },
      },
    ]);
  };

  // Bulk operations
  const [bulkLoading, setBulkLoading] = useState(false);

  const bulkMoveTasks = async (fromState: UIState, toState: UIState) => {
    const tasksToMove = byColumn[fromState];
    if (tasksToMove.length === 0) return;

    try {
      setBulkLoading(true);
      
      // Optimistic update - immediately move all tasks in UI
      setOptimisticTasks(prev => 
        prev.map(t => tasksToMove.find(mt => mt.id === t.id) ? { ...t, state: toState } : t)
      );

      const updates = tasksToMove.map(task => 
        updateTask(task.id, { state: toBackendState(toState) })
      );

      await Promise.all(updates);
      await refresh(); // Sync with backend
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      if (toState === 'Complete') setCelebrate(true);
    } catch (error: any) {
      // Revert optimistic update on error
      setOptimisticTasks(prev => 
        prev.map(t => tasksToMove.find(mt => mt.id === t.id) ? { ...t, state: fromState } : t)
      );
      Alert.alert('Bulk move failed', error?.message || 'Failed to move tasks');
    } finally {
      setBulkLoading(false);
    }
  };

  const archiveAllComplete = async () => {
    const tasksToArchive = byColumn.Complete;
    if (tasksToArchive.length === 0) return;
    
    Alert.alert(
      'Archive All Complete',
      `Archive ${tasksToArchive.length} completed tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Archive', 
          onPress: async () => {
            try {
              setBulkLoading(true);
              
              // Optimistic update - immediately remove tasks from UI
              setOptimisticTasks(prev => 
                prev.filter(t => !tasksToArchive.find(at => at.id === t.id))
              );

              await Promise.all(tasksToArchive.map(task => deleteTask(task.id)));
              await refresh(); // Sync with backend
              
              if (Platform.OS !== 'web') {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            } catch (error: any) {
              // Revert optimistic update on error - add tasks back
              setOptimisticTasks(prev => [...prev, ...tasksToArchive]);
              Alert.alert('Archive failed', error?.message || 'Failed to archive tasks');
            } finally {
              setBulkLoading(false);
            }
          }
        }
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
              
              // Step 1: Handle Complete tasks with confirmation
              if (byColumn.Complete.length > 0) {
                await new Promise<void>(resolve => {
                  Alert.alert(
                    'Archive Complete Tasks',
                    `Archive ${byColumn.Complete.length} completed tasks?`,
                    [
                      { 
                        text: 'Skip', 
                        onPress: () => resolve()
                      },
                      { 
                        text: 'Archive', 
                        onPress: async () => {
                          try {
                            await Promise.all(byColumn.Complete.map(task => deleteTask(task.id)));
                            await refresh(); // Sync after archive
                          } catch (error: any) {
                            Alert.alert('Archive failed', error?.message || 'Failed to archive tasks');
                          }
                          resolve();
                        }
                      }
                    ]
                  );
                });
              }
              
              if (byColumn.Reviewing.length > 0) {
                await bulkMoveTasks('Reviewing', 'Complete');
              }
              
              if (byColumn.Active.length > 0) {
                await bulkMoveTasks('Active', 'Exploring');
              }
              
              // Final refresh to ensure UI is fully synced with backend
              await refresh();
              
              if (Platform.OS !== 'web') {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              }
            } catch (error: any) {
              Alert.alert('Restart failed', error?.message || 'Failed to restart workflow');
            } finally {
              setBulkLoading(false);
            }
          }
        }
      ]
    );
  };

  // Task card with sandwich menu
  const TaskCard = ({ item }: { item: UITask }) => {
    return (
      <View style={styles.taskRow}>
        <DraxView
          style={[styles.card, { backgroundColor: COLUMN_COLORS[item.state] }]}
          draggingStyle={styles.cardDragging}
          payload={{ taskId: item.id }}
          longPressDelay={200}
          onDragStart={() => Platform.OS !== 'web' && Haptics.selectionAsync()}
          draggable
        >
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.notes && (
            <Text style={styles.cardNotes} numberOfLines={2}>
              {item.notes}
            </Text>
          )}
        </DraxView>
        
        <TouchableOpacity 
          style={styles.sandwichMenu}
          onPress={() => setOverlayTask(item)}
        >
          <Text style={styles.sandwichMenuIcon}>☰</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
        
        {/* Bottom dock */}
        <View style={styles.bottomDock}>
          <TouchableOpacity
            style={[styles.dockButton, styles.dockButtonActive]}
            onPress={() => {}} // Already on flowboard
          >
            <Text style={styles.dockIcon}>🎯</Text>
            <Text style={[styles.dockLabel, styles.dockLabelActive]}>Flowboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockButton}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.dockIcon}>🏠</Text>
            <Text style={styles.dockLabel}>Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dockButton}
            onPress={() => navigation.navigate('ChaosCatcher')}
          >
            <Text style={styles.dockIcon}>🌪️</Text>
            <Text style={styles.dockLabel}>Chaos</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with + New button */}
      <View style={styles.header}>
        <Text style={styles.title}>Flowboard</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={[styles.restartButton, bulkLoading && styles.buttonDisabled]} 
            onPress={handleRestart}
            disabled={bulkLoading}
          >
            <Text style={styles.restartButtonText}>Restart</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.addButton, bulkLoading && styles.buttonDisabled]} 
            onPress={openAddModal}
            disabled={bulkLoading}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Columns */}
      <DraxProvider>
        <FlatList
          data={COLUMNS}
          keyExtractor={item => item}
          contentContainerStyle={styles.board}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: col }) => (
            <DraxView
              style={[
                (col === 'Exploring' && exploringCollapsed) 
                  ? styles.fullColumnCollapsed 
                  : styles.fullColumn, 
                { backgroundColor: COLUMN_COLORS[col] + '0A' }
              ]}
              receptive
              onReceiveDragDrop={({ dragged: { payload } }: { dragged: { payload: any } }) => {
                const taskId = (payload as any)?.taskId;
                if (taskId) {
                  moveTaskTo(taskId, col);
                }
                return { snapbackTarget: 'receiver' } as any;
              }}
            >
              <View style={styles.columnHeader}>
                {col === 'Exploring' ? (
                  <TouchableOpacity 
                    style={styles.exploringHeader}
                    onPress={() => setExploringCollapsed(!exploringCollapsed)}
                  >
                    <Text style={styles.columnTitle}>Exploring</Text>
                    <Text style={styles.caretIcon}>
                      {exploringCollapsed ? '▼' : '▲'}
                    </Text>
                    <Text style={styles.columnCount}>
                      {byColumn[col].length > 0 && `(${byColumn[col].length})`}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.columnTitle}>{col}</Text>
                    <Text style={styles.columnCount}>
                      {byColumn[col].length > 0 && `(${byColumn[col].length})`}
                    </Text>
                  </>
                )}
              </View>
              
              {/* Action chips - DISABLED
              {!exploringCollapsed && (
                <View style={styles.actionRow}>
                  {col === 'Active' && (
                    <>
                      <TouchableOpacity 
                        onPress={() => bulkMoveTasks('Active', 'Exploring')} 
                        style={[styles.chip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Active.length === 0}
                      >
                        <Text style={styles.chipText}>→ Exploring</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => bulkMoveTasks('Active', 'Reviewing')} 
                        style={[styles.chip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Active.length === 0}
                      >
                        <Text style={styles.chipText}>→ Reviewing</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {col === 'Reviewing' && (
                    <>
                      <TouchableOpacity 
                        onPress={() => bulkMoveTasks('Reviewing', 'Active')} 
                        style={[styles.chip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Reviewing.length === 0}
                      >
                        <Text style={styles.chipText}>→ Active</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => bulkMoveTasks('Reviewing', 'Complete')} 
                        style={[styles.chip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Reviewing.length === 0}
                      >
                        <Text style={styles.chipText}>→ Complete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {col === 'Complete' && (
                    <>
                      <TouchableOpacity 
                        onPress={() => bulkMoveTasks('Complete', 'Reviewing')} 
                        style={[styles.chip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Complete.length === 0}
                      >
                        <Text style={styles.chipText}>→ Reviewing</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={archiveAllComplete} 
                        style={[styles.archiveChip, bulkLoading && styles.chipDisabled]}
                        disabled={bulkLoading || byColumn.Complete.length === 0}
                      >
                        <Text style={styles.archiveChipText}>Archive All</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )} */}
              
              <View style={styles.columnContent}>
                {col === 'Exploring' && exploringCollapsed ? (
                  <Text style={styles.collapsedText}>Tap to expand ({byColumn[col].length} tasks)</Text>
                ) : byColumn[col].length === 0 ? (
                  <Text style={styles.emptyText}>Drop tasks here</Text>
                ) : (
                  <FlatList
                    data={byColumn[col]}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => <TaskCard item={item} />}
                    scrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </View>
            </DraxView>
          )}
        />
      </DraxProvider>

      {/* Bottom dock */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={[styles.dockButton, styles.dockButtonActive]}
          onPress={() => {}} // Already on flowboard
        >
          <Text style={styles.dockIcon}>🎯</Text>
          <Text style={[styles.dockLabel, styles.dockLabelActive]}>Flowboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.dockIcon}>🏠</Text>
          <Text style={styles.dockLabel}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dockButton}
          onPress={() => navigation.navigate('ChaosCatcher')}
        >
          <Text style={styles.dockIcon}>🌪️</Text>
          <Text style={styles.dockLabel}>Chaos</Text>
        </TouchableOpacity>
      </View>

      {/* Task Overlay Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={!!overlayTask}
        onRequestClose={() => setOverlayTask(null)}
      >
        <TouchableWithoutFeedback onPress={() => setOverlayTask(null)}>
          <View style={styles.overlayBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.overlayContent}>
                {overlayTask && (
                  <>
                    <View style={[styles.overlayTask, { backgroundColor: COLUMN_COLORS[overlayTask.state] }]}>
                      <Text style={styles.overlayTitle}>{overlayTask.title}</Text>
                      {overlayTask.notes && (
                        <Text style={styles.overlayNotes}>{overlayTask.notes}</Text>
                      )}
                      <Text style={styles.overlayState}>Status: {overlayTask.state}</Text>
                    </View>
                    
                    <View style={styles.overlayActions}>
                      <TouchableOpacity 
                        style={styles.overlayActionButton}
                        onPress={() => openEditModal(overlayTask)}
                      >
                        <Text style={styles.overlayActionIcon}>✏️</Text>
                        <Text style={styles.overlayActionText}>Edit</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.overlayActionButton}
                        onPress={() => confirmDelete(overlayTask)}
                      >
                        <Text style={styles.overlayActionIcon}>🗑️</Text>
                        <Text style={styles.overlayActionText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Add Task Modal */}
      <Modal animationType="slide" transparent visible={addVisible} onRequestClose={() => setAddVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Task</Text>

              <Text style={styles.label}>Start in:</Text>
              <View style={styles.stateGrid}>
                {COLUMNS.map(state => (
                  <TouchableOpacity
                    key={state}
                    style={[styles.stateButton, { backgroundColor: COLUMN_COLORS[state] + '33' }, newState === state && styles.stateButtonActive]}
                    onPress={() => setNewState(state)}
                  >
                    <Text style={[styles.stateButtonText, { color: COLUMN_COLORS[state] }]}>{state}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="What would you like to work on?"
                style={styles.input}
                autoFocus
              />
              <TextInput
                value={newNotes}
                onChangeText={setNewNotes}
                placeholder="Any details or context..."
                style={[styles.input, styles.notesInput]}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setAddVisible(false)} style={styles.cancelButton} disabled={saving}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitNewTask} style={styles.addButtonModal} disabled={saving}>
                  <Text style={styles.addButtonModalText}>Add</Text>
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
              />
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add details..."
                style={[styles.input, styles.notesInput]}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setEditVisible(false)} style={styles.cancelButton} disabled={saving}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitEdit} style={styles.addButtonModal} disabled={saving}>
                  <Text style={styles.addButtonModalText}>Save</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <LoadingOverlay visible={isLoading || saving || bulkLoading} />
      <Celebration visible={celebrate} onDone={() => setCelebrate(false)} />
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
  addButton: { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#ef4444', fontSize: 16 },

  // Board
  board: { padding: 12, paddingBottom: 100 }, // Add bottom padding for dock
  compactBoard: { 
    padding: 12, 
    paddingBottom: 100,
    justifyContent: 'space-between',
    flexGrow: 1,
  },
  fullColumn: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    minHeight: 200,
  },
  fullColumnCollapsed: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    minHeight: 80, // Smaller when explore is collapsed
  },
  compactColumn: {
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    maxHeight: 120,
    justifyContent: 'center',
    flex: 1, // Take equal space
  },
  columnHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 12, 
    paddingHorizontal: 4,
    zIndex: 10,
  },
  compactColumnHeader: {
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 6, 
    paddingHorizontal: 4,
    zIndex: 10,
    justifyContent: 'center',
  },
  columnTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  compactColumnTitle: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#111827', 
    textAlign: 'center',
    flex: 1,
  },
  columnCount: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  columnContent: { flex: 1 },

  // Exploring column specific
  exploringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  caretIcon: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 8,
    marginRight: 8,
  },
  collapsedText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  dropZoneText: {
    textAlign: 'center',
    fontSize: 18,
    color: '#374151',
    fontWeight: '700',
    marginVertical: 12,
    letterSpacing: 0.5,
  },

  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },

  // Tasks
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardDragging: { 
    opacity: 0.9, 
    transform: [{ scale: 1.1 }], 
    elevation: 15,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 20 },
  cardNotes: { fontSize: 13, color: '#374151', marginTop: 2, lineHeight: 16 },

  // Sandwich menu
  sandwichMenu: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  sandwichMenuIcon: { fontSize: 18, color: '#6b7280' },

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
  dockButtonActive: {
    backgroundColor: '#f3f4f6',
  },
  dockIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  dockLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  dockLabelActive: {
    color: '#374151',
    fontWeight: '600',
  },

  // Task overlay
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  overlayContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
  },
  overlayTask: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  overlayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    lineHeight: 28,
  },
  overlayNotes: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
    lineHeight: 24,
  },
  overlayState: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  overlayActions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  overlayActionButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 100,
  },
  overlayActionIcon: { fontSize: 24, marginBottom: 8 },
  overlayActionText: { fontSize: 16, fontWeight: '600', color: '#374151' },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stateButton: {
    flexBasis: '48%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stateButtonActive: { borderColor: '#111827' },
  stateButtonText: { fontSize: 14, fontWeight: '700' },
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
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  addButtonModal: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  addButtonModalText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Header buttons
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restartButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  restartButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Action chips
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chip: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  archiveChip: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  archiveChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  chipDisabled: {
    opacity: 0.5,
  },
});
