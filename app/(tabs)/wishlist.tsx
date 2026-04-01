import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/utils/supabase';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { WishlistItem } from '@/types';

const MAX_TITLE_LENGTH = 255;
const MAX_AUTHOR_LENGTH = 255;

export default function WishlistScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addAuthor, setAddAuthor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useFocusEffect(
    useCallback(() => { fetchWishlist(); }, [])
  );

  const fetchWishlist = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wishlists')
        .select('*')
        .order('added_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as WishlistItem[]);
    } catch (e: any) {
      Alert.alert('Fehler', 'Wunschliste konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  const moveToLibrary = (item: WishlistItem) => {
    Alert.alert(
      'Zur Library hinzufügen?',
      `"${item.title}" wurde gekauft und soll in die Library verschoben werden?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Verschieben', style: 'default', onPress: () => confirmMove(item) },
      ]
    );
  };

  const confirmMove = async (item: WishlistItem) => {
    const { error: insertError } = await supabase.from('books').insert([{
      title: item.title,
      author: item.author,
      isbn: item.isbn ?? null,
      cover_url: item.cover_url ?? null,
      description: item.description ?? null,
    }]);

    if (insertError) {
      Alert.alert('Fehler beim Hinzufügen', insertError.message);
      return;
    }

    const { error: deleteError } = await supabase.from('wishlists').delete().eq('id', item.id);
    if (deleteError) {
      // Book was added to library but delete failed – inform user, don't update UI as if it's gone
      Alert.alert(
        'Teilweise erfolgreich',
        'Das Buch wurde zur Library hinzugefügt, konnte aber nicht von der Wunschliste entfernt werden. Bitte manuell löschen.'
      );
      return;
    }

    setItems(prev => prev.filter(i => i.id !== item.id));
    Alert.alert('In Library verschoben!', item.title);
  };

  const deleteFromWishlist = (item: WishlistItem) => {
    Alert.alert(
      'Von Wunschliste entfernen?',
      `"${item.title}" von der Wunschliste löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('wishlists').delete().eq('id', item.id);
            if (error) {
              Alert.alert('Fehler', error.message);
            } else {
              setItems(prev => prev.filter(i => i.id !== item.id));
            }
          },
        },
      ]
    );
  };

  const saveManualEntry = async () => {
    const title = addTitle.trim();
    const author = addAuthor.trim();

    if (!title) {
      Alert.alert('Fehlende Angaben', 'Bitte mindestens einen Titel eingeben.');
      return;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      Alert.alert('Titel zu lang', `Maximal ${MAX_TITLE_LENGTH} Zeichen.`);
      return;
    }
    if (author.length > MAX_AUTHOR_LENGTH) {
      Alert.alert('Autor zu lang', `Maximal ${MAX_AUTHOR_LENGTH} Zeichen.`);
      return;
    }

    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('wishlists').insert([{
      title,
      author: author || 'Unbekannt',
      user_id: user?.id,
    }]);
    setIsSaving(false);

    if (error) {
      Alert.alert('Fehler', error.message);
    } else {
      setAddTitle('');
      setAddAuthor('');
      setShowAddModal(false);
      fetchWishlist();
    }
  };

  const renderItem = ({ item }: { item: WishlistItem }) => (
    <TouchableOpacity
      style={styles.bookCard}
      onLongPress={() => deleteFromWishlist(item)}
      delayLongPress={600}
    >
      <View style={[styles.coverPlaceholder, { backgroundColor: theme.surfaceHighest }]}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={styles.coverImage} />
        ) : (
          <Text style={{ color: theme.textSecondary, fontSize: 32 }}>📖</Text>
        )}
        <TouchableOpacity
          style={[styles.moveBtn, { backgroundColor: theme.primary }]}
          onPress={() => moveToLibrary(item)}
        >
          <IconSymbol size={14} name="arrow.right" color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.bookInfo}>
        <Text style={[styles.bookTitle, { color: theme.primary }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.bookAuthor, { color: theme.textSecondary }]} numberOfLines={1}>{item.author}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      <View style={styles.topNav}>
        <Text style={[styles.navTitle, { color: theme.primary }]}>BuchWelt</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.scrollContent}
        refreshing={loading}
        onRefresh={fetchWishlist}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <Text style={[styles.headline, { color: theme.primary }]}>
              My<Text style={{ fontFamily: 'Newsreader_400Regular_Italic' }}> Wishlist</Text>
            </Text>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Lang drücken zum Löschen · Pfeil-Button → Library
            </Text>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Deine Wunschliste ist leer.{'\n'}Scanne ein Buch oder tippe auf +.
              </Text>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => setShowAddModal(true)}
      >
        <IconSymbol size={28} name="plus" color="#fff" />
      </TouchableOpacity>

      {/* Manual Add Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.primary }]}>Manuell hinzufügen</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Buch ohne ISBN direkt zur Wunschliste hinzufügen.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
              placeholder="Titel"
              placeholderTextColor={theme.textSecondary}
              value={addTitle}
              onChangeText={setAddTitle}
              maxLength={MAX_TITLE_LENGTH}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
              placeholder="Autor"
              placeholderTextColor={theme.textSecondary}
              value={addAuthor}
              onChangeText={setAddAuthor}
              maxLength={MAX_AUTHOR_LENGTH}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderWidth: 1, borderColor: theme.borderDark }]}
                onPress={() => { setAddTitle(''); setAddAuthor(''); setShowAddModal(false); }}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={saveManualEntry}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Speichern</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 },
  navTitle: { fontFamily: 'Newsreader_400Regular_Italic', fontSize: 24, letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 120 },
  headerSection: { marginBottom: 32 },
  headline: { fontFamily: 'Newsreader_400Regular', fontSize: 48, marginBottom: 8 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 13, marginBottom: 8 },
  gridRow: { justifyContent: 'space-between' },
  bookCard: { width: '47%', marginBottom: 32 },
  coverPlaceholder: { width: '100%', aspectRatio: 2 / 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden', elevation: 3, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20 },
  coverImage: { width: '100%', height: '100%', borderRadius: 12 },
  moveBtn: { position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  bookInfo: { paddingLeft: 4 },
  bookTitle: { fontFamily: 'Newsreader_700Bold', fontSize: 18, lineHeight: 22, marginBottom: 4 },
  bookAuthor: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  emptyState: { paddingTop: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 16, textAlign: 'center', lineHeight: 26 },
  fab: { position: 'absolute', bottom: 100, right: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48, elevation: 20, shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 30 },
  modalTitle: { fontFamily: 'Newsreader_400Regular', fontSize: 28, marginBottom: 8 },
  modalSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, marginBottom: 24 },
  input: { fontFamily: 'Manrope_500Medium', fontSize: 16, padding: 16, borderRadius: 12, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
});
