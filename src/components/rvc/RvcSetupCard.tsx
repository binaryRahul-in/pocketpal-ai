import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import {observer} from 'mobx-react';
import {Button, Divider, Switch, Text} from 'react-native-paper';

import {rvcStore} from '../../store';
import {useTheme} from '../../hooks';

export const RvcSetupCard: React.FC = observer(() => {
  const theme = useTheme();

  useEffect(() => {
    rvcStore.init().catch(error => {
      console.warn('[RvcSetupCard] initialization failed:', error);
    });
  }, []);

  const selectedModel = rvcStore.selectedModel;
  const capability = rvcStore.capability;
  const unavailable = capability && !capability.offlineRuntime;

  return (
    <View
      style={[styles.card, {backgroundColor: theme.colors.elevation.level1}]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text variant="titleMedium">RVC voice conversion</Text>
          <Text
            variant="bodySmall"
            style={{color: theme.colors.onSurfaceVariant}}>
            Optional speech-to-speech and TTS voice transformation
          </Text>
        </View>
        <Switch
          value={rvcStore.config.enabled}
          onValueChange={enabled => rvcStore.setConfig({enabled})}
          disabled={Boolean(unavailable)}
          accessibilityLabel="Enable RVC voice conversion"
        />
      </View>

      {unavailable ? (
        <Text style={{color: theme.colors.onSurfaceVariant}}>
          RVC is available only in a native Android or iOS build. Standard chat
          and TTS remain unchanged.
        </Text>
      ) : (
        <>
          <Text variant="bodyMedium" style={styles.status}>
            {selectedModel
              ? `Voice model: ${selectedModel.displayName}`
              : 'No RVC voice model installed'}
          </Text>
          <Text
            variant="bodySmall"
            style={{color: theme.colors.onSurfaceVariant}}>
            RVC models contain a target voice. A reference recording alone is
            not a standard RVC model.
          </Text>
          <View style={styles.row}>
            <Text>Offline conversion</Text>
            <Switch
              value={rvcStore.config.mode === 'offline'}
              onValueChange={offline =>
                rvcStore.setConfig({mode: offline ? 'offline' : 'streaming'})
              }
              accessibilityLabel="Use offline RVC conversion"
            />
          </View>
          <View style={styles.row}>
            <Text>Use INT8 base models</Text>
            <Switch
              value={rvcStore.config.precision === 'int8'}
              onValueChange={int8 =>
                rvcStore.setConfig({precision: int8 ? 'int8' : 'fp32'})
              }
              accessibilityLabel="Use INT8 RVC base models"
            />
          </View>
          <View style={styles.row}>
            <Text>TTS post-processing</Text>
            <Switch
              value={rvcStore.config.ttsPostProcessingEnabled}
              onValueChange={enabled =>
                rvcStore.setConfig({ttsPostProcessingEnabled: enabled})
              }
              disabled={!selectedModel}
              accessibilityLabel="Enable RVC post-processing for TTS"
            />
          </View>
          <View style={styles.row}>
            <Text>Index retrieval</Text>
            <Text
              variant="bodySmall"
              style={{color: theme.colors.onSurfaceVariant}}>
              Off by default
            </Text>
          </View>
          <Divider style={styles.divider} />
          {capability?.warnings.map(warning => (
            <Text
              key={warning}
              variant="bodySmall"
              style={[styles.warning, {color: theme.colors.error}]}>
              {warning}
            </Text>
          ))}
          <Button
            mode="contained-tonal"
            onPress={() => {
              rvcStore.pickAndInstallModel().catch(error => {
                console.warn('[RvcSetupCard] model import failed:', error);
              });
            }}>
            Import RVC model bundle
          </Button>
          {rvcStore.jobState === 'validating' ? (
            <Text>Validating model files…</Text>
          ) : null}
          {rvcStore.jobError ? (
            <Text style={{color: theme.colors.error}}>{rvcStore.jobError}</Text>
          ) : null}
          <Button
            mode="outlined"
            onPress={() => rvcStore.selectModel(null)}
            disabled={!selectedModel}>
            Clear selected voice
          </Button>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {borderRadius: 16, marginTop: 16, padding: 16, gap: 10},
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {flex: 1, gap: 2},
  status: {fontWeight: '600'},
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  divider: {marginVertical: 4},
  warning: {lineHeight: 18},
});
