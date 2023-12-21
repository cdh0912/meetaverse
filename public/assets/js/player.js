class Player {
  constructor(game, options) {
    this.local = true;
    let model, color;

    const colors = ["Black", "Brown", "White"];
    color = colors[Math.floor(Math.random() * colors.length)];

    if (options === undefined) {
      // TODO:
      const people = ["BeachBabe", "BusinessMan", "Doctor", "FireFighter", "Housewife", "Policeman", "Prostitute", "Punk", "RiotCop", "Roadworker", "Robber", "Sheriff", "Streetman", "Waitress"];
      model = people[Math.floor(Math.random() * people.length)];
    } else if (typeof options === "object") {
      this.local = false;
      this.options = options;
      this.id = options.id;
      model = options.model;
      color = options.color;
    } else {
      model = options;
    }
    this.model = model;
    this.color = color;
    this.game = game;
    this.animations = this.game.animations;

    const loader = new THREE.FBXLoader();
    const player = this;

    function getRandomAroundValue(base, range = 500) {
      const min = base - range;
      const max = base + range;
      return Math.random() * (max - min) + min;
    }

    loader.load(`/assets/models/people/${model}.fbx`, function (object) {
      object.mixer = new THREE.AnimationMixer(object);
      player.root = object;
      player.mixer = object.mixer;

      object.name = "Person";

      object.traverse(function (child) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const textureLoader = new THREE.TextureLoader();

      textureLoader.load(`/assets/images/SimplePeople_${model}_${color}.png`, function (texture) {
        object.traverse(function (child) {
          if (child.isMesh) {
            child.material.map = texture;
          }
        });
      });

      const randomDirection = Math.floor(Math.random() * 10);
      player.object = new THREE.Object3D();
      // 플레이어 시작 위치
      player.object.position.set(getRandomAroundValue(17891), 70, getRandomAroundValue(-3572));
      // player.object.position.set(-4570.466993301836, 74.09778044642792, -9177.773433758168);

      // 플레이어 시작 방향
      player.object.rotation.set(0, 5.5, 0);
      // player.object.rotation.set(0, randomDirection, 0);

      player.object.add(object);
      if (player.deleted === undefined) game.scene.add(player.object);

      if (player.local) {
        game.createCameras();
        game.sun.target = game.player.object;
        game.animations.Idle = object.animations[0];
        if (player.initSocket !== undefined) player.initSocket();
      } else {
        const geometry = new THREE.BoxGeometry(100, 300, 100);
        const material = new THREE.MeshBasicMaterial({ visible: false });
        const box = new THREE.Mesh(geometry, material);
        box.name = "Collider";
        box.position.set(0, 150, 0);
        player.object.add(box);
        player.collider = box;
        player.object.userData.id = player.id;
        player.object.userData.remotePlayer = true;
        const players = game.initialisingPlayers.splice(game.initialisingPlayers.indexOf(this), 1);
        game.remotePlayers.push(players[0]);
      }

      if (game.animations.Idle !== undefined) player.action = "Idle";
    });
  }

  set action(name) {
    if (this.actionName === name) return;
    // 리모트 플레이어인 경우 애니메이션 클립의 사본을 생성
    const clip = this.local ? this.animations[name] : THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(this.animations[name]));
    const action = this.mixer.clipAction(clip);
    action.time = 0;
    this.mixer.stopAllAction();
    this.actionName = name;
    this.actionTime = Date.now();

    action.fadeIn(0.5);
    action.play();
  }

  get action() {
    return this.actionName;
  }

  update(dt) {
    this.mixer.update(dt);

    if (this.game.remoteData.length > 0) {
      let found = false;
      for (let data of this.game.remoteData) {
        if (data.id != this.id) continue;
        //Found the player
        this.object.position.set(data.x, data.y, data.z);
        const euler = new THREE.Euler(data.pb, data.heading, data.pb);
        this.object.quaternion.setFromEuler(euler);
        this.action = data.action;
        found = true;
      }
      if (!found) this.game.removePlayer(this);
    }
  }
}

