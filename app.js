(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const menuScreen = $('#menu-screen');
  const gameScreen = $('#game-screen');
  const activePhoto = $('#active-photo');
  const stagePhoto = $('#stage-photo');
  const photoUpload = $('#photo-upload');
  const impactLabel = $('#impact-label');
  const fxLayer = $('#fx-layer');
  const currentSound = $('#current-sound');
  const soundNow = $('.sound-now');
  const liveAnnouncer = $('#live-announcer');
  const audioToggle = $('#audio-toggle');
  const audioLabel = $('#audio-label');
  const installButton = $('#install-button');

  const SOUND_BANK = [
    {
      name: 'Короткий «пфф»', shout: 'ПФФ!', color: '#d7ff56',
      pulses: [{ at: 0, length: .27, from: 145, to: 68, volume: .2, grit: .58, wobble: 3.5 }]
    },
    {
      name: 'Бульк-бульк', shout: 'БУЛЬК!', color: '#69e7d7',
      pulses: [
        { at: 0, length: .16, from: 116, to: 76, volume: .18, grit: .62, wobble: 8 },
        { at: .17, length: .16, from: 132, to: 66, volume: .19, grit: .7, wobble: 10 },
        { at: .38, length: .23, from: 108, to: 50, volume: .22, grit: .68, wobble: 6 }
      ]
    },
    {
      name: 'Турбо-пшик', shout: 'ТРРР!', color: '#ffbd4a',
      pulses: [{ at: 0, length: .57, from: 178, to: 53, peak: 112, volume: .18, grit: .72, wobble: 18, rise: true }]
    },
    {
      name: 'Пружинка', shout: 'ПРЫГ!', color: '#d9a4ff',
      pulses: [
        { at: 0, length: .2, from: 105, to: 72, volume: .18, grit: .52, wobble: 20 },
        { at: .23, length: .2, from: 152, to: 78, volume: .2, grit: .58, wobble: 17 },
        { at: .5, length: .22, from: 125, to: 48, volume: .2, grit: .7, wobble: 14 }
      ]
    },
    {
      name: 'Дробный залп', shout: 'ПА-ПА-ПА!', color: '#ff8d78',
      pulses: [
        { at: 0, length: .1, from: 155, to: 90, volume: .17, grit: .53, wobble: 7 },
        { at: .13, length: .11, from: 142, to: 76, volume: .18, grit: .59, wobble: 8 },
        { at: .28, length: .11, from: 160, to: 75, volume: .19, grit: .61, wobble: 7 },
        { at: .43, length: .1, from: 132, to: 68, volume: .2, grit: .7, wobble: 9 },
        { at: .59, length: .22, from: 110, to: 50, volume: .2, grit: .72, wobble: 6 }
      ]
    },
    {
      name: 'Суперкомбо', shout: 'КОМБО!', color: '#85a9ff',
      pulses: [
        { at: 0, length: .15, from: 160, to: 82, volume: .17, grit: .5, wobble: 4 },
        { at: .17, length: .15, from: 134, to: 65, volume: .2, grit: .62, wobble: 9 },
        { at: .35, length: .42, from: 152, to: 45, peak: 90, volume: .21, grit: .78, wobble: 13, rise: true }
      ]
    },
    {
      name: 'Финальный раскат', shout: 'БА-ДУМ!', color: '#f5e66b',
      pulses: [{ at: 0, length: .91, from: 91, to: 39, peak: 118, volume: .23, grit: .82, wobble: 9, rise: true }]
    }
  ];

  let soundEnabled = true;
  let hitCount = 0;
  let nextSoundIndex = 0;
  let activeObjectUrl = null;
  let audioContext = null;
  let noiseBuffer = null;
  let deferredInstallPrompt = null;
  let effectTimeout = 0;

  function updateAudioToggle() {
    audioToggle.setAttribute('aria-pressed', String(soundEnabled));
    audioToggle.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
    audioLabel.textContent = soundEnabled ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ';
  }

  function selectPhoto(photo) {
    if (activeObjectUrl && activeObjectUrl !== photo.src) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    if (photo.isLocal) activeObjectUrl = photo.src;

    activePhoto.src = photo.src;
    activePhoto.alt = photo.alt || photo.title;
    $('#photo-caption').textContent = photo.title;
    $('#selected-title').textContent = photo.title.toLocaleUpperCase('ru-RU');
    $('#arena-title').textContent = 'Приготовься!';
    hitCount = 0;
    nextSoundIndex = 0;
    $('#hit-count').textContent = '00';
    $('#current-sound').textContent = 'Нажми на фото, чтобы начать';
    soundNow.classList.remove('is-playing');
    $$('.sound-pad').forEach((pad) => pad.classList.remove('is-current'));
    menuScreen.hidden = true;
    gameScreen.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function returnToMenu() {
    gameScreen.hidden = true;
    menuScreen.hidden = false;
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    photoUpload.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getAudioContext() {
    if (audioContext) return audioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audioContext = new Context();
    return audioContext;
  }

  function getNoiseBuffer(context) {
    if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
    const length = Math.ceil(context.sampleRate * 1.1);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      // Slightly correlated noise gives the synthetic effects a soft, raspy body.
      const white = Math.random() * 2 - 1;
      last = last * .22 + white * .78;
      samples[i] = last;
    }
    return noiseBuffer;
  }

  function setEnvelope(gainParam, start, length, peak) {
    const attack = Math.min(.025, length * .22);
    const releaseAt = start + length;
    gainParam.setValueAtTime(.0001, start);
    gainParam.exponentialRampToValueAtTime(Math.max(.0002, peak), start + attack);
    gainParam.setValueAtTime(Math.max(.0002, peak * .62), start + length * .52);
    gainParam.exponentialRampToValueAtTime(.0001, releaseAt);
  }

  function schedulePulse(context, profile, pulse, offset) {
    const start = context.currentTime + offset + pulse.at;
    const stop = start + pulse.length + .035;
    const oscillator = context.createOscillator();
    const toneFilter = context.createBiquadFilter();
    const toneGain = context.createGain();
    const wobble = pulse.wobble || 0;

    oscillator.type = pulse.length < .13 ? 'triangle' : 'sawtooth';
    oscillator.frequency.setValueAtTime(Math.max(35, pulse.from), start);
    if (pulse.rise && pulse.peak) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, pulse.peak), start + pulse.length * .34);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, pulse.to), start + pulse.length);
    } else {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, pulse.to), start + pulse.length);
    }
    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(830, start);
    toneFilter.frequency.exponentialRampToValueAtTime(310, start + pulse.length);
    toneFilter.Q.value = 1.15;
    setEnvelope(toneGain.gain, start, pulse.length, pulse.volume);
    oscillator.connect(toneFilter).connect(toneGain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(stop);

    if (wobble > 0) {
      const lfo = context.createOscillator();
      const lfoDepth = context.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 10 + wobble * .42;
      lfoDepth.gain.value = wobble;
      lfo.connect(lfoDepth).connect(oscillator.frequency);
      lfo.start(start);
      lfo.stop(stop);
    }

    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = getNoiseBuffer(context);
    noise.playbackRate.value = .88 + Math.random() * .21;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(650 + Math.random() * 180, start);
    noiseFilter.frequency.exponentialRampToValueAtTime(260, start + pulse.length);
    noiseFilter.Q.value = .72;
    setEnvelope(noiseGain.gain, start, pulse.length, pulse.grit * .2);
    noise.connect(noiseFilter).connect(noiseGain).connect(context.destination);
    noise.start(start);
    noise.stop(stop);
  }

  function synthesizeSound(index) {
    if (!soundEnabled) return;
    let context;
    try {
      context = getAudioContext();
    } catch (error) {
      console.warn('Не удалось включить аудио:', error);
      currentSound.textContent = 'Звук недоступен в этом браузере';
      return;
    }
    if (!context) {
      currentSound.textContent = 'Звук недоступен в этом браузере';
      return;
    }
    const play = () => {
      const profile = SOUND_BANK[index];
      const offset = .012;
      profile.pulses.forEach((pulse) => schedulePulse(context, profile, pulse, offset));
    };
    if (context.state === 'suspended') {
      context.resume().then(play).catch((error) => console.warn('Аудио пока недоступно:', error));
    } else {
      play();
    }
  }

  function createPuffs() {
    const glyphs = ['✳', '·', '✦', '◌', '☁'];
    for (let i = 0; i < 8; i += 1) {
      const puff = document.createElement('span');
      puff.className = 'puff';
      puff.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      puff.style.setProperty('--x', `${28 + Math.random() * 46}%`);
      puff.style.setProperty('--y', `${48 + Math.random() * 24}%`);
      puff.style.setProperty('--dx', `${Math.round((Math.random() - .5) * 118)}px`);
      puff.style.setProperty('--dy', `${Math.round((Math.random() - .5) * 65)}px`);
      puff.style.setProperty('--rot', `${Math.round((Math.random() - .5) * 60)}deg`);
      puff.style.setProperty('--size', `${12 + Math.round(Math.random() * 16)}px`);
      puff.style.setProperty('--puff-color', Math.random() > .55 ? '#d7ff56' : '#ff9b76');
      fxLayer.appendChild(puff);
      window.setTimeout(() => puff.remove(), 900);
    }
  }

  function play(index) {
    const safeIndex = (index + SOUND_BANK.length) % SOUND_BANK.length;
    const sound = SOUND_BANK[safeIndex];
    hitCount += 1;
    nextSoundIndex = (safeIndex + 1) % SOUND_BANK.length;

    $('#hit-count').textContent = String(hitCount).padStart(2, '0');
    $('#arena-title').textContent = sound.shout;
    currentSound.textContent = `${String(safeIndex + 1).padStart(2, '0')} / 07 · ${sound.name}`;
    impactLabel.textContent = sound.shout;
    impactLabel.style.color = sound.color;
    soundNow.classList.add('is-playing');
    $$('.sound-pad').forEach((pad) => {
      const isCurrent = Number(pad.dataset.soundIndex) === safeIndex;
      pad.classList.toggle('is-current', isCurrent);
      pad.setAttribute('aria-pressed', String(isCurrent));
    });

    stagePhoto.classList.remove('is-bopping');
    impactLabel.classList.remove('is-visible');
    // Restart the CSS animations even if the user taps rapidly.
    void stagePhoto.offsetWidth;
    stagePhoto.classList.add('is-bopping');
    impactLabel.classList.add('is-visible');
    window.clearTimeout(effectTimeout);
    effectTimeout = window.setTimeout(() => {
      stagePhoto.classList.remove('is-bopping');
      impactLabel.classList.remove('is-visible');
    }, 800);
    createPuffs();
    synthesizeSound(safeIndex);
  }

  $$('.photo-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectPhoto({
        src: card.dataset.photo,
        title: card.dataset.title,
        alt: $('img', card).alt
      });
    });
  });

  $('#stage-photo').addEventListener('click', () => play(nextSoundIndex));
  $('#play-button').addEventListener('click', () => play(nextSoundIndex));
  $('#back-button').addEventListener('click', returnToMenu);
  $$('.sound-pad').forEach((pad) => {
    pad.addEventListener('click', () => play(Number(pad.dataset.soundIndex)));
  });

  $('#upload-button').addEventListener('click', () => photoUpload.click());
  photoUpload.addEventListener('change', () => {
    const file = photoUpload.files && photoUpload.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      liveAnnouncer.textContent = 'Пожалуйста, выбери файл изображения.';
      photoUpload.value = '';
      return;
    }
    const imageUrl = URL.createObjectURL(file);
    selectPhoto({ src: imageUrl, title: file.name.replace(/\.[^.]+$/, '') || 'Моё фото', alt: 'Загруженное фото', isLocal: true });
  });

  audioToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateAudioToggle();
    if (!soundEnabled) soundNow.classList.remove('is-playing');
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installButton.hidden = true;
    deferredInstallPrompt = null;
  });

  updateAudioToggle();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      const workerUrl = new URL('./service-worker.js', document.baseURI);
      navigator.serviceWorker.register(workerUrl.href, { scope: new URL('./', document.baseURI).pathname })
        .catch((error) => console.warn('Не удалось сохранить игру для офлайн-режима:', error));
    });
  }
})();
