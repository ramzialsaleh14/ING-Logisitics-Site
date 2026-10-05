/* ==========================================================================
   Pending (unpublished) photos.

   Photos the admin has picked but not pushed yet are far too large for
   localStorage, so the blobs live in IndexedDB instead. admin.html writes
   them; content-apply.js reads them when previewing a draft.
   ========================================================================== */
(function () {
  "use strict";

  var DB_NAME = "ing-admin";
  var STORE = "images";
  var VERSION = 1;

  function open() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("This browser has no IndexedDB, so photos cannot be stored."));
        return;
      }
      var request = window.indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function run(mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var request = work(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(request ? request.result : undefined); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }

  window.INGDraftImages = {
    get: function (key) {
      return run("readonly", function (store) { return store.get(key); })
        .catch(function () { return null; });
    },
    put: function (key, blob) {
      return run("readwrite", function (store) { return store.put(blob, key); });
    },
    remove: function (key) {
      return run("readwrite", function (store) { return store.delete(key); });
    },
    clear: function () {
      return run("readwrite", function (store) { return store.clear(); });
    }
  };
})();
