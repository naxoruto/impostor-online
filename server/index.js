const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// CARGAMOS LAS CATEGORÍAS
let categories = {};
try {
  categories = require('./categories.json');
} catch (e) {
  // AQUÍ ESTÁ EL CAMBIO: Imprimir el error real
  console.error("🔴 ERROR CRÍTICO AL LEER JSON:", e.message); 
  categories = { "Random": ["Pizza", "Hamburguesa", "Taco"] };
}

let rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  
  socket.on('create-room', ({ username, emoji }) => {
    const roomId = generateRoomCode();
    rooms[roomId] = { 
      players: [], phase: 'lobby', ownerId: socket.id, timer: null 
    };
    joinRoomLogic(socket, roomId, username, emoji);
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', ({ roomId, username, emoji }) => {
    if (rooms[roomId]) {
      joinRoomLogic(socket, roomId, username, emoji);
    } else {
      socket.emit('error', 'Sala no encontrada');
    }
  });

  function joinRoomLogic(socket, roomId, username, emoji) {
    const room = rooms[roomId];
    socket.join(roomId);
    
    // Evitar duplicados
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.find(p => p.id === room.ownerId)) {
        room.ownerId = socket.id;
    }
    room.players.push({ 
      id: socket.id, username, emoji, isReady: false, votes: 0 
    });
    
    io.to(roomId).emit('update-players', { 
      players: room.players, ownerId: room.ownerId 
    });
  }

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          clearInterval(room.timer);
          delete rooms[roomId];
        } else {
          if (socket.id === room.ownerId) {
            room.ownerId = room.players[0].id;
          }
          io.to(roomId).emit('update-players', { players: room.players, ownerId: room.ownerId });
        }
      }
    });
  });

  socket.on('player-ready', ({ roomId, isReady }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.isReady = isReady;

    io.to(roomId).emit('update-players', { players: room.players, ownerId: room.ownerId });

    if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
       let count = 3;
       let interval = setInterval(() => {
         io.to(roomId).emit('countdown', count);
         count--;
         if(count < 0) clearInterval(interval);
       }, 1000);
    }
  });

  socket.on('start-game-signal', ({ roomId, category, showHint }) => {
    startGame(roomId, category, showHint);
  });

  function startGame(roomId, categoryName, showHint) {
    const room = rooms[roomId];
    if (!room) return;

    const wordList = categories[categoryName] || categories["Random"];
    const secretWord = wordList[Math.floor(Math.random() * wordList.length)];
    const impostorIndex = Math.floor(Math.random() * room.players.length);
    room.impostorId = room.players[impostorIndex].id;

    room.players.forEach((p, i) => {
      const isImpostor = (i === impostorIndex);
      const hint = (isImpostor && showHint) ? categoryName : (isImpostor ? '' : categoryName);
      io.to(p.id).emit('assign-role', {
        role: isImpostor ? 'impostor' : 'tripulante',
        word: isImpostor ? 'ERES EL IMPOSTOR' : secretWord,
        category: hint
      });
    });

    io.to(roomId).emit('change-phase', 'reveal');

    setTimeout(() => {
      room.turnOrder = [...room.players].sort(() => Math.random() - 0.5);
      room.currentTurnIndex = 0;
      io.to(roomId).emit('change-phase', 'talking');
      io.to(roomId).emit('next-turn', room.turnOrder[0].username);
      startDiscussionTimer(roomId, 60); 
    }, 4000);
  }

  function startDiscussionTimer(roomId, duration) {
    const room = rooms[roomId];
    let timeLeft = duration;
    
    if (room.timer) clearInterval(room.timer);

    io.to(roomId).emit('timer-update', timeLeft);
    room.timer = setInterval(() => {
      timeLeft--;
      io.to(roomId).emit('timer-update', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(room.timer);
        room.votes = {};
        io.to(roomId).emit('change-phase', 'voting'); 
      }
    }, 1000);
  }

  socket.on('finish-turn', ({ roomId }) => {
    const room = rooms[roomId];
    room.currentTurnIndex++;
    if (room.currentTurnIndex < room.turnOrder.length) {
      io.to(roomId).emit('next-turn', room.turnOrder[room.currentTurnIndex].username);
    } else {
      clearInterval(room.timer);
      room.votes = {};
      io.to(roomId).emit('change-phase', 'voting');
    }
  });

  socket.on('vote-player', ({ roomId, targetId }) => {
     const room = rooms[roomId];
     if (!room.votes) room.votes = {};
     if (room.votes[socket.id]) return; 
 
     room.votes[socket.id] = targetId;
 
     const counts = {};
     Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
     io.to(roomId).emit('update-votes', counts);
 
     if (Object.keys(room.votes).length === room.players.length) {
       evaluateWinner(roomId, counts);
     }
  });

  function evaluateWinner(roomId, counts) {
    const room = rooms[roomId];
    
    // 1. Encontrar máximo de votos
    let maxVotes = 0;
    Object.values(counts).forEach(c => {
      if (c > maxVotes) maxVotes = c;
    });

    // 2. ¿Quiénes tienen esos votos?
    const candidates = Object.keys(counts).filter(id => counts[id] === maxVotes);
    const impostor = room.players.find(p => p.id === room.impostorId);

    // 3. Lógica de Empate
    if (candidates.length > 1) {
        io.to(roomId).emit('game-result', {
            success: false, // Empate = Nadie expulsado = Gana Impostor por caos
            expelledName: "Nadie (Empate)",
            impostorName: impostor.username
        });
        return;
    }

    const expelledId = candidates[0];
    const expelledPlayer = room.players.find(p => p.id === expelledId);
    const crewWon = (expelledId === room.impostorId);

    io.to(roomId).emit('game-result', {
      success: crewWon, 
      expelledName: expelledPlayer ? expelledPlayer.username : "Nadie",
      impostorName: impostor.username
    });
  }

  socket.on('reset-game', ({ roomId }) => {
    const room = rooms[roomId];
    if(room) {
        room.phase = 'lobby';
        room.votes = {};
        room.players.forEach(p => { p.isReady = false; p.votes = 0; });
        io.to(roomId).emit('change-phase', 'lobby');
        io.to(roomId).emit('update-players', { players: room.players, ownerId: room.ownerId });
    }
  });
});

server.listen(3000, () => console.log('Server OK en puerto 3000'));