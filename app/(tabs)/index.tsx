import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { Book } from '@/types';

const STATUS_FILTERS = [
  { label: 'Alle',          value: 'all' },
  { label: 'Am Lesen',      value: 'reading' },
  { label: 'Gelesen',       value: 'finished' },
  { label: 'Abgebrochen',   value: 'abandoned' },
  { label: 'Nicht gelesen', value: 'not_read' },
];

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    fetchBooks();
    const subscription = supabase
      .channel('books_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, () => fetchBooks())
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, cover_url, reading_status, is_read, tags, current_page, total_pages, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBooks((data ?? []) as Book[]);
    } catch (error) {
      console.warn('Bücher konnten nicht geladen werden:', error);
    } finally {
      setLoading(false);
    }
  };

  // All unique tags – memoized so it only recalculates when books change
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    books.forEach(b => (b.tags ?? []).forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [books]);

  // Filtered books – memoized for performance
  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!book.title?.toLowerCase().includes(q) && !book.author?.toLowerCase().includes(q)) return false;
      }
      if (activeStatus !== 'all') {
        const status = book.reading_status ?? (book.is_read ? 'finished' : 'not_read');
        if (status !== activeStatus) return false;
      }
      if (activeTag && !(book.tags ?? []).includes(activeTag)) return false;
      return true;
    });
  }, [books, searchQuery, activeStatus, activeTag]);

  const renderBook = useCallback(({ item }: { item: Book }) => {
    const cur = item.current_page ?? 0;
    const tot = item.total_pages ?? 0;
    const hasProgress = item.reading_status === 'reading' && cur > 0 && tot > 0;
    const progressPct = hasProgress ? Math.min(Math.round((cur / tot) * 100), 100) : 0;

    return (
      <TouchableOpacity style={styles.bookCard} onPress={() => router.push(`/book/${item.id}`)}>
        <View style={[styles.coverPlaceholder, { backgroundColor: theme.surfaceHighest }]}>
          {item.cover_url ? (
            <Image source={item.cover_url} style={styles.coverImage} transition={200} cachePolicy="disk" />
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 32 }}>📖</Text>
          )}
          {/* Reading progress bar overlay */}
          {hasProgress && (
            <View style={styles.progressOverlay}>
              <View style={[styles.progressOverlayFill, { width: `${progressPct}%`, backgroundColor: theme.primary }]} />
            </View>
          )}
        </View>
        <View style={styles.bookInfo}>
          <Text style={[styles.bookTitle, { color: theme.primary }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.bookAuthor, { color: theme.textSecondary }]} numberOfLines={1}>{item.author}</Text>
          {hasProgress && (
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>{progressPct}%</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [theme, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      <View style={styles.topNav}>
        <Text style={[styles.navTitle, { color: theme.primary }]}>BuchWelt</Text>
        <TouchableOpacity
          style={[styles.sparklesBtn, { backgroundColor: theme.surfaceHighest }]}
          onPress={() => router.push('/recommendations')}
        >
          <Ionicons name="sparkles" size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredBooks}
        keyExtractor={(i) => i.id}
        renderItem={renderBook}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.scrollContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {loading ? 'Wird geladen…' : 'Keine Bücher gefunden. Scanne dein erstes Buch!'}
            </Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <Text style={[styles.headline, { color: theme.primary }]}>
              My<Text style={{ fontFamily: 'Newsreader_400Regular_Italic' }}> Collection</Text>
            </Text>

            {/* Search */}
            <View style={[styles.searchBox, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text }]}>
              <Text style={{ fontSize: 20, color: theme.borderDark, marginRight: 8 }}>🔍</Text>
              <TextInput
                placeholder="Titel oder Autor suchen…"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Status filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={[styles.filterGroup, { backgroundColor: theme.surface }]}>
                {STATUS_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    onPress={() => setActiveStatus(f.value)}
                    style={[styles.filterPill, { backgroundColor: activeStatus === f.value ? theme.primary : 'transparent' }]}
                  >
                    <Text style={[styles.filterPillText, { color: activeStatus === f.value ? '#fff' : theme.textSecondary }]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagFilterScroll}>
                <View style={styles.tagFilterRow}>
                  <TouchableOpacity
                    onPress={() => setActiveTag(null)}
                    style={[styles.tagFilterChip, { backgroundColor: activeTag === null ? theme.primary : theme.surfaceHighest }]}
                  >
                    <Text style={[styles.tagFilterText, { color: activeTag === null ? '#fff' : theme.textSecondary }]}>Alle Tags</Text>
                  </TouchableOpacity>
                  {allTags.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => setActiveTag(activeTag === tag ? null : tag)}
                      style={[styles.tagFilterChip, { backgroundColor: activeTag === tag ? theme.primary : theme.surfaceHighest }]}
                    >
                      <Text style={[styles.tagFilterText, { color: activeTag === tag ? '#fff' : theme.textSecondary }]}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
  navTitle: { fontFamily: 'Newsreader_400Regular_Italic', fontSize: 24, letterSpacing: -0.5 },
  sparklesBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 100 },
  headerSection: { marginBottom: 32 },
  headline: { fontFamily: 'Newsreader_400Regular', fontSize: 48, marginBottom: 24 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 16, elevation: 4, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.04, shadowRadius: 20 },
  searchInput: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 16 },
  filterScroll: { marginBottom: 12 },
  filterGroup: { flexDirection: 'row', alignSelf: 'flex-start', padding: 6, borderRadius: 999 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  filterPillText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  tagFilterScroll: { marginBottom: 8 },
  tagFilterRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tagFilterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  tagFilterText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  gridRow: { justifyContent: 'space-between' },
  bookCard: { width: '47%', marginBottom: 32 },
  coverPlaceholder: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, elevation: 3, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, overflow: 'hidden' },
  progressOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.2)' },
  progressOverlayFill: { height: '100%', borderBottomLeftRadius: 12 },
  bookInfo: { paddingLeft: 4 },
  bookTitle: { fontFamily: 'Newsreader_700Bold', fontSize: 18, lineHeight: 22, marginBottom: 4 },
  bookAuthor: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  progressText: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  emptyState: { paddingTop: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  coverImage: { width: '100%', height: '100%', borderRadius: 12 },
});
