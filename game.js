/* LUDO MASTER PRO - Standalone Universal Game Engine */
(function () {
  'use strict';

  // --- 1. FIREBASE CONFIG & INIT ---
  const firebaseConfig = {
    apiKey: "AIzaSyDnfIFlNgFAaY5k4DcpeanXnTYan_VaTg0",
    authDomain: "ludo-739f9.firebaseapp.com",
    databaseURL: "https://ludo-739f9-default-rtdb.firebaseio.com",
    projectId: "ludo-739f9",
    storageBucket: "ludo-739f9.firebasestorage.app",
    messagingSenderId: "256500867340",
    appId: "1:256500867340:web:f31ce7983d4236f8df2929"
  };

  let db = null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  } catch (e) {
    console.warn("Firebase Init Error:", e);
  }

  // User Session Handling
  let localUserData = null;
  try {
    localUserData = JSON.parse(localStorage.getItem('ludo_user') || 'null');
  } catch (e) {}

  if (!localUserData) {
    const guestName = "Guest_" + Math.floor(1000 + Math.random() * 9000);
    localUserData = { username: guestName, safeUsername: guestName, coins: 1000, isGuest: true };
    localStorage.setItem('ludo_user', JSON.stringify(localUserData));
  }

  const currentUsername = localUserData.username || "Player";
  const safeUsername = localUserData.safeUsername || currentUsername.replace(/[.#$\[\]@]/g, '_');
  let currentCoins = localUserData.coins !== undefined ? localUserData.coins : 1000;

  // --- 2. AUDIO SYNTHESIZER ---
  class LoudAudioMaster {
    constructor() {
      this.ctx = null;
      this.compressor = null;
    }
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
          this.compressor.knee.setValueAtTime(28, this.ctx.currentTime);
          this.compressor.ratio.setValueAtTime(14, this.ctx.currentTime);
          this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
          this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(2.2, this.ctx.currentTime);
          this.compressor.connect(gain);
          gain.connect(this.ctx.destination);
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    playTone(freq, type, duration, vol = 0.55) {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.compressor);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    }
    roll() {
      this.init();
      let c = 0;
      const iv = setInterval(() => {
        this.playTone(210 + Math.random() * 260, 'square', 0.045, 0.45);
        c++;
        if (c > 5) clearInterval(iv);
      }, 38);
    }
    step(idx) { this.playTone(430 + (idx % 14) * 28, 'sine', 0.065, 0.7); }
    capture() {
      this.playTone(260, 'sawtooth', 0.14, 0.9);
      setTimeout(() => this.playTone(105, 'sawtooth', 0.32, 1.0), 60);
    }
    rewind(step) { this.playTone(680 + (step % 8) * 45, 'triangle', 0.035, 0.45); }
    bonus() {
      this.playTone(740, 'triangle', 0.12, 0.75);
      setTimeout(() => this.playTone(1080, 'triangle', 0.24, 0.85), 85);
    }
    home() {
      [587.33, 739.99, 880, 1174.66].forEach((f, i) => {
        setTimeout(() => this.playTone(f, 'triangle', 0.22, 0.8), i * 70);
      });
    }
    win() {
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
        setTimeout(() => this.playTone(f, 'triangle', 0.4, 0.9), i * 100);
      });
    }
    warningBeep() { this.playTone(850, 'sine', 0.08, 0.5); }
    cheerAndApplause() {
      this.init();
      if (!this.ctx) return;
      const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      chords.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 'triangle', 0.5, 0.7), idx * 110);
      });
      const bufferSize = this.ctx.sampleRate * 2.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.7));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 1.2;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2.2);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor || this.ctx.destination);
      noise.start();
    }
  }
  const sound = new LoudAudioMaster();

  function triggerHaptic() {
    if (navigator.vibrate) navigator.vibrate(80);
  }

  // --- 3. WEBRTC & CHAT MODULE ---
  let localStream = null;
  let peerConnection = null;
  let remoteAudioElement = null;
  let isMicOn = false;
  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  async function toggleVoiceChat() {
    const micBtn = document.getElementById('mic-toggle-btn');
    if (!isMicOn) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        isMicOn = true;
        micBtn.classList.add('active');
        micBtn.innerText = '🎙️ Mic On';
        if (isOnline && roomRef) initVoicePeer();
      } catch (err) {
        alert('Microphone permission required for voice chat!');
      }
    } else {
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      if (peerConnection) { peerConnection.close(); peerConnection = null; }
      isMicOn = false;
      micBtn.classList.remove('active');
      micBtn.innerText = '🎙️ Mic Off';
    }
  }

  function initVoicePeer() {
    if (!isOnline || !roomRef || !localStream) return;
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      if (!remoteAudioElement) {
        remoteAudioElement = new Audio();
        remoteAudioElement.autoplay = true;
      }
      remoteAudioElement.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        roomRef.child('signals/' + (myPlayerId === 0 ? 'hostCandidate' : 'guestCandidate')).set(JSON.stringify(event.candidate));
      }
    };

    if (myPlayerId === 0) {
      peerConnection.createOffer().then(offer => {
        peerConnection.setLocalDescription(offer);
        roomRef.child('signals/offer').set(JSON.stringify(offer));
      });
    }

    roomRef.child('signals').on('value', async (snap) => {
      const signals = snap.val();
      if (!signals || !peerConnection) return;
      if (myPlayerId === 2 && signals.offer && !peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(signals.offer)));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        roomRef.child('signals/answer').set(JSON.stringify(answer));
      }
      if (myPlayerId === 0 && signals.answer && !peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(signals.answer)));
      }
      if (myPlayerId === 0 && signals.guestCandidate) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(signals.guestCandidate))); } catch (e) {}
      }
      if (myPlayerId === 2 && signals.hostCandidate) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(signals.hostCandidate))); } catch (e) {}
      }
    });
  }

  function toggleChatDrawer() {
    document.getElementById('chat-drawer').classList.toggle('open');
  }

  function sendChatMessage() {
    const input = document.getElementById('chat-text-input');
    const text = input.value.trim();
    if (!text) return;
    const payload = { senderId: myPlayerId, senderName: currentUsername, text: text, time: Date.now() };
    if (isOnline && roomRef) roomRef.child('chat').push(payload);
    else renderChatMessage(payload);
    input.value = '';
  }

  function renderChatMessage(msg) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.senderId === myPlayerId ? 'mine' : 'theirs'}`;
    div.innerHTML = `<strong>${msg.senderName}:</strong> ${msg.text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // --- 4. BOARD COORDINATES & GAME STATE ---
  const COMMON_PATH = [
    {r:6, c:1}, {r:6, c:2}, {r:6, c:3}, {r:6, c:4}, {r:6, c:5},
    {r:5, c:6}, {r:4, c:6}, {r:3, c:6}, {r:2, c:6}, {r:1, c:6}, {r:0, c:6},
    {r:0, c:7},
    {r:0, c:8}, {r:1, c:8}, {r:2, c:8}, {r:3, c:8}, {r:4, c:8}, {r:5, c:8},
    {r:6, c:9}, {r:6, c:10}, {r:6, c:11}, {r:6, c:12}, {r:6, c:13}, {r:6, c:14},
    {r:7, c:14},
    {r:8, c:14}, {r:8, c:13}, {r:8, c:12}, {r:8, c:11}, {r:8, c:10}, {r:8, c:9},
    {r:9, c:8}, {r:10, c:8}, {r:11, c:8}, {r:12, c:8}, {r:13, c:8}, {r:14, c:8},
    {r:14, c:7},
    {r:14, c:6}, {r:13, c:6}, {r:12, c:6}, {r:11, c:6}, {r:10, c:6}, {r:9, c:6},
    {r:8, c:5}, {r:8, c:4}, {r:8, c:3}, {r:8, c:2}, {r:8, c:1}, {r:8, c:0},
    {r:7, c:0}, {r:6, c:0}
  ];

  const HOME_PATHS = {
    0: [{r:13, c:7}, {r:12, c:7}, {r:11, c:7}, {r:10, c:7}, {r:9, c:7}, {r:8, c:7}],
    2: [{r:1, c:7}, {r:2, c:7}, {r:3, c:7}, {r:4, c:7}, {r:5, c:7}, {r:6, c:7}]
  };

  const SAFE_POINTS = [0, 8, 13, 21, 26, 34, 39, 47];

  const BASES = {
    0: [{r:10.8, c:1.8}, {r:10.8, c:3.8}, {r:12.8, c:1.8}, {r:12.8, c:3.8}],
    2: [{r:1.8, c:10.8}, {r:1.8, c:12.8}, {r:3.8, c:10.8}, {r:3.8, c:12.8}]
  };

  let tokens = [];
  let currentTurn = 0;
  let diceVal = 1;
  let state = 'ROLL';
  let validMoves = [];
  let particles = [];
  let confettiRibbons = [];
  let animClock = 0;
  let consecutiveSixes = 0;

  let isOnline = false;
  let myPlayerId = 0;
  let roomCode = null;
  let roomRef = null;
  let turnTimerInterval = null;
  let turnTimeLeft = 15;
  let strikes = { 0: 0, 2: 0 };
  let isMovingOptimistic = false;

  const canvas = document.getElementById('boardCanvas');
  const ctx = canvas.getContext('2d');
  const statusMsg = document.getElementById('status-msg');
  const diceRed = document.getElementById('dice-red');
  const diceYellow = document.getElementById('dice-yellow');
  const deckRed = document.getElementById('deck-red');
  const deckYellow = document.getElementById('deck-yellow');
  const timerRed = document.getElementById('timer-red');
  const timerYellow = document.getElementById('timer-yellow');
  const heartsRed = document.getElementById('hearts-red');
  const heartsYellow = document.getElementById('hearts-yellow');
  const topRoomBadge = document.getElementById('top-room-badge');
  const topRoomCode = document.getElementById('top-room-code');

  document.getElementById('player-profile-name').innerText = currentUsername;
  document.getElementById('player-coin-count').innerText = currentCoins;

  // Check saved match
  try {
    const activeMatch = JSON.parse(sessionStorage.getItem('ludo_active_match') || 'null');
    if (activeMatch && activeMatch.roomCode) {
      document.getElementById('rejoin-prompt').style.display = 'block';
    }
  } catch (e) {}

  function updateCoinsInDB(newAmount) {
    currentCoins = newAmount;
    document.getElementById('player-coin-count').innerText = currentCoins;
    localUserData.coins = currentCoins;
    localStorage.setItem('ludo_user', JSON.stringify(localUserData));
    if (db && !localUserData.isGuest) {
      db.ref('users/' + safeUsername).update({ coins: currentCoins });
    }
  }

  function logout() {
    sessionStorage.removeItem('ludo_active_match');
    localStorage.removeItem('ludo_user');
    window.location.href = 'index.html';
  }

  function copyRoomCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    alert("Room Code Copied: " + roomCode);
  }

  function resumeSavedMatch() {
    const activeMatch = JSON.parse(sessionStorage.getItem('ludo_active_match') || 'null');
    if (!activeMatch || !db) return;

    roomCode = activeMatch.roomCode;
    myPlayerId = activeMatch.myPlayerId;
    isOnline = true;
    roomRef = db.ref('rooms/' + roomCode);

    roomRef.once('value').then(snap => {
      const val = snap.val();
      if (!val || val.status === 'FINISHED') {
        alert('Saved room expired.');
        sessionStorage.removeItem('ludo_active_match');
        document.getElementById('rejoin-prompt').style.display = 'none';
        return;
      }

      document.getElementById('name-red').innerText = (myPlayerId === 0 ? currentUsername : (val.host || 'Red')) + " (Red)";
      document.getElementById('name-yellow').innerText = (myPlayerId === 2 ? currentUsername : (val.guest || 'Yellow')) + " (Yellow)";
      topRoomCode.innerText = roomCode;
      topRoomBadge.style.display = 'inline-block';

      document.getElementById('screen-lobby').classList.remove('active');
      document.getElementById('screen-game').classList.add('active');

      tokens = val.tokens || tokens;
      currentTurn = val.currentTurn || 0;
      diceVal = val.diceVal || 1;
      strikes = val.strikes || { 0: 0, 2: 0 };
      updateScores();
      updateHeartsUI();
      setTurnUI();
      listenToRoom();
    });
  }

  function startOfflineMode() {
    isOnline = false;
    myPlayerId = 0;
    topRoomBadge.style.display = 'none';
    sessionStorage.removeItem('ludo_active_match');
    document.getElementById('name-red').innerText = currentUsername + " (Red)";
    document.getElementById('name-yellow').innerText = "Grandmaster AI";
    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    initGame();
  }

  function createRoom() {
    if (currentCoins < 100) {
      alert("Kam se kam 100 coins hone chahiye!");
      return;
    }
    if (!db) {
      alert("Database connection offline!");
      return;
    }

    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    myPlayerId = 0;
    isOnline = true;

    updateCoinsInDB(currentCoins - 100);
    initGame();

    sessionStorage.setItem('ludo_active_match', JSON.stringify({ roomCode: roomCode, myPlayerId: 0 }));
    topRoomCode.innerText = roomCode;
    topRoomBadge.style.display = 'inline-block';

    roomRef = db.ref('rooms/' + roomCode);
    roomRef.set({
      host: currentUsername,
      guest: null,
      currentTurn: 0,
      diceVal: 1,
      consecutiveSixes: 0,
      tokens: tokens,
      reaction: null,
      status: 'WAITING',
      betAmount: 100,
      strikes: { 0: 0, 2: 0 },
      riggedDice: { red: 'AUTO', yellow: 'AUTO' }
    }).then(() => {
      document.getElementById('name-red').innerText = currentUsername + " (Red)";
      document.getElementById('name-yellow').innerText = "Waiting for Guest...";
      document.getElementById('screen-lobby').classList.remove('active');
      document.getElementById('screen-game').classList.add('active');
      statusMsg.innerText = "Room ready! Opponent ka wait ho raha hai...";
      listenToRoom();
    }).catch(err => {
      alert("Room create error: " + err.message);
    });
  }

  function joinRoom() {
    const codeInput = document.getElementById('room-code-input').value.trim();
    if (!codeInput) { alert("Room Code dalein!"); return; }
    if (currentCoins < 100) { alert("Kam se kam 100 coins hone chahiye!"); return; }
    if (!db) { alert("Database error!"); return; }

    roomCode = codeInput;
    myPlayerId = 2;
    isOnline = true;
    roomRef = db.ref('rooms/' + roomCode);

    roomRef.once('value').then(snap => {
      const val = snap.val();
      if (!val) { alert("Room nahi mila!"); return; }
      if (val.status !== 'WAITING' && val.guest !== currentUsername) {
        alert("Room full ya expired!");
        return;
      }

      updateCoinsInDB(currentCoins - 100);
      sessionStorage.setItem('ludo_active_match', JSON.stringify({ roomCode: roomCode, myPlayerId: 2 }));
      topRoomCode.innerText = roomCode;
      topRoomBadge.style.display = 'inline-block';

      roomRef.update({
        guest: currentUsername,
        status: 'PLAYING'
      }).then(() => {
        document.getElementById('name-red').innerText = val.host + " (Red)";
        document.getElementById('name-yellow').innerText = currentUsername + " (Yellow)";
        document.getElementById('screen-lobby').classList.remove('active');
        document.getElementById('screen-game').classList.add('active');
        initGame();
        listenToRoom();
      });
    });
  }

  function listenToRoom() {
    if (!roomRef) return;

    roomRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;

      if (data.guest && myPlayerId === 0) {
        document.getElementById('name-yellow').innerText = data.guest + " (Yellow)";
      }

      if (data.reaction && (!window.lastReactionTime || window.lastReactionTime !== data.reaction.time)) {
        window.lastReactionTime = data.reaction.time;
        showFloatingReaction(data.reaction.emoji, data.reaction.player);
      }

      if (data.strikes) {
        strikes = data.strikes;
        updateHeartsUI();
      }

      if (data.status === 'FINISHED' && data.winner !== undefined && state !== 'WIN') {
        handleRemoteForfeit(data.winner);
        return;
      }

      if (isOnline && data.tokens && !isMovingOptimistic) {
        tokens = data.tokens;
        diceVal = data.diceVal || 1;
        consecutiveSixes = data.consecutiveSixes || 0;

        if (currentTurn !== data.currentTurn) {
          currentTurn = data.currentTurn;
          updateScores();
          setTurnUI();
        }

        if (data.lastAction === 'ROLL' && data.actor !== myPlayerId) {
          animateOpponentRoll(data.currentTurn, data.diceVal);
        }
      }
    });

    roomRef.child('chat').on('child_added', (snap) => {
      const msg = snap.val();
      if (msg) renderChatMessage(msg);
    });
  }

  function animateOpponentRoll(player, val) {
    sound.roll();
    const targetDice = (player === 0) ? diceRed : diceYellow;
    targetDice.classList.add('rolling');
    setTimeout(() => {
      targetDice.classList.remove('rolling');
      targetDice.setAttribute('data-val', val);
    }, 360);
  }

  function syncStateToFirebase(actionType, extraData = {}) {
    if (!isOnline || !roomRef) return;
    roomRef.update({
      tokens: tokens,
      currentTurn: currentTurn,
      diceVal: diceVal,
      consecutiveSixes: consecutiveSixes,
      strikes: strikes,
      lastAction: actionType,
      ...extraData
    });
  }

  function sendReaction(emoji) {
    if (isOnline && roomRef) {
      roomRef.update({ reaction: { emoji: emoji, player: myPlayerId, time: Date.now() } });
    } else {
      showFloatingReaction(emoji, myPlayerId);
    }
  }

  function showFloatingReaction(emoji, player) {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.fontSize = '2.8rem';
    el.style.zIndex = '100';
    el.style.pointerEvents = 'none';
    el.innerText = emoji;
    el.style.left = (player === 0 ? '25%' : '75%');
        el.style.top = (player === 0 ? '70%' : '15%');
    document.getElementById('game-shell').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function initGame() {
    tokens = [
      { player: 0, id: 0, step: -1, isDone: false },
      { player: 0, id: 1, step: -1, isDone: false },
      { player: 0, id: 2, step: -1, isDone: false },
      { player: 0, id: 3, step: -1, isDone: false },
      { player: 2, id: 0, step: -1, isDone: false },
      { player: 2, id: 1, step: -1, isDone: false },
      { player: 2, id: 2, step: -1, isDone: false },
      { player: 2, id: 3, step: -1, isDone: false }
    ];
    particles = [];
    confettiRibbons = [];
    currentTurn = 0;
    consecutiveSixes = 0;
    strikes = { 0: 0, 2: 0 };
    isMovingOptimistic = false;
    updateScores();
    updateHeartsUI();
    setTurnUI();
  }

  function updateHeartsUI() {
    const renderHearts = (strikeCount) => {
      let h = '';
      for (let i = 0; i < 3; i++) h += (i < 3 - strikeCount) ? '❤️' : '🖤';
      return h;
    };
    heartsRed.innerText = renderHearts(strikes[0]);
    heartsYellow.innerText = renderHearts(strikes[2]);
  }

  function startTurnTimer() {
    clearInterval(turnTimerInterval);
    turnTimeLeft = 15;
    updateTimerDisplay();

    if (!isOnline || currentTurn === myPlayerId) triggerHaptic();

    turnTimerInterval = setInterval(() => {
      turnTimeLeft--;
      updateTimerDisplay();

      if (turnTimeLeft <= 3 && turnTimeLeft > 0) sound.warningBeep();

      if (turnTimeLeft <= 0) {
        clearInterval(turnTimerInterval);
        handleTurnTimeout();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const activeTimer = (currentTurn === 0) ? timerRed : timerYellow;
    const inactiveTimer = (currentTurn === 0) ? timerYellow : timerRed;

    activeTimer.innerText = `⏱ ${turnTimeLeft}s`;
    inactiveTimer.innerText = '';

    if (turnTimeLeft <= 3) activeTimer.classList.add('danger');
    else activeTimer.classList.remove('danger');
  }

  function handleTurnTimeout() {
    strikes[currentTurn]++;
    updateHeartsUI();

    if (strikes[currentTurn] >= 3) {
      const winnerId = (currentTurn === 0) ? 2 : 0;
      executeForfeitWin(winnerId);
      return;
    }

    statusMsg.innerText = `Time Out! Strike ${strikes[currentTurn]}/3!`;

    if (state === 'SELECT' && validMoves.length > 0) {
      moveToken(validMoves[0]);
    } else {
      if (!isOnline || currentTurn === myPlayerId) switchTurn();
    }
  }

  function triggerConfettiShower() {
    const palette = ['#e11d48', '#3b82f6', '#10b981', '#fbbf24', '#a855f7', '#ec4899'];
    confettiRibbons = [];
    for (let i = 0; i < 110; i++) {
      confettiRibbons.push({
        x: 300, y: 300,
        w: Math.random() * 9 + 4, h: Math.random() * 7 + 4,
        vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.7) * 17,
        rot: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 14,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 1.0, decay: Math.random() * 0.012 + 0.007
      });
    }
  }

  function executeForfeitWin(winnerId) {
    state = 'WIN';
    clearInterval(turnTimerInterval);
    sessionStorage.removeItem('ludo_active_match');

    sound.cheerAndApplause();
    triggerConfettiShower();
    triggerHaptic();

    const isMeWinner = (winnerId === myPlayerId);
    statusMsg.innerText = isMeWinner ? "🏆 Opponent Inactive! You Won! (+180 Coins)" : "❌ Match Forfeit! Inactive for 3 turns.";

    if (isMeWinner) updateCoinsInDB(currentCoins + 180);

    spawnBurst(winnerId, { r: 7.5, c: 7.5 }, 90);

    if (isOnline) {
      roomRef.update({
        status: 'FINISHED',
        winner: winnerId,
        strikes: strikes
      });
    }
  }

  function handleRemoteForfeit(winnerId) {
    state = 'WIN';
    clearInterval(turnTimerInterval);
    sessionStorage.removeItem('ludo_active_match');

    sound.cheerAndApplause();
    triggerConfettiShower();
    triggerHaptic();

    const isMeWinner = (winnerId === myPlayerId);
    statusMsg.innerText = isMeWinner ? "🏆 Opponent Inactive! You Won! (+180 Coins)" : "❌ Match Forfeit! Inactive for 3 turns.";

    if (isMeWinner) updateCoinsInDB(currentCoins + 180);
    spawnBurst(winnerId, { r: 7.5, c: 7.5 }, 80);
  }

  function setTurnUI() {
    startTurnTimer();
    diceRed.setAttribute('data-val', diceVal);
    diceYellow.setAttribute('data-val', diceVal);

    if (currentTurn === 0) {
      deckRed.classList.add('active-turn');
      deckYellow.classList.remove('active-turn');

      if (!isOnline || myPlayerId === 0) {
        state = 'ROLL';
        diceRed.classList.remove('disabled');
        diceYellow.classList.add('disabled');
        statusMsg.innerText = "Aapka Turn! (15s Baaki)";
      } else {
        state = 'WAIT';
        diceRed.classList.add('disabled');
        diceYellow.classList.add('disabled');
        statusMsg.innerText = "Red player chaal chal raha hai...";
      }
    } else {
      deckYellow.classList.add('active-turn');
      deckRed.classList.remove('active-turn');

      if (isOnline && myPlayerId === 2) {
        state = 'ROLL';
        diceYellow.classList.remove('disabled');
        diceRed.classList.add('disabled');
        statusMsg.innerText = "Aapka Turn! (15s Baaki)";
      } else if (!isOnline) {
        state = 'MOVING';
        diceYellow.classList.remove('disabled');
        diceRed.classList.add('disabled');
        statusMsg.innerText = "Grandmaster AI chaal soch raha hai...";
        setTimeout(handleAITurn, 600);
      } else {
        state = 'WAIT';
        diceYellow.classList.add('disabled');
        diceRed.classList.add('disabled');
        statusMsg.innerText = "Opponent chaal chal raha hai...";
      }
    }
  }

  async function handleDiceClick(player) {
    if (state !== 'ROLL' || currentTurn !== player) return;
    if (isOnline && currentTurn !== myPlayerId) return;

    sound.roll();
    const activeDice = (player === 0) ? diceRed : diceYellow;
    activeDice.classList.add('rolling');

    let targetVal = null;
    if (isOnline && roomRef) {
      try {
        const snap = await roomRef.child('riggedDice').once('value');
        const rigged = snap.val();
        if (rigged) {
          const playerKey = (player === 0 ? 'red' : 'yellow');
          if (rigged[playerKey] && rigged[playerKey] !== 'AUTO') {
            targetVal = parseInt(rigged[playerKey], 10);
          }
        }
      } catch (e) {}
    }

    diceVal = targetVal || (Math.floor(Math.random() * 6) + 1);

    if (diceVal === 6) consecutiveSixes++;
    else consecutiveSixes = 0;

    if (consecutiveSixes === 3) {
      consecutiveSixes = 0;
      statusMsg.innerText = "Lagatar 3 bar 6 aaya! Turn Cancel!";
      if (isOnline) syncStateToFirebase('ROLL_CANCEL', { actor: myPlayerId });
      setTimeout(switchTurn, 800);
      return;
    }

    setTimeout(() => {
      activeDice.classList.remove('rolling');
      activeDice.setAttribute('data-val', diceVal);

      if (isOnline) syncStateToFirebase('ROLL', { actor: myPlayerId });

      validMoves = getValidTokens(player, diceVal);

      if (validMoves.length === 0) {
        statusMsg.innerText = `Koi move nahi mila! (${diceVal})`;
        setTimeout(switchTurn, 750);
        return;
      }

      if (validMoves.length === 1) {
        moveToken(validMoves[0]);
      } else {
        state = 'SELECT';
        statusMsg.innerText = `${diceVal} Aaya! Goti touch karein.`;
      }
    }, 360);
  }

  function evaluateAIMove(token, roll) {
    let score = 0;
    const curStep = token.step;
    const targetStep = (curStep === -1) ? 0 : curStep + roll;

    if (targetStep === 56) return 2500;
    if (curStep === -1 && roll === 6) score += 400;

    if (targetStep < 51) {
      const targetPos = getCoords(2, targetStep);
      const isSafeTarget = SAFE_POINTS.some(i => COMMON_PATH[i].r === targetPos.r && COMMON_PATH[i].c === targetPos.c);

      if (!isSafeTarget) {
        const wouldKill = tokens.some(p => p.player === 0 && !p.isDone && p.step >= 0 && p.step < 51 &&
          getCoords(0, p.step).r === targetPos.r && getCoords(0, p.step).c === targetPos.c);
        if (wouldKill) score += 750;
      }
      if (isSafeTarget) score += 220;
    } else if (targetStep >= 51 && targetStep < 56) {
      score += 260;
    }
    return score + targetStep * 2.5;
  }

  function handleAITurn() {
    sound.roll();
    diceYellow.classList.add('rolling');
    diceVal = Math.floor(Math.random() * 6) + 1;

    setTimeout(() => {
      diceYellow.classList.remove('rolling');
      diceYellow.setAttribute('data-val', diceVal);

      if (diceVal === 6) consecutiveSixes++;
      else consecutiveSixes = 0;

      if (consecutiveSixes === 3) {
        consecutiveSixes = 0;
        statusMsg.innerText = "AI ke 3 bar 6 aaye! Turn Cancel!";
        setTimeout(switchTurn, 800);
        return;
      }

      const aiMoves = getValidTokens(2, diceVal);
      if (aiMoves.length === 0) {
        statusMsg.innerText = `AI ka ${diceVal} aaya, koi move nahi!`;
        setTimeout(switchTurn, 750);
        return;
      }

      aiMoves.sort((a, b) => evaluateAIMove(b, diceVal) - evaluateAIMove(a, diceVal));
      moveToken(aiMoves[0]);
    }, 360);
  }

  function getValidTokens(p, roll) {
    return tokens.filter(t => {
      if (t.player !== p || t.isDone) return false;
      if (t.step === -1) return roll === 6;
      return t.step + roll <= 56;
    });
  }

  function moveToken(tok) {
    state = 'MOVING';
    isMovingOptimistic = true;
    const from = tok.step;
    const to = (from === -1) ? 0 : from + diceVal;

    if (from === -1) {
      tok.step = 0;
      sound.step(0);
      spawnBurst(tok.player, getCoords(tok.player, 0), 16);
      afterMove(tok, false, false);
    } else {
      let curr = from;
      const iv = setInterval(() => {
        curr++;
        tok.step = curr;
        sound.step(curr);
        if (curr >= to) {
          clearInterval(iv);
          let justReachedHome = false;
          if (tok.step === 56) {
            tok.isDone = true;
            justReachedHome = true;
            sound.home();
            spawnBurst(tok.player, { r: (tok.player === 0 ? 8 : 6), c: 7 }, 36);
          }
          checkCapture(tok, (captured) => {
            afterMove(tok, captured, justReachedHome);
          });
        }
      }, 100);
    }
  }

  function checkCapture(tok, callback) {
    if (tok.step < 0 || tok.step >= 51) { callback(false); return; }
    const c = getCoords(tok.player, tok.step);
    if (SAFE_POINTS.some(i => COMMON_PATH[i].r === c.r && COMMON_PATH[i].c === c.c)) { callback(false); return; }

    let capturedPawn = null;
    tokens.forEach(other => {
      if (other.player !== tok.player && !other.isDone && other.step >= 0 && other.step < 51) {
        const oc = getCoords(other.player, other.step);
        if (oc.r === c.r && oc.c === c.c) capturedPawn = other;
      }
    });

    if (!capturedPawn) { callback(false); return; }

    sound.capture();
    spawnBurst(capturedPawn.player, c, 28);
    state = 'REWINDING';
    statusMsg.innerText = "Goti Kat Gayi! Reverse...";

    let revStep = capturedPawn.step;
    const rIv = setInterval(() => {
      revStep--;
      capturedPawn.step = revStep;
      sound.rewind(revStep);

      if (revStep <= -1) {
        clearInterval(rIv);
        capturedPawn.step = -1;
        spawnBurst(capturedPawn.player, BASES[capturedPawn.player][capturedPawn.id], 14);
        setTimeout(() => callback(true), 200);
      }
    }, 55);
  }

  function afterMove(tok, captured, justReachedHome) {
    updateScores();
    const redWon = tokens.filter(t => t.player === 0 && t.isDone).length === 4;
    const yellowWon = tokens.filter(t => t.player === 2 && t.isDone).length === 4;

    if (redWon || yellowWon) {
      state = 'WIN';
      const winnerName = redWon ? "Red" : "Yellow";
      statusMsg.innerText = `🏆 JEET! ${winnerName.toUpperCase()} WINNER HAI! (+180 Coins)`;
      
      sound.cheerAndApplause();
      triggerConfettiShower();
      triggerHaptic();

      spawnBurst(redWon ? 0 : 2, { r: 7.5, c: 7.5 }, 80);

      sessionStorage.removeItem('ludo_active_match');
      const isWinner = (redWon && myPlayerId === 0) || (yellowWon && myPlayerId === 2);
      if (isWinner) updateCoinsInDB(currentCoins + 180);

      if (isOnline) {
        roomRef.update({ status: 'FINISHED', winner: redWon ? 0 : 2 });
        syncStateToFirebase('WIN', { winner: redWon ? 0 : 2 });
      }
      isMovingOptimistic = false;
      return;
    }

    const getsBonus = (diceVal === 6 || captured || justReachedHome);
    if (isOnline) syncStateToFirebase('MOVE_DONE', { movedToken: tok.id });
    isMovingOptimistic = false;

    if (getsBonus) {
      sound.bonus();
      statusMsg.innerText = justReachedHome ? "🎯 Home! Extra Roll!" : (captured ? "⚔️ Goti Kaati! Extra Roll!" : "🎲 6 Aaya! Extra Roll!");
      setTimeout(setTurnUI, 700);
    } else {
      switchTurn();
    }
  }

  function switchTurn() {
    currentTurn = (currentTurn === 0) ? 2 : 0;
    if (isOnline) syncStateToFirebase('SWITCH_TURN');
    else setTurnUI();
  }

  function updateScores() {
    const redDone = tokens.filter(t => t.player === 0 && t.isDone).length;
    const yellowDone = tokens.filter(t => t.player === 2 && t.isDone).length;
    document.getElementById('score-red').innerText = `${redDone}/4 Home`;
    document.getElementById('score-yellow').innerText = `${yellowDone}/4 Home`;
  }

  function getCoords(player, step) {
    if (step >= 0 && step <= 50) {
      const offset = (player === 0) ? 39 : 13;
      const idx = (offset + step) % 52;
      return COMMON_PATH[idx];
    }
    if (step >= 51 && step <= 56) return HOME_PATHS[player][step - 51];
    return { r: 7, c: 7 };
  }

  function spawnBurst(player, pos, count = 18) {
    const s = 40;
    const cx = (pos.c + 0.5) * s;
    const cy = (pos.r + 0.5) * s;
    const color = (player === 0) ? '#e11d48' : '#eab308';

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5.5;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: 1.0, color: (Math.random() > 0.4) ? color : '#fbbf24',
        size: 2.5 + Math.random() * 3
      });
    }
  }

  function drawClassicPawn(cx, cy, colorMain, colorDark, scale = 1, isJumping = false) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.beginPath();
    ctx.ellipse(0, 14, 11 * (isJumping ? 0.7 : 1), 5 * (isJumping ? 0.7 : 1), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 10, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = colorDark;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6.5, 9);
    ctx.quadraticCurveTo(-3.5, -2, -3.5, -6);
    ctx.lineTo(3.5, -6);
    ctx.quadraticCurveTo(3.5, -2, 6.5, 9);
    ctx.closePath();
    ctx.fillStyle = colorMain;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -9.5, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = colorMain;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    ctx.restore();
  }

  function drawBoardBackground() {
    const s = 40;
    ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 6*s, 6*s);
    ctx.fillStyle = '#eab308'; ctx.fillRect(9*s, 0, 6*s, 6*s);
    ctx.fillStyle = '#e11d48'; ctx.fillRect(0, 9*s, 6*s, 6*s);
    ctx.fillStyle = '#16a34a'; ctx.fillRect(9*s, 9*s, 6*s, 6*s);

    const drawBaseCircle = (cx, cy) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();
    };
    drawBaseCircle(3*s, 3*s);
    drawBaseCircle(12*s, 3*s);
    drawBaseCircle(3*s, 12*s);
    drawBaseCircle(12*s, 12*s);

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const inBase = (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8);
        const inCenter = (r >= 6 && r <= 8 && c >= 6 && c <= 8);

        if (!inBase && !inCenter) {
          ctx.fillStyle = '#ffffff';

          if (r === 13 && c === 6) ctx.fillStyle = '#e11d48';
          if (c === 7 && r >= 9 && r <= 13) ctx.fillStyle = '#e11d48';
          if (r === 1 && c === 8) ctx.fillStyle = '#eab308';
          if (c === 7 && r >= 1 && r <= 5) ctx.fillStyle = '#eab308';
          if (r === 6 && c === 1) ctx.fillStyle = '#2563eb';
          if (r === 7 && c >= 1 && c <= 5) ctx.fillStyle = '#2563eb';
          if (r === 8 && c === 13) ctx.fillStyle = '#16a34a';
          if (r === 7 && c >= 9 && c <= 13) ctx.fillStyle = '#16a34a';

          ctx.fillRect(c*s, r*s, s, s);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(c*s, r*s, s, s);

          if (SAFE_POINTS.some(i => COMMON_PATH[i].r === r && COMMON_PATH[i].c === c)) {
            let dColor = '#1e293b';
            if ((r === 13 && c === 6) || (r === 1 && c === 8)) dColor = '#ffffff';
            ctx.fillStyle = dColor;
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦', (c+0.5)*s, (r+0.5)*s);
          }
        }
      }
    }

    ctx.beginPath(); ctx.moveTo(6*s, 6*s); ctx.lineTo(7.5*s, 7.5*s); ctx.lineTo(6*s, 9*s); ctx.fillStyle = '#2563eb'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(6*s, 6*s); ctx.lineTo(7.5*s, 7.5*s); ctx.lineTo(9*s, 6*s); ctx.fillStyle = '#eab308'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(9*s, 6*s); ctx.lineTo(7.5*s, 7.5*s); ctx.lineTo(9*s, 9*s); ctx.fillStyle = '#16a34a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(6*s, 9*s); ctx.lineTo(7.5*s, 7.5*s); ctx.lineTo(9*s, 9*s); ctx.fillStyle = '#e11d48'; ctx.fill();
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5; ctx.strokeRect(6*s, 6*s, 3*s, 3*s);
  }

  function render() {
    animClock += 0.08;
    ctx.clearRect(0, 0, 600, 600);
    const s = 40;

    drawBoardBackground();

    if (state === 'SELECT' && (!isOnline || currentTurn === myPlayerId)) {
      validMoves.forEach(t => {
        const targetStep = (t.step === -1) ? 0 : t.step + diceVal;
        if (targetStep <= 56) {
          const targetPos = getCoords(t.player, targetStep);
          ctx.fillStyle = 'rgba(251, 191, 36, 0.38)';
          ctx.fillRect(targetPos.c * s, targetPos.r * s, s, s);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(targetPos.c * s, targetPos.r * s, s, s);
        }
      });
    }

    const clusterMap = new Map();
    tokens.forEach(tok => {
      if (tok.step >= 0 && !tok.isDone) {
        const pos = getCoords(tok.player, tok.step);
        const key = `${pos.r},${pos.c}`;
        if (!clusterMap.has(key)) clusterMap.set(key, []);
        clusterMap.get(key).push(tok);
      }
    });

    tokens.forEach(tok => {
      let x, y;
      let scale = 1;

      if (tok.step === -1) {
        const bp = BASES[tok.player][tok.id];
        x = (bp.c + 0.5) * s;
        y = (bp.r + 0.5) * s;
      } else if (tok.isDone) {
        x = 7.5 * s;
        y = (tok.player === 0) ? (8.2 - tok.id * 0.15) * s : (6.8 + tok.id * 0.15) * s;
      } else {
        const pos = getCoords(tok.player, tok.step);
        const key = `${pos.r},${pos.c}`;
        const cluster = clusterMap.get(key);
        const count = cluster.length;
        const idx = cluster.indexOf(tok);

        x = (pos.c + 0.5) * s;
        y = (pos.r + 0.5) * s;

        if (count > 1) {
          const angle = (idx / count) * 2 * Math.PI;
          x += Math.cos(angle) * 8.5;
          y += Math.sin(angle) * 8.5;
          scale = 0.82;
        }
      }

            const isMyTurn = !isOnline || currentTurn === myPlayerId;
      const isJumping = (state === 'SELECT' && isMyTurn && validMoves.some(m => m.id === tok.id && m.player === tok.player));
      if (isJumping) {
        y -= Math.abs(Math.sin(animClock * 3.8)) * 12;
        ctx.beginPath();
        ctx.arc(x, y + 2, 20 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.fill();
      }

      const colorMain = (tok.player === 0) ? '#e11d48' : '#eab308';
      const colorDark = (tok.player === 0) ? '#9f1239' : '#ca8a04';
      drawClassicPawn(x, y, colorMain, colorDark, scale, isJumping);
    });

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.035;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    for (let j = confettiRibbons.length - 1; j >= 0; j--) {
      const cf = confettiRibbons[j];
      cf.x += cf.vx;
      cf.y += cf.vy;
      cf.vy += 0.35;
      cf.vx *= 0.98;
      cf.rot += cf.rotSpeed;
      cf.life -= cf.decay;

      if (cf.life <= 0) {
        confettiRibbons.splice(j, 1);
        continue;
      }

      ctx.save();
      ctx.translate(cf.x, cf.y);
      ctx.rotate((cf.rot * Math.PI) / 180);
      ctx.globalAlpha = cf.life;
      ctx.fillStyle = cf.color;
      ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
      ctx.restore();
    }

    requestAnimationFrame(render);
  }

  function handleCanvasTouch(e) {
    if (state !== 'SELECT') return;
    if (isOnline && currentTurn !== myPlayerId) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scale = 600 / rect.width;
    const clickX = (clientX - rect.left) * scale;
    const clickY = (clientY - rect.top) * scale;
    const s = 40;

    for (let tok of validMoves) {
      let x, y;
      if (tok.step === -1) {
        const bp = BASES[tok.player][tok.id];
        x = (bp.c + 0.5) * s; y = (bp.r + 0.5) * s;
      } else {
        const pos = getCoords(tok.player, tok.step);
        x = (pos.c + 0.5) * s; y = (pos.r + 0.5) * s;
      }

      if (Math.hypot(clickX - x, clickY - y) <= 44) {
        moveToken(tok);
        break;
      }
    }
  }

  diceRed.addEventListener('click', () => handleDiceClick(0));
  diceYellow.addEventListener('click', () => handleDiceClick(2));
  canvas.addEventListener('click', handleCanvasTouch);
  canvas.addEventListener('touchstart', handleCanvasTouch, { passive: true });

  // Expose global window hooks for HTML buttons
  window.createRoom = createRoom;
  window.joinRoom = joinRoom;
  window.startOfflineMode = startOfflineMode;
  window.resumeSavedMatch = resumeSavedMatch;
  window.copyRoomCode = copyRoomCode;
  window.logout = logout;
  window.sendReaction = sendReaction;
  window.toggleVoiceChat = toggleVoiceChat;
  window.toggleChatDrawer = toggleChatDrawer;
  window.sendChatMessage = sendChatMessage;

  initGame();
  render();
})();
