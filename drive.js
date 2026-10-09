// ======================
// SINCRONIZZAZIONE GOOGLE DRIVE
// ======================

const DRIVE_FILE_NAME = "budget-state.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

let driveFileId = null;
let syncInProgress = false;
let syncTimeout = null;
let lastRemoteModified = 0;

// ======================
// CERCA / CREA FILE
// ======================

function findDriveFile() {
  const url = DRIVE_API +
    "?spaces=appDataFolder" +
    "&q=" + encodeURIComponent("name='" + DRIVE_FILE_NAME + "'") +
    "&fields=files(id,name,modifiedTime,size)";

  return fetch(url, {
    headers: { Authorization: "Bearer " + getAccessToken() }
  })
  .then(function(r) {
    if (!r.ok) throw new Error("Errore ricerca file: " + r.status);
    return r.json();
  })
  .then(function(data) {
    if (data.files && data.files.length > 0) {
      driveFileId = data.files[0].id;
      lastRemoteModified = new Date(data.files[0].modifiedTime).getTime();
      return driveFileId;
    }
    return null;
  });
}

function createDriveFile(content) {
  const metadata = {
    name: DRIVE_FILE_NAME,
    parents: ["appDataFolder"]
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    content +
    closeDelim;

  return fetch(DRIVE_UPLOAD + "?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + getAccessToken(),
      "Content-Type": "multipart/related; boundary=" + boundary
    },
    body: body
  })
  .then(function(r) {
    if (!r.ok) throw new Error("Errore creazione file: " + r.status);
    return r.json();
  })
  .then(function(data) {
    driveFileId = data.id;
    lastRemoteModified = new Date(data.modifiedTime).getTime();
    return driveFileId;
  });
}

// ======================
// LEGGI / SCRIVI
// ======================

function readDriveFile() {
  if (!driveFileId) return Promise.resolve(null);
  return fetch(DRIVE_API + "/" + driveFileId + "?alt=media", {
    headers: { Authorization: "Bearer " + getAccessToken() }
  })
  .then(function(r) {
    if (!r.ok) throw new Error("Errore lettura file: " + r.status);
    return r.json();
  });
}

function updateDriveFile(content) {
  if (!driveFileId) return createDriveFile(content);

  const metadata = { name: DRIVE_FILE_NAME };
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    content +
    closeDelim;

  return fetch(DRIVE_UPLOAD + "/" + driveFileId + "?uploadType=multipart&fields=id,modifiedTime", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + getAccessToken(),
      "Content-Type": "multipart/related; boundary=" + boundary
    },
    body: body
  })
  .then(function(r) {
    if (!r.ok) throw new Error("Errore aggiornamento file: " + r.status);
    return r.json();
  })
  .then(function(data) {
    lastRemoteModified = new Date(data.modifiedTime).getTime();
    return driveFileId;
  });
}

// ======================
// SYNC PRINCIPALE
// ======================

function syncWithDrive() {
  if (!isLoggedIn()) return;
  if (syncInProgress) return;
  syncInProgress = true;

  findDriveFile()
    .then(function(id) {
      if (!id) {
        const localContent = JSON.stringify(state, null, 2);
        return createDriveFile(localContent).then(function() {
          flashSyncStatus("☁️ Primo backup caricato");
          setLocalUpdatedAt(Date.now());
        });
      } else {
        return readDriveFile().then(function(remoteState) {
          if (!remoteState) return;
          const localUpdated = getLocalUpdatedAt();
          const remoteUpdated = lastRemoteModified;

          if (remoteUpdated > localUpdated) {
            if (confirm("Trovata una versione più recente su Google Drive (" +
                new Date(remoteUpdated).toLocaleString("it-IT") +
                "). Vuoi caricarla sul dispositivo?")) {
              state = remoteState;
              if (!state.incomes) state.incomes = [];
              if (!state.expenses) state.expenses = [];
              if (!state.closedMonths) state.closedMonths = [];
              if (!state.monthSnapshots) state.monthSnapshots = {};
              if (!state.recurringExpenses) state.recurringExpenses = [];
              if (!state.annualGoals) state.annualGoals = {};
              if (!state.theme) state.theme = "light";
              saveStateLocally();
              if (typeof applyTheme === "function") applyTheme();
              if (typeof renderHome === "function") renderHome();
              flashSyncStatus("☁️ Dati caricati da Drive");
            }
          } else if (localUpdated > remoteUpdated + 1000) {
            return updateDriveFile(JSON.stringify(state, null, 2)).then(function() {
              flashSyncStatus("☁️ Backup aggiornato");
              setLocalUpdatedAt(Date.now());
            });
          } else {
            flashSyncStatus("☁️ Già sincronizzato");
          }
        });
      }
    })
    .catch(function(err) {
      console.error("Errore sync Drive:", err);
      flashSyncStatus("⚠️ Errore sync", true);
    })
    .then(function() { syncInProgress = false; });
}

// ======================
// AUTO-SYNC DEBOUNCED
// ======================

function scheduleSyncToDrive() {
  if (!isLoggedIn()) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(function() {
    if (syncInProgress) {
      scheduleSyncToDrive();
      return;
    }
    syncInProgress = true;
    findDriveFile()
      .then(function(id) {
        if (!id) return createDriveFile(JSON.stringify(state, null, 2));
        return updateDriveFile(JSON.stringify(state, null, 2));
      })
      .then(function() {
        flashSyncStatus("☁️ Salvato");
        setLocalUpdatedAt(Date.now());
      })
      .catch(function(err) {
        console.error("Errore auto-sync:", err);
        flashSyncStatus("⚠️ Errore sync", true);
      })
      .then(function() { syncInProgress = false; });
  }, 2500);
}

// ======================
// TIMESTAMP LOCALE
// ======================

function getLocalUpdatedAt() {
  const v = localStorage.getItem("budgetStateUpdatedAt");
  return v ? Number(v) : 0;
}

function setLocalUpdatedAt(ts) {
  localStorage.setItem("budgetStateUpdatedAt", String(ts));
}