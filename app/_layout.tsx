import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { supabase } from '@/utils/supabase';
import { useRouter, useSegments } from 'expo-router';
import { setupNotificationChannel } from '@/utils/notifications';
import { syncGoogleBooksTagsForAllBooks } from '@/utils/googleBooks';

import { useFonts, Newsreader_400Regular, Newsreader_400Regular_Italic, Newsreader_700Bold, Newsreader_700Bold_Italic } from '@expo-google-fonts/newsreader';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';

import { useColorScheme } from '@/hooks/use-color-scheme';

// How notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  
  const [sessionResolved, setSessionResolved] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [loaded, error] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_700Bold,
    Newsreader_700Bold_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    setupNotificationChannel();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      // PKCE flow (Supabase v2 default): code in query params
      const queryString = url.split('?')[1]?.split('#')[0];
      if (queryString) {
        const queryParams = new URLSearchParams(queryString);
        const code = queryParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          return;
        }
      }

      // Implicit flow fallback: tokens in hash fragment
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const type = params.get('type');
      if (type === 'recovery' || type === 'signup') {
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }
    };

    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionActive(!!session);
      setSessionResolved(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setSessionActive(true);
        setSessionResolved(true);
        return;
      }
      setIsPasswordRecovery(false);
      setSessionActive(!!session);
      setSessionResolved(true);
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  const googleBooksSyncStartedRef = useRef(false);
  useEffect(() => {
    if (!sessionActive || googleBooksSyncStartedRef.current) return;
    googleBooksSyncStartedRef.current = true;
    syncGoogleBooksTagsForAllBooks();
  }, [sessionActive]);

  useEffect(() => {
    if (!loaded || !sessionResolved) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isPasswordRecovery) {
      router.replace('/(auth)/reset-password' as any);
      return;
    }

    if (!sessionActive && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (sessionActive && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [sessionActive, sessionResolved, loaded, segments, isPasswordRecovery]);

  if (!loaded && !error) {
    return null;
  }

  if (!sessionResolved) {
    return null; // Don't render layout until we know the auth state
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="recommendations" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
