import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import {
  getNotificationSettings,
  saveNotificationSettings,
  scheduleReadingReminder,
  cancelReadingReminder,
  requestNotificationPermission,
  INTERVAL_OPTIONS,
  DEFAULT_INTERVAL_DAYS,
} from '@/utils/notifications';

const API_KEY_STORAGE = 'gemini_api_key';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [apiKey, setApiKey] = useState('');
  const [keyIsSaved, setKeyIsSaved] = useState(false);

  // Notification settings
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifInterval, setNotifInterval] = useState(DEFAULT_INTERVAL_DAYS);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await SecureStore.getItemAsync(API_KEY_STORAGE);
      if (stored && stored.trim().length > 0) {
        setApiKey(stored);
        setKeyIsSaved(true);
      }
    } catch (e) {
      console.log('SecureStore unavailable. Using an emulated device?');
    }
    const notifSettings = await getNotificationSettings();
    setNotifEnabled(notifSettings.enabled);
    setNotifInterval(notifSettings.intervalDays);
  };

  const handleNotifToggle = async (value: boolean) => {
    setNotifEnabled(value);
    await saveNotificationSettings(value, notifInterval);
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Benachrichtigungen blockiert',
          'Bitte erlaube Benachrichtigungen in den Systemeinstellungen, um Lese-Erinnerungen zu erhalten.',
        );
        setNotifEnabled(false);
        await saveNotificationSettings(false, notifInterval);
        return;
      }
      await scheduleReadingReminder(notifInterval);
      Alert.alert('Erinnerungen aktiv', `Du wirst nach ${notifInterval} Tag${notifInterval === 1 ? '' : 'en'} ohne Leseaktivität erinnert.`);
    } else {
      await cancelReadingReminder();
    }
  };

  const handleIntervalChange = async (days: number) => {
    setNotifInterval(days);
    await saveNotificationSettings(notifEnabled, days);
    if (notifEnabled) {
      await scheduleReadingReminder(days);
    }
  };

  const saveSettings = async () => {
    try {
      await SecureStore.setItemAsync(API_KEY_STORAGE, apiKey);
      setKeyIsSaved(apiKey.trim().length > 0);
      Alert.alert('Gespeichert', 'Dein API-Key wurde sicher auf dem Gerät hinterlegt.');
    } catch (e) {
      Alert.alert('Fehler', 'SecureStore ist auf diesem Gerät nicht verfügbar.');
    }
  };

  const removeApiKey = () => {
    Alert.alert(
      'API-Schlüssel entfernen',
      'KI-Features (Empfehlungen, Zusammenfassungen, Cover-Scan) werden deaktiviert.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen', style: 'destructive', onPress: async () => {
            try {
              await SecureStore.deleteItemAsync(API_KEY_STORAGE);
              setApiKey('');
              setKeyIsSaved(false);
            } catch (e) {
              Alert.alert('Fehler', 'Schlüssel konnte nicht entfernt werden.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden', style: 'destructive', onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Fehler beim Abmelden', error.message);
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Konto unwiderruflich löschen',
      'Alle deine Bücher, Wunschlisten und Daten werden endgültig gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Endgültig löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error('Nicht angemeldet.');
              // Delete user data from tables
              await supabase.from('books').delete().eq('user_id', user.id);
              await supabase.from('wishlists').delete().eq('user_id', user.id);
              // Sign out (full account deletion requires server-side admin call)
              await supabase.auth.signOut();
              Alert.alert('Konto gelöscht', 'Deine Daten wurden entfernt. Das Konto wird beim nächsten Bereinigungslauf vollständig gelöscht.');
            } catch (e: any) {
              Alert.alert('Fehler', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.primary }]}>Configuration</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>BuchWelt Settings</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>AI Configuration</Text>

          {/* Key status badge */}
          <View style={[styles.statusBadge, {
            backgroundColor: keyIsSaved ? theme.surface : theme.surfaceHigh,
            borderColor: keyIsSaved ? theme.primary : theme.borderDark,
          }]}>
            <Ionicons
              name={keyIsSaved ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={keyIsSaved ? theme.primary : theme.textSecondary}
            />
            <Text style={[styles.statusText, { color: keyIsSaved ? theme.primary : theme.textSecondary }]}>
              {keyIsSaved ? 'API-Key hinterlegt – KI-Features aktiv' : 'Kein API-Key – KI-Features deaktiviert'}
            </Text>
          </View>

          {!keyIsSaved && (
            <View style={[styles.hintBox, { backgroundColor: theme.surface }]}>
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                Mit einem Google Gemini API-Key schaltest du folgende Features frei:
              </Text>
              <Text style={[styles.hintItem, { color: theme.textSecondary }]}>· KI-Zusammenfassung im Buchdetail</Text>
              <Text style={[styles.hintItem, { color: theme.textSecondary }]}>· "Ask The Scholar" Chat</Text>
              <Text style={[styles.hintItem, { color: theme.textSecondary }]}>· Cover-Scan (Buch per Kamera erkennen)</Text>
            </View>
          )}

          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Gib deinen Google Gemini API-Key ein. Er wird verschlüsselt auf deinem Gerät gespeichert.
          </Text>

          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
            placeholder="Gemini API Key"
            placeholderTextColor={theme.tabIconDefault}
            value={apiKey}
            onChangeText={(v) => { setApiKey(v); setKeyIsSaved(false); }}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.primary }]}
            onPress={saveSettings}
          >
            <Text style={[styles.saveButtonText, { color: '#ffffff' }]}>Key speichern</Text>
          </TouchableOpacity>

          {keyIsSaved && (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: 'transparent', marginTop: 10 }]}
              onPress={removeApiKey}
            >
              <Text style={[styles.saveButtonText, { color: theme.error }]}>Schlüssel entfernen</Text>
            </TouchableOpacity>
          )}

          {keyIsSaved && (
            <View style={[styles.hintBox, { backgroundColor: theme.surface, marginTop: 16 }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.hintText, { color: theme.textSecondary, marginBottom: 0 }]}>
                KI-Features senden Daten (Buchtitel, Autoren, Cover-Fotos) an Google Gemini. Deine Daten werden nicht dauerhaft bei Google gespeichert.
              </Text>
            </View>
          )}
        </View>

        {/* Notifications Card */}
        <View style={[styles.card, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text, marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Lese-Erinnerungen</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            BuchWelt erinnert dich, wenn du längere Zeit nicht gelesen hast. Der Countdown startet neu, sobald du eine Seite speicherst oder einen Lesestatus änderst.
          </Text>

          {/* Toggle Row */}
          <View style={[styles.toggleRow, { borderColor: theme.border }]}>
            <View style={styles.toggleLabel}>
              <Ionicons name="notifications-outline" size={18} color={notifEnabled ? theme.primary : theme.textSecondary} />
              <Text style={[styles.toggleText, { color: notifEnabled ? theme.primary : theme.textSecondary }]}>
                {notifEnabled ? 'Erinnerungen aktiv' : 'Erinnerungen deaktiviert'}
              </Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleNotifToggle}
              trackColor={{ false: theme.surfaceHigh, true: theme.primary + '55' }}
              thumbColor={notifEnabled ? theme.primary : theme.textSecondary}
            />
          </View>

          {/* Interval Selector */}
          {notifEnabled && (
            <View style={styles.intervalSection}>
              <Text style={[styles.intervalLabel, { color: theme.textSecondary }]}>ERINNERUNG NACH</Text>
              <View style={styles.intervalRow}>
                {INTERVAL_OPTIONS.map(({ label, days }) => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.intervalChip,
                      { backgroundColor: notifInterval === days ? theme.primary : theme.surface }
                    ]}
                    onPress={() => handleIntervalChange(days)}
                  >
                    <Text style={[styles.intervalChipText, { color: notifInterval === days ? '#fff' : theme.textSecondary }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Database Card */}
        <View style={[styles.card, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text, marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>Datenbank</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Die Verbindung zur Cloud-Datenbank wird über Umgebungsvariablen konfiguriert. Deine Bücher sind sicher gespeichert.
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.error, marginTop: 16 }]}
            onPress={handleSignOut}
          >
            <Text style={[styles.saveButtonText, { color: theme.error }]}>Abmelden</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.error, marginTop: 12 }]}
            onPress={handleDeleteAccount}
          >
            <Text style={[styles.saveButtonText, { color: '#fff' }]}>Konto & Daten löschen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
    paddingBottom: 100,
  },
  header: { marginBottom: 40 },
  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 48,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 20,
    letterSpacing: -0.5,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    elevation: 4,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  sectionTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 24,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  hintBox: {
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
    gap: 4,
  },
  hintText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 20,
  },
  hintItem: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    lineHeight: 22,
  },
  description: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 22,
  },
  input: {
    borderWidth: 0,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    marginBottom: 20,
  },
  saveButton: {
    padding: 16,
    borderRadius: 999,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 16,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  toggleText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
  },
  intervalSection: {
    marginTop: 4,
  },
  intervalLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  intervalChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  intervalChipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
});
