import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import type { Book } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isoWeekLabel = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `KW${week}`;
};

const monthLabel = (date: Date): string => {
  return date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
};

const startOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

type Period = 'weeks' | 'months';

interface BarData {
  label: string;
  count: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('months');

  useFocusEffect(
    useCallback(() => {
      fetchBooks();
    }, [])
  );

  const fetchBooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('books')
      .select('id, title, reading_status, finished_at, tags, created_at, current_page, total_pages');
    if (!error) setBooks((data || []) as Book[]);
    setLoading(false);
  };

  // ── Memoized derived data ──────────────────────────────────────────────────
  const { total, finished, reading, abandoned, datedBooks } = useMemo(() => {
    const total = books.length;
    const finished = books.filter(b => b.reading_status === 'finished').length;
    const reading = books.filter(b => b.reading_status === 'reading').length;
    const abandoned = books.filter(b => b.reading_status === 'abandoned').length;
    const datedBooks = books.filter(b => b.reading_status === 'finished' && b.finished_at);
    return { total, finished, reading, abandoned, datedBooks };
  }, [books]);

  const avgPerWeek = useMemo(() => {
    if (datedBooks.length === 0) return 0;
    const dates = datedBooks.map(b => new Date(b.finished_at!).getTime());
    const earliest = new Date(Math.min(...dates));
    const weeksElapsed = Math.max(1, Math.ceil((Date.now() - earliest.getTime()) / (7 * 86400000)));
    return (datedBooks.length / weeksElapsed).toFixed(1);
  }, [datedBooks]);

  const avgPerMonth = useMemo(() => {
    if (datedBooks.length === 0) return 0;
    const dates = datedBooks.map(b => new Date(b.finished_at!).getTime());
    const earliest = new Date(Math.min(...dates));
    const monthsElapsed = Math.max(1,
      (new Date().getFullYear() - earliest.getFullYear()) * 12 +
      new Date().getMonth() - earliest.getMonth() + 1
    );
    return (datedBooks.length / monthsElapsed).toFixed(1);
  }, [datedBooks]);

  const barData: BarData[] = useMemo(() => {
    const now = new Date();
    const buckets: Map<string, number> = new Map();

    if (period === 'weeks') {
      for (let i = 9; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const key = startOfWeek(d).toISOString();
        buckets.set(key, 0);
      }
      datedBooks.forEach(b => {
        const key = startOfWeek(new Date(b.finished_at!)).toISOString();
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      });
      return Array.from(buckets.entries()).map(([key, count]) => ({
        label: isoWeekLabel(new Date(key)),
        count,
      }));
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = startOfMonth(d).toISOString();
        buckets.set(key, 0);
      }
      datedBooks.forEach(b => {
        const key = startOfMonth(new Date(b.finished_at!)).toISOString();
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      });
      return Array.from(buckets.entries()).map(([key, count]) => ({
        label: monthLabel(new Date(key)),
        count,
      }));
    }
  }, [datedBooks, period]);

  const maxCount = useMemo(() => Math.max(...barData.map(b => b.count), 1), [barData]);

  const readingWithProgress = useMemo(() => books
    .filter(b => b.reading_status === 'reading' && b.current_page && b.total_pages && b.total_pages > 0)
    .map(b => ({
      id: b.id,
      title: b.title as string,
      pct: Math.min(Math.round(((b.current_page ?? 0) / (b.total_pages ?? 1)) * 100), 100),
      current_page: b.current_page as number,
      total_pages: b.total_pages as number,
    })), [books]);

  const topTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    books.forEach(b => (b.tags ?? []).forEach((t: string) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; }));
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [books]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.topNav}>
        <Text style={[styles.navTitle, { color: theme.primary }]}>BuchWelt</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Headline */}
        <Text style={[styles.headline, { color: theme.primary }]}>
          My<Text style={{ fontFamily: 'Newsreader_400Regular_Italic' }}> Stats</Text>
        </Text>

        {/* Overview Cards */}
        <View style={styles.overviewRow}>
          <StatCard label="Gesamt" value={total} color={theme.primary} bg={theme.surfaceHighest} />
          <StatCard label="Gelesen" value={finished} color={theme.primary} bg={theme.surfaceHighest} />
          <StatCard label="Am Lesen" value={reading} color={theme.primary} bg={theme.surfaceHighest} />
          <StatCard label="Abgebr." value={abandoned} color={theme.primary} bg={theme.surfaceHighest} />
        </View>

        {/* Averages */}
        {datedBooks.length > 0 && (
          <View style={[styles.avgRow, { backgroundColor: theme.surfaceHighest }]}>
            <View style={styles.avgItem}>
              <Text style={[styles.avgValue, { color: theme.primary }]}>{avgPerWeek}</Text>
              <Text style={[styles.avgLabel, { color: theme.textSecondary }]}>Ø pro Woche</Text>
            </View>
            <View style={[styles.avgDivider, { backgroundColor: theme.border }]} />
            <View style={styles.avgItem}>
              <Text style={[styles.avgValue, { color: theme.primary }]}>{avgPerMonth}</Text>
              <Text style={[styles.avgLabel, { color: theme.textSecondary }]}>Ø pro Monat</Text>
            </View>
          </View>
        )}

        {/* Currently Reading Progress */}
        {readingWithProgress.length > 0 && (
          <View style={styles.readingSection}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>Lese gerade</Text>
            <View style={styles.readingList}>
              {readingWithProgress.map((item) => (
                <View key={item.id} style={[styles.readingRow, { backgroundColor: theme.surfaceHighest }]}>
                  <View style={styles.readingInfo}>
                    <Text style={[styles.readingTitle, { color: theme.primary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.readingPages, { color: theme.textSecondary }]}>
                      Seite {item.current_page} von {item.total_pages}
                    </Text>
                  </View>
                  <View style={styles.readingProgressArea}>
                    <View style={[styles.readingTrack, { backgroundColor: theme.surface }]}>
                      <View style={[styles.readingFill, { width: `${item.pct}%`, backgroundColor: theme.primary }]} />
                    </View>
                    <Text style={[styles.readingPct, { color: theme.primary }]}>{item.pct}%</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Chart Section */}
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>Lesetrend</Text>
            {/* Period Toggle */}
            <View style={[styles.toggle, { backgroundColor: theme.surfaceHighest }]}>
              <TouchableOpacity
                style={[styles.toggleBtn, period === 'weeks' && { backgroundColor: theme.primary }]}
                onPress={() => setPeriod('weeks')}
              >
                <Text style={[styles.toggleText, { color: period === 'weeks' ? '#fff' : theme.textSecondary }]}>Wochen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, period === 'months' && { backgroundColor: theme.primary }]}
                onPress={() => setPeriod('months')}
              >
                <Text style={[styles.toggleText, { color: period === 'months' ? '#fff' : theme.textSecondary }]}>Monate</Text>
              </TouchableOpacity>
            </View>
          </View>

          {datedBooks.length === 0 ? (
            <View style={[styles.emptyChart, { backgroundColor: theme.surfaceHighest }]}>
              <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
                Markiere Bücher als „Gelesen" mit Datum um Trends zu sehen.
              </Text>
            </View>
          ) : (
            <View style={[styles.chartContainer, { backgroundColor: theme.surfaceHighest }]}>
              {/* Y-axis hint */}
              <Text style={[styles.yAxisLabel, { color: theme.textSecondary }]}>Bücher</Text>

              <View style={styles.barsArea}>
                {barData.map((bar, i) => {
                  const heightPct = bar.count / maxCount;
                  const isHighest = bar.count === maxCount && bar.count > 0;
                  return (
                    <View key={i} style={styles.barWrapper}>
                      {bar.count > 0 && (
                        <Text style={[styles.barValue, { color: theme.primary }]}>{bar.count}</Text>
                      )}
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: `${Math.max(heightPct * 100, bar.count > 0 ? 5 : 0)}%`,
                              backgroundColor: isHighest ? theme.primary : theme.primary + '66',
                              borderRadius: 4,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[styles.barLabel, { color: theme.textSecondary }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {bar.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Top Tags */}
        {topTags.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>Top Tags</Text>
            <View style={styles.tagsGrid}>
              {topTags.map(([tag, count]) => (
                <View key={tag} style={[styles.tagRow, { backgroundColor: theme.surfaceHighest }]}>
                  <Text style={[styles.tagName, { color: theme.primary }]}>{tag}</Text>
                  <View style={styles.tagBarWrapper}>
                    <View
                      style={[
                        styles.tagBar,
                        {
                          width: `${(count / (topTags[0][1])) * 100}%`,
                          backgroundColor: theme.primary + '55',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.tagCount, { color: theme.textSecondary }]}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Subcomponent ─────────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[statCardStyles.card, { backgroundColor: bg }]}>
      <Text style={[statCardStyles.value, { color }]}>{value}</Text>
      <Text style={[statCardStyles.label, { color: color + '99' }]}>{label}</Text>
    </View>
  );
}

const statCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  value: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 32,
    lineHeight: 36,
  },
  label: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 4,
  },
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  navTitle: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 24,
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  headline: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 48,
    marginBottom: 28,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  avgRow: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 32,
    overflow: 'hidden',
  },
  avgItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  avgDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  avgValue: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 40,
    lineHeight: 44,
  },
  avgLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    marginTop: 4,
  },
  readingSection: {
    marginBottom: 32,
  },
  readingList: {
    gap: 10,
    marginTop: 12,
  },
  readingRow: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  readingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  readingTitle: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  readingPages: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
  },
  readingProgressArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readingTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  readingFill: {
    height: '100%',
    borderRadius: 3,
  },
  readingPct: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  chartSection: {
    marginBottom: 32,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 26,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  toggleText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  emptyChart: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyChartText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  chartContainer: {
    borderRadius: 16,
    padding: 16,
    paddingTop: 20,
  },
  yAxisLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  barsArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 160,
    gap: 4,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    marginBottom: 2,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    minHeight: 2,
  },
  barLabel: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 9,
    marginTop: 6,
    textAlign: 'center',
    width: '100%',
  },
  tagsSection: {
    marginBottom: 16,
  },
  tagsGrid: {
    gap: 8,
    marginTop: 12,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  tagName: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    width: 90,
  },
  tagBarWrapper: {
    flex: 1,
    height: 6,
    backgroundColor: 'transparent',
    borderRadius: 3,
    overflow: 'hidden',
  },
  tagBar: {
    height: '100%',
    borderRadius: 3,
  },
  tagCount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    width: 20,
    textAlign: 'right',
  },
});
