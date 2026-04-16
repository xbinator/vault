import { useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/files';

export function useOpenFile() {
  const router = useRouter();
  const filesStore = useFilesStore();
  const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

  async function openFile(file: StoredFile): Promise<void> {
    if (file.path) {
      const result = await native.readFile(file.path);
      await filesStore.updateFile(file.id, { ...file, content: result.content });
    }
    router.push({ name: 'editor', params: { id: file.id } });
  }

  async function openFileById(id: string): Promise<void> {
    const file = await filesStore.getFileById(id);
    if (!file) return;
    await openFile(file);
  }

  async function openNativeFile(): Promise<void> {
    const file = await native.openFile();
    if (!file.path) return;

    let id = nanoid();
    const existingFile = await filesStore.getFileByPath(file.path);

    if (existingFile) {
      id = existingFile.id;
    } else {
      await filesStore.addFile({ ...file, id });
    }

    await router.push({ name: 'editor', params: { id } });
  }

  return { openFile, openFileById, openNativeFile };
}
