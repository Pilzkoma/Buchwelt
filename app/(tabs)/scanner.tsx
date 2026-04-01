import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import { hasGeminiKey, analyzeBookCover } from '@/utils/gemini';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { BookInput } from '@/types';

const MAX_TITLE_LENGTH = 255;
const MAX_AUTHOR_LENGTH = 255;

export default function ScannerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [scanMode, setScanMode] = useState<'ISBN' | 'Cover'>('ISBN');
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedMenuOpen, setScannedMenuOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const scanLock = useRef(false);
  const cameraRef = useRef<CameraView>(null);

  const [manualEntryIsbn, setManualEntryIsbn] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  useFocusEffect(
    useCallback(() => {
      hasGeminiKey().then(setAiEnabled);
    }, [])
  );

  // ─── Book Lookup ─────────────────────────────────────────────────────────────

  const fetchBookByISBN = async (rawIsbn: string): Promise<BookInput | null> => {
    const isbn = rawIsbn.replace(/[^0-9X]/gi, '');
    try {
      // 1. Google Books
      const googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const googleData = await googleRes.json();
      if (googleData.items?.length > 0) {
        const info = googleData.items[0].volumeInfo;
        return {
          title: info.title || 'Unbekannter Titel',
          author: info.authors?.join(', ') || 'Unbekannt',
          description: info.description || null,
          cover_url: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
          isbn,
          total_pages: info.pageCount ?? null,
        };
      }

      // 2. Lobid (Deutsche Nationalbibliothek)
      const lobidRes = await fetch(`https://lobid.org/resources/search?q=isbn:${isbn}&format=json`);
      const lobidData = await lobidRes.json();
      if (lobidData.member?.length > 0) {
        const info = lobidData.member[0];
        const author = info.contribution?.[0]?.agent?.label || 'Unbekannt';
        return { title: info.title || 'Unbekannter Titel', author, description: null, cover_url: null, isbn };
      }

      // 3. Open Library
      const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const olData = await olRes.json();
      const bookKey = `ISBN:${isbn}`;
      if (olData[bookKey]) {
        const info = olData[bookKey];
        return {
          title: info.title || 'Unbekannter Titel',
          author: info.authors?.map((a: any) => a.name).join(', ') || 'Unbekannt',
          description: null,
          cover_url: info.cover?.medium || info.cover?.small || null,
          isbn,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const checkBookExists = async (isbn: string) => {
    const [libRes, wishRes] = await Promise.all([
      supabase.from('books').select('id').eq('isbn', isbn).maybeSingle(),
      supabase.from('wishlists').select('id').eq('isbn', isbn).maybeSingle(),
    ]);
    return {
      inLibrary: !!libRes.data,
      inWishlist: !!wishRes.data,
      wishlistId: wishRes.data?.id ?? null,
    };
  };

  const resetScanner = () => {
    setScannedMenuOpen(false);
    setManualEntryIsbn(null);
    setTimeout(() => { scanLock.current = false; }, 1500);
  };

  // ─── Destination Alert ───────────────────────────────────────────────────────

  const showDestinationAlert = (bookData: BookInput) => {
    Alert.alert(
      'Buch gefunden!',
      `${bookData.title}\nvon ${bookData.author}\n\nWohin soll es?`,
      [
        { text: 'Abbrechen', style: 'cancel', onPress: resetScanner },
        { text: 'Wunschliste', onPress: () => saveToWishlist(bookData) },
        { text: 'Library', style: 'default', onPress: () => saveBookToLibrary(bookData) },
      ]
    );
  };

  // ─── Barcode Scan ────────────────────────────────────────────────────────────

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanLock.current || scanMode !== 'ISBN') return;
    scanLock.current = true;
    setIsProcessing(true);

    const bookData = await fetchBookByISBN(data);
    setIsProcessing(false);
    setScannedMenuOpen(true);

    if (bookData) {
      const { inLibrary, inWishlist, wishlistId } = await checkBookExists(bookData.isbn ?? data);
      if (inLibrary) {
        Alert.alert('Bereits in deiner Library', `"${bookData.title}" ist schon in deiner Sammlung.`, [{ text: 'OK', onPress: resetScanner }]);
      } else if (inWishlist) {
        Alert.alert(
          'Auf der Wunschliste',
          `"${bookData.title}" steht auf deiner Wunschliste.\n\nJetzt gekauft? Zur Library verschieben?`,
          [
            { text: 'Abbrechen', style: 'cancel', onPress: resetScanner },
            { text: 'Zur Library', style: 'default', onPress: () => moveWishlistToLibrary(wishlistId!, bookData) },
          ]
        );
      } else {
        showDestinationAlert(bookData);
      }
    } else {
      Alert.alert(
        'Kein Eintrag gefunden',
        `Keine Buchdaten für ISBN: ${data}\n\nMöchtest du das Buch manuell eintragen?`,
        [
          { text: 'Abbrechen', style: 'cancel', onPress: resetScanner },
          { text: 'Manuell eingeben', onPress: () => setManualEntryIsbn(data) },
        ]
      );
    }
  };

  // ─── Cover Scan ──────────────────────────────────────────────────────────────

  const handleCoverCapture = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);
    setScannedMenuOpen(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error('Kein Foto aufgenommen.');
      const result = await analyzeBookCover(photo.base64);
      const bookData: BookInput = { title: result.title, author: result.author, description: null, cover_url: null, isbn: null };
      setIsProcessing(false);
      showDestinationAlert(bookData);
    } catch (e: any) {
      setIsProcessing(false);
      Alert.alert('Cover-Scan Fehler', e.message, [{ text: 'OK', onPress: resetScanner }]);
    }
  };

  // ─── DB Operations ───────────────────────────────────────────────────────────

  const saveBookToLibrary = async (bookData: BookInput) => {
    setIsProcessing(true);
    const { error } = await supabase.from('books').insert([bookData]);
    setIsProcessing(false);
    if (error) Alert.alert('Fehler', error.message);
    else Alert.alert('Zur Library hinzugefügt', bookData.title);
    resetScanner();
  };

  const saveToWishlist = async (bookData: BookInput) => {
    setIsProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('wishlists').insert([{ ...bookData, user_id: user?.id }]);
    setIsProcessing(false);
    if (error) Alert.alert('Fehler', error.message);
    else Alert.alert('Zur Wunschliste hinzugefügt', bookData.title);
    resetScanner();
  };

  const moveWishlistToLibrary = async (wishlistId: string, bookData: BookInput) => {
    setIsProcessing(true);
    const { error: insertErr } = await supabase.from('books').insert([bookData]);
    if (insertErr) {
      Alert.alert('Fehler', insertErr.message);
      setIsProcessing(false);
      resetScanner();
      return;
    }
    const { error: deleteErr } = await supabase.from('wishlists').delete().eq('id', wishlistId);
    setIsProcessing(false);
    if (deleteErr) {
      Alert.alert('Teilweise erfolgreich', 'Zur Library hinzugefügt, aber nicht von Wunschliste entfernt. Bitte manuell löschen.');
    } else {
      Alert.alert('In Library verschoben!', bookData.title);
    }
    resetScanner();
  };

  // ─── Manual Entry Save ───────────────────────────────────────────────────────

  const submitManualEntry = async (destination: 'library' | 'wishlist') => {
    const title = manualTitle.trim();
    const author = manualAuthor.trim();

    if (!title) {
      Alert.alert('Fehlende Angaben', 'Bitte mindestens einen Titel eingeben.');
      return;
    }
    if (title.length > MAX_TITLE_LENGTH || author.length > MAX_AUTHOR_LENGTH) {
      Alert.alert('Eingabe zu lang', 'Titel oder Autor überschreitet die maximale Länge.');
      return;
    }

    const isbn = manualEntryIsbn;
    setManualEntryIsbn(null);
    const bookData: BookInput = { title, author: author || 'Unbekannt', isbn, description: null, cover_url: null };

    setManualTitle('');
    setManualAuthor('');

    if (destination === 'library') await saveBookToLibrary(bookData);
    else await saveToWishlist(bookData);
  };

  // ─── Permission Guard ────────────────────────────────────────────────────────

  if (!permission || !permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#fff', marginBottom: 20 }}>Kamerazugriff erforderlich.</Text>
        <TouchableOpacity style={{ backgroundColor: theme.primary, padding: 12, borderRadius: 12 }} onPress={requestPermission}>
          <Text style={{ color: '#fff' }}>Zugriff erlauben</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
      <OfflineBanner />
      <View style={styles.topNav}>
        <Text style={[styles.navTitle, { color: '#FFF' }]}>BuchWelt Scanner</Text>
      </View>

      <View style={styles.cameraFrame}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scannedMenuOpen || scanMode !== 'ISBN' ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
        />

        {manualEntryIsbn ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)', padding: 24, justifyContent: 'center' }]}>
            <View style={[styles.manualForm, { backgroundColor: theme.surface }]}>
              <Text style={[styles.instructionTitle, { color: theme.primary, fontSize: 24, marginBottom: 16 }]}>Manuell eingeben</Text>
              <Text style={{ fontFamily: 'Manrope_500Medium', color: theme.textSecondary, marginBottom: 24 }}>
                Kein Eintrag für ISBN {manualEntryIsbn}. Buchdaten manuell eintragen.
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
                placeholder="Titel"
                placeholderTextColor={theme.textSecondary}
                value={manualTitle}
                onChangeText={setManualTitle}
                maxLength={MAX_TITLE_LENGTH}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceHighest, color: theme.text }]}
                placeholder="Autor"
                placeholderTextColor={theme.textSecondary}
                value={manualAuthor}
                onChangeText={setManualAuthor}
                maxLength={MAX_AUTHOR_LENGTH}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.borderDark, alignItems: 'center' }}
                  onPress={resetScanner}
                >
                  <Text style={{ color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 13 }}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.primary, alignItems: 'center' }}
                  onPress={() => submitManualEntry('wishlist')}
                >
                  <Text style={{ color: theme.primary, fontFamily: 'Manrope_700Bold', fontSize: 13 }}>Wunschliste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' }}
                  onPress={() => submitManualEntry('library')}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13 }}>Library</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.overlay, isProcessing && { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            {isProcessing ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <View style={[styles.viewportFrame, scanMode === 'Cover' && { aspectRatio: 2 / 3 }]} />
            )}

            {scanMode === 'Cover' && !isProcessing && (
              <TouchableOpacity style={styles.shutterBtn} onPress={handleCoverCapture}>
                <Ionicons name="camera" size={28} color="#fff" />
              </TouchableOpacity>
            )}

            {aiEnabled && (
              <View style={styles.modeSelector}>
                <TouchableOpacity onPress={() => setScanMode('Cover')}>
                  <Text style={[styles.modeText, { opacity: scanMode === 'Cover' ? 1 : 0.5 }]}>COVER</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setScanMode('ISBN')}>
                  <Text style={[styles.modeText, { opacity: scanMode === 'ISBN' ? 1 : 0.5 }]}>ISBN</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <View style={styles.shutterRow}>
          <View style={styles.instructionBlock}>
            <Text style={[styles.instructionTitle, { color: theme.primary }]}>
              {scanMode === 'ISBN' ? 'ISBN scannen' : 'Cover scannen'}
            </Text>
            <Text style={[styles.instructionSub, { color: theme.textSecondary }]}>
              {scanMode === 'ISBN'
                ? 'Barcode in den Rahmen halten'
                : 'Cover ausrichten und Kamera-Button drücken'}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: { position: 'absolute', top: 50, width: '100%', zIndex: 50, alignItems: 'center' },
  navTitle: { fontFamily: 'Newsreader_400Regular_Italic', fontSize: 20, letterSpacing: -0.5 },
  cameraFrame: { flex: 1, position: 'relative', backgroundColor: '#111' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  manualForm: { padding: 24, borderRadius: 24, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.1, shadowRadius: 30 },
  input: { fontFamily: 'Manrope_500Medium', fontSize: 16, padding: 16, borderRadius: 12, marginBottom: 16 },
  viewportFrame: { width: '100%', maxWidth: 320, aspectRatio: 1, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed' },
  shutterBtn: { marginTop: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  modeSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginTop: 24 },
  modeText: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 2, color: '#FFF', paddingHorizontal: 16, paddingVertical: 8 },
  bottomBar: { position: 'absolute', bottom: 0, width: '100%', paddingBottom: 110, paddingTop: 32, paddingHorizontal: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 30 },
  shutterRow: { width: '100%', alignItems: 'center' },
  instructionBlock: { alignItems: 'center', width: '100%' },
  instructionTitle: { fontFamily: 'Newsreader_400Regular', fontSize: 28, marginBottom: 4 },
  instructionSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, textAlign: 'center' },
});
