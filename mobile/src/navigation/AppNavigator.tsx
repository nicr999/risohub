// ============================================================
// RISO HUB Mobile — src/navigation/AppNavigator.tsx
// Full navigation structure:
//
// Bottom tabs (authenticated):
//   🏠 Dashboard  — summary, pipeline, alerts
//   📋 Projects   — list → detail (Overview/Checklist/Files/Notes)
//   🎓 Qualifications — staff quals with expiry status
//   🔔 Notifications — in-app notification centre
//
// Unauthenticated: Login screen
// ============================================================

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../auth/AuthContext';
import { COLOURS } from '../theme';
import { usePushNotifications } from '../sync/useNotifications';

import LoginScreen          from '../screens/LoginScreen';
import ProjectsScreen       from '../screens/ProjectsScreen';
import ProjectDetailScreen  from '../screens/ProjectDetailScreen';
import DashboardScreen      from '../screens/DashboardScreen';
import QualificationsScreen from '../screens/QualificationsScreen';
import NotificationsScreen  from '../screens/NotificationsScreen';

// ─── Stack / Tab creators ─────────────────────────────────────

const RootStack = createNativeStackNavigator();
const Tab       = createBottomTabNavigator();
const ProjStack = createNativeStackNavigator();

// ─── Projects stack ────────────────────────────────────────────

function ProjectsStack() {
  return (
    <ProjStack.Navigator
      screenOptions={{
        headerStyle:      { backgroundColor: COLOURS.olive },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
      }}
    >
      <ProjStack.Screen
        name="ProjectsList"
        component={ProjectsScreen}
        options={{ title: 'Projects' }}
      />
      <ProjStack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{ title: 'Project' }}
      />
    </ProjStack.Navigator>
  );
}

// ─── Tab icon ─────────────────────────────────────────────────

type TabIconProps = {
  icon: string;
  focused: boolean;
  badge?: number;
};

function TabIcon({ icon, focused, badge }: TabIconProps) {
  return (
    <View style={ti.wrap}>
      <Text style={[ti.icon, focused && ti.iconFocused]}>{icon}</Text>
      {badge != null && badge > 0 && (
        <View style={ti.badge}>
          <Text style={ti.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

const ti = StyleSheet.create({
  wrap:        { position: 'relative' },
  icon:        { fontSize: 22, opacity: 0.4 },
  iconFocused: { opacity: 1 },
  badge: {
    position:        'absolute',
    top:             -4,
    right:           -8,
    backgroundColor: COLOURS.error,
    borderRadius:    8,
    minWidth:        16,
    height:          16,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});

// ─── Main tab navigator ───────────────────────────────────────

function AppTabs() {
  usePushNotifications(); // Register FCM token + handle notification taps

  // We use a context-level unread count hook here so the tab badge stays live
  // The actual count is fetched inside NotificationsScreen/NotificationsTab
  const [unreadCount, setUnreadCount] = React.useState(0);

  // Poll unread count every 60s while tabs are mounted
  React.useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const { api } = await import('../api/client');
        const res = await api.get('/api/notifications/unread-count');
        if (mounted) setUnreadCount(res.data.count ?? 0);
      } catch { /* non-fatal */ }
    };
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor:   COLOURS.olive,
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: {
          borderTopWidth:  1,
          borderTopColor:  '#e8e8e4',
          paddingBottom:   4,
          paddingTop:      4,
          height:          56,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 0 },
        headerShown:      false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon:  ({ focused }) => <TabIcon icon="⊡" focused={focused} />,
          headerShown: true,
          headerStyle: { backgroundColor: COLOURS.olive },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          title: 'RISO HUB',
        }}
      />

      <Tab.Screen
        name="Projects"
        component={ProjectsStack}
        options={{
          tabBarLabel: 'Projects',
          tabBarIcon:  ({ focused }) => <TabIcon icon="📋" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="Qualifications"
        component={QualificationsScreen}
        options={{
          tabBarLabel: 'Quals',
          tabBarIcon:  ({ focused }) => <TabIcon icon="🎓" focused={focused} />,
          headerShown: true,
          headerStyle: { backgroundColor: COLOURS.olive },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          title: 'Qualifications',
        }}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarIcon:  ({ focused }) => (
            <TabIcon icon="🔔" focused={focused} badge={unreadCount} />
          ),
          headerShown: true,
          headerStyle: { backgroundColor: COLOURS.olive },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          title: 'Notifications',
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root navigator ───────────────────────────────────────────

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOURS.cream }}>
      <ActivityIndicator color={COLOURS.olive} size="large" />
    </View>
  );

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <RootStack.Screen name="App" component={AppTabs} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
