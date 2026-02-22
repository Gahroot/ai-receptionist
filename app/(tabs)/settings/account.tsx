import { useState, useEffect } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button, Spinner, Separator } from 'tamagui';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import { useAuthStore } from '../../../stores/authStore';
import api from '../../../services/api';

export default function AccountScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get('/settings/users/me/profile');
        setFullName(res.data.full_name || '');
        setPhone(res.data.phone_number || '');
      } catch {
        // Fall back to auth store values
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/settings/users/me/profile', {
        full_name: fullName,
        phone_number: phone,
      });
      await useAuthStore.getState().fetchUser();
      Alert.alert('Saved', 'Profile updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Please fill in both password fields');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      Alert.alert('Saved', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail === 'Current password is incorrect') {
        Alert.alert('Error', 'Current password is incorrect');
      } else {
        Alert.alert('Error', 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor={colors.backgroundSecondary}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={() => router.back()}
          icon={<ArrowLeft size={20} color={colors.textPrimary} />}
        />
        <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
          Account
        </Text>
      </XStack>

      {loadingProfile ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <YStack paddingHorizontal="$4" gap="$3" marginBottom="$5">
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Profile
          </Text>

          <YStack gap="$2">
            <Text fontSize={13} color={colors.textSecondary}>Full Name</Text>
            <Input
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontSize={13} color={colors.textSecondary}>Email</Text>
            <Input
              value={user?.email || ''}
              disabled
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
              backgroundColor={colors.backgroundSecondary}
              color={colors.textSecondary}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontSize={13} color={colors.textSecondary}>Phone Number</Text>
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
            />
          </YStack>

          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            onPress={handleSaveProfile}
            disabled={saving}
            pressStyle={{ opacity: 0.8 }}
            marginTop="$2"
          >
            {saving ? <Spinner color="white" /> : 'Save Profile'}
          </Button>
        </YStack>

        <Separator marginHorizontal="$4" borderColor={colors.borderLight} marginBottom="$5" />

        {/* Change Password */}
        <YStack paddingHorizontal="$4" gap="$3">
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Change Password
          </Text>

          <YStack gap="$2">
            <Text fontSize={13} color={colors.textSecondary}>Current Password</Text>
            <Input
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              secureTextEntry
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontSize={13} color={colors.textSecondary}>New Password</Text>
            <Input
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              secureTextEntry
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
            />
          </YStack>

          <Button
            size="$5"
            backgroundColor={colors.backgroundSecondary}
            color={colors.textPrimary}
            borderRadius="$4"
            fontWeight="600"
            borderWidth={1}
            borderColor={colors.border}
            onPress={handleChangePassword}
            disabled={changingPassword}
            pressStyle={{ backgroundColor: colors.surfaceSecondary }}
            marginTop="$2"
          >
            {changingPassword ? <Spinner color={colors.textPrimary} /> : 'Change Password'}
          </Button>
        </YStack>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}
