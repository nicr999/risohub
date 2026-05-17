// ============================================================
// RISO HUB Mobile — index.js
// ============================================================

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);


// ============================================================
// src/App.tsx — Root component
// ============================================================

import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AuthProvider } from './auth/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { COLOURS } from './theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={COLOURS.olive} />
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}


// ============================================================
// app.json
// ============================================================

// {
//   "name": "RisoHub",
//   "displayName": "RISO HUB"
// }
