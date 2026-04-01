import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { generateGeminiCompletion, hasGeminiKey } from '@/utils/gemini';
import { OfflineBanner } from '@/components/OfflineBanner';
import { onReadingActivity } from '@/utils/notifications';
import type { Book, ReadingStatus, ChatMessage } from '@/types';

const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

const STATUS_OPTIONS: { value: ReadingStatus; label: string; icon: string }[] = [
  { value: 'not_read',  label: 'Nicht gelesen', icon: 'book-outline' },
  { value: 'reading',   label: 'Am Lesen',      icon: 'book' },
  { value: 'finished',  label: 'Gelesen',        icon: 'checkmark-circle' },
  { value: 'abandoned', label: 'Abgebrochen',    icon: 'close-circle-outline' },
];

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);

  // AI & Chat
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Finished date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingFinishedDate, setPendingFinishedDate] = useState(new Date());

  // Page & tag input
  const [pageInput, setPageInput] = useState('');
  const [totalPagesInput, setTotalPagesInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    fetchBookDetails();
  }, [id]);

  useEffect(() => {
    hasGeminiKey().then(setAiEnabled);
  }, []);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory]);

  const fetchBookDetails = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('books').select('*').eq('id', id).single();
    if (error || !data) {
      Alert.alert('Fehler', 'Buchdetails konnten nicht geladen werden.');
      router.back();
      return;
    }
    setBook(data as Book);
    setPageInput(data.current_page ? String(data.current_page) : '');
    setTotalPagesInput(data.total_pages ? String(data.total_pages) : '');
    setLoading(false);
  };

  const deleteBook = () => {
    Alert.alert(
      'Buch löschen',
      `"${book?.title}" dauerhaft aus der Library entfernen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('books').delete().eq('id', id);
            if (error) Alert.alert('Fehler', error.message);
            else router.back();
          },
        },
      ]
    );
  };

  const updateReadingStatus = async (status: ReadingStatus, finishedAt?: string) => {
    if (!book) return;
    const updates: Partial<Book> & { finished_at?: string | null } = { reading_status: status };

    const wasFinished = book.reading_status === 'finished' || book.is_read;
    if (status === 'finished') {
      updates.finished_at = finishedAt ?? new Date().toISOString();
    } else if (wasFinished) {
      updates.finished_at = null;
    }

    const { error } = await supabase.from('books').update(updates).eq('id', id);
    if (error) {
      Alert.alert('Fehler beim Speichern', error.message);
      return;
    }
    setBook({ ...book, ...updates });
    // Reset reading reminder countdown on status change
    onReadingActivity();
    if (status === 'abandoned') {
      Alert.alert(
        'Auf welcher Seite abgebrochen?',
        'Seite unten eingeben um später weiterzumachen (optional).',
        [{ text: 'OK' }]
      );
    }
  };

  const handleFinishedTap = () => {
    if (book?.reading_status === 'finished') {
      updateReadingStatus('not_read');
      return;
    }
    setPendingFinishedDate(new Date());
    setShowDatePicker(true);
  };

  const confirmFinishedDate = async (date: Date) => {
    setShowDatePicker(false);
    await updateReadingStatus('finished', date.toISOString());
  };

  const updateRanking = async (newRank: number) => {
    if (!book) return;
    const { error } = await supabase.from('books').update({ ranking: newRank }).eq('id', id);
    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }
    setBook({ ...book, ranking: newRank });
  };

  const savePage = async () => {
    if (!book) return;
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 0) return;
    const { error } = await supabase.from('books').update({ current_page: page }).eq('id', id);
    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }
    setBook({ ...book, current_page: page });
    // User is actively reading → reset reminder clock
    onReadingActivity();
  };

  const saveTotalPages = async () => {
    if (!book) return;
    const total = parseInt(totalPagesInput, 10);
    if (isNaN(total) || total <= 0) return;
    const { error } = await supabase.from('books').update({ total_pages: total }).eq('id', id);
    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }
    setBook({ ...book, total_pages: total });
  };

  const addTag = async () => {
    if (!book) return;
    const tag = tagInput.trim();
    if (!tag) return;
    if (tag.length > MAX_TAG_LENGTH) {
      Alert.alert('Tag zu lang', `Tags dürfen maximal ${MAX_TAG_LENGTH} Zeichen haben.`);
      return;
    }
    const existingTags: string[] = book.tags ?? [];
    if (existingTags.length >= MAX_TAGS) {
      Alert.alert('Zu viele Tags', `Maximal ${MAX_TAGS} Tags pro Buch.`);
      return;
    }
    if (existingTags.includes(tag)) {
      setTagInput('');
      return;
    }
    const newTags = [...existingTags, tag];
    const { error } = await supabase.from('books').update({ tags: newTags }).eq('id', id);
    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }
    setBook({ ...book, tags: newTags });
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    if (!book) return;
    const newTags = (book.tags ?? []).filter((t) => t !== tag);
    const { error } = await supabase.from('books').update({ tags: newTags }).eq('id', id);
    if (error) {
      Alert.alert('Fehler', error.message);
      return;
    }
    setBook({ ...book, tags: newTags });
  };

  const generateSummary = async () => {
    if (!book) return;
    setIsSummarizing(true);
    try {
      const prompt = `You are a scholarly literature curator. Provide a short, cohesive, intellectual summary (max 3 sentences) of the book: "${book.title}" by ${book.author}.`;
      const aiResponse = await generateGeminiCompletion(prompt);
      const { error } = await supabase.from('books').update({ description: aiResponse }).eq('id', id);
      if (error) throw error;
      setBook({ ...book, description: aiResponse });
    } catch (e: any) {
      Alert.alert('KI-Fehler', e.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim() || !book) return;
    const userText = chatMessage.trim();
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userText };
    setChatHistory(prev => [...prev, newUserMsg]);
    setChatMessage('');
    setIsChatting(true);
    try {
      const prompt = `We are discussing the book "${book.title}" by ${book.author}. User question: ${userText}`;
      const systemInstruction = `You are an expert literary scholar assisting a user. Answer concisely and specifically about the book "${book.title}". Provide interesting insights. Keep formatting clean.`;
      const aiResponse = await generateGeminiCompletion(prompt, systemInstruction);
      const newAiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', text: aiResponse };
      setChatHistory(prev => [...prev, newAiMsg]);
    } catch (e: any) {
      Alert.alert('KI-Fehler', e.message);
    } finally {
      setIsChatting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!book) return null;

  const currentStatus: ReadingStatus = book.reading_status ?? (book.is_read ? 'finished' : 'not_read');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <OfflineBanner />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>Buchdetail</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={deleteBook}>
          <Ionicons name="trash-outline" size={24} color={theme.error || '#D32F2F'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={chatScrollRef}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Book Metadata */}
        <View style={styles.bookCore}>
          <Image
            source={{ uri: book.cover_url || 'https://via.placeholder.com/200x300?text=No+Cover' }}
            style={[styles.cover, { backgroundColor: theme.surface }]}
            resizeMode="cover"
          />
          <View style={styles.metadata}>
            <Text style={[styles.title, { color: theme.text }]}>{book.title}</Text>
            <Text style={[styles.author, { color: theme.textSecondary }]}>{book.author}</Text>
            {book.isbn ? (
              <Text style={[styles.isbn, { color: theme.textSecondary, opacity: 0.5 }]}>ISBN: {book.isbn}</Text>
            ) : null}
            <View style={[styles.starRow, { marginTop: 12 }]}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => updateRanking(star)}>
                  <Ionicons
                    name={(book.ranking ?? 0) >= star ? 'star' : 'star-outline'}
                    size={22}
                    color={(book.ranking ?? 0) >= star ? '#FFD700' : theme.borderDark}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Reading Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>LESESTATUS</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => {
              const active = currentStatus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusChip, { backgroundColor: active ? theme.primary : theme.surfaceHigh }]}
                  onPress={() => opt.value === 'finished' ? handleFinishedTap() : updateReadingStatus(opt.value)}
                >
                  <Ionicons name={opt.icon as any} size={13} color={active ? '#fff' : theme.textSecondary} />
                  <Text style={[styles.statusChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Reading Progress */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>LESEFORTSCHRITT</Text>

          {/* Page inputs row */}
          <View style={styles.progressInputsRow}>
            <View style={styles.progressInputGroup}>
              <Text style={[styles.progressInputLabel, { color: theme.textSecondary }]}>Aktuelle Seite</Text>
              <TextInput
                style={[styles.pageInput, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
                placeholder="—"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                value={pageInput}
                onChangeText={setPageInput}
                onBlur={savePage}
                onSubmitEditing={savePage}
                returnKeyType="done"
              />
            </View>

            <Text style={[styles.progressSlash, { color: theme.textSecondary }]}>/</Text>

            <View style={styles.progressInputGroup}>
              <Text style={[styles.progressInputLabel, { color: theme.textSecondary }]}>Gesamt</Text>
              <TextInput
                style={[styles.pageInput, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
                placeholder="—"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                value={totalPagesInput}
                onChangeText={setTotalPagesInput}
                onBlur={saveTotalPages}
                onSubmitEditing={saveTotalPages}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Progress bar */}
          {(() => {
            const cur = book.current_page ?? 0;
            const tot = book.total_pages ?? 0;
            if (cur <= 0 || tot <= 0) return null;
            const pct = Math.min(cur / tot, 1);
            const pctLabel = Math.round(pct * 100);
            return (
              <View style={styles.progressSection}>
                <View style={[styles.progressTrack, { backgroundColor: theme.surfaceHighest }]}>
                  <View style={[styles.progressFill, { width: `${pctLabel}%`, backgroundColor: theme.primary }]} />
                </View>
                <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
                  Seite {cur} von {tot} · {pctLabel}%
                </Text>
              </View>
            );
          })()}
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TAGS</Text>
          <View style={styles.tagWrap}>
            {(book.tags ?? []).map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, { backgroundColor: theme.surfaceHighest }]}
                onPress={() => removeTag(tag)}
              >
                <Text style={[styles.tagText, { color: theme.primary }]}>{tag}</Text>
                <Ionicons name="close" size={12} color={theme.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.tagInput, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
              placeholder="Tag hinzufügen…"
              placeholderTextColor={theme.textSecondary}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              returnKeyType="done"
              maxLength={MAX_TAG_LENGTH}
            />
            <TouchableOpacity style={[styles.tagAddBtn, { backgroundColor: theme.primary }]} onPress={addTag}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Summary */}
        {aiEnabled && (
          <View style={[styles.summarySection, { backgroundColor: theme.surfaceHighest }]}>
            {book.description ? (
              <Text style={[styles.descriptionText, { color: theme.text }]}>{book.description}</Text>
            ) : (
              <TouchableOpacity
                style={[styles.generateButton, { backgroundColor: theme.primaryContainer }]}
                onPress={generateSummary}
                disabled={isSummarizing}
              >
                {isSummarizing ? (
                  <ActivityIndicator size="small" color={theme.onPrimaryContainer} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color={theme.onPrimaryContainer} />
                    <Text style={[styles.generateText, { color: theme.onPrimaryContainer }]}>
                      KI-Zusammenfassung generieren
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* AI Chat */}
        {aiEnabled && (
          <View style={[styles.chatSection, { borderTopColor: theme.border }]}>
            <Text style={[styles.chatHeader, { color: theme.primary }]}>Ask The Scholar</Text>
            <View style={styles.chatHistory}>
              {chatHistory.length === 0 ? (
                <Text style={{ fontFamily: 'Manrope_500Medium', color: theme.textSecondary, textAlign: 'center', marginTop: 24 }}>
                  Stelle eine Frage zu „{book.title}"…
                </Text>
              ) : (
                chatHistory.map(msg => (
                  <View
                    key={msg.id}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user' ? styles.userBubble : styles.aiBubble,
                      {
                        backgroundColor: msg.role === 'user' ? theme.primary : theme.surface,
                        borderColor: msg.role === 'user' ? 'transparent' : theme.border,
                        borderWidth: msg.role === 'user' ? 0 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: msg.role === 'user' ? '#fff' : theme.text, fontFamily: 'Manrope_500Medium', lineHeight: 22 }}>
                      {msg.text}
                    </Text>
                  </View>
                ))
              )}
              {isChatting && (
                <View style={[styles.chatBubble, styles.aiBubble, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, alignSelf: 'flex-start' }]}>
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Finished Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.datePickerBackdrop}>
          <View style={[styles.datePickerCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.datePickerTitle, { color: theme.primary }]}>Wann beendet?</Text>
            <Text style={[styles.datePickerSub, { color: theme.textSecondary }]}>
              Datum anpassen, um auch ältere Bücher korrekt zu erfassen.
            </Text>
            <DateTimePicker
              value={pendingFinishedDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={(_, date) => { if (date) setPendingFinishedDate(date); }}
              style={{ width: '100%' }}
              textColor={theme.text}
            />
            <View style={styles.datePickerButtons}>
              <TouchableOpacity
                style={[styles.datePickerBtn, { borderWidth: 1, borderColor: theme.borderDark }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={[styles.datePickerBtnText, { color: theme.text }]}>Überspringen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.datePickerBtn, { backgroundColor: theme.primary }]}
                onPress={() => confirmFinishedDate(pendingFinishedDate)}
              >
                <Text style={[styles.datePickerBtnText, { color: '#fff' }]}>Bestätigen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Chat Input */}
      {aiEnabled && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.inputContainer, { backgroundColor: theme.background, borderTopColor: theme.border }]}
        >
          <TextInput
            style={[styles.chatInput, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
            placeholder="Was ist das Hauptthema?"
            placeholderTextColor={theme.textSecondary}
            value={chatMessage}
            onChangeText={setChatMessage}
            onSubmitEditing={sendChatMessage}
            returnKeyType="send"
          />
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: theme.primary }]} onPress={sendChatMessage}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 4 },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: { padding: 24, paddingBottom: 120 },
  bookCore: { flexDirection: 'row', gap: 20, marginBottom: 32 },
  cover: {
    width: 120,
    height: 180,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  metadata: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: 'Newsreader_700Bold', fontSize: 26, lineHeight: 32, marginBottom: 8 },
  author: { fontFamily: 'Manrope_500Medium', fontSize: 16, marginBottom: 4 },
  isbn: { fontFamily: 'Manrope_500Medium', fontSize: 12 },
  starRow: { flexDirection: 'row', gap: 4 },
  section: { marginBottom: 28 },
  sectionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 1.5, marginBottom: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  statusChipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  progressInputsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  progressInputGroup: { flex: 1 },
  progressInputLabel: { fontFamily: 'Manrope_500Medium', fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  progressSlash: { fontFamily: 'Newsreader_400Regular', fontSize: 28, paddingBottom: 10 },
  pageInput: { fontFamily: 'Manrope_500Medium', fontSize: 16, padding: 14, borderRadius: 10, textAlign: 'center' },
  progressSection: { gap: 8 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  tagText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  tagInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  tagInput: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, padding: 12, borderRadius: 10 },
  tagAddBtn: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summarySection: { padding: 16, borderRadius: 12, marginBottom: 32 },
  descriptionText: { fontFamily: 'Manrope_500Medium', fontSize: 15, lineHeight: 24 },
  generateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, gap: 8 },
  generateText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  chatSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 24 },
  chatHeader: { fontFamily: 'Newsreader_700Bold', fontSize: 22, marginBottom: 16 },
  chatHistory: { flex: 1, gap: 12 },
  chatBubble: { maxWidth: '85%', padding: 12, borderRadius: 12 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  chatInput: { flex: 1, height: 48, borderRadius: 24, paddingHorizontal: 20, fontFamily: 'Manrope_500Medium' },
  sendButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  datePickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePickerCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48, elevation: 20, shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 30 },
  datePickerTitle: { fontFamily: 'Newsreader_400Regular', fontSize: 28, marginBottom: 6 },
  datePickerSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginBottom: 8, lineHeight: 20 },
  datePickerButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  datePickerBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  datePickerBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
});
