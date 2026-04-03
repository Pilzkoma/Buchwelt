import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';

export default function ResetPasswordScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (password.length < 6) {
      Alert.alert('Passwort zu kurz', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwörter stimmen nicht überein', 'Bitte gib dasselbe Passwort in beiden Feldern ein.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Fehler', error.message);
    } else {
      await supabase.auth.signOut();
      Alert.alert(
        'Passwort geändert',
        'Dein Passwort wurde erfolgreich geändert. Bitte melde dich neu an.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.formContainer}>
        <View style={styles.header}>
          <Text style={[styles.mainTitle, { color: theme.primary }]}>BuchWelt</Text>
          <Text style={[styles.subTitle, { color: theme.textSecondary }]}>Neues Passwort setzen</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="Neues Passwort"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
          />

          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="Passwort bestätigen"
            placeholderTextColor={theme.textSecondary}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
          />

          <View style={{ gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.buttonText, { color: '#fff' }]}>Passwort speichern</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.replace('/(auth)/login')}
              disabled={loading}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  mainTitle: {
    fontFamily: 'Newsreader_700Bold',
    fontSize: 52,
    letterSpacing: -1,
  },
  subTitle: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
    marginTop: 8,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    elevation: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 30,
  },
  input: {
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
  },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
  },
  buttonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
});
