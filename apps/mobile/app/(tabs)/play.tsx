import { usePlayerLocation } from '@app/hooks/usePlayerLocation';
import { ClueMarkdownRenderer } from '@components/ClueMarkdownRenderer';
import { EmptyState } from '@components/EmptyState';
import { OfflineBanner } from '@components/OfflineBanner';
import { QRScanner } from '@components/QRScanner';
import { ThemedButton, ThemedCustomText, ThemedView } from '@components/themed';
import { useHaptics } from '@hooks/useHaptics';
import { matchesClueAnswer } from '@lib/clueAnswerVerification';
import { verifyQrAgainstClue } from '@lib/qrCodeDecryptor';
import type { Clue } from '@lib/types';
import { useTheme } from '@providers/ThemeProvider';
import { useToast } from '@providers/ToastProvider';
import { getHuntClues } from '@store/huntStore';
import { usePlayerStore, useWalletStore } from '@store/useStore';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { verifyClueGeofence } from '@/lib/locationGate';
import { queueClueAnswer } from '@/lib/syncQueue';

import NetInfo from '@react-native-community/netinfo';

export default function PlayScreen() {
  const { t } = useTranslation();

  // Network status
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return () => unsubscribe();
  }, []);

  const router = useRouter();
  const { colors } = useTheme();
  const haptics = useHaptics();
  const { showToast } = useToast();
  const { network } = useWalletStore();
  const {
    location,
    error: locationError,
    loading: locationLoading,
    permissionGranted,
    shareLocation,
    setShareLocation,
  } = usePlayerLocation();
  const { currentProgress, updateClueIndex, markCompleted, markClueCompleted, clearProgress } =
    usePlayerStore();

  const [answer, setAnswer] = useState('');
  const [clues, setClues] = useState<Clue[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentProgress?.hunt_id) {
      setClues([]);
      return;
    }

    void getHuntClues(currentProgress.hunt_id).then(setClues);
  }, [currentProgress?.hunt_id]);

  if (!currentProgress?.hunt_id) {
    return (
      <EmptyState
        icon="🎯"
        title={t('play.empty.title')}
        description={t('play.empty.description')}
        action={{
          label: t('play.empty.cta'),
          onPress: () => router.push('/(tabs)/hunts'),
        }}
      />
    );
  }

  const activeClueIndex = currentProgress.current_clue_index;
  const activeClue = clues[activeClueIndex];
  const allSolved = activeClueIndex >= clues.length;

  const progressLabel = useMemo(() => {
    if (clues.length === 0) {
      return t('play.progress.loading');
    }

    if (allSolved) {
      return t('play.progress.allSolved');
    }

    return t('play.progress.clueOf', {
      current: activeClueIndex + 1,
      total: clues.length,
    });
  }, [activeClueIndex, allSolved, clues.length, t]);

  const submitClueAnswer = async (submittedAnswer: string, fromQr = false) => {
    if (!activeClue || !currentProgress?.hunt_id || isSubmitting) {
      return;
    }

    // If offline, queue the answer and update progress locally
    if (!isOnline) {
      await queueClueAnswer(currentProgress.hunt_id, activeClue.id, answer.trim());
      markClueCompleted(currentProgress.hunt_id, activeClueIndex);
      updateClueIndex(activeClueIndex + 1);
      setAnswer('');
      showToast({ message: t('play.answer.queued'), type: 'info' });
      return;
    }

    if (network === 'mainnet') {
      showToast({
        message: t('play.toast.switchNetwork'),
        type: 'warning',
      });
      router.push('/network/switch');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const locationCheck = await verifyClueGeofence(activeClue);
      if (!locationCheck.allowed) {
        setError(locationCheck.reason);
        haptics.triggerNotification('error');
        return;
      }

      if (fromQr) {
        const qrCheck = await verifyQrAgainstClue(
          submittedAnswer,
          activeClue,
          currentProgress.hunt_id,
        );
        if (!qrCheck.match) {
          showToast({ message: qrCheck.reason, type: 'error' });
          setError(qrCheck.reason);
          return;
        }
      } else if (!(await matchesClueAnswer(submittedAnswer, activeClue, currentProgress.hunt_id))) {
        setError(t('play.answer.incorrect'));
        haptics.triggerNotification('error');
        return;
      }

      const isLastClue = activeClueIndex === clues.length - 1;
      markClueCompleted(currentProgress.hunt_id, activeClueIndex);

      if (isLastClue) {
        haptics.triggerImpact('heavy');
        markCompleted();
        router.push({
          pathname: '/transaction/pending',
          params: {
            action: 'complete',
            huntId: String(currentProgress.hunt_id),
            huntTitle: 'Reward Dispatch',
          },
        });
      } else {
        haptics.triggerNotification('success');
        updateClueIndex(activeClueIndex + 1);
      }

      setAnswer('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    await submitClueAnswer(answer);
  };

  const handleQrScan = async (data: string) => {
    await submitClueAnswer(data, true);
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.primary + '10', borderColor: colors.border },
          ]}
        >
          <ThemedCustomText variant="h2" color="primary" weight="800">
            {t('play.title')}
          </ThemedCustomText>
          <ThemedCustomText variant="body">{progressLabel}</ThemedCustomText>
        </View>

        <View
          style={[
            styles.locationCard,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.locationHeader}>
            <ThemedCustomText variant="label" weight="700">
              {t('play.location.label')}
            </ThemedCustomText>
            <Switch
              value={shareLocation}
              onValueChange={setShareLocation}
              disabled={!permissionGranted}
              trackColor={{ false: '#cbd5e1', true: colors.primary }}
            />
          </View>
          <ThemedCustomText variant="caption" style={styles.locationCopy}>
            {permissionGranted
              ? shareLocation
                ? t('play.location.trackingEnabled')
                : t('play.location.trackingPaused')
              : t('play.location.permissionRequired')}
          </ThemedCustomText>
          {locationLoading ? (
            <ThemedCustomText variant="caption" color="warning">
              {t('play.location.requesting')}
            </ThemedCustomText>
          ) : null}
          {locationError ? (
            <ThemedCustomText variant="caption" color="error">
              {locationError}
            </ThemedCustomText>
          ) : null}
          {location ? (
            <ThemedCustomText variant="caption" style={styles.locationMeta}>
              {t('play.location.liveCoords', {
                lat: location.latitude.toFixed(4),
                lng: location.longitude.toFixed(4),
              })}
            </ThemedCustomText>
          ) : null}
        </View>

        {clues.map((clue, index) => {
          const isActive = index === activeClueIndex && !allSolved;
          const isUnlocked = index <= activeClueIndex;

          return (
            <View
              key={clue.id}
              style={[
                styles.clueCard,
                {
                  backgroundColor: isActive ? colors.primary + '12' : colors.background,
                  borderColor: isActive ? colors.primary : colors.border,
                  opacity: isUnlocked ? 1 : 0.55,
                },
              ]}
            >
              <ThemedCustomText variant="label" color={isActive ? 'primary' : 'text'} weight="700">
                {isActive
                  ? t('play.clue.current')
                  : isUnlocked
                    ? t('play.clue.unlocked')
                    : t('play.clue.locked')}
              </ThemedCustomText>

              <View style={styles.clueQuestion}>
                <ClueMarkdownRenderer text={clue.question} />
              </View>

              <ThemedCustomText variant="caption" style={styles.clueMeta}>
                {t('play.clue.points', { points: clue.points })}
                {clue.hint ? ` • Hint: ${clue.hint}` : ''}
              </ThemedCustomText>
            </View>
          );
        })}

        {!allSolved && activeClue ? (
          <>
            <OfflineBanner />
            <View
              style={[
                styles.answerPanel,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <ThemedCustomText variant="h3" weight="700">
                {t('play.answer.title')}
              </ThemedCustomText>
              <ThemedCustomText variant="caption" style={styles.answerCopy}>
                {t('play.answer.description')}
              </ThemedCustomText>
              <TextInput
                value={answer}
                onChangeText={(value) => {
                  setAnswer(value);
                  if (error) {
                    setError('');
                  }
                }}
                placeholder={t('play.answer.placeholder')}
                placeholderTextColor="#94a3b8"
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {error ? (
                <ThemedCustomText variant="caption" color="error">
                  {error}
                </ThemedCustomText>
              ) : null}
              <ThemedButton
                text={isSubmitting ? t('play.answer.checkingGps') : t('play.answer.submit')}
                loading={isSubmitting}
                fullWidth
                onPress={handleSubmit}
              />
              <ThemedButton
                text={t('play.answer.scanQr')}
                variant="secondary"
                fullWidth
                onPress={() => setScannerOpen(true)}
              />
              <ThemedButton
                text={t('play.answer.abandon')}
                variant="ghost"
                fullWidth
                onPress={clearProgress}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
        title={t('play.qrScanner.title')}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  clueCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  clueQuestion: {
    marginTop: 4,
  },
  clueMeta: {
    opacity: 0.75,
  },
  locationCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationCopy: {
    opacity: 0.8,
  },
  locationMeta: {
    opacity: 0.65,
  },
  answerPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  answerCopy: {
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
