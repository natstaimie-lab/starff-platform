/**
 * Guided, framed document capture — the "hold it inside the frame" flow used for
 * the high-value identity items (passport, driving licence, ID/residence card,
 * selfie). The candidate lines the document up inside an on-screen frame, then
 * must review the shot ("Looks clear?/Retake") before it uploads, which lifts
 * image quality a lot versus the raw camera. Two-sided docs capture front then
 * back. Lower-stakes docs (CV, certificates) still use the plain picker.
 *
 * Params: { docType, label, mode } where mode is:
 *   'single' — one photo (passport photo page)
 *   'card'   — front then back (driving licence, ID / residence card)
 *   'selfie' — front camera, face oval
 */
import React, { useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { uploadCandidateDocument } from '@/lib/storage';
import { candidateApi } from '@/lib/endpoints';
import type { ProfileStackParamList } from '@/navigation/types';

type Shot = { uri: string; width: number; height: number };
type Step = 'front' | 'front-review' | 'back' | 'back-review' | 'uploading';

// A capture whose longest side is under this looks too low-res to verify.
const MIN_LONG_SIDE = 900;

export function DocumentCaptureScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<ProfileStackParamList, 'DocumentCapture'>>();
  const { docType, label, mode } = route.params;
  const { width } = useWindowDimensions();

  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [step, setStep] = useState<Step>('front');
  const [front, setFront] = useState<Shot | null>(null);
  const [back, setBack] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelfie = mode === 'selfie';
  const twoSided = mode === 'card';
  const capturingBack = step === 'back' || step === 'back-review';

  // Frame geometry (ID-1 card ≈ 1.586, passport page ≈ 1.42).
  const frameW = Math.round(width * 0.86);
  const frameH = isSelfie ? Math.round(frameW * 1.3) : Math.round(frameW / (twoSided ? 1.586 : 1.42));

  const sideLabel = capturingBack ? 'back' : twoSided ? 'front' : '';
  const prompt = isSelfie
    ? 'Centre your face in the oval, in good light'
    : `Fit the ${sideLabel ? sideLabel + ' of your ' : ''}${label.toLowerCase()} inside the frame`;

  // ── Permission gate ──
  if (!permission) {
    return <View style={styles.root}><View style={styles.center}><Text style={styles.msg}>Preparing camera…</Text></View></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <Header onBack={() => nav.goBack()} title={label} />
        <View style={styles.center}>
          <Icon name="cloud-upload" size={40} color={colors.textFaint} />
          <Text style={styles.msg}>Camera access is needed to photograph your {label.toLowerCase()}.</Text>
          <Button title="Enable camera" onPress={requestPermission} style={{ marginTop: 14, paddingHorizontal: 22 }} />
          <Pressable onPress={() => nav.goBack()} hitSlop={8} style={{ marginTop: 14 }}><Text style={styles.linkMuted}>Cancel</Text></Pressable>
        </View>
      </View>
    );
  }

  const takeShot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!photo) return;
      const shot: Shot = { uri: photo.uri, width: photo.width ?? 0, height: photo.height ?? 0 };
      if (capturingBack) { setBack(shot); setStep('back-review'); }
      else { setFront(shot); setStep('front-review'); }
    } catch {
      Alert.alert('Could not take the photo', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const retake = () => setStep(capturingBack ? 'back' : 'front');
  const lowRes = (s: Shot | null) => !!s && Math.max(s.width, s.height) > 0 && Math.max(s.width, s.height) < MIN_LONG_SIDE;

  const useFront = () => {
    if (twoSided) setStep('back');
    else submit(front, null);
  };
  const useBack = () => submit(front, back);

  const submit = async (f: Shot | null, b: Shot | null) => {
    if (!f) return;
    setStep('uploading');
    try {
      const fr = await uploadCandidateDocument({ uri: f.uri, name: `${docType.toLowerCase()}_front_${Date.now()}.jpg`, mimeType: 'image/jpeg' });
      let backPath: { path: string; fileName: string } | null = null;
      if (b) backPath = await uploadCandidateDocument({ uri: b.uri, name: `${docType.toLowerCase()}_back_${Date.now()}.jpg`, mimeType: 'image/jpeg' });
      await candidateApi.addDocument({
        type: docType,
        fileUrl: fr.path,
        fileName: fr.fileName,
        ...(backPath ? { backFileUrl: backPath.path, backFileName: backPath.fileName } : {}),
      });
      Alert.alert('Uploaded', `Your ${label.toLowerCase()} was sent for verification.`, [{ text: 'Done', onPress: () => nav.goBack() }]);
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message, [{ text: 'Try again', onPress: () => setStep(b ? 'back-review' : 'front-review') }]);
    }
  };

  // ── Review a captured shot ──
  if (step === 'front-review' || step === 'back-review' || step === 'uploading') {
    const shot = step === 'back-review' ? back : front;
    const uploading = step === 'uploading';
    return (
      <View style={styles.root}>
        <Header onBack={uploading ? undefined : () => nav.goBack()} title={label} />
        <View style={styles.reviewWrap}>
          {shot ? <Image source={{ uri: shot.uri }} style={styles.preview} resizeMode="contain" /> : null}
          {!uploading && lowRes(shot) ? (
            <View style={styles.warn}><Text style={styles.warnText}>This looks a little low quality. Move closer and fill the frame in good light for a clearer shot.</Text></View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {uploading ? (
            <Button title="Uploading…" loading onPress={() => {}} />
          ) : (
            <>
              <Button
                title={twoSided && !capturingBack ? 'Use front — next: back' : 'Use photo'}
                onPress={capturingBack ? useBack : useFront}
              />
              <Button title="Retake" kind="ghost" onPress={retake} />
            </>
          )}
        </View>
      </View>
    );
  }

  // ── Live camera with the alignment frame ──
  return (
    <View style={styles.root}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing={isSelfie ? 'front' : 'back'} />
      <View style={styles.overlay} pointerEvents="box-none">
        <Header onBack={() => nav.goBack()} title={label} light />
        <View style={styles.frameArea} pointerEvents="none">
          <Text style={styles.prompt}>{prompt}</Text>
          <View style={[styles.frame, { width: frameW, height: frameH, borderRadius: isSelfie ? frameW : 16 }]}>
            <View style={[styles.corner, styles.tl]} /><View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} /><View style={[styles.corner, styles.br]} />
          </View>
          {twoSided ? <Text style={styles.sideTag}>{capturingBack ? 'Step 2 of 2 · Back' : 'Step 1 of 2 · Front'}</Text> : null}
        </View>
        <View style={styles.shutterBar} pointerEvents="box-none">
          <Pressable onPress={takeShot} disabled={busy} style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Header({ onBack, title, light }: { onBack?: () => void; title: string; light?: boolean }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={[styles.backBtn, light && styles.backBtnLight]}>
          <Icon name="arrow-left" size={20} color={light ? '#fff' : colors.text} />
        </Pressable>
      ) : <View style={styles.backBtn} />}
      <Text style={[styles.headerTitle, light && { color: '#fff' }]} numberOfLines={1}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6, backgroundColor: colors.bg },
  msg: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  linkMuted: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, backgroundColor: colors.bg },
  backBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  backBtnLight: { backgroundColor: 'rgba(0,0,0,0.35)' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text },

  // live overlay
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  frameArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  prompt: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 30, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  frame: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', position: 'relative' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: colors.orange },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  sideTag: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(244,122,32,0.9)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },

  shutterBar: { alignItems: 'center', paddingBottom: 46, paddingTop: 10 },
  shutter: { width: 74, height: 74, borderRadius: 999, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 999, backgroundColor: '#fff' },

  // review
  reviewWrap: { flex: 1, backgroundColor: '#0b1220', alignItems: 'center', justifyContent: 'center', padding: 16 },
  preview: { width: '100%', height: '100%' },
  warn: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: colors.warningBg, borderRadius: radius.tile, padding: 12 },
  warnText: { color: colors.warning, fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  actions: { padding: 18, gap: 10, backgroundColor: colors.bg },
});
