import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useI18n } from '../../lib/i18n';
import { colors } from '../../lib/theme';

type Icon = ComponentProps<typeof Ionicons>['name'];

const tabIcon = (name: Icon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

/** Bottom tabs: Home, My trips, Safety, Settings. Other screens open on top of them. */
export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { minHeight: 60, paddingTop: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('app.name'), tabBarLabel: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="trips" options={{ title: t('saved.title'), tabBarLabel: t('tabs.trips'), tabBarIcon: tabIcon('bookmark') }} />
      <Tabs.Screen name="safety" options={{ title: t('tabs.safety'), tabBarLabel: t('tabs.safety'), tabBarIcon: tabIcon('shield-checkmark') }} />
      <Tabs.Screen
        name="settings"
        options={{ title: t('settings.title'), tabBarLabel: t('settings.title'), tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
