const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn'); // Stop button
const nextBtn = document.createElement('button'); // Next button
const msgInput = document.getElementById('msgInput');
const messages = document.getElementById('messages');

let localStream;
let peerConnection;
let partnerId;

// STUN servers for ICE candidates
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ]
};

// Start camera on user click
async function startLocalStream() {
  if (localStream) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Media error', err);
    alert('Unable to access camera/microphone. Please allow access and reload.');
  }
}

function addSystemMessage(text){
  const d = document.createElement('div');
  d.className = 'system';
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function addLocalMessage(text){
  const d = document.createElement('div');
  d.className = 'msg local';
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

function addRemoteMessage(text){
  const d = document.createElement('div');
  d.className = 'msg remote';
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

// Create peer connection
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.onicecandidate = event => {
    if (event.candidate && partnerId) {
      socket.emit('ice_candidate', { targetId: partnerId, candidate: event.candidate });
    }
  };

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

// Start Chat
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Searching...';

  await startLocalStream();
  socket.emit('join_queue');
});

// Partner found
socket.on('partner_found', async (data) => {
  partnerId = data.partnerId;
  addSystemMessage('Partner found! Connecting...');
  createPeerConnection();

  // Hide start button
  startBtn.style.display = 'none';

  // Show Stop button
  endBtn.textContent = 'Stop';
  endBtn.style.background = '#ff5555'; // red
  endBtn.style.color = '#fff';
  endBtn.style.display = 'inline-block';

  // Show Next button
  nextBtn.textContent = 'Next';
  nextBtn.style.background = '#00bbbb'; // blue
  nextBtn.style.color = '#000';
  nextBtn.style.padding = '10px 20px';
  nextBtn.style.borderRadius = '8px';
  nextBtn.style.border = 'none';
  nextBtn.style.fontWeight = 'bold';
  nextBtn.style.cursor = 'pointer';
  nextBtn.style.marginLeft = '10px';
  endBtn.parentNode.insertBefore(nextBtn, endBtn.nextSibling);
  nextBtn.style.display = 'inline-block';

  // Next button: leave current partner, immediately join queue again
  nextBtn.onclick = () => {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(t => t.stop());
      remoteVideo.srcObject = null;
    }

    // Leave current partner but also rejoin queue immediately
    socket.emit('leave_queue', { next: true });
    partnerId = null;

    addSystemMessage('Searching for new partner...');
    socket.emit('join_queue');
  };

  if (data.initiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc_offer', { targetId: partnerId, sdp: offer });
  }
});

// Stop button
endBtn.addEventListener('click', () => {
  socket.emit('leave_queue');

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }

  partnerId = null;
  addSystemMessage('Chat ended.');

  // Hide Stop & Next, show Start again
  endBtn.style.display = 'none';
  nextBtn.style.display = 'none';
  startBtn.style.display = 'inline-block';
  startBtn.disabled = false;
  startBtn.textContent = 'Start Chat';
});

// Receive offer
socket.on('webrtc_offer', async ({ fromId, sdp }) => {
  partnerId = fromId;
  createPeerConnection();
  await peerConnection.setRemoteDescription(sdp);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('webrtc_answer', { targetId: partnerId, sdp: answer });
});

// Receive answer
socket.on('webrtc_answer', async ({ fromId, sdp }) => {
  await peerConnection.setRemoteDescription(sdp);
});

// Receive ICE
socket.on('ice_candidate', async ({ fromId, candidate }) => {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error('Error adding ICE candidate', err);
  }
});

// Partner left
socket.on('partner_left', () => {
  addSystemMessage('Partner disconnected.');
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  partnerId = null;

  // Automatically rejoin queue if previously clicked Next
  socket.emit('join_queue');

  // Update buttons
  endBtn.style.display = 'none';
  nextBtn.style.display = 'none';
  startBtn.style.display = 'inline-block';
  startBtn.disabled = false;
  startBtn.textContent = 'Start Chat';
});

// Send message with Enter
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && msgInput.value.trim()) {
    const text = msgInput.value.trim();
    addLocalMessage(text);
    if (partnerId) socket.emit('chat_message', { targetId: partnerId, text });
    msgInput.value = '';
  }
});

// Receive message
socket.on('chat_message', (text) => addRemoteMessage(text));
