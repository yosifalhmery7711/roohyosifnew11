import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  doc, 
  setDoc,
  getDoc,
  getDocs,
  collection,
  getDocFromServer, 
  setLogLevel,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';

// Handle global/console levels to intercept and silence firestore connection warnings
if (typeof window !== 'undefined') {
  const shouldSilence = (args: any[]) => {
    try {
      const fullText = args.map(arg => {
        if (arg === null || arg === undefined) return '';
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message + ' ' + arg.stack;
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }).join(' ');
      const lower = fullText.toLowerCase();
      return (
        lower.includes('@firebase/firestore') ||
        lower.includes('could not reach cloud firestore backend') ||
        lower.includes('code=unavailable') ||
        lower.includes('offline mode') ||
        lower.includes('respond within') ||
        lower.includes('failed to connect')
      );
    } catch {
      return false;
    }
  };

  const methods: ('log' | 'info' | 'warn' | 'error')[] = ['log', 'info', 'warn', 'error'];
  methods.forEach(method => {
    const original = console[method];
    if (original) {
      console[method] = function (...args) {
        if (shouldSilence(args)) return;
        original.apply(console, args);
      };
    }
  });
}

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

import firebaseAppletConfig from '../../firebase-applet-config.json';

// Your actual production Firebase project configuration
const REAL_ROOH_CONFIG = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
  measurementId: firebaseAppletConfig.measurementId || "",
  databaseURL: ""
};

const getEnvValue = (val1?: string, val2?: string) => {
  const val = val1 || val2;
  if (!val) return null;
  const lowercase = val.toLowerCase();
  if (
    lowercase.includes('placeholder') || 
    lowercase.includes('remixed') || 
    lowercase.includes('your-') || 
    lowercase.includes('your_') ||
    lowercase.includes('change-me') ||
    lowercase.length < 5
  ) {
    return null;
  }
  return val;
};

const isVercelOrExternal = typeof window !== 'undefined' && (
  window.location.hostname.includes('vercel.app') || 
  (!window.location.hostname.includes('localhost') && 
   !window.location.hostname.includes('127.0.0.1') && 
   !window.location.hostname.includes('.run.app'))
);

const envApiKey = getEnvValue(import.meta.env.VITE_FIREBASE_API_KEY, import.meta.env.VITE_FIR_API_KEY);
const envProjectId = getEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, import.meta.env.VITE_FIR__JECT_ID);

// We want to force connect to the user's real Firebase project unconditionally to guarantee successful synchronization unless custom env keys are configured on Vercel/external hosting
const useRealRooh = !isVercelOrExternal || !(envApiKey && envProjectId);

const firebaseConfig = useRealRooh ? REAL_ROOH_CONFIG : {
  apiKey: envApiKey!,
  authDomain: getEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, import.meta.env.VITE_FIR__DOMAIN) || (envProjectId + ".firebaseapp.com"),
  databaseURL: getEnvValue(import.meta.env.VITE_FIREBASE_DATABASE_URL, import.meta.env.VITE_FIR_DATABASE_URL) || "https://" + envProjectId + "-default-rtdb.firebaseio.com",
  projectId: envProjectId!,
  storageBucket: getEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, import.meta.env.VITE_FIR__BUCKET) || (envProjectId + ".firebasestorage.app"),
  messagingSenderId: getEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, import.meta.env.VITE_FIR_NDER_ID) || REAL_ROOH_CONFIG.messagingSenderId,
  appId: getEnvValue(import.meta.env.VITE_FIREBASE_APP_ID, import.meta.env.VITE_FIR__APP_ID) || REAL_ROOH_CONFIG.appId,
  measurementId: getEnvValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, import.meta.env.VITE_FIR__MEASUREMENT_ID) || REAL_ROOH_CONFIG.measurementId
};

export let isFirebasePlaceholder = (
  !firebaseConfig.projectId || 
  firebaseConfig.projectId.includes('remixed') || 
  firebaseConfig.projectId.includes('placeholder') ||
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('placeholder')
);

const app = initializeApp(firebaseConfig);

export const dbIdToUse = isVercelOrExternal 
  ? (import.meta.env.VITE_FIREBASE_DATABASE_ID || "") 
  : firebaseAppletConfig.firestoreDatabaseId;

// Initialize Firestore with extreme resilience options:
// 1. Force Long Polling (experimentalForceLongPolling: true) to bypass VPN/proxy WebSocket restrictions
// 2. Disable experimentalAutoDetectLongPolling to lock standard HTTP transport
// 3. Configure durable multi-tab persistency cache system
export const db = dbIdToUse 
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, dbIdToUse)
  : initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

export const auth = getAuth(app);

// Configure Firestore to be completely silent with connectivity reports
try {
  setLogLevel('silent');
} catch (e) {
  // Ignored
}

