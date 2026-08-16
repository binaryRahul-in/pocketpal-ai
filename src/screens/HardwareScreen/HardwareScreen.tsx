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
import {
  buildRecommendations,
  formatBytes,
  getModelSize,
  HardwareSnapshot,
} from '../../services/modelRecommendations';

const HardwareRow = ({label, value}: {label: string; value: string}) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      paddingVertical: 7,
    }}>
    <Text variant="labelMedium" style={{flex: 1}}>
      {label}
    </Text>
    <Text variant="bodyMedium" style={{flex: 2, textAlign: 'right'}}>
      {value}
    </Text>
  </View>
);

export const HardwareScreen: React.FC = observer(() => {
  const theme = useTheme();
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
    <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 32}}>
      <Text variant="headlineSmall" style={{marginBottom: 6}}>
        Hardware & recommendations
      </Text>
      <Text
        variant="bodyMedium"
        style={{color: theme.colors.onSurfaceVariant, marginBottom: 16}}>
        These are conservative estimates based on device memory, storage, CPU
        cores, and the metadata available for each model. Actual speed varies by
        phone and model.
      </Text>

      <Card mode="outlined" style={{marginBottom: 16}}>
        <Card.Title title="Device information" />
        <Card.Content>
          {loading ? (
            <ActivityIndicator />
          ) : snapshot ? (
            <>
              <HardwareRow
                label="Device"
                value={`${snapshot.brand} ${snapshot.model}`}
              />
              <HardwareRow
                label="Android / API"
                value={`${snapshot.androidVersion} / ${snapshot.apiLevel}`}
              />
              <HardwareRow
                label="CPU architecture"
                value={snapshot.abis.join(', ') || 'Unknown'}
              />
              <HardwareRow
                label="CPU cores"
                value={String(snapshot.cores || 'Unknown')}
              />
              <HardwareRow
                label="Total memory"
                value={formatBytes(snapshot.totalMemory)}
              />
              <HardwareRow
                label="Free storage"
                value={formatBytes(snapshot.freeStorage)}
              />
              <HardwareRow label="Chipset" value={snapshot.chipset} />
              <HardwareRow label="GPU" value={snapshot.gpu} />
              <HardwareRow
                label="Acceleration"
                value={snapshot.gpuAcceleration}
              />
            </>
          ) : (
            <Text>Hardware information is unavailable.</Text>
          )}
        </Card.Content>
      </Card>

      <Card mode="outlined" style={{marginBottom: 16}}>
        <Card.Title title="Recommended local models" />
        <Card.Content>
          {recommendations.length === 0 ? (
            <Text variant="bodyMedium">
              No downloadable model metadata is available yet. Open Models to
              refresh or add a compatible GGUF model.
            </Text>
          ) : (
            recommendations.map(({model, label, reason}) => (
              <View key={model.id} style={{paddingVertical: 10}}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                  <Text variant="titleMedium" style={{flex: 1}}>
                    {model.name}
                  </Text>
                  <Chip compact>{label}</Chip>
                </View>
                <Text
                  variant="bodySmall"
                  style={{color: theme.colors.onSurfaceVariant, marginTop: 4}}>
                  {formatBytes(getModelSize(model))} ·{' '}
                  {model.author || 'Unknown provider'}
                </Text>
                <Text variant="bodySmall" style={{marginTop: 4}}>
                  {reason}
                </Text>
                <Button
                  mode={model.isDownloaded ? 'outlined' : 'contained'}
                  compact
                  style={{alignSelf: 'flex-start', marginTop: 8}}
                  loading={downloadingId === model.id}
                  disabled={
                    downloadingId !== null || label === 'Not recommended'
                  }
                  onPress={() => handleDownload(model)}>
                  {model.isDownloaded ? 'Open in Models' : 'Download in app'}
                </Button>
                <Divider style={{marginTop: 12}} />
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
