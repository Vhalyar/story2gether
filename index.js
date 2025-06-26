const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let players = [];
let story = [];
let turnIndex = 0;
let voteInProgress = false;
let votes = {};

function resetGame() {
  story = [];
  turnIndex = 0;
  voteInProgress = false;
  votes = {};
  players.forEach(p => {
    p.ready = false;
    delete p.turnOrder;
  });
}


io.on("connection", (socket) => {
  socket.on("setName", (name) => {
    if (!name || players.find(p => p.name === name)) return;
    const color = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    const player = { id: socket.id, name, color, ready: false };
    players.push(player);
    socket.emit("playerData", player);
    io.emit("playersUpdate", players);
  });

  socket.on("toggleReady", () => {
    const player = players.find(p => p.id === socket.id);
    if (!player) return;
    player.ready = !player.ready;
    io.emit("playersUpdate", players);
    if (players.length > 1 && players.every(p => p.ready)) {
      const shuffled = [...players].sort(() => 0.5 - Math.random());
      shuffled.forEach((p, i) => { p.turnOrder = i; });
      turnIndex = 0;
      io.emit("gameStart", { players: shuffled, turnIndex, story });
    }
  });

  socket.on("submitText", (text) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || player.turnOrder !== turnIndex || voteInProgress) return;
    story.push({ text, playerName: player.name, color: player.color });
    turnIndex = (turnIndex + 1) % players.length;
    io.emit("storyUpdate", { story, turnIndex });
  });

  socket.on("voteToEnd", () => {
    if (voteInProgress) return;
    voteInProgress = true;
    votes = {};
    io.emit("voteStarted");
  });

  socket.on("castVote", (choice) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || votes[player.id]) return;
    votes[player.id] = choice;
    if (Object.keys(votes).length === players.length) {
      if (Object.values(votes).every(v => v === "agree")) {
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
  io.emit("playersUpdate", players);
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
