import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';

import type {InstalledRvcModel} from '../../types/rvc';
import {RvcModelManager} from './modelManager';

export async function pickAndInstallRvcModel(
  manager: RvcModelManager,
): Promise<InstalledRvcModel | null> {
  try {
    const files = await pick({
      type:
        Platform.OS === 'ios'
          ? ['public.data', 'public.json']
          : [types.allFiles],
      allowMultiSelection: true,
    });
    if (!files.length) return null;

    const manifestFile = files.find(
      file => file.name?.toLowerCase() === 'manifest.json',
    );
    if (!manifestFile)
      throw new Error(
        'Select manifest.json together with the ContentVec, pitch, and net_g ONNX files.',
      );

    const id = `local-${uuidv4()}`;
    const stagingRoot = `${RNFS.CachesDirectoryPath}/rvc-import-${id}`;
    await RNFS.mkdir(stagingRoot);
    for (const file of files) {
      const name = file.name?.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!name) continue;
      await RNFS.copyFile(file.uri, `${stagingRoot}/${name}`);
    }

    const manifest = JSON.parse(
      await RNFS.readFile(`${stagingRoot}/manifest.json`, 'utf8'),
    ) as {engine?: string; files?: Array<{path?: string}>};
    if (manifest.engine !== 'rvc' || !manifest.files?.length)
      throw new Error('manifest.json is not an RVC model manifest.');
    const displayName = id;
    return await manager.install({
      id,
      displayName,
      sourceRootPath: stagingRoot,
    });
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
}
