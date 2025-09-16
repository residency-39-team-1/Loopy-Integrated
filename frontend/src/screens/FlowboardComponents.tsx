import React, { useState, useRef, useContext, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated,
{
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  useDerivedValue,
} from 'react-native-reanimated';
import styles from './FlowboardScreen.styles';
import LoadingOverlay from '../components/LoadingOverlay';

// Use this in your main FlowboardScreen component
export function FlowboardLoadingOverlay({ loading }: { loading: boolean }) {
  return <LoadingOverlay visible={loading} />;
}
const COLUMN_COLORS = {
  Exploring: '#8B5CF6',
  Active:    '#3B82F6',
  Reviewing: '#F59E0B',
  Complete:  '#10B981',
} as const;

/* ------------------------------------------------------------------ */
/* Drag context – tracks dragging state and drop zones                */
/* ------------------------------------------------------------------ */
type DragCtx = { 
  taskId: string | null; 
  setTaskId: (id: string | null) => void;
  checkDropZone: (x: number, y: number) => string | null;
  registerDropZone: (state: string, zone: any) => void;
  unregisterDropZone: (state: string) => void;
  startAutoScroll: (direction: 'up' | 'down', speedMultiplier?: number) => void;
  stopAutoScroll: () => void;
};
export const DragContext = React.createContext<DragCtx>({ 
  taskId: null, 
  setTaskId: () => {},
  checkDropZone: () => null,
  registerDropZone: () => {},
  unregisterDropZone: () => {},
  startAutoScroll: () => {},
  stopAutoScroll: () => {}
});

/* ------------------------------------------------------------------ */
/* TaskCard – draggable with drop detection                           */
/* ------------------------------------------------------------------ */
export function TaskCard({ item, onDragEnd }: { item: any; onDragEnd: (target: any) => void }) {
  const { setTaskId, startAutoScroll, stopAutoScroll, taskId } = useContext(DragContext);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const zIndex = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const [pendingDrop, setPendingDrop] = useState<{ x: number; y: number } | null>(null);

  const { checkDropZone } = useContext(DragContext);

  // Get screen dimensions once (can't use Dimensions in worklet)
  const screenDimensions = useMemo(() => {
    try {
      const { height } = Dimensions.get('window');
      return {
        height,
        autoScrollZone: 120,
        autoScrollSpeedZone: 60,
      };
    } catch (error) {
      console.warn('Error getting screen dimensions:', error);
      return {
        height: 800, // fallback
        autoScrollZone: 120,
        autoScrollSpeedZone: 60,
      };
    }
  }, []);

  const { height: screenHeight, autoScrollZone, autoScrollSpeedZone } = screenDimensions;

  // Handle drop zone checking after gesture ends
  useEffect(() => {
    if (pendingDrop) {
      try {
        const targetState = checkDropZone(pendingDrop.x, pendingDrop.y);
        if (targetState && targetState !== item.state) {
          onDragEnd(targetState);
        }
      } catch (error) {
        console.warn('Error during drop zone check:', error);
      } finally {
        setPendingDrop(null);
      }
    }
  }, [pendingDrop, checkDropZone, onDragEnd, item.state]);

  // Cleanup auto-scroll on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  // Failsafe: stop auto-scroll if dragging ends unexpectedly
  useEffect(() => {
    if (!taskId) {
      stopAutoScroll();
    }
  }, [taskId, stopAutoScroll]);

  const drag = Gesture.Pan()
    .minDistance(5) // Reduced from 10 to be more responsive
    .maxPointers(1) // Only allow single finger drag
    .shouldCancelWhenOutside(false) // Don't cancel when dragging outside
    .onStart((event) => {
      'worklet';
      scale.value = 1.08;
      zIndex.value = 1000;
      startX.value = event.absoluteX;
      startY.value = event.absoluteY;
      runOnJS(setTaskId)(item.id);
    })
    .onUpdate((event) => {
      'worklet';
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      
      // Check for auto-scroll zones
      const currentY = startY.value + event.translationY;
      
      if (currentY < autoScrollZone) {
        const distanceFromEdge = currentY;
        const speedMultiplier = Math.max(0.5, (autoScrollZone - distanceFromEdge) / autoScrollSpeedZone);
        runOnJS(startAutoScroll)('up', speedMultiplier);
      } else if (currentY > screenHeight - autoScrollZone) {
        const distanceFromEdge = screenHeight - currentY;
        const speedMultiplier = Math.max(0.5, (autoScrollZone - distanceFromEdge) / autoScrollSpeedZone);
        runOnJS(startAutoScroll)('down', speedMultiplier);
      } else {
        runOnJS(stopAutoScroll)();
      }
    })
    .onEnd((event) => {
      'worklet';
      const dropX = startX.value + event.translationX;
      const dropY = startY.value + event.translationY;
      
      // Reset values immediately without spring animation
      scale.value = 1;
      zIndex.value = 0;
      translateX.value = 0;
      translateY.value = 0;
      
      runOnJS(setTaskId)(null);
      runOnJS(stopAutoScroll)();
      // Schedule drop zone check on JS thread
      runOnJS(setPendingDrop)({ x: dropX, y: dropY });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
  }));

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: item.stateColor },
          animatedStyle,
        ]}
      >
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.notes && (
          <Text style={styles.cardNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

/* ------------------------------------------------------------------ */
/* Column – drop zone                                                 */
/* ------------------------------------------------------------------ */
export function Column({
  state,
  count,
  collapsed,
  onToggle,
  children,
  onReceive,
}: {
  state: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  onReceive: (taskId: string) => void;
}) {
  const { taskId, registerDropZone, unregisterDropZone } = useContext(DragContext);
  const viewRef = useRef<View>(null);

  // Register this column as a drop zone
  useEffect(() => {
    const measureDropZone = () => {
      if (viewRef.current) {
        viewRef.current.measure((x, y, width, height, pageX, pageY) => {
          registerDropZone(state, {
            x: pageX,
            y: pageY,
            width,
            height,
          });
        });
      }
    };

    // Measure after a short delay to ensure layout is complete
    const timer = setTimeout(measureDropZone, 100);
    return () => {
      clearTimeout(timer);
      unregisterDropZone(state);
    };
  }, [state, collapsed, registerDropZone, unregisterDropZone]);

  // Highlight column when dragging
  const isDragging = taskId !== null;
  const isDropTarget = isDragging;

  return (
    <View
      ref={viewRef}
      style={[
        collapsed ? styles.fullColumnCollapsed : styles.fullColumn,
        { backgroundColor: (COLUMN_COLORS as any)[state] + '0A' },
        isDropTarget && styles.columnDropZone,
      ]}
      onLayout={() => {
        // Re-measure when layout changes
        if (viewRef.current) {
          viewRef.current.measure((x, y, width, height, pageX, pageY) => {
            registerDropZone(state, {
              x: pageX,
              y: pageY,
              width,
              height,
            });
          });
        }
      }}
    >
      <View style={styles.columnHeader}>
        {state === 'Exploring' ? (
          <TouchableOpacity style={styles.exploringHeader} onPress={onToggle}>
            <Text style={styles.columnTitle}>Exploring</Text>
            <Text style={styles.caretIcon}>{collapsed ? '▼' : '▲'}</Text>
            <Text style={styles.columnCount}>{count > 0 && `(${count})`}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.columnTitle}>{state}</Text>
            <Text style={styles.columnCount}>{count > 0 && `(${count})`}</Text>
          </>
        )}
      </View>

      <View style={styles.columnContent}>
        {state === 'Exploring' && collapsed ? (
          <Text style={styles.collapsedText}>Tap to expand ({count} tasks)</Text>
        ) : count === 0 ? (
          <Text style={styles.emptyText}>Drop tasks here</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Modals & dock – plain components                                   */
/* ------------------------------------------------------------------ */
export function BottomDock({ navigation }: { navigation: any }) {
  return (
    <View style={styles.bottomDock}>
      <TouchableOpacity style={[styles.dockButton, styles.dockButtonActive]} onPress={() => {}}>
        <Text style={styles.dockIcon}>🎯</Text>
        <Text style={[styles.dockLabel, styles.dockLabelActive]}>Flowboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dockButton} onPress={() => navigation.navigate('Dashboard')}>
        <Text style={styles.dockIcon}>🏠</Text>
        <Text style={styles.dockLabel}>Dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dockButton} onPress={() => navigation.navigate('ChaosCatcher')}>
        <Text style={styles.dockIcon}>🌪️</Text>
        <Text style={styles.dockLabel}>Chaos</Text>
      </TouchableOpacity>
    </View>
  );
}

export function TaskOverlay({
  task,
  onClose,
  onEdit,
  onDelete,
}: {
  task: any;
  onClose: () => void;
  onEdit: (task: any) => void;
  onDelete: (task: any) => void;
}) {
  if (!task) return null;
  
  const color = (COLUMN_COLORS as any)[task.state] || '#888';
  
  return (
    <Modal animationType="fade" transparent visible={!!task} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlayBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.overlayContent}>
              <View style={[styles.overlayTask, { backgroundColor: color }]}>
                <Text style={styles.overlayTitle}>{task.title}</Text>
                {task.notes && <Text style={styles.overlayNotes}>{task.notes}</Text>}
                <Text style={styles.overlayState}>Status: {task.state}</Text>
              </View>
              <View style={styles.overlayActions}>
                <TouchableOpacity style={styles.overlayActionButton} onPress={() => onEdit(task)}>
                  <Text style={styles.overlayActionIcon}>✏️</Text>
                  <Text style={styles.overlayActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayActionButton} onPress={() => onDelete(task)}>
                  <Text style={styles.overlayActionIcon}>🗑️</Text>
                  <Text style={styles.overlayActionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function AddTaskModal({
  visible,
  onClose,
  newTitle,
  setNewTitle,
  newNotes,
  setNewNotes,
  newState,
  setNewState,
  onSubmit,
  saving,
}: any) {
  const COLUMNS = ['Exploring', 'Active', 'Reviewing', 'Complete'];
  
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Task</Text>
            <Text style={styles.label}>Start in:</Text>
            <View style={styles.stateGrid}>
              {COLUMNS.map((state) => (
                <TouchableOpacity
                  key={state}
                  style={[
                    styles.stateButton,
                    { backgroundColor: (COLUMN_COLORS as any)[state] + '33' },
                    newState === state && styles.stateButtonActive,
                  ]}
                  onPress={() => setNewState(state)}
                >
                  <Text style={[styles.stateButtonText, { color: (COLUMN_COLORS as any)[state] }]}>{state}</Text>
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
              <TouchableOpacity onPress={onClose} style={styles.cancelButton} disabled={saving}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSubmit} style={styles.addButtonModal} disabled={saving}>
                <Text style={styles.addButtonModalText}>Add</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function EditTaskModal({
  visible,
  onClose,
  editTitle,
  setEditTitle,
  editNotes,
  setEditNotes,
  onSubmit,
  saving,
}: any) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
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
              <TouchableOpacity onPress={onClose} style={styles.cancelButton} disabled={saving}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSubmit} style={styles.addButtonModal} disabled={saving}>
                <Text style={styles.addButtonModalText}>Save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}