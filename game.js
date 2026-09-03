/* Firebase Engine, Confetti Blast, 15s Timer & Board Control */
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
  console.warn("Firebase direct mode warning:", e);
}

// User Session Safe Fallback
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

document.getElementById('player-profile-name').innerText = currentUsername;
document.getElementById('player-coin-count').innerText = currentCoins;

function logout() {
  sessionStorage.removeItem('ludo_active_match');
  localStorage.removeItem('ludo_user');
  window.location.href = 'index.html';
}

function updateCoinsInDB(newAmount) {
  currentCoins = newAmount;
  document.getElementById('player-coin-count').innerText = currentCoins;
  localUserData.coins = currentCoins;
  localStorage.setItem('ludo_user', JSON.stringify(localUserData));
  if (db && !localUserData.isGuest) {
    db.ref('users/' + safeUsername).update({ coins: currentCoins });
  }
}

/* Board Coordinates Engine */
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

window.addEventListener('DOMContentLoaded', () => {
  try {
    const activeMatch = JSON.parse(sessionStorage.getItem('ludo_active_match') || 'null');
    if (activeMatch && activeMatch.roomCode) {
      document.getElementById('rejoin-prompt').style.display = 'block';
    }
  } catch(e) {}
});

function showPermanentRoomBadge(code) {
  topRoomCode.innerText = code;
  topRoomBadge.style.display = 'inline-block';
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
      alert('Saved room already completed ya expired hai.');
      sessionStorage.removeItem('ludo_active_match');
      document.getElementById('rejoin-prompt').style.display = 'none';
      return;
    }

    document.getElementById('name-red').innerText = (myPlayerId === 0 ? currentUsername : (val.host || 'Red')) + " (Red)";
    document.getElementById('name-yellow').innerText = (myPlayerId === 2 ? currentUsername : (val.guest || 'Yellow')) + " (Yellow)";
    showPermanentRoomBadge(roomCode);

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
    alert("Match fees ke liye kam se kam 100 virtual coins hone chahiye!");
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
  showPermanentRoomBadge(roomCode);

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
    strikes: { 0: 0, 2: 0 }
  }).then(() => {
    document.getElementById('name-red').innerText = currentUsername + " (Red)";
    document.getElementById('name-yellow').innerText = "Waiting for Guest...";
    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    statusMsg.innerText = "Room created! Opponent ka wait ho raha hai...";
    listenToRoom();
  }).catch(err => {
    alert("Room create error: " + err.message);
  });
}

function joinRoom() {
  const codeInput = document.getElementById('room-code-input').value.trim();
  if (!codeInput) { alert("Kripya Room Code dalein!"); return; }
  if (currentCoins < 100) { alert("Match fees ke liye kam se kam 100 coins hone chahiye!"); return; }
  if (!db) { alert("Database connection error!"); return; }

  roomCode = codeInput;
  myPlayerId = 2;
  isOnline = true;
  roomRef = db.ref('rooms/' + roomCode);

  roomRef.once('value').then(snap => {
    const val = snap.val();
    if (!val) { alert("Room code exist nahi karta!"); return; }
    if (val.status !== 'WAITING' && val.guest !== currentUsername) {
      alert("Room full ya expired ho chuka hai!");
      return;
    }

    updateCoinsInDB(currentCoins - 100);
    sessionStorage.setItem('ludo_active_match', JSON.stringify({ roomCode: roomCode, myPlayerId: 2 }));
    showPermanentRoomBadge(roomCode);

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
  el.className = 'floating-reaction';
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
    for (let i = 0; i < 3; i++) {
      h += (i < 3 - strikeCount) ? '❤️' : '🖤';
    }
    return h;
  };
  heartsRed.innerText = renderHearts(strikes[0]);
  heartsYellow.innerText = renderHearts(strikes[2]);
}

function startTurnTimer() {
  clearInterval(turnTimerInterval);
  turnTimeLeft = 15;
  updateTimerDisplay();

  if (!isOnline || currentTurn === myPlayerId) {
    triggerHaptic();
  }

  turnTimerInterval = setInterval(() => {
    turnTimeLeft--;
    updateTimerDisplay();

    if (turnTimeLeft <= 3 && turnTimeLeft > 0) {
      sound.warningBeep();
    }

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

  statusMsg.innerText = `Time Out! Strike ${strikes[currentTurn]}/3 lag gaya!`;

  if (state === 'SELECT' && validMoves.length > 0) {
    moveToken(validMoves[0]);
  } else {
    if (!isOnline || currentTurn === myPlayerId) {
      switchTurn();
    }
  }
}

/* Confetti Ribbon Generator */
function triggerConfettiShower() {
  const palette = ['#e11d48', '#3b82f6', '#10b981', '#fbbf24', '#a855f7', '#ec4899'];
  confettiRibbons = [];
  for (let i = 0; i < 110; i++) {
    confettiRibbons.push({
      x: 300,
      y: 300,
      w: Math.random() * 9 + 4,
      h: Math.random() * 7 + 4,
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.7) * 17,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 14,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 1.0,
      decay: Math.random() * 0.012 + 0.007
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
  statusMsg.innerText = isMeWinner ? 
    `🏆 Opponent Inactive! You Won by Forfeit! (+180 Coins)` : 
    `❌ Match Forfeit! Inactive for 3 turns.`;

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
  statusMsg.innerText = isMeWinner ? 
    `🏆 Opponent Inactive! You Won by Forfeit! (+180 Coins)` : 
    `❌ Match Forfeit! Inactive for 3 turns.`;

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

function handleDiceClick(player) {
  if (state !== 'ROLL' || currentTurn !== player) return;
  if (isOnline && currentTurn !== myPlayerId) return;

  sound.roll();
  const activeDice = (player === 0) ? diceRed : diceYellow;
  activeDice.classList.add('rolling');
  diceVal = Math.floor(Math.random() * 6) + 1;

  if (diceVal === 6) consecutiveSixes++;
  else consecutiveSixes = 0;

  if (consecutiveSixes === 3) {
    consecutiveSixes = 0;
    statusMsg.innerText = "Lagatar 3 baar 6 aaya! Turn Cancel!";
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
    if (t.pla
