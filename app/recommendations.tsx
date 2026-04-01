import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import { getBookRecommendations, hasGeminiKey, type BookRecommendation } from '@/utils/gemini';
import { OfflineBanner } from '@/components/OfflineBanner';

export default function RecommendationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [recommendations, setRecommendations] = useState<BookRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    hasGeminiKey().then(enabled => {
      setAiEnabled(enabled);
      if (enabled) loadRecommendations();
      else setHasLoaded(true);
    });
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);
    setHasLoaded(false);
    try {
      // Fetch finished books + all tags for context
      const { data: books } = await supabase
        .from('books')
        .select('title, author, ranking, tags, reading_status')
        .eq('reading_status', 'finished');

      const allBooks = books ?? [];

      // Build top-tags list across the entire library (not just finished)
      const { data: allLibrary } = await supabase
        .from('books')
        .select('tags');
      const tagCounts: Record<string, number> = {};
      (allLibrary ?? []).forEach(b =>
        (b.tags ?? []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; })
      );
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      const results = await getBookRecommendations(allBooks, topTags);
      setRecommendations(results);
    } catch (e: any) {
      Alert.alert('KI-Fehler', e.message);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  const addToWishlist = async (rec: BookRecommendation) => {
    const key = `${rec.title}::${rec.author}`;
    setAddingId(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('wishlists').insert([{
        title: rec.title,
        author: rec.author,
        description: rec.reason,
        user_id: user?.id,
      }]);
      if (error) throw error;
      Alert.alert('Zur Wunschliste hinzugefügt', `"${rec.title}" wartet auf dich.`);
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setAddingId(null);
    }
  };

  const addToLibrary = async (rec: BookRecommendation) => {
    const key = `${rec.title}::${rec.author}`;
    setAddingId(key + '_lib');
    try {
      const { error } = await supabase.from('books').insert([{
        title: rec.title,
        author: rec.author,
        description: rec.reason,
      }]);
      if (error) throw error;
      Alert.alert('Zur Library hinzugefügt', `"${rec.title}" ist jetzt in deiner Sammlung.`);
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    } finally {
      setAddingId(null);
    }
  };

  const handleAddPress = (rec: BookRecommendation) => {
    Alert.alert(
      rec.title,
      `von ${rec.author}\n\nWohin soll das Buch?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Wunschliste', onPress: () => addToWishlist(rec) },
        { text: 'Library', style: 'default', onPress: () => addToLibrary(rec) },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <OfflineBanner />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Empfehlungen</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={loadRecommendations}
          disabled={loading || !aiEnabled}
        >
          <Ionicons
            name="refresh"
            size={22}
            color={aiEnabled ? theme.primary : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Headline */}
        <Text style={[styles.headline, { color: theme.primary }]}>
          My<Text style={{ fontFamily: 'Newsreader_400Regular_Italic' }}> Recommendations</Text>
        </Text>
        <Text style={[styles.subline, { color: theme.textSecondary }]}>
          Kuratiert vom Scholar auf Basis deiner Bibliothek
        </Text>

        {/* No AI Key State */}
        {!aiEnabled && hasLoaded && (
          <View style={[styles.emptyCard, { backgroundColor: theme.surfaceHighest }]}>
            <Ionicons name="sparkles-outline" size={36} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.primary }]}>
              KI-Key erforderlich
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Hinterlege deinen Google Gemini API-Key in den Einstellungen, um personalisierte Buchempfehlungen zu erhalten.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Text style={[styles.emptyButtonText, { color: '#fff' }]}>Zu den Einstellungen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <View style={[styles.loadingCard, { backgroundColor: theme.surfaceHighest }]}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingTitle, { color: theme.primary }]}>
                Der Scholar denkt nach…
              </Text>
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Deine Bibliothek wird analysiert und passende Bücher gesucht.
              </Text>
            </View>
          </View>
        )}

        {/* Recommendation Cards */}
        {!loading && recommendations.length > 0 && (
          <View style={styles.cardList}>
            {recommendations.map((rec, index) => {
              const key = `${rec.title}::${rec.author}`;
              const isAdding = addingId === key || addingId === key + '_lib';
              return (
                <View
                  key={index}
                  style={[styles.recCard, { backgroundColor: theme.surfaceHighest }]}
                >
                  {/* Index badge */}
                  <View style={[styles.indexBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.indexText}>{index + 1}</Text>
                  </View>

                  {/* Content */}
                  <View style={styles.recContent}>
                    <Text style={[styles.recTitle, { color: theme.primary }]} numberOfLines={2}>
                      {rec.title}
                    </Text>
                    <Text style={[styles.recAuthor, { color: theme.textSecondary }]}>
                      {rec.author.toUpperCase()}
                    </Text>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <Text style={[styles.recReason, { color: theme.text }]}>
                      {rec.reason}
                    </Text>
                  </View>

                  {/* Add Button */}
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: theme.primary }]}
                    onPress={() => handleAddPress(rec)}
                    disabled={isAdding}
                  >
                    {isAdding
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="add" size={22} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Regenerate Button */}
        {!loading && recommendations.length > 0 && aiEnabled && (
          <TouchableOpacity
            style={[styles.regenerateBtn, { borderColor: theme.primary }]}
            onPress={loadRecommendations}
          >
            <Ionicons name="sparkles" size={16} color={theme.primary} />
            <Text style={[styles.regenerateBtnText, { color: theme.primary }]}>
              Neue Empfehlungen generieren
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>
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
    fontSize: 48,
    marginBottom: 6,
  },
  subline: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    marginBottom: 32,
    lineHeight: 20,
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
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  loadingContainer: {
    paddingTop: 20,
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
  cardList: {
    gap: 16,
  },
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
  recContent: {
    flex: 1,
    gap: 4,
  },
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
  addBtn: {
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
    fontSize: 14,
  },
});
