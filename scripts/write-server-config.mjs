import fs from 'node:fs';
const port = Number(process.env.PORT || 3000);
const serverUrl = (process.env.GAME_SERVER_URL || (process.env.E2B_SANDBOX_ID ? `https://${port}-${process.env.E2B_SANDBOX_ID}.e2b.app` : '')).replace(/\/$/, '');
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/server-config.json', JSON.stringify({ serverUrl, room: 'district-1', maxPlayers: 2 }, null, 2) + '\n');
console.log('Game server for APK:', serverUrl || '(not set)');
