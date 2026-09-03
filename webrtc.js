/* WebRTC Voice Engine, Remote Speaker & In-Game Chat Drawer */
let localStream = null;
let peerConnection = null;
let remoteAudioElement = null;
let isMicOn = false;
let isSpeakerMuted = false;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function toggleVoiceChat() {
  const micBtn = document.getElementById('mic-toggle-btn');
  if (!isMicOn) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      isMicOn = true;
      micBtn.classList.add('active');
      micBtn.innerText = '🎙️ Mic On';
      document.getElementById('avatar-red-box').classList.add('speaking');
      if (typeof isOnline !== 'undefined' && isOnline && roomRef) initVoicePeer();
    } catch (err) {
      alert('Microphone permission required for voice chat!');
    }
  } else {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    isMicOn = false;
    micBtn.classList.remove('active');
    micBtn.innerText = '🎙️ Mic Off';
    document.getElementById('avatar-red-box').classList.remove('speaking');
  }
}

function toggleSpeaker() {
  isSpeakerMuted = !isSpeakerMuted;
  const spkBtn = document.getElementById('speaker-toggle-btn');
  if (remoteAudioElement) remoteAudioElement.muted = isSpeakerMuted;
  spkBtn.innerText = isSpeakerMuted ? '🔇 Muted' : '🔊 On';
  spkBtn.classList.toggle('muted', isSpeakerMuted);
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
    remoteAudioElement.muted = isSpeakerMuted;
    document.getElementById('avatar-yellow-box').classList.add('speaking');
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
