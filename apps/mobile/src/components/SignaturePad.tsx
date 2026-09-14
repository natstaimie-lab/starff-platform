/**
 * Finger-drawn signature pad (react-native-svg + PanResponder). Captures strokes
 * as SVG paths, supports Clear, and reports whether anything has been drawn.
 * Ported from the prototype's <SignaturePad>.
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';

export interface SignaturePadRef {
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadRef, { onChange?: (hasInk: boolean) => void }>(
  ({ onChange }, ref) => {
    const [paths, setPaths] = useState<string[]>([]);
    const currentRef = useRef('');
    const [, tick] = useState(0);
    const render = () => tick((t) => t + 1);

    const pan = useRef(
      PanResponder.create({
        // Capture the touch so the parent ScrollView can't steal it for scrolling
        // while the user is drawing their signature.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          currentRef.current = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          render();
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          currentRef.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
          render();
        },
        onPanResponderRelease: () => {
          const stroke = currentRef.current;
          currentRef.current = '';
          if (stroke) {
            setPaths((p) => {
              const np = [...p, stroke];
              onChange?.(np.length > 0);
              return np;
            });
          }
        },
      }),
    ).current;

    const clear = () => {
      setPaths([]);
      currentRef.current = '';
      onChange?.(false);
    };
    useImperativeHandle(ref, () => ({ clear }));

    const hasInk = paths.length > 0 || currentRef.current.length > 0;

    return (
      <View style={styles.wrap}>
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
          <Svg width="100%" height="100%">
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke={colors.navy} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {currentRef.current ? (
              <Path d={currentRef.current} stroke={colors.navy} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </Svg>
        </View>

        {!hasInk ? (
          <View style={styles.placeholder} pointerEvents="none">
            <Icon name="signature" size={18} color={colors.textFaint} />
            <Text style={styles.phText}>Sign here with your finger</Text>
          </View>
        ) : null}

        {!hasInk ? <View style={styles.baseline} pointerEvents="none" /> : null}

        {hasInk ? (
          <Pressable style={styles.clearBtn} onPress={clear}>
            <Icon name="eraser" size={12} color={colors.textMuted} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
);

SignaturePad.displayName = 'SignaturePad';

const styles = StyleSheet.create({
  wrap: {
    height: 190,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: colors.orangeBorder,
    borderStyle: 'dashed',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  phText: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
  baseline: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 34,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderStrong,
  },
  clearBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  clearText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
});
