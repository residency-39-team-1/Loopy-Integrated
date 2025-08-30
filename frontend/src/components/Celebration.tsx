import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';

type Props = {
  visible: boolean;
  onDone?: () => void;
  fallbackMs?: number; // optional: duration fallback
};

const Celebration: React.FC<Props> = ({ visible, onDone, fallbackMs = 1600 }) => {
  const ref = useRef<LottieView>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!visible) return;

    // give the modal a beat to mount then play
    const t = setTimeout(() => {
      ref.current?.reset?.();
      ref.current?.play?.();
    }, 0);

    // fallback in case finish doesn't fire on some Androids
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onDone?.();
      }, fallbackMs);
    }

    return () => {
      clearTimeout(t);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, onDone, fallbackMs]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={onDone}>
        <View style={styles.fill}>
          <View style={styles.card} pointerEvents="none">
            <LottieView
              ref={ref}
              source={require('../../assets/celebrate.json')}
              autoPlay={false}   // we call play()
              loop={false}
              enableMergePathsAndroidForKitKatAndAbove
              renderMode={Platform.OS === 'android' ? 'AUTOMATIC' : 'AUTOMATIC'}
              onAnimationFinish={() => {
                if (timerRef.current) {
                  clearTimeout(timerRef.current);
                  timerRef.current = null;
                }
                onDone?.();
              }}
              style={{ width: 260, height: 260 }}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    // no background so confetti blends with app
    // if you want a white plate behind, uncomment:
    // backgroundColor: '#fff',
    // borderRadius: 16,
  },
});

export default Celebration;