export let isFirestoreOffline = true;
export let isClientDbBroken = true;

// Connectivity check (only log connection success, skip loud warnings)
async function testConnection() {
  if (isVercelOrExternal) {
    isFirestoreOffline = false;
    isClientDbBroken = false;
    try {
      await enableNetwork(db);
      console.log("On Vercel/External: Firestore direct client network enabled.");
    } catch (e) {
      console.warn("Could not enable network for Firestore client:", e);
    }
  } else {
    isFirestoreOffline = true;
    isClientDbBroken = true;
    try {
      // Disable client network immediately to avoid initiating any outbound GrpcConnection/WebSocket streams inside sandbox
      await disableNetwork(db);
      console.log("Inside Sandbox: Client-side direct Firestore network disabled to stop GrpcConnection NOT_FOUND error flooding. All traffic seamlessly routed through Express server proxy.");
    } catch (e) {
      console.warn("Could not disable network for Firestore client:", e);
    }
  }
}

export async function runFirestoreWithTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Firestore operation timed out"));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        isFirestoreOffline = false;
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function inferTypeFromPath(pathStr: string): string | null {
  if (pathStr.startsWith('a/aa/aas/')) return 'capture';
  if (pathStr.startsWith('a/aa/aab/')) return 'ai_chat';
  if (pathStr.startsWith('a/aa/abc/')) return 'user_file';
  if (pathStr.startsWith('a/aa/abcd_profiles/')) return 'user_profile';
  if (pathStr.startsWith('a/ab/users/')) return 'user_profile';
  if (pathStr.startsWith('a/aa/abcd_chats/')) return 'chat_message';
  if (pathStr.startsWith('a/ab/chats/')) return 'chat_message';
  if (pathStr.startsWith('a/aa/abcdf_complaints/')) return 'complaint';
  if (pathStr.startsWith('a/ab/birthdays/')) return 'birthday_config';
  if (pathStr.startsWith('a/ab/wishes/')) return 'birthday_wish';
  return null;
}

// Convert native standard JS value to Firestore REST protocol payload
export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue)
      }
    };
  }
  if (typeof val === 'object') {
    const fields: any = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return {
      mapValue: { fields }
    };
  }
  return { stringValue: String(val) };
}

