self.onmessage = async (event: MessageEvent) => {
  const { files, singleFileTest } = event.data;

  if (typeof self.navigator.storage.getDirectory !== "function") {
    self.postMessage({ error: "OPFS Sync Access Handle API not supported." });
    return;
  }

  try {
    // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
    const rootDir = await self.navigator.storage.getDirectory();

    if (singleFileTest) {
      const opfsFileHandle = await rootDir.getFileHandle("opfsSyncTestFile", { create: true });

      // Write the file using Sync Access Handle API
      const startWrite = performance.now();
      // @ts-ignore: 'createSyncAccessHandle' might not be available in TypeScript types
      const syncHandle = await opfsFileHandle.createSyncAccessHandle();
      const buffer = await files[0].arrayBuffer();
      syncHandle.write(buffer);
      syncHandle.close();
      const endWrite = performance.now();
      const writeTime = endWrite - startWrite;

      // Read the file using Sync Access Handle API
      const startRead = performance.now();
      // @ts-ignore: 'createSyncAccessHandle' might not be available in TypeScript types
      const readHandle = await opfsFileHandle.createSyncAccessHandle();
      const fileSize = readHandle.getSize();
      const readBuffer = new ArrayBuffer(fileSize);
      readHandle.read(readBuffer, { at: 0 });
      readHandle.close();
      const endRead = performance.now();
      const readTime = endRead - startRead;
      self.postMessage({ writeTime, readTime, singleFileTest: true });
    } else {
      // Handle multiple files test
      const writeTimes = [];
      for (let i = 0; i < files.length; i++) {
        const fileHandle = await rootDir.getFileHandle(`opfsSyncTestFile_${i}`, { create: true });
        // @ts-ignore: 'createSyncAccessHandle' might not be available in TypeScript types
        const syncHandle = await fileHandle.createSyncAccessHandle();
        const buffer = await files[i].arrayBuffer();
        const startWrite = performance.now();
        syncHandle.write(buffer);
        syncHandle.close();
        const endWrite = performance.now();
        writeTimes.push(endWrite - startWrite);
      }

      const readTimes = [];
      for (let i = 0; i < files.length; i++) {
        const fileHandle = await rootDir.getFileHandle(`opfsSyncTestFile_${i}`);
        // @ts-ignore: 'createSyncAccessHandle' might not be available in TypeScript types
        const syncHandle = await fileHandle.createSyncAccessHandle();
        const fileSize = syncHandle.getSize();
        const readBuffer = new ArrayBuffer(fileSize);
        const startRead = performance.now();
        syncHandle.read(readBuffer, { at: 0 });
        syncHandle.close();
        const endRead = performance.now();
        readTimes.push(endRead - startRead);
      }

      const writeTime = writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length;
      const readTime = readTimes.reduce((a, b) => a + b, 0) / readTimes.length;
      self.postMessage({ writeTime, readTime, singleFileTest: false });
    }
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
