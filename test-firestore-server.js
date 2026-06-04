import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

async function test() {
  console.log("Starting server-size Firestore test...");
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error("firebase-applet-config.json not found!");
    process.exit(1);
  }
  
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log("Using config:", JSON.stringify(configData, null, 2));
  
  const app = initializeApp(configData, 'test-app');
  const db = getFirestore(app, configData.firestoreDatabaseId || "(default)");
  
  const testRef = doc(db, 'a', 'aa', 'diagnostic_checks', 'direct_node_test_run');
  try {
    console.log("Writing to Firestore...");
    await setDoc(testRef, { lastNodeCheck: new Date().toISOString() }, { merge: true });
    console.log("Successfully wrote test doc!");
    
    console.log("Reading from Firestore...");
    const snap = await getDoc(testRef);
    if (snap.exists()) {
      console.log("Read success:", JSON.stringify(snap.data()));
    } else {
      console.log("Read returned empty snap!");
    }
  } catch (err) {
    console.error("Operation failed:", err);
  }
}

test();
