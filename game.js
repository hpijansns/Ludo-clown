<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>LUDO MASTER PRO</title>
  
  <!-- Firebase Compat Libraries -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js"></script>
  
  <link rel="stylesheet" href="style.css?v=3">
</head>
<body>

  <div id="game-shell">
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:6px;">
        <div style="font-weight: 800; font-size: 0.9rem;" id="player-profile-name">Player</div>
        <div id="top-room-badge" class="room-badge" onclick="window.copyRoomCode()">ROOM: <span id="top-room-code">------</span> 📋</div>
      </div>
      <div class="coin-badge">🟡 <span id="player-coin-count">1000</span> Coins</div>
      <button type="button" class="ctrl-btn" style="background:#ef4444;" onclick="window.logout()">Logout</button>
    </div>

    <!-- Lobby Screen -->
    <div id="screen-lobby" class="screen active">
      <div class="lobby-box">
        <h2 style="color:var(--gold);">MATCHMAKING</h2>
        <p style="font-size:0.8rem; color:var(--text-muted);">Speed 15s • Fee: 100 Coins / Match</p>

        <div id="rejoin-prompt" class="rejoin-card">
          <div style="font-size:0.85rem; color:#4ade80; font-weight:800; margin-bottom:6px;">⚡ Active Match Found!</div>
          <button type="button" class="btn-main" style="background:#16a34a; padding:9px;" onclick="window.resumeSavedMatch()">Rejoin Match Now</button>
        </div>

        <button type="button" class="btn-main btn-gold" onclick="window.createRoom()">👑 CREATE ROOM</button>
        
        <div style="display:flex; gap:6px;">
          <input type="text" id="room-code-input" class="input-field" placeholder="Room Code">
          <button type="button" class="btn-main" style="width:110px;" onclick="window.joinRoom()">JOIN</button>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.1); margin:4px 0;"></div>
        <button type="button" class="btn-main" style="background:#334155;" onclick="window.startOfflineMode()">🤖 PLAY VS COMPUTER</button>
      </div>
    </div>

    <!-- Gameplay Screen -->
    <div id="screen-game" class="screen">
      <!-- Opponent Deck -->
      <div id="deck-yellow" class="deck">
        <div class="player-profile">
          <div class="avatar-circle avatar-yellow">🟡</div>
          <div>
            <h4 id="name-yellow">Opponent</h4>
            <div>
              <span id="score-yellow" class="status-chip">0/4 Home</span>
              <span id="hearts-yellow">❤️❤️❤️</span>
              <span id="timer-yellow" class="turn-timer">15s</span>
            </div>
          </div>
        </div>
        <div class="dice-wrap">
          <div id="dice-yellow" class="dice-cube disabled" data-val="1">
            <div class="pip dp1" style="grid-area:1/1;"></div><div class="pip dp2" style="grid-area:1/2;"></div><div class="pip dp3" style="grid-area:1/3;"></div>
            <div class="pip dp4" style="grid-area:2/1;"></div><div class="pip dp5" style="grid-area:2/2;"></div><div class="pip dp6" style="grid-area:2/3;"></div>
            <div class="pip dp7" style="grid-area:3/1;"></div><div class="pip dp8" style="grid-area:3/2;"></div><div class="pip dp9" style="grid-area:3/3;"></div>
          </div>
        </div>
      </div>

      <div id="status-msg" class="status-banner">Game Ready!</div>

      <div class="board-frame">
        <canvas id="boardCanvas" width="600" height="600"></canvas>
      </div>

      <!-- Player Deck (Red) -->
      <div id="deck-red" class="deck active-turn">
        <div class="player-profile">
          <div class="avatar-circle avatar-red">🔴</div>
          <div>
            <h4 id="name-red">You</h4>
            <div>
              <span id="score-red" class="status-chip">0/4 Home</span>
              <span id="hearts-red">❤️❤️❤️</span>
              <span id="timer-red" class="turn-timer">15s</span>
            </div>
          </div>
        </div>
        <div class="ctrl-group">
          <button type="button" id="mic-toggle-btn" class="ctrl-btn" onclick="window.toggleVoiceChat()">🎙️ Mic Off</button>
          <button type="button" class="ctrl-btn" onclick="window.toggleChatDrawer()">💬 Chat</button>
          <div class="dice-wrap">
            <div id="dice-red" class="dice-cube" data-val="1">
              <div class="pip dp1" style="grid-area:1/1;"></div><div class="pip dp2" style="grid-area:1/2;"></div><div class="pip dp3" style="grid-area:1/3;"></div>
              <div class="pip dp4" style="grid-area:2/1;"></div><div class="pip dp5" style="grid-area:2/2;"></div><div class="pip dp6" style="grid-area:2/3;"></div>
              <div class="pip dp7" style="grid-area:3/1;"></div><div class="pip dp8" style="grid-area:3/2;"></div><div class="pip dp9" style="grid-area:3/3;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-strip">
        <span class="chat-emoji" onclick="window.sendReaction('😂')">😂</span>
        <span class="chat-emoji" onclick="window.sendReaction('🔥')">🔥</span>
        <span class="chat-emoji" onclick="window.sendReaction('👑')">👑</span>
        <span class="chat-emoji" onclick="window.sendReaction('💀')">💀</span>
        <span class="chat-emoji" onclick="window.sendReaction('🚀')">🚀</span>
      </div>
    </div>
  </div>

  <!-- Chat Drawer -->
  <div id="chat-drawer" class="chat-drawer">
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <span style="font-weight:800; color:var(--gold);">ROOM CHAT</span>
      <button type="button" class="ctrl-btn" onclick="window.toggleChatDrawer()">✕</button>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-row">
      <input type="text" id="chat-text-input" class="input-field" placeholder="Type message..." onkeydown="if(event.key==='Enter') window.sendChatMessage()">
      <button type="button" class="btn-main" style="width:80px;" onclick="window.sendChatMessage()">Send</button>
    </div>
  </div>

  <script src="game.js?v=3" defer></script>
</body>
</html>
  
