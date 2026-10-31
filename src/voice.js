import { send } from './net.js';
export async function startVoice(ws, slot, onState) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const audio = new Audio(); audio.autoplay = true; document.body.appendChild(audio);
    pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); onState('on'); };
    pc.onicecandidate = e => { if (e.candidate) send(ws, { type: 'signal', data: { candidate: e.candidate } }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') onState('on'); };
    let makingOffer = false;
    async function offer() { if (slot !== 0) return; try { makingOffer = true; await pc.setLocalDescription(await pc.createOffer()); send(ws, { type: 'signal', data: { description: pc.localDescription } }); } catch {} finally { makingOffer = false; } }
    async function handle(data) {
      if (data.description) {
        const desc = data.description;
        if (desc.type === 'offer') { await pc.setRemoteDescription(desc); await pc.setLocalDescription(await pc.createAnswer()); send(ws, { type: 'signal', data: { description: pc.localDescription } }); }
        else if (desc.type === 'answer') await pc.setRemoteDescription(desc);
      } else if (data.candidate) { try { await pc.addIceCandidate(data.candidate); } catch {} }
    }
    setTimeout(offer, 1200);
    onState('waiting');
    return { handle, offer, stop() { stream.getTracks().forEach(t => t.stop()); pc.close(); audio.remove(); } };
  } catch (e) { onState('denied'); return { handle() {}, stop() {} }; }
}
