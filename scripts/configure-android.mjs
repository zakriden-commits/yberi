import fs from 'node:fs';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  let s = fs.readFileSync(manifestPath, 'utf8');
  const perms = ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'];
  for (const p of perms) if (!s.includes(p)) s = s.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  if (!s.includes('android.hardware.microphone')) s = s.replace('</manifest>', '    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n</manifest>');
  fs.writeFileSync(manifestPath, s);
  console.log('Android microphone permissions added');
}