class PlayerLocal extends Player {
  constructor(game, model) {
    super(game, model);

    const player = this;
    const socket = io();
    socket.on("setId", function (data) {
      player.id = data.id;
    });
    socket.on("remoteData", function (data) {
      game.remoteData = data;
    });
    socket.on("deletePlayer", function (data) {
      const players = game.remotePlayers.filter(function (player) {
        if (player.id === data.id) {
          return player;
        }
      });
      if (players.length > 0) {
        let index = game.remotePlayers.indexOf(players[0]);
        if (index != -1) {
          game.remotePlayers.splice(index, 1);
          game.scene.remove(players[0].object);
        } else {
          index = game.initialisingPlayers.indexOf(data.id);
          if (index != -1) {
            const player = game.initialisingPlayers[index];
            player.deleted = true;
            game.initialisingPlayers.splice(index, 1);
          }
        }
      }
    });

    this.socket = socket;
  }

  initSocket() {
    this.socket.emit("init", {
      model: this.model,
      color: this.color,
      x: this.object.position.x,
      y: this.object.position.y,
      z: this.object.position.z,
      h: this.object.rotation.y,
      pb: this.object.rotation.x,
    });
  }

  updateSocket() {
    if (this.socket !== undefined) {
      this.socket.emit("update", {
        x: this.object.position.x,
        y: this.object.position.y,
        z: this.object.position.z,
        h: this.object.rotation.y,
        pb: this.object.rotation.x,
        action: this.action,
      });
    }
  }

  // 플레이어 위치 로직
  move(delta) {
    const pos = this.object.position.clone();
    pos.y += 60;
    let direction = new THREE.Vector3();
    this.object.getWorldDirection(direction);
    if (this.motion.forward < 0) direction.negate();

    let raycaster = new THREE.Raycaster(pos, direction);
    let blocked = false; // 장애물 충돌 여부
    const colliders = this.game.colliders;

    if (colliders !== undefined) {
      const intersect = raycaster.intersectObjects(colliders);
      if (intersect.length > 0) {
        if (intersect[0].distance < 50) blocked = true;
      }
    }

    if (!blocked) {
      if (this.motion.forward > 0) {
        const speed = this.action === "Running" ? 1000 : 300;
        this.object.translateZ(delta * speed);
      } else {
        this.object.translateZ(-delta * 30);
      }
    }

    if (colliders !== undefined) {
      // move left
      direction.set(-1, 0, 0);
      direction.applyMatrix4(this.object.matrix);
      direction.normalize();
      raycaster = new THREE.Raycaster(pos, direction);

      let intersect = raycaster.intersectObjects(colliders);
      if (intersect.length > 0) {
        if (intersect[0].distance < 50) this.object.translateX(100 - intersect[0].distance);
      }

      // move right
      direction.set(1, 0, 0);
      direction.applyMatrix4(this.object.matrix);
      direction.normalize();
      raycaster = new THREE.Raycaster(pos, direction);

      intersect = raycaster.intersectObjects(colliders);
      if (intersect.length > 0) {
        if (intersect[0].distance < 50) this.object.translateX(intersect[0].distance - 100);
      }

      // move down
      direction.set(0, -1, 0);
      pos.y += 200;
      raycaster = new THREE.Raycaster(pos, direction);
      const gravity = 30; // 중력

      intersect = raycaster.intersectObjects(colliders);
      if (intersect.length > 0) {
        const targetY = pos.y - intersect[0].distance;
        if (targetY > this.object.position.y) {
          // move up
          this.object.position.y = 0.8 * this.object.position.y + 0.2 * targetY;
          this.velocityY = 0;
        } else if (targetY < this.object.position.y) {
          // falling
          if (this.velocityY === undefined) this.velocityY = 0;
          this.velocityY += delta * gravity;
          this.object.position.y -= this.velocityY;
          if (this.object.position.y < targetY) {
            this.velocityY = 0;
            this.object.position.y = targetY;
          }
        }
      }
    }

    this.object.rotateY(this.motion.turn * delta);

    this.updateSocket();
  }
}
