import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Home, Phone, MessageCircle, Users, Settings } from 'lucide-react-native';
import { colors } from '../../constants/theme';
import { useAuthStore } from '../../stores/authStore';
import { useVoicemailStore } from '../../stores/voicemailStore';

export default function TabLayout() {
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const unreadCount = useVoicemailStore((s) => s.unreadCount);
  const fetchUnreadCount = useVoicemailStore((s) => s.fetchUnreadCount);

  useEffect(() => {
    if (workspaceId) {
      fetchUnreadCount(workspaceId);
    }
  }, [workspaceId, fetchUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          paddingTop: 4,
          height: 85,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          tabBarIcon: ({ color, size }) => <Phone size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.error,
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
