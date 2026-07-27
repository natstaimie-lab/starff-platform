// Custom entry point (monorepo-safe). Expo's default `expo/AppEntry.js` resolves
// `../../App` relative to the hoisted node_modules, which breaks in a workspace.
// Registering here resolves ./App relative to this app folder.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
