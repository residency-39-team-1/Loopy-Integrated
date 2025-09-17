// src/components/PlantCard.tsx
import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { usePlant } from '../contexts/PlantContext';
import { useAuth } from '../contexts/AuthContext';
import { resetPlant, getPlantState } from '../api/dopamine';
import { plantImageMap } from '../assets/plantImages';

export default function PlantCard() {
  const { plant, setPlant } = usePlant();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Always render something (fallback to phase1 pot)
  const key = (plant?.asset_filename ?? 'plant_phase1_POT.png').trim();
  const imgSrc = plantImageMap[key];
  const fallback = require('../../assets/plants/plant_phase1_POT.png');

  const isFullyGrown = Number(plant?.phase ?? 1) >= 4;

  const onReset = async () => {
    if (!user?.uid) {
      Alert.alert('Not signed in', 'Please sign in to start a new plant.');
      return;
    }
    try {
      setLoading(true);
      await resetPlant(user.uid);                  // POST /dopamine/reset
      const latest = await getPlantState(user.uid); // GET /dopamine/state
      setPlant(latest.plant);
    } catch (e: any) {
      Alert.alert('Could not start a new plant', e?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <Image
          source={imgSrc ?? fallback}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.lineText}>
          Complete tasks to help your plant grow!
        </Text>

        {isFullyGrown && (
          <TouchableOpacity
            style={[styles.resetButton, loading && styles.resetButtonDisabled]}
            onPress={onReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.resetButtonText}>Start a new plant</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    elevation: 2,
    alignItems: 'center',
  },
  image: { width: '100%', height: 180, borderRadius: 8 },
  lineText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#333',
  },
  resetButton: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#10B981',
    borderRadius: 10,
  },
  resetButtonDisabled: { opacity: 0.7 },
  resetButtonText: { color: '#fff', fontWeight: '600' },
});
