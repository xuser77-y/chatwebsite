const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 5000;

// Queue & paired users map
let waitingQueue = [];
let pairedUsers = {}; // { socket.id: partnerId }

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join_queue', () => {
    console.log(`${socket.id} joined queue`);
    waitingQueue.push(socket);

    if (waitingQueue.length >= 2) {
      const user1 = waitingQueue.shift();
      const user2 = waitingQueue.shift();

      pairedUsers[user1.id] = user2.id;
      pairedUsers[user2.id] = user1.id;

      // Send partner info and initiator flag
      user1.emit('partner_found', { partnerId: user2.id, initiator: true });
      user2.emit('partner_found', { partnerId: user1.id, initiator: false });
    }
  });

  socket.on('leave_queue', () => {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    const partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit('partner_left');

    delete pairedUsers[socket.id];
    delete pairedUsers[partner];
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    const partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit('partner_left');

    delete pairedUsers[socket.id];
    delete pairedUsers[partner];
  });

  // WebRTC signaling
  socket.on('webrtc_offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc_offer', { fromId: socket.id, sdp });
  });

  socket.on('webrtc_answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc_answer', { fromId: socket.id, sdp });
  });

  socket.on('ice_candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice_candidate', { fromId: socket.id, candidate });
  });

  // 1-to-1 chat
  socket.on('chat_message', ({ targetId, text }) => {
    if (targetId) io.to(targetId).emit('chat_message', text);
  });
});

server.listen(PORT, () => {
  console.log(`Server running — open http://localhost:${PORT}`);
});
