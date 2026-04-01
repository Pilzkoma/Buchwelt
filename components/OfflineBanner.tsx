import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';

export const OfflineBanner = () => {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>⚠️ Keine Internetverbindung</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#c0392b',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
});
