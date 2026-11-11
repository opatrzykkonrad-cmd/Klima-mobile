import React from 'react';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RootStackParamList, TabParamList } from './types';
import { colors } from '../theme';
import DashboardScreen from '../screens/DashboardScreen';
import ClientsScreen from '../screens/ClientsScreen';
import LogsScreen from '../screens/LogsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ClientFormScreen from '../screens/ClientFormScreen';
import ClientDetailsScreen from '../screens/ClientDetailsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.late,
  },
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Dashboard: 'view-dashboard-outline',
  Clients: 'account-group-outline',
  Logs: 'message-text-clock-outline',
  Settings: 'cog-outline',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mute,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={TAB_ICONS[route.name]} color={color} size={size} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Pulpit' }} />
      <Tab.Screen name="Clients" component={ClientsScreen} options={{ title: 'Klienci' }} />
      <Tab.Screen name="Logs" component={LogsScreen} options={{ title: 'Historia' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ustawienia' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="ClientDetails" component={ClientDetailsScreen} options={{ title: 'Klient' }} />
        <Stack.Screen name="ClientForm" component={ClientFormScreen} options={{ title: 'Klient', animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
