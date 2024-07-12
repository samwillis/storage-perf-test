import { useState, useEffect } from "react";

function App() {
  const [results, setResults] = useState<any>({});
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    const newWorker = new Worker(new URL("./opfsWorker.ts", import.meta.url));
    newWorker.onmessage = (event) => {
      const { writeTime, readTime, singleFileTest, error } = event.data;
      if (error) {
        console.error("Worker error:", error);
      } else {
        const testType = singleFileTest ? "singleFile" : "multipleFiles";
        setResults((prevResults: any) => ({
          ...prevResults,
          ["OPFS Sync"]: {
            ...prevResults["OPFS Sync"],
            [testType]: {
              writeTime: writeTime.toFixed(2),
              readTime: readTime.toFixed(2),
            },
          },
        }));
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

  const createFiles = (count: number, sizeInKB: number): Blob[] => {
    const files: Blob[] = [];
    const sizeInBytes = sizeInKB * 1024;
    for (let j = 0; j < count; j++) {
      const buffer = new ArrayBuffer(sizeInBytes);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < sizeInBytes; i++) {
        view[i] = i % 256;
      }
      files.push(new Blob([view], { type: "application/octet-stream" }));
    }
    return files;
  };

  const saveToOPFS = async (file: Blob): Promise<number> => {
    // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
    const rootDir = await navigator.storage.getDirectory();
    const opfsFile = await rootDir.getFileHandle("opfsTestFile", {
      create: true,
    });
    const writable = await opfsFile.createWritable();
    const start = performance.now();
    await writable.write(file);
    await writable.close();
    const end = performance.now();
    return end - start;
  };

  const saveMultipleToOPFS = async (files: Blob[]): Promise<number> => {
    const times: number[] = [];
    for (let i = 0; i < files.length; i++) {
      // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
      const rootDir = await navigator.storage.getDirectory();
      const opfsFile = await rootDir.getFileHandle(`opfsTestFile_${i}`, {
        create: true,
      });
      const writable = await opfsFile.createWritable();
      const start = performance.now();
      await writable.write(files[i]);
      await writable.close();
      const end = performance.now();
      times.push(end - start);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
  };

  const saveToCache = async (file: Blob): Promise<number> => {
    const cache = await caches.open("cacheTest");
    const start = performance.now();
    await cache.put("/cacheTestFile", new Response(file));
    const end = performance.now();
    return end - start;
  };

  const saveMultipleToCache = async (files: Blob[]): Promise<number> => {
    const cache = await caches.open("cacheTest");
    const times: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const start = performance.now();
      await cache.put(`/cacheTestFile_${i}`, new Response(files[i]));
      const end = performance.now();
      times.push(end - start);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
  };

  const saveToIndexedDB = async (file: Blob): Promise<number> => {
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
    return performance.now() - start;
  };

  const saveMultipleToIndexedDB = async (files: Blob[]): Promise<number> => {
    const dbOpenRequest = indexedDB.open("indexedDBTest", 1);

    dbOpenRequest.onupgradeneeded = function () {
      const db = dbOpenRequest.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    };

    const times: number[] = [];
    await new Promise<void>((resolve, reject) => {
      dbOpenRequest.onsuccess = function () {
        const db = dbOpenRequest.result;
        const transaction = db.transaction("files", "readwrite");
        const store = transaction.objectStore("files");

        for (let i = 0; i < files.length; i++) {
          const start = performance.now();
          store.put(files[i], `indexedDBTestFile_${i}`);

          transaction.oncomplete = function () {
            const end = performance.now();
            times.push(end - start);
            if (i === files.length - 1) {
              resolve();
            }
          };

          transaction.onerror = function () {
            reject(transaction.error);
          };
        }
      };

      dbOpenRequest.onerror = function () {
        reject(dbOpenRequest.error);
      };
    });
    return times.reduce((a, b) => a + b, 0) / times.length;
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

  const readMultipleFromOPFS = async (): Promise<number> => {
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      // @ts-ignore: 'navigator.storage.getDirectory' might not be available in TypeScript types
      const rootDir = await navigator.storage.getDirectory();
      const opfsFile = await rootDir.getFileHandle(`opfsTestFile_${i}`);
      const file = await opfsFile.getFile();
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve();
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
      const end = performance.now();
      times.push(end - start);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
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

  const readMultipleFromCache = async (): Promise<number> => {
    const cache = await caches.open("cacheTest");
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const response = await cache.match(`/cacheTestFile_${i}`);
      if (!response) {
        throw new Error(`Cache file not found: /cacheTestFile_${i}`);
      }
      const start = performance.now();
      await response.arrayBuffer();
      const end = performance.now();
      times.push(end - start);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
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

  const readMultipleFromIndexedDB = async (): Promise<number> => {
    const dbOpenRequest = indexedDB.open("indexedDBTest", 1);

    const times: number[] = [];
    return new Promise<number>((resolve, reject) => {
      dbOpenRequest.onsuccess = function () {
        const db = dbOpenRequest.result;
        const transaction = db.transaction("files", "readonly");
        const store = transaction.objectStore("files");

        const readPromises = [];
        for (let i = 0; i < 100; i++) {
          readPromises.push(
            new Promise<void>((resolveRead, rejectRead) => {
              const start = performance.now();
              const getRequest = store.get(`indexedDBTestFile_${i}`);

              getRequest.onsuccess = function () {
                const file = getRequest.result;
                if (!file) {
                  reject(
                    new Error(
                      `File not found in IndexedDB: indexedDBTestFile_${i}`
                    )
                  );
                  return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                  const end = performance.now();
                  times.push(end - start);
                  resolveRead();
                };
                reader.onerror = () => rejectRead(reader.error);
                reader.readAsArrayBuffer(file);
              };

              getRequest.onerror = function () {
                rejectRead(getRequest.error);
              };
            })
          );
        }

        Promise.all(readPromises)
          .then(() => {
            resolve(times.reduce((a, b) => a + b, 0) / times.length);
          })
          .catch(reject);
      };

      dbOpenRequest.onerror = function () {
        reject(dbOpenRequest.error);
      };
    });
  };

  const runTests = async () => {
    setResults({});
    const file = createFile(100);
    const files = createFiles(100, 1);

    // Single 100MB File Tests
    const cacheWriteTime = await saveToCache(file);
    const cacheReadTime = await readFromCache();
    const indexedDBWriteTime = await saveToIndexedDB(file);
    const indexedDBReadTime = await readFromIndexedDB();
    const opfsWriteTime = await saveToOPFS(file);
    const opfsReadTime = await readFromOPFS();

    setResults((prevResults: any) => ({
      ...prevResults,
      "Cache API": {
        ...prevResults["Cache API"],
        singleFile: {
          writeTime: cacheWriteTime.toFixed(2),
          readTime: cacheReadTime.toFixed(2),
        },
      },
      IndexedDB: {
        ...prevResults["IndexedDB"],
        singleFile: {
          writeTime: indexedDBWriteTime.toFixed(2),
          readTime: indexedDBReadTime.toFixed(2),
        },
      },
      OPFS: {
        ...prevResults["OPFS"],
        singleFile: {
          writeTime: opfsWriteTime.toFixed(2),
          readTime: opfsReadTime.toFixed(2),
        },
      },
    }));

    if (worker) {
      worker.postMessage({ files: [file], singleFileTest: true });
    }

    // 100 x 1KB Files Tests
    const cacheMultipleWriteTime = await saveMultipleToCache(files);
    const cacheMultipleReadTime = await readMultipleFromCache();
    const indexedDBMultipleWriteTime = await saveMultipleToIndexedDB(files);
    const indexedDBMultipleReadTime = await readMultipleFromIndexedDB();
    const opfsMultipleWriteTime = await saveMultipleToOPFS(files);
    const opfsMultipleReadTime = await readMultipleFromOPFS();

    setResults((prevResults: any) => ({
      ...prevResults,
      "Cache API": {
        ...prevResults["Cache API"],
        multipleFiles: {
          writeTime: cacheMultipleWriteTime.toFixed(2),
          readTime: cacheMultipleReadTime.toFixed(2),
        },
      },
      IndexedDB: {
        ...prevResults["IndexedDB"],
        multipleFiles: {
          writeTime: indexedDBMultipleWriteTime.toFixed(2),
          readTime: indexedDBMultipleReadTime.toFixed(2),
        },
      },
      OPFS: {
        ...prevResults["OPFS"],
        multipleFiles: {
          writeTime: opfsMultipleWriteTime.toFixed(2),
          readTime: opfsMultipleReadTime.toFixed(2),
        },
      },
    }));

    if (worker) {
      worker.postMessage({ files, singleFileTest: false });
    }
  };

  return (
    <div className="App">
      <h1>Storage Performance Tests</h1>
      <p>
        Read/write a 100MB file and 100 x 1KB files using the Cache API,
        IndexedDB, and OPFS (both the async main thread API, and the sync worker
        API)
      </p>
      <button onClick={runTests}>Run Tests</button>
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Storage</th>
            <th colSpan={2}>Single 100MB File</th>
            <th colSpan={2}>100 x 1KB Files (avg)</th>
          </tr>
          <tr>
            <th>Write (ms)</th>
            <th>Read (ms)</th>
            <th>Write (ms)</th>
            <th>Read (ms)</th>
          </tr>
        </thead>
        <tbody>
          {["Cache API", "IndexedDB", "OPFS", "OPFS Sync"].map((storage) => (
            <tr key={storage}>
              <td>{storage}</td>
              <td>{results[storage]?.singleFile?.writeTime ?? "N/A"}</td>
              <td>{results[storage]?.singleFile?.readTime ?? "N/A"}</td>
              <td>{results[storage]?.multipleFiles?.writeTime ?? "N/A"}</td>
              <td>{results[storage]?.multipleFiles?.readTime ?? "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
