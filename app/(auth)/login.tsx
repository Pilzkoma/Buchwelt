import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/utils/supabase';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Ungültige E-Mail', 'Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Passwort zu kurz', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) Alert.alert('Anmeldung fehlgeschlagen', error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Ungültige E-Mail', 'Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Passwort zu kurz', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: 'buchweltexpo://confirm' },
    });
    if (error) {
      Alert.alert('Registrierung fehlgeschlagen', error.message);
    } else {
      Alert.alert('Willkommen bei BuchWelt!', 'Dein Konto wurde erfolgreich erstellt.');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!isValidEmail(email)) {
      Alert.alert(
        'E-Mail erforderlich',
        'Bitte gib zuerst deine E-Mail-Adresse ein, dann tippe auf „Passwort vergessen".'
      );
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'buchweltexpo://reset-password',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Fehler', error.message);
    } else {
      Alert.alert(
        'E-Mail gesendet',
        `Wir haben dir eine E-Mail an ${email.trim()} geschickt. Folge dem Link um dein Passwort zurückzusetzen.`
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
          <Text style={[styles.subTitle, { color: theme.textSecondary }]}>The Scholarly Curator App</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surfaceHighest, shadowColor: theme.text }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="E-Mail-Adresse"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="Passwort"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
          />

          <View style={{ gap: 12, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.buttonText, { color: '#fff' }]}>Anmelden</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.primary }]}
              onPress={handleSignUp}
              disabled={loading}
            >
              <Text style={[styles.buttonText, { color: theme.primary }]}>Konto erstellen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handlePasswordReset}
              disabled={loading}
            >
              <Text style={[styles.forgotText, { color: theme.textSecondary }]}>
                Passwort vergessen?
              </Text>
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
  secondaryButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  forgotButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  forgotText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
  },
  buttonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
  },
});
