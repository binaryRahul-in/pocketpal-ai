import React, {useCallback, useEffect, useState} from 'react';
import {Platform, ScrollView, View} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {observer} from 'mobx-react';
import {
  Button,
  Card,
  Chip,
  Divider,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';

import {modelStore} from '../../store';
import {useTheme} from '../../hooks';
import {
  getChipsetInfo,
  getCpuInfo,
  getGpuInfo,
} from '../../utils/deviceCapabilities';
import {Model} from '../../utils/types';
import {ROUTES} from '../../utils/navigationConstants';
import {createStyles} from './styles';
import {
  buildRecommendations,
  formatBytes,
  getModelSize,
  HardwareSnapshot,
} from '../../services/modelRecommendations';

const HardwareRow = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.hardwareRow}>
    <Text variant="labelMedium" style={styles.hardwareRowLabel}>
      {label}
    </Text>
    <Text variant="bodyMedium" style={styles.hardwareRowValue}>
      {value}
    </Text>
  </View>
);

export const HardwareScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<any>();
  const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadHardware = useCallback(async () => {
    setLoading(true);
    try {
      const [abis, totalMemory, freeStorage, chipset, cpu, gpu] =
        await Promise.all([
          DeviceInfo.supportedAbis(),
          DeviceInfo.getTotalMemory(),
          DeviceInfo.getFreeDiskStorage(),
          getChipsetInfo(),
          getCpuInfo(),
          getGpuInfo(),
        ]);
      const gpuName = gpu?.renderer || gpu?.gpuType || 'Unknown';
      const gpuAcceleration = gpu?.supportsOpenCL
        ? 'OpenCL available'
        : 'Unknown';
      setSnapshot({
        model: DeviceInfo.getModel(),
        brand: DeviceInfo.getBrand(),
        androidVersion:
          Platform.OS === 'android' ? String(Platform.Version) : 'Not Android',
        apiLevel:
          Platform.OS === 'android' ? String(Platform.Version) : 'Unknown',
        abis,
        cores: cpu?.cores || 0,
        totalMemory,
        freeStorage,
        chipset: chipset || cpu?.socModel || 'Unknown',
        gpu: gpuName,
        gpuAcceleration,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHardware().catch(() => setLoading(false));
  }, [loadHardware]);

  const recommendations = buildRecommendations(
    snapshot,
    modelStore.availableModels,
  );

  const handleDownload = async (model: Model) => {
    if (model.isDownloaded) {
      navigation.navigate(ROUTES.MODELS);
      return;
    }
    setDownloadingId(model.id);
    try {
      await modelStore.checkSpaceAndDownload(model.id);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text variant="headlineSmall" style={styles.title}>
        Hardware & recommendations
      </Text>
      <Text variant="bodyMedium" style={styles.description}>
        These are conservative estimates based on device memory, storage, CPU
        cores, and the metadata available for each model. Actual speed varies by
        phone and model.
      </Text>

      <Card mode="outlined" style={styles.card}>
        <Card.Title title="Device information" />
        <Card.Content>
          {loading ? (
            <ActivityIndicator />
          ) : snapshot ? (
            <>
              <HardwareRow
                label="Device"
                value={`${snapshot.brand} ${snapshot.model}`}
                styles={styles}
              />
              <HardwareRow
                label="Android / API"
                value={`${snapshot.androidVersion} / ${snapshot.apiLevel}`}
                styles={styles}
              />
              <HardwareRow
                label="CPU architecture"
                value={snapshot.abis.join(', ') || 'Unknown'}
                styles={styles}
              />
              <HardwareRow
                label="CPU cores"
                value={String(snapshot.cores || 'Unknown')}
                styles={styles}
              />
              <HardwareRow
                label="Total memory"
                value={formatBytes(snapshot.totalMemory)}
                styles={styles}
              />
              <HardwareRow
                label="Free storage"
                value={formatBytes(snapshot.freeStorage)}
                styles={styles}
              />
              <HardwareRow
                label="Chipset"
                value={snapshot.chipset}
                styles={styles}
              />
              <HardwareRow label="GPU" value={snapshot.gpu} styles={styles} />
              <HardwareRow
                label="Acceleration"
                value={snapshot.gpuAcceleration}
                styles={styles}
              />
            </>
          ) : (
            <Text>Hardware information is unavailable.</Text>
          )}
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Title title="Recommended local models" />
        <Card.Content>
          {recommendations.length === 0 ? (
            <Text variant="bodyMedium">
              No downloadable model metadata is available yet. Open Models to
              refresh or add a compatible GGUF model.
            </Text>
          ) : (
            recommendations.map(({model, label, reason}) => (
              <View key={model.id} style={styles.recommendationItem}>
                <View style={styles.recommendationHeader}>
                  <Text
                    variant="titleMedium"
                    style={styles.recommendationTitle}>
                    {model.name}
                  </Text>
                  <Chip compact>{label}</Chip>
                </View>
                <Text variant="bodySmall" style={styles.recommendationMetadata}>
                  {formatBytes(getModelSize(model))} ·{' '}
                  {model.author || 'Unknown provider'}
                </Text>
                <Text variant="bodySmall" style={styles.reason}>
                  {reason}
                </Text>
                <Button
                  mode={model.isDownloaded ? 'outlined' : 'contained'}
                  compact
                  style={styles.downloadButton}
                  loading={downloadingId === model.id}
                  disabled={
                    downloadingId !== null || label === 'Not recommended'
                  }
                  onPress={() => handleDownload(model)}>
                  {model.isDownloaded ? 'Open in Models' : 'Download in app'}
                </Button>
                <Divider style={styles.recommendationDivider} />
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      <Button
        mode="outlined"
        onPress={() => navigation.navigate(ROUTES.MODELS)}>
        Open model settings and catalog
      </Button>
    </ScrollView>
  );
});