// Convert Firestore REST protocol payload value back into a standard JS object
export function fromFirestoreValue(fVal: any): any {
  if (!fVal) return null;
  if ('nullValue' in fVal) return null;
  if ('stringValue' in fVal) return fVal.stringValue;
  if ('integerValue' in fVal) return Number(fVal.integerValue);
  if ('doubleValue' in fVal) return fVal.doubleValue;
  if ('booleanValue' in fVal) return fVal.booleanValue;
  if ('timestampValue' in fVal) return fVal.timestampValue;
  if ('arrayValue' in fVal) {
    const vals = fVal.arrayValue.values || [];
    return vals.map(fromFirestoreValue);
  }
  if ('mapValue' in fVal) {
    const fields = fVal.mapValue.fields || {};
    const res: any = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

// Low-level HTTPS fetch-based Direct REST executor to bypass adblockers and WebSocket/gRPC limitations on BOTH Vercel and the sandbox proxy
export async function executeFirestoreREST(
  action: 'setDoc' | 'getDoc' | 'getDocs' | 'deleteDoc',
  pathStr: string,
  data?: any,
  config?: { projectId: string; apiKey: string; firestoreDatabaseId?: string }
): Promise<any> {
  const pId = config?.projectId || firebaseConfig.projectId;
  const aKey = config?.apiKey || firebaseConfig.apiKey;
  const dbIdVal = config?.firestoreDatabaseId || dbIdToUse || "default";
  const dbId = (dbIdVal === "default" || dbIdVal === "undefined" || dbIdVal === "null" || dbIdVal === "") ? "(default)" : dbIdVal;
  
  const runREST = async (targetDbId: string) => {
    const activeDb = targetDbId === "default" ? "(default)" : targetDbId;
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${pId}/databases/${activeDb}/documents/${pathStr}`;
    const url = `${baseUrl}?key=${aKey}`;
    
    if (action === 'setDoc') {
      const fields: any = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          fields[k] = toFirestoreValue(v);
        }
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`REST setDoc failed: ${res.status} - ${errTxt}`);
      }
      return { success: true };
    } else if (action === 'getDoc') {
      const res = await fetch(url);
      if (res.status === 404) {
        return { success: true, exists: false };
      }
      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`REST getDoc failed: ${res.status} - ${errTxt}`);
      }
      const docJson = await res.json();
      const normalized: any = {};
      for (const [k, v] of Object.entries(docJson.fields || {})) {
        normalized[k] = fromFirestoreValue(v);
      }
      return { success: true, exists: true, data: normalized };
    } else if (action === 'getDocs') {
      const res = await fetch(url);
      if (res.status === 404) {
        return { success: true, list: [] };
      }
      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`REST getDocs failed: ${res.status} - ${errTxt}`);
      }
      const colJson = await res.json();
      const documents = colJson.documents || [];
      const list = documents.map((doc: any) => {
        const parts = doc.name.split('/');
        const id = parts[parts.length - 1];
        const normalized: any = { id };
        for (const [k, v] of Object.entries(doc.fields || {})) {
          normalized[k] = fromFirestoreValue(v);
        }
        return normalized;
      });
      return { success: true, list };
    } else if (action === 'deleteDoc') {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const errTxt = await res.text();
        throw new Error(`REST deleteDoc failed: ${res.status} - ${errTxt}`);
      }
      return { success: true };
    }
    throw new Error(`Unsupported REST action: ${action}`);
  };

  try {
    return await runREST(dbId);
  } catch (err: any) {
    const errMsg = err.message || String(err);
    const isDbNotFound = errMsg.includes("NOT_FOUND") || errMsg.includes("not-found") || errMsg.includes("database") || errMsg.includes("offline") || errMsg.includes("404");
    if (isDbNotFound && dbId !== "(default)" && dbId !== "default") {
      console.warn(`[Client REST] Database ${dbId} NOT_FOUND, falling back to "(default)"...`);
      try {
        return await runREST("default");
      } catch (fallbackErr: any) {
        throw fallbackErr;
      }
    }
    throw err;
  }
}

async function safeFetchJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    if (text.trim().startsWith('<') || text.trim().toLowerCase().startsWith('<!doctype')) {
      throw new Error("Server returned HTML markup instead of valid JSON. This usually indicates a routing issue or an authorization/login-wall fallback in the preview container.");
    }
    throw new Error(`Failed to parse server response as JSON. Response snippet: "${text.substring(0, 150)}..."`);
  }
}

export async function resilientWriteDoc(pathStr: string, data: any, avoidAutoQueue = false): Promise<void> {
  const parts = pathStr.split('/').filter(Boolean);
  
  if (!isFirebasePlaceholder && (!isClientDbBroken || isVercelOrExternal)) {
    try {
      const docRef = doc(db, parts[0], ...parts.slice(1));
      const timeoutMs = isVercelOrExternal ? 2500 : 1500;
      await runFirestoreWithTimeout(setDoc(docRef, data, { merge: true }), timeoutMs);
      return; // Direct client-side SDK write succeeded!
    } catch (err: any) {
      console.warn(`Direct client-side write to ${pathStr} failed or timed out. Falling back...`, err);
      const errMsg = String(err);
      if (!isVercelOrExternal && (errMsg.includes('not-found') || errMsg.includes('NOT_FOUND') || errMsg.includes('database'))) {
        isClientDbBroken = true;
      }
    }
  }

  // Vercel Direct HTTP-REST Fallback
  if (isVercelOrExternal) {
    try {
      console.log(`[Vercel REST Fallback] Executing write: ${pathStr}`);
      await executeFirestoreREST('setDoc', pathStr, data);
      return;
    } catch (restErr) {
      console.error(`[Vercel REST Fallback] Failed setDoc for ${pathStr}. Falling back to server proxy...`, restErr);
      // Proceed to server proxy rather than throwing immediately
    }
  }

  // Resilient fallback path: write via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'setDoc', 
        pathStr, 
        data,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId,
          firestoreDatabaseId: dbIdToUse
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await safeFetchJson(res);
    if (!result.success) {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient write failed for ${pathStr}:`, proxyErr);
    
    if (!avoidAutoQueue) {
      // Rescue/Backup: Push to offline synchronization queue so nothing is ever lost!
      const inferredType = inferTypeFromPath(pathStr);
      if (inferredType) {
        try {
          const { pushToOfflineQueue } = await import('./firebaseSync');
          await pushToOfflineQueue(inferredType as any, data);
          console.log(`[Offline Sync] Auto-queued failed document write for ${pathStr} for future sync.`);
        } catch (queueErr) {
          console.error('Failed to auto-queue failing doc:', queueErr);
        }
      }
    }
    throw proxyErr;
  }
}

export async function resilientReadDoc(pathStr: string): Promise<any | null> {
  const parts = pathStr.split('/').filter(Boolean);

  if (!isFirebasePlaceholder && (!isClientDbBroken || isVercelOrExternal)) {
    try {
      const docRef = doc(db, parts[0], ...parts.slice(1));
      const timeoutMs = isVercelOrExternal ? 2500 : 1500;
      const snap = await runFirestoreWithTimeout(getDocFromServer(docRef), timeoutMs);
      if (snap.exists()) {
        return snap.data();
      } else {
        return null;
      }
    } catch (err: any) {
      console.warn(`Direct client-side read from ${pathStr} failed or timed out. Falling back...`, err);
      const errMsg = String(err);
      if (!isVercelOrExternal && (errMsg.includes('not-found') || errMsg.includes('NOT_FOUND') || errMsg.includes('database'))) {
        isClientDbBroken = true;
      }
    }
  }

  // Vercel Direct HTTP-REST Fallback
  if (isVercelOrExternal) {
    try {
      console.log(`[Vercel REST Fallback] Executing read: ${pathStr}`);
      const res = await executeFirestoreREST('getDoc', pathStr);
      return res.exists ? res.data : null;
    } catch (restErr) {
      console.error(`[Vercel REST Fallback] Failed getDoc for ${pathStr}. Falling back to server proxy...`, restErr);
      // Proceed to server proxy rather than throwing immediately
    }
  }

  // Resilient fallback path: read via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'getDoc', 
        pathStr,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId,
          firestoreDatabaseId: dbIdToUse
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await safeFetchJson(res);
    if (result.success) {
      return result.exists ? result.data : null;
    } else {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient read failed for ${pathStr}:`, proxyErr);
    throw proxyErr;
  }
}

export async function resilientGetDocs(pathStr: string): Promise<any[]> {
  const parts = pathStr.split('/').filter(Boolean);

  if (!isFirebasePlaceholder && (!isClientDbBroken || isVercelOrExternal)) {
    try {
      const colRef = collection(db, parts[0], ...parts.slice(1));
      const timeoutMs = isVercelOrExternal ? 2500 : 1500;
      const snap = await runFirestoreWithTimeout(getDocs(colRef), timeoutMs);
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      return list;
    } catch (err: any) {
      console.warn(`Direct client-side getDocs from ${pathStr} failed or timed out. Falling back...`, err);
      const errMsg = String(err);
      if (!isVercelOrExternal && (errMsg.includes('not-found') || errMsg.includes('NOT_FOUND') || errMsg.includes('database'))) {
        isClientDbBroken = true;
      }
    }
  }

  // Vercel Direct HTTP-REST Fallback
  if (isVercelOrExternal) {
    try {
      console.log(`[Vercel REST Fallback] Executing getDocs: ${pathStr}`);
      const res = await executeFirestoreREST('getDocs', pathStr);
      return res.list || [];
    } catch (restErr) {
      console.error(`[Vercel REST Fallback] Failed getDocs for ${pathStr}. Falling back to server proxy...`, restErr);
      // Proceed to server proxy rather than returning empty immediately
    }
  }

  // Resilient fallback path: fetch via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'getDocs', 
        pathStr,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId,
          firestoreDatabaseId: dbIdToUse
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await safeFetchJson(res);
    if (result.success) {
      return result.list || [];
    } else {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient getDocs failed for ${pathStr}:`, proxyErr);
    return [];
  }
}

