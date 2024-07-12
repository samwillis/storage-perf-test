import React, { useState, useEffect } from "react";

function App() {
  const [opfsWriteTime, setOpfsWriteTime] = useState<number | null>(null);
  const [cacheWriteTime, setCacheWriteTime] = useState<number | null>(null);
  const [indexedDBWriteTime, setIndexedDBWriteTime] = useState<number | null>(null);
  const [opfsSyncWriteTime, setOpfsSyncWriteTime] = useState<number | null>(null);
  const [opfsReadTime, setOpfsReadTime] = useState<number | null>(null);
  const [cacheReadTime, setCacheReadTime] = useState<number | null>(null);
  const [indexedDBReadTime, setIndexedDBReadTime] = useState<number | null>(null);
  const [opfsSyncReadTime, setOpfsSyncReadTime] = useState<number | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    const newWorker = new Worker(new URL('./opfsWorker.ts', import.meta.url));
    newWorker.onmessage = (event) => {
      const { writeTime, readTime, error } = event.data;
      if (error) {
        console.error("Worker error:", error);
      } else {
        if (writeTime !== undefined) {
          setOpfsSyncWriteTime(writeTime);
        }
        if (readTime !== undefined) {
          setOpfsSyncReadTime(readTime);
        }
      }
    };
    setWorker(newWorker);
    return () => {
      newWorker.terminate();
    };
  }, []);

  const createFile = (sizeInMB: number): Blob => {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    const buffer = new ArrayBuffer(sizeInBytes);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < sizeInBytes; i++) {
      view[i] = i % 256;
    }
    return new Blob([view], { type: "application/octet-stream" });
  };

  const saveToOPFS = async (file: Blob): Promise<void> => {
    // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
    const rootDir = await navigator.storage.getDirectory();
    const opfsFile = await rootDir.getFileHandle("opfsTestFile", { create: true });
    const writable = await opfsFile.createWritable();
    const start = performance.now();
    await writable.write(file);
    await writable.close();
    const end = performance.now();
    setOpfsWriteTime(end - start);
  };

  const saveToCache = async (file: Blob): Promise<void> => {
    const cache = await caches.open("cacheTest");
    const start = performance.now();
    await cache.put("/cacheTestFile", new Response(file));
    const end = performance.now();
    setCacheWriteTime(end - start);
  };

  const saveToIndexedDB = async (file: Blob): Promise<void> => {
    const dbOpenRequest = indexedDB.open("indexedDBTest", 1);

    dbOpenRequest.onupgradeneeded = function () {
      const db = dbOpenRequest.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };

    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      dbOpenRequest.onsuccess = function () {
        const db = dbOpenRequest.result;
        const transaction = db.transaction("files", "readwrite");
        const store = transaction.objectStore("files");
        store.put(file, "indexedDBTestFile");

        transaction.oncomplete = function () {
          const end = performance.now();
          setIndexedDBWriteTime(end - start);
          resolve();
        };

        transaction.onerror = function () {
          reject(transaction.error);
        };
      };

      dbOpenRequest.onerror = function () {
        reject(dbOpenRequest.error);
      };
    });
  };

  const readFromOPFS = async (): Promise<number> => {
    // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
    const rootDir = await navigator.storage.getDirectory();
    const opfsFile = await rootDir.getFileHandle("opfsTestFile");
    const file = await opfsFile.getFile();
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve();
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
    const end = performance.now();
    return end - start;
  };

  const readFromCache = async (): Promise<number> => {
    const cache = await caches.open("cacheTest");
    const response = await cache.match("/cacheTestFile");
    if (!response) {
      throw new Error("Cache file not found");
    }
    const start = performance.now();
    await response.arrayBuffer();
    const end = performance.now();
    return end - start;
  };

  const readFromIndexedDB = async (): Promise<number> => {
    const dbOpenRequest = indexedDB.open("indexedDBTest", 1);

    const start = performance.now();
    return new Promise<number>((resolve, reject) => {
      dbOpenRequest.onsuccess = function () {
        const db = dbOpenRequest.result;
        const transaction = db.transaction("files", "readonly");
        const store = transaction.objectStore("files");
        const getRequest = store.get("indexedDBTestFile");

        getRequest.onsuccess = function () {
          const file = getRequest.result;
          if (!file) {
            reject(new Error("File not found in IndexedDB"));
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const end = performance.now();
            resolve(end - start);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(file);
        };

        getRequest.onerror = function () {
          reject(getRequest.error);
        };
      };

      dbOpenRequest.onerror = function () {
        reject(dbOpenRequest.error);
      };
    });
  };

  const writeFiles = async () => {
    const file = createFile(100);

    // Save to OPFS
    await saveToOPFS(file);

    // Save to Cache API
    await saveToCache(file);

    // Save to IndexedDB
    await saveToIndexedDB(file);

    // Save to OPFS using Sync Access Handle (via Worker)
    if (worker) {
      worker.postMessage({ file });
    }
  };

  const readFiles = async () => {
    // Read from OPFS
    const opfsReadTime = await readFromOPFS();
    setOpfsReadTime(opfsReadTime);

    // Read from Cache API
    const cacheReadTime = await readFromCache();
    setCacheReadTime(cacheReadTime);

    // Read from IndexedDB
    const indexedDBReadTime = await readFromIndexedDB();
    setIndexedDBReadTime(indexedDBReadTime);

    // Read from OPFS using Sync Access Handle (via Worker)
    if (worker) {
      worker.postMessage({ file: null });
    }
  };

  return (
    <div className="App">
      <h1>Storage Performance Test</h1>
      <p>Read/write a 100mb file using the Cache API, IndexedDB, and OPFS (both the async main tread api, and the sync worker api)</p>
      <button onClick={writeFiles}>Write Files</button>{" "}
      <button onClick={readFiles}>Read Files</button>
      <div>
        <h4>Write:</h4>
        <p>Cache API Write Time: {cacheWriteTime !== null ? `${cacheWriteTime.toFixed(1)} ms` : "N/A"}</p>
        <p>IndexedDB Write Time: {indexedDBWriteTime !== null ? `${indexedDBWriteTime.toFixed(1)} ms` : "N/A"}</p>
        <p>OPFS Write Time: {opfsWriteTime !== null ? `${opfsWriteTime.toFixed(1)} ms` : "N/A"}</p>
        <p>OPFS Sync Write Time: {opfsSyncWriteTime !== null ? `${opfsSyncWriteTime.toFixed(1)} ms` : "N/A"}</p>
        <h4>Read:</h4>
        <p>Cache API Read Time: {cacheReadTime !== null ? `${cacheReadTime.toFixed(1)} ms` : "N/A"}</p>
        <p>IndexedDB Read Time: {indexedDBReadTime !== null ? `${indexedDBReadTime.toFixed(1)} ms` : "N/A"}</p>
        <p>OPFS Read Time: {opfsReadTime !== null ? `${opfsReadTime.toFixed(1)} ms` : "N/A"}</p>
        <p>OPFS Sync Read Time: {opfsSyncReadTime !== null ? `${opfsSyncReadTime.toFixed(1)} ms` : "N/A"}</p>
      </div>
    </div>
  );
}

export default App;
