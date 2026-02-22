import { useState, useEffect, useCallback } from 'react';
import { FlatList, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, TextArea, Button, Spinner } from 'tamagui';
import { ArrowLeft, Plus, Pencil, Trash2, Search, BookOpen, X } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import type { FAQItem } from '../../../lib/types';

export default function KnowledgeBaseScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFaqs = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await api.get<FAQItem[]>(`/workspaces/${workspaceId}/knowledge-base`);
      setFaqs(Array.isArray(res.data) ? res.data : []);
    } catch {
      // Empty on error
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const filteredFaqs = searchQuery.trim()
    ? faqs.filter(
        (f) =>
          f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : faqs;

  const openAddModal = () => {
    setEditingFaq(null);
    setQuestion('');
    setAnswer('');
    setModalVisible(true);
  };

  const openEditModal = (faq: FAQItem) => {
    setEditingFaq(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      if (editingFaq) {
        await api.put(`/workspaces/${workspaceId}/knowledge-base/${editingFaq.id}`, {
          question: question.trim(),
          answer: answer.trim(),
        });
      } else {
        await api.post(`/workspaces/${workspaceId}/knowledge-base`, {
          question: question.trim(),
          answer: answer.trim(),
        });
      }
      setModalVisible(false);
      fetchFaqs();
    } catch {
      Alert.alert('Error', `Failed to ${editingFaq ? 'update' : 'create'} FAQ`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (faq: FAQItem) => {
    Alert.alert('Delete FAQ', `Are you sure you want to delete "${faq.question}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!workspaceId) return;
          try {
            await api.delete(`/workspaces/${workspaceId}/knowledge-base/${faq.id}`);
            fetchFaqs();
          } catch {
            Alert.alert('Error', 'Failed to delete FAQ');
          }
        },
      },
    ]);
  };

  const renderFaqItem = ({ item }: { item: FAQItem }) => (
    <YStack
      marginHorizontal="$4"
      marginBottom="$2"
      padding="$3"
      backgroundColor={colors.background}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.borderLight}
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
        <YStack flex={1} gap="$1">
          <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
            {item.question}
          </Text>
          <Text fontSize={13} color={colors.textSecondary} numberOfLines={2}>
            {item.answer}
          </Text>
        </YStack>
        <XStack gap="$2">
          <Button
            size="$2"
            circular
            backgroundColor={colors.backgroundSecondary}
            pressStyle={{ backgroundColor: colors.surfaceSecondary }}
            onPress={() => openEditModal(item)}
            icon={<Pencil size={14} color={colors.textSecondary} />}
          />
          <Button
            size="$2"
            circular
            backgroundColor="#FEF2F2"
            pressStyle={{ backgroundColor: '#FEE2E2' }}
            onPress={() => handleDelete(item)}
            icon={<Trash2 size={14} color={colors.error} />}
          />
        </XStack>
      </XStack>
    </YStack>
  );

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
        <Text flex={1} fontSize={20} fontWeight="700" color={colors.textPrimary}>
          Knowledge Base
        </Text>
        <Button
          size="$3"
          circular
          backgroundColor={colors.primary}
          pressStyle={{ opacity: 0.8 }}
          onPress={openAddModal}
          icon={<Plus size={20} color="white" />}
        />
      </XStack>

      {/* Search Bar */}
      <XStack paddingHorizontal="$4" paddingBottom="$3">
        <XStack
          flex={1}
          backgroundColor={colors.backgroundSecondary}
          borderRadius="$3"
          borderWidth={1}
          borderColor={colors.borderLight}
          alignItems="center"
          paddingHorizontal="$3"
        >
          <Search size={18} color={colors.textTertiary} />
          <Input
            flex={1}
            size="$4"
            placeholder="Search FAQs..."
            placeholderTextColor={colors.textTertiary as any}
            backgroundColor="transparent"
            borderWidth={0}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </XStack>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
        <FlatList
          data={filteredFaqs}
          keyExtractor={(item) => item.id}
          renderItem={renderFaqItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$3">
              <YStack
                width={56}
                height={56}
                borderRadius={28}
                backgroundColor="#E6FFF0"
                alignItems="center"
                justifyContent="center"
              >
                <BookOpen size={24} color="#10B981" />
              </YStack>
              <Text
                fontSize={14}
                color={colors.textTertiary}
                textAlign="center"
                paddingHorizontal="$6"
                lineHeight={22}
              >
                {searchQuery.trim()
                  ? 'No FAQs match your search'
                  : 'Add frequently asked questions and answers to help your AI respond more accurately'}
              </Text>
            </YStack>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal Header */}
          <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
            <Button
              size="$3"
              circular
              backgroundColor={colors.backgroundSecondary}
              pressStyle={{ backgroundColor: colors.surfaceSecondary }}
              onPress={() => setModalVisible(false)}
              icon={<X size={20} color={colors.textPrimary} />}
            />
            <Text flex={1} fontSize={20} fontWeight="700" color={colors.textPrimary}>
              {editingFaq ? 'Edit FAQ' : 'Add FAQ'}
            </Text>
          </XStack>

          <YStack flex={1} paddingHorizontal="$4" gap="$4" paddingTop="$2">
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Question
              </Text>
              <Input
                value={question}
                onChangeText={setQuestion}
                placeholder="What question do callers frequently ask?"
                size="$5"
                borderRadius="$3"
                borderColor={colors.border}
              />
            </YStack>

            <YStack gap="$2">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Answer
              </Text>
              <TextArea
                value={answer}
                onChangeText={setAnswer}
                placeholder="How should the AI respond to this question?"
                numberOfLines={6}
                size="$4"
                borderRadius="$3"
                borderColor={colors.border}
                minHeight={120}
              />
            </YStack>

            <YStack gap="$2" marginTop="$2">
              <Button
                size="$5"
                backgroundColor={colors.primary}
                color="white"
                borderRadius="$4"
                fontWeight="600"
                onPress={handleSave}
                disabled={saving || !question.trim() || !answer.trim()}
                pressStyle={{ opacity: 0.8 }}
                opacity={!question.trim() || !answer.trim() ? 0.5 : 1}
              >
                {saving ? <Spinner color="white" /> : editingFaq ? 'Save Changes' : 'Add FAQ'}
              </Button>
              <Button
                size="$5"
                backgroundColor={colors.backgroundSecondary}
                color={colors.textPrimary}
                borderRadius="$4"
                fontWeight="600"
                borderWidth={1}
                borderColor={colors.border}
                pressStyle={{ backgroundColor: colors.surfaceSecondary }}
                onPress={() => setModalVisible(false)}
              >
                Cancel
              </Button>
            </YStack>
          </YStack>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
