import {StyleSheet} from 'react-native';
import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    title: {
      marginBottom: 6,
    },
    description: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 16,
    },
    card: {
      marginBottom: 16,
    },
    hardwareRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      paddingVertical: 7,
    },
    hardwareRowLabel: {
      flex: 1,
    },
    hardwareRowValue: {
      flex: 2,
      textAlign: 'right',
    },
    recommendationItem: {
      paddingVertical: 10,
    },
    recommendationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    recommendationTitle: {
      flex: 1,
    },
    recommendationMetadata: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    reason: {
      marginTop: 4,
    },
    downloadButton: {
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    recommendationDivider: {
      marginTop: 12,
    },
  });
