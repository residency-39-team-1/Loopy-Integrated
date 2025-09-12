import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import {
  getPlantState,
  getDopamineSummary,
  initPlant,
  resetPlant,
  getAssetPath,
  type PlantState,
  type DopamineSummary,
} from '../services/dopamine';

export default function ProgressScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  
  // State
  const [plant, setPlant] = useState<PlantState | null>(null);
  const [todaySummary, setTodaySummary] = useState<DopamineSummary | null>(null);
  const [weekSummary, setWeekSummary] = useState<DopamineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load plant and dopamine data
  const loadData = async () => {
    if (!user?.uid) return;
    
    try {
      setError(null);
      
      // Try to get plant state, init if doesn't exist
      let plantResponse;
      try {
        plantResponse = await getPlantState(user.uid);
      } catch (e: any) {
        if (e.message.includes('404') || e.message.includes('not_found')) {
          // Plant doesn't exist, initialize it
          const initResponse = await initPlant(user.uid);
          plantResponse = { ok: true, plant: initResponse.plant };
        } else {
          throw e;
        }
      }
      
      if (plantResponse.ok) {
        setPlant(plantResponse.plant);
      }

      // Get dopamine summaries
      const [today, week] = await Promise.all([
        getDopamineSummary({ window: 'day' }),
        getDopamineSummary({ window: 'week' }),
      ]);
      
      setTodaySummary(today);
      setWeekSummary(week);
      
    } catch (e: any) {
      console.error('Failed to load progress data:', e);
      setError(e.message || 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  // Refresh data when screen comes into focus
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.uid) {
        setLoading(true);
        loadData();
      }
    });
    return unsubscribe;
  }, [navigation, user?.uid]);

  const handleResetPlant = () => {
    Alert.alert(
      'Reset Plant',
      'This will restart your plant from the beginning. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            try {
              setLoading(true);
              await resetPlant(user.uid, 'user_reset');
              await loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to reset plant');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading your progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>😔 {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Progress</Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetPlant}
        >
          <Text style={styles.resetButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Plant Display */}
        <View style={styles.plantSection}>
          <View style={styles.plantContainer}>
            {plant && (
              <>
                <Image
                  source={getAssetPath(plant.asset_filename)}
                  style={styles.plantImage}
                  resizeMode="contain"
                />
                <View style={styles.plantInfo}>
                  <Text style={styles.plantPhase}>Phase {plant.phase}</Text>
                  <Text style={styles.plantVariant}>{plant.variant}</Text>
                  <Text style={styles.plantProgress}>
                    {plant.tasks_completed_since_phase} tasks completed
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
          
          {/* Today's Stats */}
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>Today</Text>
            <Text style={styles.statValue}>
              {todaySummary?.total || 0} points
            </Text>
            <Text style={styles.statSubtext}>
              {todaySummary?.count || 0} activities completed
            </Text>
          </View>

          {/* This Week's Stats */}
          <View style={styles.statCard}>
            <Text style={styles.statTitle}>This Week</Text>
            <Text style={styles.statValue}>
              {weekSummary?.total || 0} points
            </Text>
            <Text style={styles.statSubtext}>
              {weekSummary?.count || 0} activities completed
            </Text>
          </View>

          {/* Source Breakdown */}
          {todaySummary?.bySource && Object.keys(todaySummary.bySource).length > 0 && (
            <View style={styles.sourceCard}>
              <Text style={styles.sourceTitle}>Today's Activities</Text>
              {Object.entries(todaySummary.bySource).map(([source, points]) => (
                <View key={source} style={styles.sourceRow}>
                  <Text style={styles.sourceName}>
                    {formatSourceName(source)}
                  </Text>
                  <Text style={styles.sourcePoints}>{points} pts</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Growth Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <Text style={styles.infoText}>
            Complete tasks to earn points and grow your plant! Each completed task 
            helps your plant advance through different phases with unique variants.
          </Text>
          <Text style={styles.infoText}>
            Phase 1 → Phase 2 → Phase 3 → Phase 4 (Final)
          </Text>
        </View>

        {/* Bottom Padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper function to format source names
function formatSourceName(source: string): string {
  const sourceMap: Record<string, string> = {
    'task_completed': '✅ Tasks',
    'plant_task_completed': '🌱 Plant Tasks',
    'chaos_entry_created': '🌪️ Chaos Entries',
    'daily_session_review': '📝 Daily Reviews',
    'manual_reward': '🎁 Manual Rewards',
    'plant_phase_advanced': '🚀 Phase Advances',
    'plant_init': '🌱 Plant Started',
    'plant_reset': '🔄 Plant Reset',
  };
  return sourceMap[source] || source;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  resetButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 18,
  },

  // Main Content
  scrollView: {
    flex: 1,
  },

  // Plant Section
  plantSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  plantContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  plantImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  plantInfo: {
    alignItems: 'center',
  },
  plantPhase: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  plantVariant: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  plantProgress: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // Stats Section
  statsSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#9ca3af',
  },
  sourceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sourceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  sourceName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  sourcePoints: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4285F4',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  bottomPadding: {
    height: 40,
  },
});
