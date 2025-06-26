const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let players = [];
let turnIndex = 0;
let story = [];
let currentBoxIndex = 0;
let voteInProgress = false;
let votes = {};

function getNextTurnIndex() {
  return (turnIndex + 1) % players.length;
}

function resetGame() {
  players = [];
  turnIndex = 0;
  story = [];
  currentBoxIndex = 0;
  voteInProgress = false;
  votes = {};
}

io.on("connection", (socket) => {
  socket.on("setName", (name) => {
    if (!name || players.find(p => p.name === name)) return;
    const color = "#" + Math.floor(Math.random() * 16777215).toString(16);
    const player = { id: socket.id, name, color };
    players.push(player);
    socket.emit("playerData", { ...player, turnIndex: players.length - 1 });
    io.emit("playersUpdate", players);
  });

  socket.on("readyStatus", (status) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.ready = status;
      io.emit("playersUpdate", players);
      if (players.length > 1 && players.every(p => p.ready)) {
        // Randomize turn order
        players = players.sort(() => 0.5 - Math.random());
        turnIndex = 0;
        io.emit("gameStart", { players, turnIndex, currentBoxIndex });
      }
    }
  });

  socket.on("submitText", (text) => {
    const player = players[turnIndex];
    if (!player || socket.id !== player.id || voteInProgress) return;
    story.push({ text, playerName: player.name, color: player.color });
    turnIndex = getNextTurnIndex();
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
