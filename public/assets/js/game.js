class Game {
  constructor() {
    // WebGL 지원 안하는 브라우저 체크
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    // 전체 상태
    this.modes = Object.freeze({
      NONE: "none",
      PRELOAD: "preload",
      INITIALISING: "initialising",
      ACTIVE: "active",
    });
    this.mode = this.modes.NONE;

    // 프로퍼티 initialize
    this.container;
    this.player;
    this.cameras;
    this.camera;
    this.scene;
    this.renderer;
    this.animations = {};

    this.remotePlayers = [];
    this.initialisingPlayers = []; // 캐릭터 initialize 할 플레이어들
    this.remoteData = [];

    this.container = document.querySelector("#game");
    document.body.appendChild(this.container);

    const game = this;
    this.anims = ["Walking", "Walking Backwards", "Turn", "Running", "Pointing", "Talking", "Pointing Gesture", "Punch Combo", "Drop Kick"];
    this.gestureAnims = ["Pointing", "Talking", "Pointing Gesture", "Punch Combo", "Drop Kick"];

    //#region ___ preloader ___
    const options = {
      assets: [`/assets/images/nx.jpg`, `/assets/images/px.jpg`, `/assets/images/ny.jpg`, `/assets/images/py.jpg`, `/assets/images/nz.jpg`, `/assets/images/pz.jpg`],
      oncomplete: function () {
        game.init();
      },
    };
    this.anims.forEach(function (anim) {
      options.assets.push(`/assets/models/anims/${anim}.fbx`);
    });
    options.assets.push(`/assets/models/city.fbx`);
    const preloader = new Preloader(options);
    //#endregion

    this.mode = this.modes.PRELOAD;

    this.clock = new THREE.Clock();

    window.onError = function (error) {
      console.error(JSON.stringify(error));
    };
  }

  // 게임 initialize
  init() {
    this.mode = this.modes.INITIALISING;

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 200000);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x00a0f0);

    // light
    const ambient = new THREE.AmbientLight(0xaaaaaa);
    this.scene.add(ambient);

    const light = new THREE.DirectionalLight(0xaaaaaa);
    light.position.set(30, 100, 40);
    light.target.position.set(0, 0, 0);

    light.castShadow = true;

    const lightSize = 500;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 500;
    light.shadow.camera.left = light.shadow.camera.bottom = -lightSize;
    light.shadow.camera.right = light.shadow.camera.top = lightSize;

    light.shadow.bias = 0.0039;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;

    this.sun = light;
    this.scene.add(light);

    // ground
    // const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(10000, 10000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
    // mesh.rotation.x = -Math.PI / 2;
    // mesh.receiveShadow = true;
    // this.scene.add(mesh);

    // model
    const loader = new THREE.FBXLoader();
    const game = this;

    this.player = new PlayerLocal(this);

    this.loadEnvironment(loader);

    this.joystick = new JoyStick({
      onMove: this.playerControl,
      game: this,
    });

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // control
    // const controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    // controls.target.set(0, 0.5, 0);
    // controls.update();

    if ("ontouchstart" in window) {
      $(window).on("touchdown", (event) => game.onMouseDown(event), false);
    } else {
      $(window).on("mousedown", (event) => game.onMouseDown(event), false);
    }

    $(window).on("resize", () => game.onWindowResize(), false);

    $(window).on("keydown", (e) => game.onKeyDown(e), false);

    // TODO: 닉네임 변경
    $("#btnChangeNickName").on("click", () => game.changeNickName());

    $("#btnAnimateGesture").on("click", () => game.animateGesture());
  }

  // 맵 로드
  loadEnvironment(loader) {
    const game = this;
    // TODO:
    loader.load(`/assets/models/city.fbx`, function (object) {
      game.environment = object;
      game.colliders = [];
      game.scene.add(object);
      object.traverse(function (child) {
        if (child.type === "Mesh") {
          game.colliders.push(child);
          // if (child.name.startsWith("proxy")) {
          //   game.colliders.push(child);
          //   child.material.visible = false;
          // } else {
          //   child.castShadow = true;
          //   child.receiveShadow = true;
          // }
        }
      });

      //#region ___ 노을 하늘 ___
      const tloader = new THREE.CubeTextureLoader();
      tloader.setPath(`/assets/images/`);
      var textureCube = tloader.load(["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"]);
      game.scene.background = textureCube;
      //#endregion

      game.loadNextAnim(loader);
    });
  }

  // 캐릭터(플레이어) 애니메이션 전부 로드
  loadNextAnim(loader) {
    const game = this;
    this.anims.forEach(function (anim) {
      loader.load(`/assets/models/anims/${anim}.fbx`, function (object) {
        game.player.animations[anim] = object.animations[0];
      });
    });
    game.action = "Idle";
    game.mode = game.modes.ACTIVE;
    game.animate();
  }

  // 걷기/뛰기/돌기/뒷걸음/대기 모션
  playerControl(forward, turn) {
    turn = -turn;

    if (forward > 0.3) {
      if (this.player.action != "Walking" && this.player.action != "Running") this.player.action = "Walking";
    } else if (forward < -0.3) {
      if (this.player.action != "Walking Backwards") this.player.action = "Walking Backwards";
    } else {
      forward = 0;
      if (Math.abs(turn) > 0.1) {
        if (this.player.action != "Turn") this.player.action = "Turn";
      } else if (this.player.action != "Idle") {
        this.player.action = "Idle";
      }
    }

    if (forward === 0 && turn === 0) {
      delete this.player.motion;
    } else {
      this.player.motion = { forward, turn };
    }

    this.player.updateSocket();
  }

  createCameras() {
    const back = new THREE.Object3D();
    back.name = "back";
    back.position.set(0, 300, -1000);
    back.parent = this.player.object;
    const front = new THREE.Object3D();
    front.name = "front";
    front.position.set(0, 300, 1400);
    front.parent = this.player.object;
    const selfie = new THREE.Object3D();
    selfie.name = "selfie";
    selfie.position.set(0, 200, 400);
    selfie.parent = this.player.object;
    const fps = new THREE.Object3D();
    fps.name = "fps";
    fps.position.set(0, 300, -1);
    fps.parent = this.player.object;
    const aerial = new THREE.Object3D();
    aerial.name = "aerial";
    aerial.position.set(0, 2500, 0);
    aerial.parent = this.player.object;
    this.cameras = { front, back, fps, aerial, selfie };

    const cameraKeys = ["back", "front", "selfie", "fps", "aerial"];

    // 카메라 초기값은 back
    this.cameras.active = this.cameras[cameraKeys[0]];
    $("#camName").text(cameraKeys[0]);

    $("#btnChangeCamera").on("click", () => {
      const currentCam = this.cameras.active.name;
      const currentCamIdx = cameraKeys.indexOf(currentCam);
      const len = cameraKeys.length;
      const nextCamIdx = (currentCamIdx + 1) % len;
      const nextCamName = cameraKeys[nextCamIdx];
      this.cameras.active = this.cameras[nextCamName];
      $("#camName").text(nextCamName);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateRemotePlayers(delta) {
    if (this.remoteData === undefined || this.remoteData.length === 0 || this.player === undefined || this.player.id === undefined) return;

    const game = this;
    const remotePlayers = [];

    this.remoteData.forEach(function (data) {
      // 리모트 플레이어만
      if (game.player.id != data.id) {
        let iplayer;
        game.initialisingPlayers.forEach(function (player) {
          if (player.id === data.id) iplayer = player;
        });
        // initialize 대상에 없을 경우
        if (iplayer === undefined) {
          let rplayer;
          // 이미 있는 리모트 플레이어들 배열에서 확인
          game.remotePlayers.forEach(function (player) {
            if (player.id === data.id) rplayer = player;
          });
          if (rplayer === undefined) {
            // 해당 플레이어 initialize
            game.initialisingPlayers.push(new Player(game, data));
          } else {
            // 리모트 플레이어들 배열에 추가
            remotePlayers.push(rplayer);
          }
        }
      }
    });

    this.scene.children.forEach(function (object) {
      if (object.userData.remotePlayer && game.getRemotePlayerById(object.userData.id) === undefined) {
        game.scene.remove(object);
      }
    });

    this.remotePlayers = remotePlayers;
    this.remotePlayers.forEach(function (player) {
      player.update(delta);
    });
  }

  // TODO: 클릭으로 플레이어 이동
  onMouseDown(e) {}

  // TODO: 키보드 wasd 방향키로 플레이어 이동
  onKeyDown(e) {
    var keyCode = e.which;
    if (keyCode == 87 || keyCode == 38) {
      // w / up
    } else if (keyCode == 65 || keyCode == 37) {
      // a / left
    } else if (keyCode == 83 || keyCode == 40) {
      // s / down
    } else if (keyCode == 68 || keyCode == 39) {
      // d / right
    } else if (keyCode == 32) {
      // spacebar
    }
  }

  getRemotePlayerById(id) {
    if (this.remotePlayers === undefined || this.remotePlayers.length === 0) return;

    const players = this.remotePlayers.filter(function (player) {
      if (player.id === id) {
        return true;
      }
    });

    if (players.length === 0) return;

    return players[0];
  }

  animate() {
    const game = this;
    const delta = this.clock.getDelta();

    requestAnimationFrame(function () {
      game.animate();
    });

    this.updateRemotePlayers(delta);

    if (this.player.mixer != undefined && this.mode === this.modes.ACTIVE) this.player.mixer.update(delta);

    if (this.player.action === "Walking") {
      const elapsedTime = Date.now() - this.player.actionTime;
      if (elapsedTime > 1000 && this.player.motion.forward > 0) {
        this.player.action = "Running";
      }
    }

    if (this.player.motion !== undefined) this.player.move(delta);

    if (this.cameras != undefined && this.cameras.active != undefined && this.player !== undefined && this.player.object !== undefined) {
      this.camera.position.lerp(this.cameras.active.getWorldPosition(new THREE.Vector3()), 0.05);
      const pos = this.player.object.position.clone();
      pos.y += 300;
      this.camera.lookAt(pos);
    }

    if (this.sun !== undefined) {
      this.sun.position.copy(this.camera.position);
      this.sun.position.y += 10;
    }

    this.renderer.render(this.scene, this.camera);
  }

  //#region ___ Button Function ___
  changeNickName() {
    console.log("닉네임 변경");
  }

  animateGesture() {
    const animCnt = this.animCnt ?? 0;
    const len = this.gestureAnims.length;
    const nextAnimIdx = (animCnt + 1) % len;
    const nextAnimName = this.gestureAnims[nextAnimIdx];

    this.player.action = nextAnimName;
    this.animCnt = nextAnimIdx;
  }
  //#endregion
}
