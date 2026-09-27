import { DisconnectWalletModal } from '@components/settings/DisconnectWalletModal';
import { SettingsRow } from '@components/settings/SettingsRow';
import { SettingsSection } from '@components/settings/SettingsSection';
import { ThemedCustomText, ThemedView } from '@components/themed';
import { useTheme } from '@providers/ThemeProvider';
import { useWalletStore } from '@store/useStore';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { disconnect } = useWalletStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const toggleNotifications = (value: boolean) => {
    setNotificationsEnabled(value);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect?.();
    } finally {
      setDisconnecting(false);
      setShowDisconnect(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection title={t('settings.sections.appearance')}>
          <SettingsRow
            icon="color-palette-outline"
            label={t('settings.rows.theme.label')}
            description={t('settings.rows.theme.description')}
            type="navigate"
            onPress={() => router.push('/settings/theme')}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.notifications')}>
          <SettingsRow
            icon="notifications-outline"
            label={t('settings.rows.pushNotifications.label')}
            description={t('settings.rows.pushNotifications.description')}
            type="toggle"
            value={notificationsEnabled}
            onToggle={toggleNotifications}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.wallet')}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label={t('settings.rows.walletSecurity.label')}
            description={t('settings.rows.walletSecurity.description')}
            type="navigate"
            onPress={() => router.push('/settings/wallet')}
          />
          <SettingsRow
            icon="log-out-outline"
            label={t('settings.rows.disconnectWallet.label')}
            description={t('settings.rows.disconnectWallet.description')}
            type="destructive"
            onPress={() => setShowDisconnect(true)}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.support')}>
          <SettingsRow
            icon="document-text-outline"
            label={t('settings.rows.documentation.label')}
            type="link"
            onPress={() => void Linking.openURL('https://docs.hunty.com')}
          />
          <SettingsRow
            icon="help-circle-outline"
            label={t('settings.rows.helpCenter.label')}
            type="link"
            onPress={() => void Linking.openURL('https://support.hunty.com')}
          />
        </SettingsSection>

        <ThemedCustomText variant="caption" style={[styles.version, { color: colors.secondary }]}>
          {t('settings.version', { version: APP_VERSION })}
        </ThemedCustomText>
      </ScrollView>

      <DisconnectWalletModal
        visible={showDisconnect}
        isLoading={disconnecting}
        onCancel={() => setShowDisconnect(false)}
        onConfirm={() => void handleDisconnect()}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 40 },
  version: {
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.5,
  },
});
