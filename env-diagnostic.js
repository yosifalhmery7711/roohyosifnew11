import fs from 'fs';

function inspectEnv() {
  const envKeys = Object.keys(process.env);
  const matched = envKeys.filter(k => 
    k.includes('GOOGLE') || 
    k.includes('FIREBASE') || 
    k.includes('GCP') || 
    k.includes('CREDENTIALS') || 
    k.includes('TOKEN') || 
    k.includes('AUTH') ||
    k.includes('KEY')
  );
  
  console.log("Matched Environment Keys:", matched);
  
  // Print values safely
  matched.forEach(k => {
    const val = process.env[k];
    if (val) {
      console.log(`- ${k}: Length ${val.length}, prefix: ${val.substring(0, 10)}...`);
    } else {
      console.log(`- ${k}: EMPTY`);
    }
  });
}

inspectEnv();
