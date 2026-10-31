import { send } from './net.js';

// Запрашиваем системный доступ к микрофону сразу по нажатию «Играть онлайн».
// Бразер/ОС может не показать окно повторно, если разрешение уже выдано навсегда.
export function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve(null);
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).catch(() => null);
}

export async function startVoice(ws, slot, onState, micPromise) {
  const noop = { handle() {}, offer() {}, stop() {} };
  const stream = await (micPromise || requestMicrophone());
  if (!stream) { onState('denied'); return noop; }
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  } catch { stream.getTracks().forEach(t => t.stop()); onState('denied'); return noop; }
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  const audio = new Audio(); audio.autoplay = true; audio.style.display = 'none'; document.body.appendChild(audio);
  let stopped = false, makingOffer = false, ignoreOffer = false;
  const polite = slot !== 0;
  pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); onState('on'); };
  pc.onicecandidate = e => { if (e.candidate && !stopped) send(ws, { type: 'signal', data: { candidate: e.candidate } }); };
  pc.onnegotiationneeded = async () => { if (polite || stopped) return; await offer(); };
  pc.onconnectionstatechange = () => {
    if (stopped) return;
    if (pc.connectionState === 'connected') onState('on');
    else if (['disconnected', 'failed'].includes(pc.connectionState)) onState('waiting');
  };
  async function offer() {
    if (stopped || polite) return;
    try { makingOffer = true; await pc.setLocalDescription(await pc.createOffer()); send(ws, { type: 'signal', data: { description: pc.localDescription } }); }
    catch {} finally { makingOffer = false; }
  }
  async function handle(data) {
    if (stopped || !data) return;
    try {
      if (data.description) {
        const desc = data.description;
        const collision = desc.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        ignoreOffer = !polite && collision;
        if (ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); send(ws, { type: 'signal', data: { description: pc.localDescription } }); }
      } else if (data.candidate) { await pc.addIceCandidate(data.candidate); }
    } catch (e) { if (!ignoreOffer) console.warn('voice signal', e); }
  }
  onState('waiting');
  if (!polite) setTimeout(offer, 800);
  return { handle, offer, stop() { stopped = true; stream.getTracks().forEach(t => t.stop()); pc.close(); audio.remove(); } };
}