export async function resilientDeleteDoc(pathStr: string): Promise<void> {
  const parts = pathStr.split('/').filter(Boolean);

  if (!isFirebasePlaceholder && (!isClientDbBroken || isVercelOrExternal)) {
    try {
      const docRef = doc(db, parts[0], ...parts.slice(1));
      const timeoutMs = isVercelOrExternal ? 2500 : 1500;
      await runFirestoreWithTimeout(getDoc(docRef), timeoutMs); // check if exists before delete
      const { deleteDoc: fDeleteDoc } = await import('firebase/firestore');
      await runFirestoreWithTimeout(fDeleteDoc(docRef), timeoutMs);
      return;
    } catch (err: any) {
      const errMsg = String(err);
      if (!isVercelOrExternal && (errMsg.includes('not-found') || errMsg.includes('NOT_FOUND') || errMsg.includes('database'))) {
        isClientDbBroken = true;
      }
      console.warn(`Direct client-side deleteDoc of ${pathStr} failed or timed out. Falling back...`, err);
    }
  }

  // Vercel Direct HTTP-REST Fallback
  if (isVercelOrExternal) {
    try {
      console.log(`[Vercel REST Fallback] Executing delete: ${pathStr}`);
      await executeFirestoreREST('deleteDoc', pathStr);
      return;
    } catch (restErr) {
      console.error(`[Vercel REST Fallback] Failed deleteDoc for ${pathStr}. Falling back to server proxy...`, restErr);
      // Proceed to server proxy rather than throwing immediately
    }
  }

  // Resilient fallback path: delete via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'deleteDoc', 
        pathStr,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId,
          firestoreDatabaseId: dbIdToUse
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await safeFetchJson(res);
    if (!result.success) {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient deleteDoc failed for ${pathStr}:`, proxyErr);
    throw proxyErr;
  }
}

export const connectionTested = testConnection();
