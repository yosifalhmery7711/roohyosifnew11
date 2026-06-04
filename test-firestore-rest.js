import fs from 'fs';
import path from 'path';

function toFirestoreValue(val) {
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
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return {
      mapValue: { fields }
    };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(fVal) {
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
    const res = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

async function testREST() {
  console.log("Starting Firestore REST API test...");
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error("firebase-applet-config.json not found!");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const projectId = config.projectId;
  const apiKey = config.apiKey;
  const dbId = "(default)";

  const pathsToTest = [
    "a/aa/abcd_profiles",
    "a/aa/aas",
    "a/aa/abc",
    "a/aa/aab",
    "a/ab/chats",
    "a/aa/abcd_chats"
  ];

  for (const pathStr of pathsToTest) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${pathStr}?key=${apiKey}`;
    try {
      console.log(`\nGET: ${url}`);
      const res = await fetch(url);
      console.log(`HTTP Status for ${pathStr}: ${res.status}`);
      const resJson = await res.json();
      if (res.ok) {
        console.log(`Success details for ${pathStr}:`, Object.keys(resJson));
      } else {
        console.error(`Error details for ${pathStr}:`, JSON.stringify(resJson, null, 2));
      }
    } catch (err) {
      console.error(`Fetch error for ${pathStr}:`, err);
    }
  }
}

testREST();
