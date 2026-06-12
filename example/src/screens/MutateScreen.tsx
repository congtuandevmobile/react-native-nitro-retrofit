import { ScrollView, StyleSheet } from 'react-native';

import { DemoButton } from '../components/DemoButton';
import { type CreatePostDTO, postService } from '../services/post.service';

const SAMPLE_DTO: CreatePostDTO = {
  userId: 1,
  title: '  hello world  ',
  body: 'This is the body text.',
};

interface Props {
  onLog: (label: string, fn: () => Promise<Response>) => void;
}

export function MutateScreen({ onLog }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <DemoButton
        label="@Body + @POST — create(dto)"
        onPress={() => onLog('create', () => postService.create(SAMPLE_DTO))}
      />
      <DemoButton
        label="@TransformBody + @POST — title trimmed + uppercased"
        onPress={() =>
          onLog('createTransformed', () =>
            postService.createTransformed(SAMPLE_DTO)
          )
        }
      />
      <DemoButton
        label="@Param + @Body + @PUT — update(1, { title })"
        onPress={() =>
          onLog('update(1)', () =>
            postService.update(1, { title: 'Updated title' })
          )
        }
        color="#FF9500"
      />
      <DemoButton
        label="@Headers + @POST — custom header injected"
        onPress={() =>
          onLog('createWithHeaders', () =>
            postService.createWithHeaders(SAMPLE_DTO)
          )
        }
      />
      <DemoButton
        label="@Param + @DELETE — remove(1)"
        onPress={() => onLog('remove(1)', () => postService.remove(1))}
        color="#FF3B30"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
