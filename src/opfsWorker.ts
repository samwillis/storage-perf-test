self.onmessage = async (event: MessageEvent) => {
  const { file } = event.data;

  if (typeof self.navigator.storage.getDirectory !== "function") {
    self.postMessage({ error: "OPFS Sync Access Handle API not supported." });
    return;
  }

  try {
    // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
    const rootDir = await self.navigator.storage.getDirectory();
    const opfsFileHandle = await rootDir.getFileHandle("opfsSyncTestFile", { create: true });

    if (file) {
      // Write the file using Sync Access Handle API
      const startWrite = performance.now();
      const syncHandle = await opfsFileHandle.createSyncAccessHandle();
      const buffer = await file.arrayBuffer();
      syncHandle.write(buffer);
      syncHandle.close();
      const endWrite = performance.now();
      self.postMessage({ writeTime: endWrite - startWrite });
    } else {
      // Read the file using Sync Access Handle API
      const startRead = performance.now();
      const syncHandle = await opfsFileHandle.createSyncAccessHandle();
      const fileSize = syncHandle.getSize();
      const buffer = new ArrayBuffer(fileSize);
      syncHandle.read(buffer, { at: 0 });
      syncHandle.close();
      const endRead = performance.now();
      self.postMessage({ readTime: endRead - startRead });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
