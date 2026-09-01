import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, TextInput, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import {
  getSmartRecommendations,
  hasGeminiKey, type BookRecommendation,
} from '@/utils/gemini';
import { enrichBookWithGoogleBooksTags } from '@/utils/googleBooks';
import { scoreTagAffinity, scoreAndSortBooks, type ScoredBook } from '@/utils/recommendationScoring';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Book, WishlistItem } from '@/types';

const AI_DISCLOSURE_KEY = 'ai_recommendation_disclosure_shown';

type ActiveTab = 'library' | 'ai';

type FinishedBook = Pick<Book, 'title' | 'author' | 'ranking' | 'tags' | 'description'>;
type UnreadBook = Pick<Book, 'id' | 'title' | 'author' | 'cover_url' | 'tags'>;
type WishlistEntry = Pick<WishlistItem, 'id' | 'title' | 'author' | 'cover_url'>;

interface AiSearchContext {
  bookName?: string;
  tags: string[];
}

export default function RecommendationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [activeTab, setActiveTab] = useState<ActiveTab>('library');
  const [libraryFilterTags, setLibraryFilterTags] = useState<string[]>([]);
  const [aiContext, setAiContext] = useState<AiSearchContext | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Data
  const [finishedBooks, setFinishedBooks] = useState<FinishedBook[]>([]);
  const [unreadBooks, setUnreadBooks] = useState<UnreadBook[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistEntry[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [topTags, setTopTags] = useState<string[]>([]);

  // AI state
  const [aiRecommendations, setAiRecommendations] = useState<BookRecommendation[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [addingId, setAddingId] = useState<string | null>(null);

  // Search sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetBookName, setSheetBookName] = useState('');
  const [sheetTags, setSheetTags] = useState<string[]>([]);

  const affinityMap = useMemo(() => scoreTagAffinity(finishedBooks), [finishedBooks]);
  const scoredBooks = useMemo(
    () => scoreAndSortBooks(unreadBooks, wishlistItems, affinityMap, libraryFilterTags),
    [unreadBooks, wishlistItems, affinityMap, libraryFilterTags]
  );

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const enabled = await hasGeminiKey();
    setAiEnabled(enabled);
    const data = await fetchData();
    if (enabled && data) {
      const disclosed = await AsyncStorage.getItem(AI_DISCLOSURE_KEY);
      if (disclosed !== 'true') {
        Alert.alert(
          'KI-Empfehlungen',
          'Deine Lesehistorie (Titel, Autoren, Bewertungen) wird an Google Gemini gesendet, um personalisierte Empfehlungen zu generieren. Deine Daten werden nicht dauerhaft bei Google gespeichert.',
          [{ text: 'Verstanden', onPress: () => AsyncStorage.setItem(AI_DISCLOSURE_KEY, 'true') }]
        );
      }
      loadAiRecommendationsFor(null, data.finished, data.topTags);
    }
  };

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const [finishedRes, unreadRes, wishlistRes, allRes] = await Promise.all([
        supabase.from('books').select('title, author, ranking, tags, description').eq('reading_status', 'finished'),
        supabase.from('books').select('id, title, author, cover_url, tags').eq('reading_status', 'not_read'),
        supabase.from('wishlists').select('id, title, author, cover_url'),
        supabase.from('books').select('tags'),
      ]);

      const finished = finishedRes.data ?? [];
      const unread = unreadRes.data ?? [];
      const wishlist = wishlistRes.data ?? [];

      const tagCounts: Record<string, number> = {};
      (allRes.data ?? []).forEach(b =>
        (b.tags ?? []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; })
      );
      const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

      setFinishedBooks(finished);
      setUnreadBooks(unread);
      setWishlistItems(wishlist);
      setAllTags(sortedTags);
      setTopTags(sortedTags);

      return { finished, topTags: sortedTags };
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
      return null;
    } finally {
      setDataLoading(false);
    }
  };

  const loadAiRecommendationsFor = async (
    context: AiSearchContext | null,
    finished: FinishedBook[] = finishedBooks,
    top: string[] = topTags
  ) => {
    setAiLoading(true);
    setAiContext(context);
    try {
      const results = await getSmartRecommendations({
        finishedBooks: finished,
        bookName: context?.bookName,
        selectedTags: context?.tags && context.tags.length > 0 ? context.tags : undefined,
        topTags: top,
      });
      setAiRecommendations(results);
    } catch (e: any) {
      Alert.alert('KI-Fehler', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleLibraryFilterTag = (tag: string) => {
    setLibraryFilterTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleSheetTag = (tag: string) => {
    setSheetTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const openSearchSheet = () => {
    setSheetBookName(aiContext?.bookName ?? '');
    setSheetTags(aiContext?.tags ?? []);
    setSheetVisible(true);
  };

  const closeSearchSheet = () => {
    setSheetVisible(false);
  };

  const submitSearch = () => {
    const name = sheetBookName.trim();
    const tags = sheetTags;
    if (!name && tags.length === 0) {
      resetAiContext();
      closeSearchSheet();
      return;
    }
    const context: AiSearchContext = { bookName: name || undefined, tags };
    closeSearchSheet();
    loadAiRecommendationsFor(context);
  };

  const resetAiContext = () => {
    loadAiRecommendationsFor(null);
  };

  // ── Add AI recommendation ──────────────────────────────────────────────────

  const addAiBookToWishlist = async (rec: BookRecommendation) => {
    const key = `${rec.title}::${rec.author}`;
    setAddingId(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('wishlists').insert([{
        title: rec.title, author: rec.author, description: rec.reason, user_id: user?.id,
      }]);
      if (error) throw error;
      Alert.alert('Zur Wunschliste hinzugefügt', `"${rec.title}" wartet auf dich.`);
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setAddingId(null);
    }
  };

  const addAiBookToLibrary = async (rec: BookRecommendation) => {
    const key = `${rec.title}::${rec.author}_lib`;
    setAddingId(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from('books')
        .insert([{ title: rec.title, author: rec.author, description: rec.reason, user_id: user?.id }])
        .select('id')
        .single();
      if (error) throw error;
      if (inserted?.id) {
        enrichBookWithGoogleBooksTags(inserted.id, rec.title, rec.author);
      }
      Alert.alert('Zur Library hinzugefügt', `"${rec.title}" ist jetzt in deiner Sammlung.`);
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setAddingId(null);
    }
  };

  const handleAiBookPress = (rec: BookRecommendation) => {
    Alert.alert(rec.title, `von ${rec.author}\n\nWohin soll das Buch?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Wunschliste', onPress: () => addAiBookToWishlist(rec) },
      { text: 'Library', style: 'default', onPress: () => addAiBookToLibrary(rec) },
    ]);
  };

  // ── Add wishlist item to library ───────────────────────────────────────────

  const addWishlistToLibrary = async (item: ScoredBook) => {
    setAddingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from('books')
        .insert([{ title: item.title, author: item.author, cover_url: item.cover_url, user_id: user?.id }])
        .select('id')
        .single();
      if (error) throw error;
      if (inserted?.id) {
        enrichBookWithGoogleBooksTags(inserted.id, item.title, item.author);
      }
      await supabase.from('wishlists').delete().eq('id', item.id);
      setWishlistItems(prev => prev.filter(w => w.id !== item.id));
      Alert.alert('Zur Library hinzugefügt', `"${item.title}" ist jetzt in deiner Bibliothek.`);
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setAddingId(null);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderAiCard = (rec: BookRecommendation, index: number) => {
    const key = `${rec.title}::${rec.author}`;
    const isAdding = addingId === key || addingId === key + '_lib';
    return (
      <View key={index} style={[styles.recCard, { backgroundColor: theme.surfaceHighest }]}>
        <View style={[styles.indexBadge, { backgroundColor: theme.primary }]}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>
        <View style={styles.recContent}>
          <Text style={[styles.recTitle, { color: theme.primary }]} numberOfLines={2}>{rec.title}</Text>
          <Text style={[styles.recAuthor, { color: theme.textSecondary }]}>{rec.author.toUpperCase()}</Text>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text style={[styles.recReason, { color: theme.text }]}>{rec.reason}</Text>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          onPress={() => handleAiBookPress(rec)}
          disabled={isAdding}
        >
          {isAdding
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="add" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>
    );
  };

  const renderLibraryCard = (book: ScoredBook) => {
    const isAdding = addingId === book.id;
    return (
      <TouchableOpacity
        key={book.id}
        style={[styles.libCard, { backgroundColor: theme.surfaceHighest }]}
        onPress={() => book.source === 'library' ? router.push(`/book/${book.id}` as any) : undefined}
        activeOpacity={book.source === 'library' ? 0.7 : 1}
      >
        <View style={styles.coverWrap}>
          {book.cover_url ? (
            <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: theme.surface }]}>
              <Ionicons name="book-outline" size={22} color={theme.textSecondary} />
            </View>
          )}
        </View>

        <View style={styles.libCardContent}>
          <Text style={[styles.recTitle, { color: theme.primary, fontSize: 16 }]} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={[styles.recAuthor, { color: theme.textSecondary }]}>
            {book.author.toUpperCase()}
          </Text>
          <View style={[styles.sourceBadge, {
            backgroundColor: book.source === 'library' ? theme.primary + '22' : theme.surface,
          }]}>
            <Text style={[styles.sourceBadgeText, {
              color: book.source === 'library' ? theme.primary : theme.textSecondary,
            }]}>
              {book.source === 'library' ? 'Bibliothek' : 'Wunschliste'}
            </Text>
          </View>
          {book.tags.length > 0 && (
            <View style={styles.tagRow}>
              {book.tags.slice(0, 3).map(tag => (
                <View key={tag} style={[styles.miniTag, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.miniTagText, { color: theme.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {book.source === 'wishlist' ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            onPress={() => addWishlistToLibrary(book)}
            disabled={isAdding}
          >
            {isAdding
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="add" size={20} color="#fff" />}
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    );
  };

  const renderLibraryFilterChips = () => {
    if (allTags.length === 0) return null;
    return (
      <View style={styles.tagSection}>
        <Text style={[styles.tagSectionLabel, { color: theme.textSecondary }]}>NACH TAG FILTERN</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagScroll}
          contentContainerStyle={styles.tagScrollContent}
        >
          {allTags.map(tag => {
            const active = libraryFilterTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, {
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderColor: active ? theme.primary : theme.border,
                }]}
                onPress={() => toggleLibraryFilterTag(tag)}
              >
                <Text style={[styles.tagChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderLibraryTab = () => {
    if (dataLoading) {
      return (
        <View style={[styles.loadingCard, { backgroundColor: theme.surfaceHighest }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingTitle, { color: theme.primary }]}>Bibliothek wird geladen…</Text>
        </View>
      );
    }
    if (scoredBooks.length === 0) {
      return (
        <View style={[styles.emptyCard, { backgroundColor: theme.surfaceHighest }]}>
          <Ionicons name="book-outline" size={36} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.primary }]}>
            {libraryFilterTags.length > 0 ? 'Keine Treffer' : 'Alles gelesen!'}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {libraryFilterTags.length > 0
              ? 'Keine ungelesenen Bücher oder Wunschlisteneinträge mit diesen Tags.'
              : 'Du hast keine ungelesenen Bücher oder Wunschlisteneinträge.'}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.cardList}>
        {scoredBooks.map(renderLibraryCard)}
      </View>
    );
  };

  const renderContextBanner = () => {
    if (!aiContext) return null;
    const parts: string[] = [];
    if (aiContext.bookName) parts.push(`Ähnlich wie: ${aiContext.bookName}`);
    if (aiContext.tags.length > 0) parts.push(`Themen: ${aiContext.tags.join(', ')}`);
    return (
      <View style={[styles.contextBanner, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}>
        <View style={{ flex: 1 }}>
          {parts.map((p, i) => (
            <Text key={i} style={[styles.contextBannerText, { color: theme.primary }]}>
              {p}
            </Text>
          ))}
        </View>
        <TouchableOpacity onPress={resetAiContext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderAiTab = () => {
    return (
      <>
        {renderContextBanner()}

        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: theme.surfaceHighest, borderColor: theme.border }]}
          onPress={openSearchSheet}
          disabled={aiLoading}
        >
          <Ionicons name="options-outline" size={18} color={theme.primary} />
          <Text style={[styles.searchBtnText, { color: theme.primary }]}>Suche anpassen</Text>
        </TouchableOpacity>

        {aiLoading && (
          <View style={[styles.loadingCard, { backgroundColor: theme.surfaceHighest, marginTop: 20 }]}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingTitle, { color: theme.primary }]}>Der Scholar denkt nach…</Text>
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              {aiContext
                ? (aiContext.bookName
                    ? `Suche ähnliche Bücher zu "${aiContext.bookName}"`
                    : `Suche Bücher zu: ${aiContext.tags.join(', ')}`)
                : 'Deine Bibliothek wird analysiert.'}
            </Text>
          </View>
        )}

        {!aiLoading && aiRecommendations.length > 0 && (
          <View style={[styles.cardList, { marginTop: 20 }]}>
            {aiRecommendations.map((rec, i) => renderAiCard(rec, i))}
          </View>
        )}

        {!aiLoading && (
          <TouchableOpacity
            style={[styles.regenerateBtn, { borderColor: theme.primary }]}
            onPress={() => loadAiRecommendationsFor(aiContext)}
          >
            <Ionicons name="sparkles" size={16} color={theme.primary} />
            <Text style={[styles.regenerateBtnText, { color: theme.primary }]}>
              {aiContext
                ? 'Neue Empfehlungen generieren'
                : 'Neue allgemeine Empfehlungen'}
            </Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  const renderSearchSheet = () => (
    <Modal
      visible={sheetVisible}
      transparent
      animationType="slide"
      onRequestClose={closeSearchSheet}
    >
      <Pressable style={styles.sheetBackdrop} onPress={closeSearchSheet}>
        <Pressable style={[styles.sheetCard, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.primary }]}>Empfehlungen anpassen</Text>

            <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>BUCH (OPTIONAL)</Text>
            <TextInput
              style={[styles.sheetInput, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
              placeholder="z.B. Der Hobbit"
              placeholderTextColor={theme.textSecondary}
              value={sheetBookName}
              onChangeText={setSheetBookName}
              returnKeyType="done"
              maxLength={120}
            />

            <Text style={[styles.sheetLabel, { color: theme.textSecondary, marginTop: 20 }]}>THEMEN</Text>
            {allTags.length === 0 ? (
              <Text style={[styles.sheetHint, { color: theme.textSecondary }]}>
                Du hast noch keine Tags in deiner Bibliothek.
              </Text>
            ) : (
              <View style={styles.sheetTagWrap}>
                {allTags.map(tag => {
                  const active = sheetTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagChip, {
                        backgroundColor: active ? theme.primary : theme.surface,
                        borderColor: active ? theme.primary : theme.border,
                      }]}
                      onPress={() => toggleSheetTag(tag)}
                    >
                      <Text style={[styles.tagChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[styles.sheetGenerateBtn, { backgroundColor: theme.primary }]}
              onPress={submitSearch}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={styles.sheetGenerateBtnText}>Empfehlungen generieren</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <OfflineBanner />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Empfehlungen</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => activeTab === 'ai' ? loadAiRecommendationsFor(aiContext) : fetchData()}
          disabled={aiLoading || dataLoading}
        >
          <Ionicons
            name="refresh"
            size={22}
            color={(aiLoading || dataLoading) ? theme.textSecondary : theme.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.headline, { color: theme.primary }]}>
          My<Text style={{ fontFamily: 'Newsreader_400Regular_Italic' }}> Recommendations</Text>
        </Text>
        <Text style={[styles.subline, { color: theme.textSecondary }]}>
          {aiEnabled
            ? 'Aus deiner Bibliothek oder kuratiert vom Scholar'
            : 'Aus deiner Bibliothek · ungelesene Bücher & Wunschliste'}
        </Text>

        {aiEnabled && (
          <View style={[styles.tabBar, { backgroundColor: theme.surface }]}>
            {(['library', 'ai'] as ActiveTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && { backgroundColor: theme.primary }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? '#fff' : theme.textSecondary }]}>
                  {tab === 'library' ? 'Meine Bücher' : 'KI-Empfehlungen'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'library' && renderLibraryFilterChips()}

        {activeTab === 'library' ? renderLibraryTab() : renderAiTab()}
      </ScrollView>

      {renderSearchSheet()}
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
  headerBtn: { padding: 4, width: 40 },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  headline: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 36,
    marginBottom: 6,
  },
  subline: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },

  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },

  tagSection: { marginBottom: 24 },
  tagSectionLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  tagScroll: { marginHorizontal: -4 },
  tagScrollContent: { paddingHorizontal: 4, gap: 8 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagChipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },

  sectionHeader: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  cardList: { gap: 12 },

  recCard: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  indexText: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  recContent: { flex: 1, gap: 4 },
  recTitle: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 20,
    lineHeight: 26,
  },
  recAuthor: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  recReason: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  libCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  coverWrap: {
    width: 52,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
  },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  libCardContent: { flex: 1, gap: 4 },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  sourceBadgeText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  miniTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniTagText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
  },

  loadingCard: {
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  loadingTitle: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 22,
    marginTop: 8,
  },
  loadingText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 22,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  regenerateBtnText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },

  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchBtnText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },

  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  contextBannerText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    elevation: 20,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 26,
    marginBottom: 20,
  },
  sheetLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  sheetInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
    padding: 14,
    borderRadius: 12,
  },
  sheetHint: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    marginTop: 4,
  },
  sheetTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    maxHeight: 200,
  },
  sheetGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  sheetGenerateBtnText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#fff',
  },
});
