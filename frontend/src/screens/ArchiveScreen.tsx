// src/screens/ArchiveScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import LoadingOverlay from '../components/LoadingOverlay';
import { listTasks, updateTask, deleteTask, BackendTask } from '../services/api';

type ArchivedTask = BackendTask;

export default function ArchiveScreen({ navigation }: { navigation: any }) {
  const [archivedItems, setArchivedItems] = useState<ArchivedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadArchivedItems();
  }, []);

  const loadArchivedItems = async () => {
    try {
      setIsLoading(true);
      // Get all tasks and filter for archived ones
      const allTasks = await listTasks();
      const archived = allTasks.filter(task => task.isArchived);
      setArchivedItems(archived);
    } catch (error) {
      console.error('Failed to load archived items:', error);
      Alert.alert('Error', 'Failed to load archived items');
    } finally {
      setIsLoading(false);
    }
  };

  const restoreItem = async (item: ArchivedTask) => {
    Alert.alert(
      'Restore Item',
      `Restore "${item.title}" back to your active tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore', 
          onPress: async () => {
            try {
              // Restore by setting isArchived to false
              await updateTask(item.id, { isArchived: false });
              
              // Remove from archive list
              setArchivedItems(prev => prev.filter(i => i.id !== item.id));
              
              // Navigate back to trigger tasks refresh
              navigation.goBack();
              
              // Show success after navigating back
              setTimeout(() => {
                Alert.alert('Success', `${item.title} has been restored!`);
              }, 500);
            } catch (error) {
              console.error('Failed to restore item:', error);
              Alert.alert('Error', 'Failed to restore item');
            }
          }
        }
      ]
    );
  };

  const permanentlyDelete = async (item: ArchivedTask) => {
    Alert.alert(
      'Permanently Delete',
      `This will permanently delete "${item.title}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Forever', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Actually delete the task permanently
              await deleteTask(item.id);
              
              // Remove from archive list
              setArchivedItems(prev => prev.filter(i => i.id !== item.id));
              
              Alert.alert('Deleted', 'Item has been permanently deleted');
            } catch (error) {
              console.error('Failed to delete item:', error);
              Alert.alert('Error', 'Failed to delete item');
            }
          }
        }
      ]
    );
  };

  const renderArchivedItem = ({ item }: { item: ArchivedTask }) => {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemType}>task</Text>
        </View>
        
        {item.notes && (
          <Text style={styles.itemNotes}>{item.notes}</Text>
        )}
        
        <Text style={styles.itemDate}>
          Archived: {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
        
        <View style={styles.itemActions}>
          <TouchableOpacity 
            style={styles.restoreButton}
            onPress={() => restoreItem(item)}
          >
            <Text style={styles.restoreButtonText}>Restore</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => permanentlyDelete(item)}
          >
            <Text style={styles.deleteButtonText}>Delete Forever</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Archive</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.centerContent}>
            <LoadingOverlay visible={true} />
            <Text style={styles.loadingText}>Loading archived items...</Text>
          </View>
        ) : archivedItems.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Archived Items</Text>
            <Text style={styles.emptySubtext}>
              Completed tasks and deleted chaos entries will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={archivedItems}
            keyExtractor={item => item.id}
            renderItem={renderArchivedItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  placeholder: {
    width: 60, // Match back button width for centering
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  listContainer: {
    paddingBottom: 20,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  itemType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  itemNotes: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  itemDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  restoreCount: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
    marginBottom: 12,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  restoreButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
