/**
 * Clock-in identity check — the worker takes a quick selfie each time they
 * check in to a shift, re-confirming it's really them on site. The photo goes
 * to the worker's own folder in the private `candidate-documents` bucket (same
 * per-user RLS as their documents) and its path is sent with the check-in.
 * Staff compare it against the verified identity selfie in the admin dashboard.
 */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

const BUCKET = 'candidate-documents';

/** Ask the worker for a selfie. Resolves to the local photo uri, or null if they cancelled. */
async function takeSelfie(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Camera access needed',
      'Starff asks for a quick selfie each time you check in, to confirm it’s you on shift. Please allow camera access in Settings.',
    );
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    quality: 0.7,
    cameraType: ImagePicker.CameraType.front,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

async function uploadSelfie(uri: string, shiftId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error('You are not signed in.');

  // JPEG (iPhones shoot HEIC) and resized — a face check doesn't need full resolution.
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 900 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const bytes = await (await fetch(out.uri)).arrayBuffer();
  const path = `${uid}/checkin_${shiftId.replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Explain, take the selfie and upload it. Resolves to the storage path, or null
 * if the worker backed out (in which case the check-in should not go ahead).
 */
export function captureCheckInPhoto(shiftId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    Alert.alert(
      'Quick photo check',
      'Take a selfie to confirm it’s you checking in. Face the camera in good light.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        {
          text: 'Take selfie',
          onPress: async () => {
            try {
              const uri = await takeSelfie();
              resolve(uri ? await uploadSelfie(uri, shiftId) : null);
            } catch (err) {
              reject(err);
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
