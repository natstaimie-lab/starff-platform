/**
 * Icon — bridges the prototype's Tabler icon names ("ti-...") to
 * @expo/vector-icons (MaterialCommunityIcons ships with Expo, no native build
 * step). Keeping the same logical names means screens read like the prototype.
 */
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Tabler name (without the "ti-" prefix) → MaterialCommunityIcons name.
// Typed as strings (not the strict glyph union) so a version-specific glyph
// rename can never break the whole build — worst case it renders the fallback.
const MAP: Record<string, string> = {
  home: 'home-variant',
  briefcase: 'briefcase',
  robot: 'robot-happy',
  clock: 'clock-outline',
  'clock-play': 'clock-start',
  user: 'account',
  users: 'account-group',
  plus: 'plus',
  building: 'office-building',
  'building-warehouse': 'warehouse',
  helmet: 'hard-hat',
  bell: 'bell',
  settings: 'cog',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'arrow-up': 'arrow-up',
  x: 'close',
  check: 'check',
  checks: 'check-all',
  circle: 'circle-outline',
  'circle-check': 'check-circle',
  'chevron-right': 'chevron-right',
  'shield-check': 'shield-check',
  'shield-lock': 'shield-lock',
  lock: 'lock',
  'cloud-upload': 'cloud-upload',
  'map-2': 'map',
  'map-pin-check': 'map-marker-check',
  coin: 'cash',
  'credit-card': 'credit-card',
  'file-cv': 'file-account',
  'file-text': 'file-document',
  'file-invoice': 'file-document-outline',
  fingerprint: 'fingerprint',
  download: 'download',
  calendar: 'calendar',
  filter: 'filter-variant',
  'adjustments-horizontal': 'tune',
  search: 'magnify',
  'search-off': 'magnify-close',
  bookmark: 'bookmark-outline',
  'bookmark-filled': 'bookmark',
  'share-2': 'share-variant',
  message: 'message-text',
  'dots-vertical': 'dots-vertical',
  sparkles: 'star-four-points',
  alarm: 'alarm',
  'door-exit': 'door',
  'alert-triangle': 'alert',
  signature: 'signature-freehand',
  'writing-sign': 'draw',
  eraser: 'eraser',
  logout: 'logout',
  'circle-plus': 'plus-circle',
  camera: 'camera',
  photo: 'image',
  'map-pin': 'map-marker',
  star: 'star',
  car: 'car',
  bus: 'bus',
  bike: 'bike',
  walk: 'walk',
  run: 'run-fast',
  cloud: 'weather-partly-cloudy',
  coffee: 'coffee',
  shower: 'shower',
  shirt: 'tshirt-crew',
  refresh: 'refresh',
  'door-enter': 'door-open',
};

export function Icon({
  name,
  size = 20,
  color = '#0B1F3A',
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: object;
}) {
  const clean = name.replace(/^ti-/, '');
  const mapped = MAP[clean] ?? 'checkbox-blank-circle-outline';
  return (
    <MaterialCommunityIcons
      name={mapped as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={size}
      color={color}
      style={style}
    />
  );
}
