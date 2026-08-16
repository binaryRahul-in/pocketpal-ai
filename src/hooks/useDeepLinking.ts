/**
 * useDeepLinking Hook
 *
 * Handles deep link navigation from iOS Shortcuts
 * Must be called from a component inside NavigationContainer
 */

import {useEffect, useCallback} from 'react';
import {Linking} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {deepLinkService, DeepLinkParams} from '../services/DeepLinkService';
import {deepLinkStore} from '../store';
import {ROUTES} from '../utils/navigationConstants';
import {
  isBenchmarkRunnerUrl,
  parseBenchmarkAutostart,
} from '../__automation__/benchmarkRoute';

/**
 * Hook for handling deep link navigation
 * Call this once in a component inside NavigationContainer
 */
export const useDeepLinking = () => {
  const navigation = useNavigation();

  const handleChatDeepLink = useCallback(
    async (message?: string) => {
      if (message) {
        deepLinkStore.setPendingMessage(message);
      }
      (navigation as any).navigate(ROUTES.CHAT);
    },
    [navigation],
  );

  const handleDeepLink = useCallback(
    async (params: DeepLinkParams) => {
      console.log('Handling deep link:', params);

      // Automation-bridge dispatch (E2E-only). DCE-stripped in prod because
      // __E2E__ inlines to false and the require() inside the gate is never
      // reached. See src/__automation__/deepLink.ts.
      if (__E2E__) {
        const {dispatchAutomationDeepLink} = require('../__automation__');
        if (await dispatchAutomationDeepLink(params, navigation)) {
          return;
        }
      }

      if (params.host === 'chat') {
        await handleChatDeepLink(params.queryParams?.message);
      }
    },
    [handleChatDeepLink, navigation],
  );

  // E2E-only routing for the BenchmarkRunnerScreen. Two paths:
  //   1. Cold launch — Linking.getInitialURL() reads the launching intent's
  //      data URI; no MainActivity onNewIntent override needed.
  //   2. Warm launch — WDIO's `mobile: deepLink` driver command delivers the
  //      URL after the app has already started (fullReset re-installs the
  //      APK but the activity is launched before the test sends the deep
  //      link), so Android routes it as a warm 'url' event. Without the
  //      addEventListener path, the spec's `bench-run-button` wait would
  //      hang because the runner screen never mounts.
  // The whole effect is gated by __E2E__; in prod, the body is unreachable
  // and DCE-stripped by Hermes.
  useEffect(() => {
    if (!__E2E__) {
      return;
    }
    const routeIfBench = (url: string | null) => {
      if (isBenchmarkRunnerUrl(url)) {
        // Resolve autostart from the same raw URL the gate matched, via the
        // shared helper, so cold-launch (getInitialURL) and warm-launch
        // ('url' event) deliveries — and the iOS dispatchAutomationDeepLink
        // path — cannot diverge in truthiness. A bare bench URL resolves
        // false, so the screen stays idle exactly as before.
        (navigation as any).navigate(ROUTES.BENCHMARK_RUNNER, {
          autostart: parseBenchmarkAutostart(url),
        });
      }
    };
    Linking.getInitialURL()
      .then(routeIfBench)
      .catch(() => {
        // getInitialURL rejects on some surfaces; warm-state listener still
        // covers WDIO's deepLink command.
      });
    // Defensive: addEventListener is at the RN native bridge edge. If it
    // ever throws synchronously the cold-launch path above already ran, so
    // we contain the error and skip the cleanup return rather than tearing
    // down the rest of the hook's lifecycle.
    let sub: {remove: () => void} | null = null;
    try {
      sub = Linking.addEventListener('url', ({url}) => routeIfBench(url));
    } catch {
      sub = null;
    }
    return () => {
      sub?.remove();
    };
  }, [navigation]);

  useEffect(() => {
    // Initialize deep link service
    deepLinkService.initialize();

    // Add deep link handler
    const removeListener = deepLinkService.addListener(handleDeepLink);

    // Cleanup on unmount
    return () => {
      removeListener();
      deepLinkService.cleanup();
    };
  }, [handleDeepLink]);
};

/**
 * Hook for the hub/run landing-sheet host. Reads the parked request and clears
 * it once the sheet is dismissed (single-writer clear / consumed-once).
 */
export const useHubRunSheet = () => {
  return {
    pendingHubRun: deepLinkStore.pendingHubRun,
    clearPendingHubRun: () => {
      deepLinkStore.clearPendingHubRun();
    },
  };
};

/**
 * Hook for accessing pending message state
 * Can be called from any component (doesn't require navigation)
 */
export const usePendingMessage = () => {
  return {
    pendingMessage: deepLinkStore.pendingMessage,
    clearPendingMessage: () => {
      deepLinkStore.clearPendingMessage();
    },
  };
};
