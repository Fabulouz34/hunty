import { HuntyRefreshControl } from '@components/HuntyRefreshControl';
import { useRefreshByUser } from '@hooks/useRefreshByUser';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Placeholder for dashboard data fetching
const fetchDashboard = async () => ({ balance: 0 });

export default function Dashboard() {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  const { isRefreshing, onRefresh } = useRefreshByUser(refetch);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<HuntyRefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('dashboard.title')}</Text>
        <Text style={styles.subtitle}>{t('dashboard.balance', { amount: data?.balance })}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  subtitle: {
    color: '#64748b',
  },
});
