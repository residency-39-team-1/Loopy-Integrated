// src/components/PlantCard.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { usePlant } from '../contexts/PlantContext';
import { useAuth } from '../contexts/AuthContext';
import { resetPlant, getPlantState } from '../api/dopamine';
import { plantImageMap } from '../assets/plantImages';

export default function PlantCard() {
  const { plant, setPlant } = usePlant();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const lottieRef = useRef<LottieView>(null);

  const key = (plant?.asset_filename ?? 'plant_phase1_POT.png').trim();
  const imgSrc = plantImageMap[key];
  const fallback = require('../../assets/plants/plant_phase1_POT.png');
  const isFullyGrown = Number(plant?.phase ?? 1) >= 4;

  useEffect(() => {
    if (showCelebration && lottieRef.current) {
      lottieRef.current.reset();
      lottieRef.current.play();
    }
  }, [showCelebration]);

  const onReset = async () => {
    if (!user?.uid) {
      Alert.alert('Not signed in', 'Please sign in to start a new plant.');
      return;
    }
    // Trigger celebration immediately on button press
    setShowCelebration(true);
    try {
      setLoading(true);
      await resetPlant(user.uid);
      const latest = await getPlantState(user.uid);
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
        <Text style={styles.title}>🌿 Your Task Plant 🌿</Text>

        <View style={styles.imageWrap}>
          <Image source={imgSrc ?? fallback} style={styles.image} resizeMode="contain" />

          {showCelebration && (
            <View pointerEvents="none" style={styles.celebrateOverlay}>
              <LottieView
                ref={lottieRef}
                source={require('../../assets/celebrate.json')}
                autoPlay
                loop={false}
                onAnimationFinish={() => setShowCelebration(false)}
                style={styles.lottie}
              />
            </View>
          )}
        </View>

        <Text style={styles.tagline}>
           Complete tasks to help your plant <Text style={styles.taglineAccent}>grow</Text>!
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
              <Text style={styles.resetButtonText}>🔁 Start a new plant</Text>
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
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },

  imageWrap: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  image: { width: '100%', height: '100%', borderRadius: 12 },

  celebrateOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lottie: { width: '100%', height: '100%' },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(16,185,129,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tagline: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#374151',
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  taglineAccent: {
    color: '#10B981',
    fontStyle: 'italic',
    fontWeight: '800',
  },

  resetButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#10B981',
    borderRadius: 12,
  },
  resetButtonDisabled: { opacity: 0.7 },
  resetButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
