const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 9991;

console.log(__dirname);
app.use(express.static("../public/"));
app.get("/", function (req, res) {
  res.sendFile("index.html", { root: "./public" });
});

http.listen(port, function () {
  console.log("listening on " + port);
});

// 접속 : 새 클라이언트 데이터 생성
// TODO: 시작위치 랜덤하게 변경 / heading(시작 각도) 중앙을 보도록 변경
io.sockets.on("connection", function (socket) {
  socket.userData = { x: 0, y: 0, z: 0, heading: 0 };

  console.log(`${socket.id} connected`);
  socket.emit("setId", { id: socket.id });

  socket.on("disconnect", function () {
    socket.broadcast.emit("deletePlayer", { id: socket.id });
  });

  socket.on("init", function (data) {
    // console.log(`socket.init ${data.model}`);
    socket.userData.model = data.model;
    socket.userData.color = data.color;
    socket.userData.x = data.x;
    socket.userData.y = data.y;
    socket.userData.z = data.z;
    socket.userData.heading = data.h;
    (socket.userData.pb = data.pb), (socket.userData.action = "Idle");
  });

  socket.on("update", function (data) {
    socket.userData.x = data.x;
    socket.userData.y = data.y;
    socket.userData.z = data.z;
    socket.userData.heading = data.h;
    (socket.userData.pb = data.pb), (socket.userData.action = data.action);
  });
});

setInterval(function () {
  const nsp = io.of("/");
  let pack = [];

  for (let id in io.sockets.sockets) {
    const socket = nsp.connected[id];
    //Only push sockets that have been initialised
    if (socket.userData.model !== undefined) {
      pack.push({
        id: socket.id,
        model: socket.userData.model,
        color: socket.userData.color,
        x: socket.userData.x,
        y: socket.userData.y,
        z: socket.userData.z,
        heading: socket.userData.heading,
        pb: socket.userData.pb,
        action: socket.userData.action,
      });
    }
  }
  if (pack.length > 0) io.emit("remoteData", pack);
}, 40);
