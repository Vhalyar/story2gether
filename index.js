const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let players = [];
let story = [];
let turnIndex = 0;
let currentBoxIndex = 0;
let voteInProgress = false;
let votes = {};

function resetGame() {
  players.forEach(p => {
    p.ready = false;
  });
  story = [];
  turnIndex = 0;
  currentBoxIndex = 0;
  voteInProgress = false;
  votes = {};
  io.emit("playersUpdate", players);
}

io.on("connection", (socket) => {
  socket.on("setName", (name) => {
    if (!name || players.find(p => p.name === name)) return;
    const color = "#" + Math.floor(Math.random() * 16777215).toString(16);
    const player = { id: socket.id, name, color, ready: false };
    players.push(player);
    socket.emit("playerData", { ...player });
    io.emit("playersUpdate", players);
  });

  socket.on("readyStatus", (status) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.ready = status;
      io.emit("playersUpdate", players);
      if (players.length > 1 && players.every(p => p.ready)) {
        players = players.sort(() => 0.5 - Math.random());
        players.forEach((p, i) => p.turnIndex = i);
        turnIndex = 0;
        currentBoxIndex = 0;
        story = [];
        players.forEach(p => {
          io.to(p.id).emit("gameStart", {
            players,
            myTurnIndex: p.turnIndex,
            turnIndex,
            currentBoxIndex,
            story
          });
        });
      }
    }
  });

  socket.on("submitText", (text) => {
    const player = players[turnIndex];
    if (!player || socket.id !== player.id || voteInProgress) return;

    story.push({ text, playerName: player.name, color: player.color });
    turnIndex = (turnIndex + 1) % players.length;
    currentBoxIndex++;
    io.emit("storyUpdate", { story, turnIndex, currentBoxIndex });
  });

  socket.on("voteToEnd", () => {
    if (!voteInProgress) {
      voteInProgress = true;
      votes = {};
      io.emit("voteInitiated");
    }
  });

  socket.on("castVote", (choice) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || votes[player.id]) return;
    votes[player.id] = choice;
    const total = Object.keys(votes).length;
    if (total === players.length) {
      const allAgree = Object.values(votes).every(v => v === "agree");
      if (allAgree) {
        io.emit("gameEnded", story);
      } else {
        voteInProgress = false;
        votes = {};
        io.emit("voteCancelled");
      }
    }
  });

  socket.on("restartGame", () => {
    resetGame();
    io.emit("gameRestarted");
  });

  socket.on("disconnect", () => {
    players = players.filter(p => p.id !== socket.id);
    io.emit("playersUpdate", players);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
