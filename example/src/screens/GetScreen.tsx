import { ScrollView, StyleSheet } from 'react-native';

import { DemoButton } from '../components/DemoButton';
import { postService } from '../services/post.service';

interface Props {
  onLog: (label: string, fn: () => Promise<Response>) => void;
}

export function GetScreen({ onLog }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <DemoButton
        label="@Query — list(limit=5, page=1)"
        onPress={() => onLog('list(5,1)', () => postService.list(5, 1))}
      />
      <DemoButton
        label="@Param — getById(1)"
        onPress={() => onLog('getById(1)', () => postService.getById(1))}
      />
      <DemoButton
        label="@StaticQuery + @Query — listByUser(userId=2)"
        onPress={() => onLog('listByUser(2)', () => postService.listByUser(2))}
      />
      <DemoButton
        label="@QueriesMap — search({ userId:1, _limit:3 })"
        onPress={() =>
          onLog('search', () => postService.search({ userId: 1, _limit: 3 }))
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
