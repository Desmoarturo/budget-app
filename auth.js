// ======================
// AUTENTICAZIONE GOOGLE
// ======================

// >>> SOSTITUISCI QUESTO CON IL TUO CLIENT ID <<<
const GOOGLE_CLIENT_ID = "1084093193215-v6rjpj7u436nerku64hce3q4uota65ph.apps.googleusercontent.com.apps.googleusercontent.com";

const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.appdata";

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let currentUser = null;

// ======================
// INIZIALIZZAZIONE
// ======================

function initAuth() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.indexOf("INSERISCI") === 0) {
    console.warn("Client ID Google non configurato. La sincronizzazione è disabilitata.");
    updateAuthUI();
    return;
  }

  if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
    console.warn("Google Identity Services non caricato.");
    updateAuthUI();
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: function(response) {
      if (response.error) {
        console.error("Errore login Google:", response);
        alert("Errore login: " + response.error);
        return;
      }
      accessToken = response.access_token;
      tokenExpiry = Date.now() + (response.expires_in ? response.expires_in * 1000 : 3600000);
      fetchUserInfo();
      onLoginSuccess();
    }
  });

  updateAuthUI();
}

function fetchUserInfo() {
  fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    currentUser = { email: data.email, name: data.name, picture: data.picture };
    updateAuthUI();
  })
  .catch(function(err) { console.warn("Impossibile recuperare info utente", err); });
}

// ======================
// LOGIN / LOGOUT
// ======================

function requestLogin() {
  if (!tokenClient) {
    alert("Google Sign-In non configurato. Controlla il Client ID in auth.js.");
    return;
  }
  tokenClient.requestAccessToken({ prompt: "consent" });
}

function logoutGoogle() {
  if (accessToken && typeof google !== "undefined") {
    google.accounts.oauth2.revoke(accessToken, function() {
      accessToken = null;
      tokenExpiry = 0;
      currentUser = null;
      updateAuthUI();
    });
  } else {
    accessToken = null;
    tokenExpiry = 0;
    currentUser = null;
    updateAuthUI();
  }
}

function isLoggedIn() {
  return accessToken && Date.now() < tokenExpiry;
}

function getAccessToken() {
  if (!isLoggedIn()) return null;
  return accessToken;
}

// ======================
// CALLBACK
// ======================

function onLoginSuccess() {
  updateAuthUI();
  if (typeof syncWithDrive === "function") {
    syncWithDrive();
  }
}

// ======================
// UI
// ======================

function updateAuthUI() {
  const btn = document.getElementById("auth-btn");
  const status = document.getElementById("auth-status");
  if (!btn) return;

  if (isLoggedIn()) {
    btn.textContent = "🔓 Esci";
    btn.title = currentUser ? currentUser.email : "Logout";
    btn.classList.add("logged");
    if (status) {
      status.textContent = currentUser ? "☁️ " + currentUser.email : "☁️ Sincronizzato";
      status.classList.add("synced");
    }
  } else {
    btn.textContent = "☁️ Accedi";
    btn.title = "Accedi con Google per sincronizzare";
    btn.classList.remove("logged");
    if (status) {
      status.textContent = "⚠️ Non sincronizzato";
      status.classList.remove("synced");
    }
  }
}

function flashSyncStatus(text, isError) {
  const status = document.getElementById("auth-status");
  if (!status) return;
  const original = status.textContent;
  status.textContent = text;
  status.style.color = isError ? "var(--rosso)" : "var(--verde-scuro)";
  setTimeout(function() {
    status.textContent = original;
    status.style.color = "";
  }, 2500);
}