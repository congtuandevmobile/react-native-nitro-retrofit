import { ScrollView, StyleSheet, Text } from 'react-native';

import type { IMultipartFile } from 'react-native-nitro-retrofit';

import { DemoButton } from '../components/DemoButton';
import { uploadService } from '../services/upload.service';

const FAKE_FILE: IMultipartFile = {
  uri: 'file:///tmp/photo.jpg',
  name: 'photo.jpg',
  type: 'multipart/form-data',
};

interface Props {
  onLog: (label: string, fn: () => Promise<Response>) => void;
}

export function MultipartScreen({ onLog }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.note}>
        Sends to <Text style={styles.code}>httpbin.org/post</Text> which echoes
        the full request — check the log to see field names and values.
      </Text>

      <DemoButton
        label="@Part file + caption — uploadPhoto(file, 'My caption')"
        onPress={() =>
          onLog('uploadPhoto', () =>
            uploadService.uploadPhoto(FAKE_FILE, 'My caption')
          )
        }
      />
      <DemoButton
        label="@Part images[] — uploadMultiple([file, file])"
        onPress={() =>
          onLog('uploadMultiple', () =>
            uploadService.uploadMultiple([FAKE_FILE, FAKE_FILE])
          )
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  note: { color: '#555', fontSize: 13, lineHeight: 20 },
  code: { fontFamily: 'monospace', backgroundColor: '#e8e8e8' },
});
