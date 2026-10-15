(() => {
  "use strict";

  // =====================================================
  // 1. DOM AND CONFIGURATION
  // =====================================================

  const get = id => document.getElementById(id);
  const canvas = get("carCanvas");

  if (!canvas) {
    console.error('Missing canvas: id="carCanvas"');
    return;
  }

  const ctx = canvas.getContext("2d");

  const ui = {
    generation: get("generation"),
    active: get("activeCars"),
    distance: get("bestDistance"),
    speed: get("bestSpeed"),
    fitness: get("fitness"),
    fitnessBar: get("fitnessBar"),

    pause: get("pauseButton"),
    restart: get("restartButton"),
    save: get("saveButton"),
    load: get("loadButton"),
    loadFile: get("loadFile"),

    sensorsToggle: get("sensorToggle"),
    allCarsToggle: get("allCarsToggle"),
    speedControl: get("speedControl"),
    speedValue: get("speedValue"),
    overlay: get("overlay"),

    systemStatus: get("systemStatus"),
    simulationBadge: get("simulationBadge"),

    locationX: get("locationX"),
    locationY: get("locationY"),
    locationText: get("locationText"),
    telemetrySpeed: get("telemetrySpeed"),
    steeringValue: get("steeringValue"),
    distanceValue: get("distanceValue"),

    aiDecision: get("aiDecision"),
    drivingStatus: get("drivingStatus"),
    leftOutput: get("leftOutput"),
    forwardOutput: get("forwardOutput"),
    rightOutput: get("rightOutput"),
    leftOutputBar: get("leftOutputBar"),
    forwardOutputBar: get("forwardOutputBar"),
    rightOutputBar: get("rightOutputBar"),

    sensorStatus: get("sensorStatus"),
    obstacleWarning: get("obstacleWarning"),

    bestFitness: get("bestFitness"),
    averageFitness: get("averageFitness"),
    trainingStatus: get("trainingStatus"),
    completedGenerations: get("completedGenerations"),

    fitnessChart: get("fitnessChart"),
    trackMap: get("trackMap"),

    collisionCount: get("collisionCount"),
    collisionLog: get("collisionLog"),
    clearCollisionLog: get("clearCollisionLog"),

    themeButton: get("themeButton"),
    drivingMode: get("drivingMode"),
    soundToggle: get("soundToggle"),
    autoSaveToggle: get("autoSaveToggle"),
    showCoordinatesToggle: get("showCoordinatesToggle"),
    showChartToggle: get("showChartToggle"),

    moveForward: get("moveForwardButton"),
    moveBackward: get("moveBackwardButton"),
    moveLeft: get("moveLeftButton"),
    moveRight: get("moveRightButton"),
    brake: get("brakeButton"),

    exportCSV: get("exportReportButton"),
    exportJSON: get("exportJSONButton"),
    modelStatus: get("modelStatus")
  };

  const CFG = {
    roadWidth: 320,
    carWidth: 24,
    carLength: 42,

    population: 36,
    rayCount: 9,
    rayLength: 210,
    hiddenCount: 8,
    outputCount: 3,

    trafficCount: 18,
    maxSpeed: 4.2,
    acceleration: 0.075,
    brakingForce: 0.09,
    drag: 0.008,
    steeringForce: 0.045,

    mutationRate: 0.16,
    mutationStrength: 0.38,
    eliteCount: 3,
    parentFraction: 0.25,

    dashboardInterval: 120,
    maxLogEntries: 100
  };

  let width = 800;
  let height = 650;
  let running = true;
  let generation = 1;
  let bestBrain = null;
  let bestFitness = 0;

  let cars = [];
  let traffic = [];
  let fitnessHistory = [];
  let collisionHistory = [];

  let simulationTime = 0;
  let lastTime = 0;
  let lastDashboardUpdate = 0;
  let collisionTotal = 0;
  let bestDistanceEver = 0;
  let bestSpeedEver = 0;
  let generationFitnessTotal = 0;
  let generationFitnessCount = 0;
  let currentLeader = null;
  let lastLeaderId = null;
  let nextCarId = 1;
  let trainingStartTime = Date.now();

  let showSensors = true;
  let showAllCars = false;
  let manualKeys = new Set();
  let manualButtons = new Set();

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setWidth(element, value) {
    if (element) element.style.width = `${clamp(value, 0, 100)}%`;
  }

  function formatNumber(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "0";
  }

  // =====================================================
  // 2. CANVAS RESIZING
  // =====================================================

  function resizeCanvasElement(element, context) {
    if (!element || !context) return null;

    const rect = element.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    element.width = Math.round(w * dpr);
    element.height = Math.round(h * dpr);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { width: w, height: h };
  }

  function resizeCanvas() {
    const size = resizeCanvasElement(canvas, ctx);
    if (!size) return;

    width = size.width;
    height = size.height;
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    drawAnalytics();
  });

  resizeCanvas();

  // =====================================================
  // 3. ROAD
  // =====================================================

  function roadCenter(y) {
    return width / 2 +
      Math.sin(y * 0.0017) * 78 +
      Math.sin(y * 0.00053) * 38;
  }

  function roadBounds(y) {
    const center = roadCenter(y);

    return {
      left: center - CFG.roadWidth / 2,
      right: center + CFG.roadWidth / 2,
      center
    };
  }

  function screenY(worldY, cameraY) {
    return height * 0.72 + cameraY - worldY;
  }

  function drawRoad(cameraY) {
    ctx.fillStyle = "#28583a";
    ctx.fillRect(0, 0, width, height);

    // Subtle grass markings.
    ctx.strokeStyle = "rgba(180, 235, 180, 0.07)";
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += 35) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const start = cameraY - height * 0.45;
    const end = cameraY + height * 0.9;
    const left = [];
    const right = [];

    for (let y = start; y <= end; y += 8) {
      const b = roadBounds(y);
      left.push({ x: b.left, y });
      right.push({ x: b.right, y });
    }

    ctx.beginPath();

    left.forEach((p, i) => {
      const sy = screenY(p.y, cameraY);
      if (i === 0) ctx.moveTo(p.x, sy);
      else ctx.lineTo(p.x, sy);
    });

    [...right].reverse().forEach(p => {
      ctx.lineTo(p.x, screenY(p.y, cameraY));
    });

    ctx.closePath();
    ctx.fillStyle = "#343a40";
    ctx.fill();

    for (const edge of [left, right]) {
      ctx.beginPath();

      edge.forEach((p, i) => {
        const sy = screenY(p.y, cameraY);
        if (i === 0) ctx.moveTo(p.x, sy);
        else ctx.lineTo(p.x, sy);
      });

      ctx.strokeStyle = "#e7edf5";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);

    for (let lane = 1; lane <= 2; lane++) {
      ctx.beginPath();
      let first = true;

      for (let y = start; y <= end; y += 8) {
        const b = roadBounds(y);
        const x = b.left + CFG.roadWidth * lane / 3;
        const sy = screenY(y, cameraY);

        if (first) {
          ctx.moveTo(x, sy);
          first = false;
        } else {
          ctx.lineTo(x, sy);
        }
      }

      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  // =====================================================
  // 4. NEURAL NETWORK
  // =====================================================

  function randomBrain() {
    return {
      w1: Array.from({ length: CFG.rayCount }, () =>
        Array.from({ length: CFG.hiddenCount }, () => rand(-1, 1))
      ),
      b1: Array.from({ length: CFG.hiddenCount }, () => rand(-0.5, 0.5)),
      w2: Array.from({ length: CFG.hiddenCount }, () =>
        Array.from({ length: CFG.outputCount }, () => rand(-1, 1))
      ),
      b2: Array.from({ length: CFG.outputCount }, () => rand(-0.5, 0.5))
    };
  }

  function cloneBrain(brain) {
    return JSON.parse(JSON.stringify(brain));
  }

  function isValidBrain(brain) {
    return Boolean(
      brain &&
      Array.isArray(brain.w1) &&
      brain.w1.length === CFG.rayCount &&
      brain.w1.every(row =>
        Array.isArray(row) &&
        row.length === CFG.hiddenCount &&
        row.every(Number.isFinite)
      ) &&
      Array.isArray(brain.b1) &&
      brain.b1.length === CFG.hiddenCount &&
      brain.b1.every(Number.isFinite) &&
      Array.isArray(brain.w2) &&
      brain.w2.length === CFG.hiddenCount &&
      brain.w2.every(row =>
        Array.isArray(row) &&
        row.length === CFG.outputCount &&
        row.every(Number.isFinite)
      ) &&
      Array.isArray(brain.b2) &&
      brain.b2.length === CFG.outputCount &&
      brain.b2.every(Number.isFinite)
    );
  }

  function mutateBrain(brain, strength = CFG.mutationStrength) {
    const child = cloneBrain(brain);

    for (const matrix of [child.w1, child.w2]) {
      for (const row of matrix) {
        for (let i = 0; i < row.length; i++) {
          if (Math.random() < CFG.mutationRate) {
            row[i] += rand(-strength, strength);
          }
        }
      }
    }

    for (const vector of [child.b1, child.b2]) {
      for (let i = 0; i < vector.length; i++) {
        if (Math.random() < CFG.mutationRate) {
          vector[i] += rand(-strength, strength);
        }
      }
    }

    return child;
  }

  function think(brain, inputs) {
    const hidden = brain.b1.map((bias, j) => {
      let sum = bias;

      for (let i = 0; i < inputs.length; i++) {
        sum += inputs[i] * brain.w1[i][j];
      }

      return Math.tanh(sum);
    });

    const outputs = brain.b2.map((bias, k) => {
      let sum = bias;

      for (let j = 0; j < hidden.length; j++) {
        sum += hidden[j] * brain.w2[j][k];
      }

      return Math.tanh(sum);
    });

    return { outputs, hidden };
  }

  // =====================================================
  // 5. SENSORS AND COLLISIONS
  // =====================================================

  function rayIntersectsTraffic(x, y, other) {
    return Math.abs(x - other.x) < 16 &&
      Math.abs(y - other.y) < 25;
  }

  function raycast(car, angle, maxLength) {
    for (let distance = 0; distance <= maxLength; distance += 4) {
      const x = car.x + Math.sin(angle) * distance;
      const y = car.y + Math.cos(angle) * distance;
      const bounds = roadBounds(y);

      if (
        x < bounds.left + CFG.carWidth / 2 ||
        x > bounds.right - CFG.carWidth / 2
      ) {
        return distance;
      }

      for (const other of traffic) {
        if (rayIntersectsTraffic(x, y, other)) return distance;
      }
    }

    return maxLength;
  }

  function carsCollide(car, other) {
    return Math.abs(car.x - other.x) <
      (CFG.carWidth + 24) / 2 &&
      Math.abs(car.y - other.y) <
      (CFG.carLength + 40) / 2;
  }

  function logCollision(car, reason) {
    collisionTotal++;

    collisionHistory.unshift({
      time: new Date().toLocaleTimeString(),
      generation,
      vehicle: car.id,
      event: reason
    });

    collisionHistory = collisionHistory.slice(0, CFG.maxLogEntries);
    renderCollisionLog();

    if (ui.soundToggle?.checked) playAlert();
  }

  function playAlert() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      const audio = new AudioContextClass();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.frequency.value = 660;
      gain.gain.value = 0.04;

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.start();
      oscillator.stop(audio.currentTime + 0.12);
      oscillator.onended = () => audio.close();
    } catch (error) {
      // Sound is optional.
    }
  }

  function renderCollisionLog() {
    setText(ui.collisionCount, collisionTotal);

    if (!ui.collisionLog) return;

    ui.collisionLog.replaceChildren();

    if (collisionHistory.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 4;
      cell.textContent = "No collision events recorded.";

      row.appendChild(cell);
      ui.collisionLog.appendChild(row);
      return;
    }

    collisionHistory.slice(0, 20).forEach(item => {
      const row = document.createElement("tr");

      for (const value of [
        item.time,
        item.generation,
        `#${item.vehicle}`,
        item.event
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }

      ui.collisionLog.appendChild(row);
    });
  }

  // =====================================================
  // 6. TRAFFIC
  // =====================================================

  class TrafficCar {
    constructor(y) {
      this.y = y;
      this.lane = Math.floor(Math.random() * 3);
      this.speed = rand(1, 2.5);

      this.color = [
        "#ff795f", "#ffb454", "#e879f9",
        "#f87171", "#60a5fa"
      ][Math.floor(Math.random() * 5)];

      this.updatePosition();
    }

    updatePosition() {
      const bounds = roadBounds(this.y);

      this.x = bounds.left +
        CFG.roadWidth * (this.lane + 0.5) / 3;
    }

    update(dt) {
      this.y -= this.speed * dt;
      this.updatePosition();
    }

    recycle(leaderY) {
      this.y = leaderY + height + rand(250, 700);
      this.lane = Math.floor(Math.random() * 3);
      this.updatePosition();
    }

    draw(cameraY) {
      drawVehicle(
        this.x,
        screenY(this.y, cameraY),
        24,
        40,
        this.color,
        false,
        0,
        false,
        false
      );
    }
  }

  function makeTraffic() {
    traffic = [];

    for (let i = 0; i < CFG.trafficCount; i++) {
      traffic.push(new TrafficCar(250 + i * 250 + rand(-60, 60)));
    }
  }

  function updateTraffic(dt, leaderY) {
    traffic.forEach(car => {
      car.update(dt);

      if (car.y < leaderY - height) {
        car.recycle(leaderY);
      }
    });
  }

  // =====================================================
  // 7. VEHICLE RENDERING
  // =====================================================

  function drawVehicle(
    x, y, carWidth, carLength, color,
    isAI = false, angle = 0, showDriver = true, braking = false
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle);

    ctx.fillStyle = "#101318";

    for (const side of [-1, 1]) {
      ctx.fillRect(side * (carWidth / 2 - 1), -carLength * 0.31, 5, 11);
      ctx.fillRect(side * (carWidth / 2 - 1), carLength * 0.18, 5, 11);
    }

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-carWidth / 2 + 2, -carLength / 2 + 3, carWidth, carLength);

    ctx.fillStyle = color;
    ctx.beginPath();

    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-carWidth / 2, -carLength / 2, carWidth, carLength, 6);
    } else {
      ctx.rect(-carWidth / 2, -carLength / 2, carWidth, carLength);
    }

    ctx.fill();

    ctx.fillStyle = "#a8d9ec";
    ctx.fillRect(-carWidth / 2 + 4, -carLength / 2 + 5, carWidth - 8, 10);

    ctx.fillStyle = "#243747";
    ctx.fillRect(-carWidth / 2 + 4, carLength / 2 - 15, carWidth - 8, 7);

    if (showDriver) {
      ctx.fillStyle = "#e6b58a";
      ctx.beginPath();
      ctx.arc(0, -5, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#352820";
      ctx.beginPath();
      ctx.arc(0, -7, 5, Math.PI, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2563eb";
      ctx.fillRect(-5, 0, 10, 7);

      ctx.strokeStyle = "#20252c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 1, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#fff4b0";
    ctx.fillRect(-carWidth / 2 + 3, -carLength / 2, 5, 3);
    ctx.fillRect(carWidth / 2 - 8, -carLength / 2, 5, 3);

    ctx.fillStyle = braking ? "#ff1717" : "#8b2020";
    ctx.fillRect(-carWidth / 2 + 3, carLength / 2 - 3, 5, 3);
    ctx.fillRect(carWidth / 2 - 8, carLength / 2 - 3, 5, 3);

    if (isAI) {
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -carWidth / 2 - 2,
        -carLength / 2 - 2,
        carWidth + 4,
        carLength + 4
      );
    }

    ctx.restore();
  }

  // =====================================================
  // 8. AI VEHICLE
  // =====================================================

  class Car {
    constructor(brain, index) {
      this.id = nextCarId++;
      this.x = roadCenter(0) + (index % 3 - 1) * 8;
      this.y = 0;
      this.angle = 0;
      this.speed = 0;

      this.brain = brain || randomBrain();
      this.alive = true;
      this.crashed = false;
      this.rays = [];

      this.distance = 0;
      this.age = 0;
      this.fitness = 0;
      this.bestSpeed = 0;
      this.braking = false;
      this.steerValue = 0;

      this.outputs = [0, 0, 0];
      this.hidden = [];
      this.color = `hsl(${(index * 47) % 360},75%,65%)`;
      this.collisionLogged = false;
    }

    update(dt, isManual = false) {
      if (!this.alive) return;

      this.age += dt;

      const inputs = [];
      this.rays = [];

      for (let i = 0; i < CFG.rayCount; i++) {
        const relative = -Math.PI * 0.48 +
          (Math.PI * 0.96 / (CFG.rayCount - 1)) * i;

        const angle = this.angle + relative;
        const distance = raycast(this, angle, CFG.rayLength);

        this.rays.push({ angle, distance });
        inputs.push(1 - distance / CFG.rayLength);
      }

      let left = 0;
      let right = 0;
      let brake = false;

      if (isManual) {
        left = Number(manualKeys.has("ArrowLeft") ||
          manualKeys.has("a") || manualButtons.has("left"));

        right = Number(manualKeys.has("ArrowRight") ||
          manualKeys.has("d") || manualButtons.has("right"));

        const accelerate = manualKeys.has("ArrowUp") ||
          manualKeys.has("w") || manualButtons.has("forward");

        brake = manualKeys.has("ArrowDown") ||
          manualKeys.has("s") || manualButtons.has("brake");

        if (accelerate) this.speed += CFG.acceleration * dt;
        else if (!brake) this.speed -= CFG.drag * this.speed * dt;
      } else {
        const result = think(this.brain, inputs);

        this.hidden = result.hidden;
        this.outputs = result.outputs;

        left = Math.max(0, result.outputs[0]);
        right = Math.max(0, result.outputs[1]);
        brake = result.outputs[2] > 0.25;

        if (brake) this.speed -= CFG.brakingForce * dt;
        else this.speed += CFG.acceleration * dt;
      }

      this.braking = brake;
      this.steerValue = left - right;

      if (brake && isManual) {
        this.speed -= CFG.brakingForce * 2 * dt;
      }

      this.speed -= CFG.drag * this.speed * dt;
      this.speed = clamp(this.speed, 0, CFG.maxSpeed);

      this.angle += this.steerValue * CFG.steeringForce *
        (0.35 + this.speed / CFG.maxSpeed) * dt;

      this.angle = clamp(this.angle, -0.85, 0.85);

      this.x += Math.sin(this.angle) * this.speed * dt;
      this.y += Math.cos(this.angle) * this.speed * dt;

      this.distance = Math.max(this.distance, this.y);
      this.bestSpeed = Math.max(this.bestSpeed, this.speed);

      const bounds = roadBounds(this.y);

      const hitEdge =
        this.x - CFG.carWidth / 2 < bounds.left ||
        this.x + CFG.carWidth / 2 > bounds.right;

      const hitTraffic = traffic.some(other => carsCollide(this, other));

      if (hitEdge || hitTraffic) {
        this.alive = false;
        this.crashed = true;
        this.speed = 0;

        if (!this.collisionLogged) {
          logCollision(this, hitEdge ? "Road boundary collision" : "Traffic collision");
          this.collisionLogged = true;
        }
      }

      this.fitness = Math.max(0, this.distance) +
        this.age * 0.15 +
        this.bestSpeed * 2;

      bestDistanceEver = Math.max(bestDistanceEver, this.distance);
      bestSpeedEver = Math.max(bestSpeedEver, this.bestSpeed);
    }

    draw(cameraY, isBest = false) {
      const sy = screenY(this.y, cameraY);

      if (showSensors && isBest && this.alive) {
        for (const ray of this.rays) {
          const endX = this.x + Math.sin(ray.angle) * ray.distance;
          const endY = sy - Math.cos(ray.angle) * ray.distance;

          ctx.beginPath();
          ctx.moveTo(this.x, sy);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = "rgba(56,216,242,0.65)";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(endX, endY, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#38d8f2";
          ctx.fill();
        }
      }

      drawVehicle(
        this.x, sy, CFG.carWidth, CFG.carLength,
        isBest ? "#38d8f2" : this.color,
        isBest, this.angle, true, this.braking
      );

      if (isBest) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          this.alive ? (isManualMode() ? "MANUAL CAR" : "AI LEADER") : "CRASHED",
          this.x,
          sy - 30
        );
      }
    }
  }

  // =====================================================
  // 9. GENERATIONS AND TRAINING
  // =====================================================

  function newGeneration() {
    const ranked = [...cars].sort((a, b) => b.fitness - a.fitness);
    if (!ranked.length) return;

    const winner = ranked[0];

    if (!bestBrain || winner.fitness > bestFitness) {
      bestFitness = winner.fitness;
      bestBrain = cloneBrain(winner.brain);

      if (ui.autoSaveToggle?.checked) {
        saveBestToStorage();
      }
    }

    generationFitnessTotal = ranked.reduce((sum, car) => sum + car.fitness, 0);
    generationFitnessCount = ranked.length;

    fitnessHistory.push({
      generation,
      best: winner.fitness,
      average: generationFitnessTotal / generationFitnessCount
    });

    if (fitnessHistory.length > 100) fitnessHistory.shift();

    const parentCount = Math.max(
      4,
      Math.ceil(CFG.population * CFG.parentFraction)
    );

    const parents = ranked.slice(0, Math.min(parentCount, ranked.length));

    generation++;
    cars = [];

    for (let i = 0; i < Math.min(CFG.eliteCount, CFG.population); i++) {
      const source = i === 0
        ? bestBrain
        : parents[i % parents.length].brain;

      cars.push(new Car(cloneBrain(source), i));
    }

    while (cars.length < CFG.population) {
      const parent = parents[Math.floor(Math.random() * parents.length)];
      cars.push(new Car(mutateBrain(parent.brain), cars.length));
    }

    makeTraffic();
    drawAnalytics();
    updateDashboard();
  }

  function resetTraining() {
    generation = 1;
    bestBrain = null;
    bestFitness = 0;
    bestDistanceEver = 0;
    bestSpeedEver = 0;
    fitnessHistory = [];
    simulationTime = 0;
    trainingStartTime = Date.now();
    lastLeaderId = null;

    cars = Array.from(
      { length: CFG.population },
      (_, i) => new Car(randomBrain(), i)
    );

    makeTraffic();
    updateDashboard();
    drawAnalytics();
  }

  // =====================================================
  // 10. DASHBOARD CONNECTIONS
  // =====================================================

  function updateDashboard() {
    const alive = cars.filter(car => car.alive);

    const leader = [...cars].sort((a, b) =>
      b.fitness - a.fitness
    )[0] || null;

    currentLeader = leader;

    setText(ui.generation, generation);
    setText(ui.active, alive.length);
    setText(ui.distance, `${Math.floor(bestDistanceEver)} m`);
    setText(ui.speed, formatNumber(bestSpeedEver));
    setText(ui.bestFitness, formatNumber(bestFitness, 0));
    setText(ui.completedGenerations, generation - 1);

    const fitness = leader ? leader.fitness : 0;

    setText(ui.fitness, formatNumber(fitness, 0));
    setWidth(ui.fitnessBar, fitness / 1800 * 100);

    setText(ui.averageFitness,
      formatNumber(
        cars.reduce((sum, car) => sum + car.fitness, 0) /
          Math.max(cars.length, 1),
        1
      )
    );

    setText(ui.trainingStatus, running ? "Training" : "Paused");
    setText(ui.systemStatus, running ? "SYSTEM RUNNING" : "SYSTEM PAUSED");
    setText(ui.simulationBadge, running ? "RUNNING" : "PAUSED");

    if (!leader) return;

    setText(ui.locationX, formatNumber(leader.x));
    setText(ui.locationY, formatNumber(leader.y));
    setText(ui.telemetrySpeed, formatNumber(leader.speed));
    setText(ui.steeringValue, formatNumber(leader.steerValue, 2));
    setText(ui.distanceValue, `${Math.floor(leader.distance)} m`);

    setText(
      ui.locationText,
      isManualMode() ? "Manual mode" : "Virtual coordinates"
    );

    setText(
      ui.aiDecision,
      !leader.alive ? "Vehicle stopped" :
        leader.braking ? "Braking" :
        leader.steerValue > 0.12 ? "Turning left" :
        leader.steerValue < -0.12 ? "Turning right" :
        "Moving forward"
    );

    setText(
      ui.drivingStatus,
      isManualMode()
        ? "Keyboard or button control selected."
        : "Action selected by the neural network."
    );

    // The existing neural network has outputs:
    // left steering, right steering, braking.
    // The HTML's third label is renamed to match this architecture.
    const forwardLabel = document.querySelector(
      '.output-row:nth-of-type(2) > span'
    );

    if (forwardLabel) forwardLabel.textContent = "Braking";

    const outputs = leader.outputs || [0, 0, 0];

    const leftPercent = Math.max(0, outputs[0]) * 100;
    const rightPercent = Math.max(0, outputs[1]) * 100;
    const brakePercent = Math.max(0, outputs[2]) * 100;

    setText(ui.leftOutput, `${leftPercent.toFixed(0)}%`);
    setText(ui.forwardOutput, `${brakePercent.toFixed(0)}%`);
    setText(ui.rightOutput, `${rightPercent.toFixed(0)}%`);

    setWidth(ui.leftOutputBar, leftPercent);
    setWidth(ui.forwardOutputBar, brakePercent);
    setWidth(ui.rightOutputBar, rightPercent);

    // Sensor readings.
    leader.rays.forEach((ray, index) => {
      const element = get(`sensor${index + 1}`);
      const distance = ray.distance;
      setText(element, `${distance.toFixed(0)} px`);

      const card = element?.closest(".sensor-card");

      if (card) {
        card.classList.toggle("warning", distance < 50);
      }
    });

    setText(
      ui.sensorStatus,
      leader.alive ? "ACTIVE" : "STOPPED"
    );

    const nearest = leader.rays.length
      ? Math.min(...leader.rays.map(ray => ray.distance))
      : CFG.rayLength;

    setText(
      ui.obstacleWarning,
      nearest < 50 ? "Obstacle nearby — caution" :
      nearest < 100 ? "Obstacle detected ahead" :
      "No close obstacle detected"
    );
  }

  // =====================================================
  // 11. FITNESS CHART
  // =====================================================

  function drawAnalytics() {
    drawFitnessChart();
    drawTrackMap();
    drawBrainVisualization();
  }

  function drawFitnessChart() {
    const chart = ui.fitnessChart;
    if (!chart || ui.showChartToggle?.checked === false) return;

    const context = chart.getContext("2d");
    const size = resizeCanvasElement(chart, context);
    if (!size) return;

    const w = size.width;
    const h = size.height;

    context.clearRect(0, 0, w, h);
    context.fillStyle = getComputedStyle(document.body)
      .getPropertyValue("--panel-inner").trim() || "#111e32";
    context.fillRect(0, 0, w, h);

    context.strokeStyle = "rgba(145,162,189,0.15)";
    context.lineWidth = 1;

    for (let i = 1; i < 5; i++) {
      const y = h * i / 5;
      context.beginPath();
      context.moveTo(30, y);
      context.lineTo(w - 12, y);
      context.stroke();
    }

    if (!fitnessHistory.length) {
      context.fillStyle = "#91a2bd";
      context.font = "12px sans-serif";
      context.textAlign = "center";
      context.fillText("Training data will appear after a generation finishes.", w / 2, h / 2);
      return;
    }

    const maxFitness = Math.max(
      1,
      ...fitnessHistory.map(item => Math.max(item.best, item.average))
    );

    function plot(key, color) {
      context.beginPath();

      fitnessHistory.forEach((item, index) => {
        const x = 30 + index / Math.max(1, fitnessHistory.length - 1) * (w - 45);
        const y = h - 20 - item[key] / maxFitness * (h - 40);

        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    }

    plot("best", "#42d9f5");
    plot("average", "#62f0ad");

    context.font = "10px sans-serif";
    context.textAlign = "left";
    context.fillStyle = "#42d9f5";
    context.fillText("Best fitness", 12, 15);
    context.fillStyle = "#62f0ad";
    context.fillText("Average fitness", 100, 15);
  }

  // =====================================================
  // 12. VIRTUAL TRACK MAP
  // =====================================================

  function drawTrackMap() {
    const map = ui.trackMap;
    if (!map) return;

    const context = map.getContext("2d");
    const size = resizeCanvasElement(map, context);
    if (!size) return;

    const w = size.width;
    const h = size.height;

    context.clearRect(0, 0, w, h);
    context.fillStyle = "#0b1422";
    context.fillRect(0, 0, w, h);

    context.strokeStyle = "rgba(145,162,189,0.08)";
    context.lineWidth = 1;

    for (let x = 0; x < w; x += 25) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, h);
      context.stroke();
    }

    for (let y = 0; y < h; y += 25) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(w, y);
      context.stroke();
    }

    const center = w / 2;
    const roadHalf = Math.min(w * 0.27, 95);

    context.fillStyle = "#343a40";
    context.fillRect(center - roadHalf, 0, roadHalf * 2, h);

    context.strokeStyle = "#e7edf5";
    context.lineWidth = 2;
    context.strokeRect(center - roadHalf, 0, roadHalf * 2, h);

    context.strokeStyle = "#facc15";
    context.setLineDash([10, 10]);

    for (let lane = -1; lane <= 1; lane++) {
      context.beginPath();
      context.moveTo(center + lane * roadHalf * 0.33, 0);
      context.lineTo(center + lane * roadHalf * 0.33, h);
      context.stroke();
    }

    context.setLineDash([]);

    if (currentLeader) {
      const carX = clamp(
        center + (currentLeader.x - roadCenter(currentLeader.y)) *
          (roadHalf * 0.7) / (CFG.roadWidth / 2),
        center - roadHalf + 5,
        center + roadHalf - 5
      );

      const carY = h * 0.75;

      context.fillStyle = "#42d9f5";
      context.beginPath();
      context.arc(carX, carY, 6, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(66,217,245,0.4)";
      context.beginPath();
      context.arc(carX, carY, 12, 0, Math.PI * 2);
      context.stroke();
    }

    context.fillStyle = "#91a2bd";
    context.font = "10px sans-serif";
    context.textAlign = "left";
    context.fillText("VIRTUAL TRACK", 10, 16);
  }

  // =====================================================
  // 13. NEURAL NETWORK ACTIVATION VIEW
  // =====================================================

  function drawBrainVisualization() {
    const leader = currentLeader;
    const root = get("brainVisualization");
    if (!root || !leader) return;

    const neurons = root.querySelectorAll(".neuron");

    // The static HTML lists input, hidden, and output neurons.
    // Highlight hidden neurons using the actual network activations.
    const inputCount = CFG.rayCount;
    const hiddenCount = CFG.hiddenCount;

    neurons.forEach((neuron, index) => {
      let activation = 0;

      if (index < inputCount) {
        const ray = leader.rays[index];
        activation = ray ? 1 - ray.distance / CFG.rayLength : 0;
      } else if (index < inputCount + hiddenCount) {
        activation = leader.hidden[index - inputCount] || 0;
      } else {
        activation = leader.outputs[index - inputCount - hiddenCount] || 0;
      }

      neuron.classList.toggle("active", Math.abs(activation) > 0.45);
      neuron.title = `Activation: ${activation.toFixed(3)}`;
    });
  }

  // =====================================================
  // 14. MODEL SAVE / LOAD
  // =====================================================

  function modelPayload() {
    return {
      version: 2,
      architecture: {
        inputs: CFG.rayCount,
        hidden: CFG.hiddenCount,
        outputs: CFG.outputCount
      },
      generation,
      fitness: bestFitness,
      brain: bestBrain
    };
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveAI() {
    if (!bestBrain) {
      setText(ui.modelStatus, "No trained best model yet. Wait for training.");
      return;
    }

    downloadText(
      "self-driving-best-ai.json",
      JSON.stringify(modelPayload(), null, 2),
      "application/json"
    );

    setText(ui.modelStatus, "Best AI model exported.");
  }

  function saveBestToStorage() {
    if (!bestBrain) return;

    try {
      localStorage.setItem(
        "autonomousAI.bestModel",
        JSON.stringify(modelPayload())
      );

      setText(ui.modelStatus, "Best model auto-saved in this browser.");
    } catch (error) {
      setText(ui.modelStatus, "Automatic saving is unavailable in this browser.");
    }
  }

  function loadAIFile(file) {
    return file.text().then(text => {
      const data = JSON.parse(text);
      const brain = data.brain || data;

      if (!isValidBrain(brain)) {
        throw new Error("Incompatible model. Expected a 9 → 8 → 3 neural network.");
      }

      bestBrain = cloneBrain(brain);
      bestFitness = Number(data.fitness) || 0;

      cars = Array.from(
        { length: CFG.population },
        (_, i) => new Car(
          i === 0 ? cloneBrain(bestBrain) : mutateBrain(bestBrain),
          i
        )
      );

      makeTraffic();
      updateDashboard();
      drawAnalytics();

      setText(ui.modelStatus, "AI model loaded successfully.");
    });
  }

  // =====================================================
  // 15. CSV AND JSON EXPORTS
  // =====================================================

  function exportCSV() {
    const rows = [
      ["Generation", "Best Fitness", "Average Fitness"]
    ];

    fitnessHistory.forEach(item => {
      rows.push([
        item.generation,
        item.best.toFixed(2),
        item.average.toFixed(2)
      ]);
    });

    const csv = rows.map(row =>
      row.map(value =>
        `"${String(value).replaceAll('"', '""')}"`
      ).join(",")
    ).join("\r\n");

    downloadText("ai-training-report.csv", csv, "text/csv;charset=utf-8");
    setText(ui.modelStatus, "Training report exported.");
  }

  function exportJSON() {
    const report = {
      exportedAt: new Date().toISOString(),
      generation,
      collisionTotal,
      bestFitness,
      bestDistance: bestDistanceEver,
      bestSpeed: bestSpeedEver,
      history: fitnessHistory,
      collisions: collisionHistory,
      bestModel: bestBrain
    };

    downloadText(
      "ai-training-report.json",
      JSON.stringify(report, null, 2),
      "application/json"
    );

    setText(ui.modelStatus, "Training report exported as JSON.");
  }

  // =====================================================
  // 16. MANUAL MODE
  // =====================================================

  function isManualMode() {
    return ui.drivingMode?.value === "manual";
  }

  function bindManualButton(button, key) {
    if (!button) return;

    const down = event => {
      event.preventDefault();
      manualButtons.add(key);
    };

    const up = () => manualButtons.delete(key);

    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointerleave", up);
    button.addEventListener("pointercancel", up);
  }

  bindManualButton(ui.moveForward, "forward");
  bindManualButton(ui.moveBackward, "brake");
  bindManualButton(ui.moveLeft, "left");
  bindManualButton(ui.moveRight, "right");
  bindManualButton(ui.brake, "brake");

  window.addEventListener("keydown", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

    if ([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
    ].includes(key)) {
      event.preventDefault();
    }

    manualKeys.add(key);
  });

  window.addEventListener("keyup", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

    manualKeys.delete(key);
  });

  window.addEventListener("blur", () => {
    manualKeys.clear();
    manualButtons.clear();
  });

  // =====================================================
  // 17. DASHBOARD BUTTONS AND SETTINGS
  // =====================================================

  if (ui.pause) {
    ui.pause.addEventListener("click", () => {
      running = !running;
      ui.pause.textContent = running ? "Pause" : "Resume";

      if (ui.overlay) {
        ui.overlay.classList.toggle("hidden", running);

        if (!running) {
          ui.overlay.innerHTML =
            '<div class="overlay-card"><h2>Simulation Paused</h2><p>Press Resume to continue.</p></div>';
        } else {
          ui.overlay.innerHTML =
            '<div class="overlay-card"><h2>Autonomous AI</h2><p>Simulation running</p></div>';
        }
      }

      if (running) lastTime = 0;
      updateDashboard();
    });
  }

  if (ui.restart) {
    ui.restart.addEventListener("click", () => {
      resetTraining();
      running = true;
      lastTime = 0;

      if (ui.pause) ui.pause.textContent = "Pause";
      if (ui.overlay) ui.overlay.classList.add("hidden");
    });
  }

  if (ui.sensorsToggle) {
    ui.sensorsToggle.addEventListener("click", () => {
      showSensors = !showSensors;
      ui.sensorsToggle.textContent =
        showSensors ? "Hide Sensors" : "Show Sensors";

      if (ui.sensorsToggle) ui.sensorsToggle.setAttribute(
        "aria-pressed", String(showSensors)
      );
    });
  }

  if (ui.allCarsToggle) {
    ui.allCarsToggle.addEventListener("click", () => {
      showAllCars = !showAllCars;
      ui.allCarsToggle.textContent =
        showAllCars ? "Hide Other Cars" : "Show All Cars";
    });
  }

  if (ui.speedControl) {
    ui.speedControl.addEventListener("input", () => {
      setText(ui.speedValue, `${ui.speedControl.value}×`);
    });
  }

  if (ui.save) {
    ui.save.addEventListener("click", saveAI);
  }

  if (ui.load && ui.loadFile) {
    ui.load.addEventListener("click", () => ui.loadFile.click());

    ui.loadFile.addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        await loadAIFile(file);
      } catch (error) {
        setText(ui.modelStatus, `Import failed: ${error.message}`);
      }

      event.target.value = "";
    });
  }

  if (ui.exportCSV) ui.exportCSV.addEventListener("click", exportCSV);
  if (ui.exportJSON) ui.exportJSON.addEventListener("click", exportJSON);

  if (ui.clearCollisionLog) {
    ui.clearCollisionLog.addEventListener("click", () => {
      collisionHistory = [];
      collisionTotal = 0;
      renderCollisionLog();
    });
  }

  if (ui.themeButton) {
    ui.themeButton.addEventListener("click", () => {
      document.body.classList.toggle("light-theme");

      ui.themeButton.textContent =
        document.body.classList.contains("light-theme")
          ? "☾ Dark Theme"
          : "☼ Light Theme";

      drawAnalytics();
    });
  }

  if (ui.showCoordinatesToggle) {
    ui.showCoordinatesToggle.addEventListener("change", () => {
      const show = ui.showCoordinatesToggle.checked;

      const x = ui.locationX?.closest(".telemetry-item");
      const y = ui.locationY?.closest(".telemetry-item");

      if (x) x.hidden = !show;
      if (y) y.hidden = !show;
    });
  }

  if (ui.showChartToggle) {
    ui.showChartToggle.addEventListener("change", () => {
      const container = ui.fitnessChart?.closest(".chart-container");
      if (container) container.hidden = !ui.showChartToggle.checked;
      drawFitnessChart();
    });
  }

  if (ui.autoSaveToggle) {
    ui.autoSaveToggle.addEventListener("change", () => {
      if (ui.autoSaveToggle.checked && bestBrain) saveBestToStorage();
    });
  }

  // =====================================================
  // 18. MAIN SIMULATION LOOP
  // =====================================================

  function frame(timestamp) {
    requestAnimationFrame(frame);

    if (!running) {
      lastTime = 0;
      return;
    }

    const elapsed = lastTime
      ? Math.min((timestamp - lastTime) / 16.67, 3)
      : 1;

    lastTime = timestamp;

    const multiplier = clamp(
      Number(ui.speedControl?.value || 1),
      1,
      5
    );

    const dt = elapsed;
    const steps = Math.round(multiplier);

    for (let step = 0; step < steps; step++) {
      const leaderBefore = [...cars].sort(
        (a, b) => b.fitness - a.fitness
      )[0];

      const leaderY = leaderBefore ? leaderBefore.y : 0;

      updateTraffic(dt, leaderY);

      cars.forEach(car => {
        const manualCar = isManualMode() && car === currentLeader;
        car.update(dt, manualCar);
      });

      simulationTime += dt;

      if (cars.every(car => !car.alive)) {
        newGeneration();
        break;
      }
    }

    const leader = [...cars].sort(
      (a, b) => b.fitness - a.fitness
    )[0] || cars[0];

    currentLeader = leader;

    const cameraY = leader ? leader.y : 0;

    drawRoad(cameraY);
    traffic.forEach(car => car.draw(cameraY));

    if (showAllCars) {
      cars.forEach(car => {
        if (car !== leader && car.alive) car.draw(cameraY, false);
      });
    }

    if (leader) leader.draw(cameraY, true);

    if (timestamp - lastDashboardUpdate > CFG.dashboardInterval) {
      updateDashboard();
      drawAnalytics();
      lastDashboardUpdate = timestamp;
    }
  }

  // =====================================================
  // 19. INITIALIZE
  // =====================================================

  // Rename the third output to match the original neural network:
  // steering left, steering right, braking.
  const outputRows = document.querySelectorAll(".output-row");
  if (outputRows[1]?.querySelector("span")) {
    outputRows[1].querySelector("span").textContent = "Braking";
  }

  resetTraining();
  renderCollisionLog();
  requestAnimationFrame(frame);

})();
