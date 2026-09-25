const waveCanvas = document.querySelector(".wave-canvas");
const mobileViewport = window.matchMedia("(max-width: 680px)");

if (waveCanvas) {
  const context = waveCanvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let mesh = { nodes: [], connections: [] };
  let lastFrameTime = 0;
  let waveTime = 0;

  const createRandom = () => {
    let state = (Math.round(width) * 73856093 + Math.round(height) * 19349663) >>> 0;

    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  };

  const createMesh = () => {
    const columns = Math.max(12, Math.ceil(width / 105));
    const rows = 11;
    const horizon = height * 0.38;
    const random = createRandom();
    const nodes = [];

    for (let row = 0; row < rows; row += 1) {
      const depth = row / (rows - 1);
      const baseY = horizon + (height - horizon) * depth ** 1.8;

      for (let column = 0; column <= columns; column += 1) {
        const progress = column / columns;
        const xJitter = (random() - 0.5) * (width / columns) * 0.55;
        const yJitter = (random() - 0.5) * (8 + depth * 24);
        nodes.push({
          x: Math.max(0, Math.min(width, progress * width + xJitter)),
          y: baseY + yJitter,
          depth,
          row,
          column,
          phase: random() * Math.PI * 2,
        });
      }
    }

    const candidates = [];
    nodes.forEach((source, sourceIndex) => {
      nodes.slice(sourceIndex + 1).forEach((target, targetOffset) => {
        const targetIndex = sourceIndex + targetOffset + 1;
        const rowDistance = Math.abs(source.row - target.row);
        const columnDistance = Math.abs(source.column - target.column);

        if (rowDistance > 2 || columnDistance > 3 || (rowDistance === 0 && columnDistance > 2)) {
          return;
        }

        const distance = Math.hypot(source.x - target.x, source.y - target.y);
        candidates.push({
          sourceIndex,
          targetIndex,
          score: distance * (0.65 + random() * 0.9),
        });
      });
    });

    candidates.sort((first, second) => first.score - second.score);
    const maximumDegree = 11;
    const targetConnections = Math.round((nodes.length * 7) / 2);
    const degrees = new Array(nodes.length).fill(0);
    const connections = [];

    candidates.forEach(({ sourceIndex, targetIndex }) => {
      if (
        connections.length === targetConnections ||
        degrees[sourceIndex] >= maximumDegree ||
        degrees[targetIndex] >= maximumDegree
      ) {
        return;
      }

      connections.push([sourceIndex, targetIndex]);
      degrees[sourceIndex] += 1;
      degrees[targetIndex] += 1;
    });

    mesh = { nodes, connections };
  };

  const resizeCanvas = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    waveCanvas.width = Math.round(width * pixelRatio);
    waveCanvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    createMesh();
  };

  const drawWave = (time) => {
    context.clearRect(0, 0, width, height);

    const nodes = mesh.nodes.map((node) => {
      const amplitude = 7 + node.depth * 18;
      const offset = Math.sin(node.x / width * Math.PI * 3 + time * 0.001 + node.phase) * amplitude;

      return { ...node, y: node.y + offset };
    });

    mesh.connections.forEach(([sourceIndex, targetIndex]) => {
      const source = nodes[sourceIndex];
      const target = nodes[targetIndex];
      const depth = (source.depth + target.depth) / 2;

      context.lineWidth = 1.7 + depth * 2.5;
      context.strokeStyle = `rgba(34, 114, 151, ${0.035 + depth * 0.12})`;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    });

    nodes.forEach((node) => {
      const radius = 2.3 + node.depth * 3.2;

      context.fillStyle = `rgba(50, 137, 174, ${0.035 + node.depth * 0.13})`;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();
    });
  };

  const animateWave = (time) => {
    const elapsed = lastFrameTime ? Math.min(time - lastFrameTime, 34) : 0;

    lastFrameTime = time;
    waveTime += elapsed;
    drawWave(waveTime);
    if (!reducedMotion.matches) {
      window.requestAnimationFrame(animateWave);
    }
  };

  window.addEventListener("resize", () => {
    if (!mobileViewport.matches) {
      resizeCanvas();
    }
  }, { passive: true });
  window.addEventListener("orientationchange", resizeCanvas, { passive: true });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      drawWave(0);
    } else {
      window.requestAnimationFrame(animateWave);
    }
  });

  resizeCanvas();
  window.requestAnimationFrame(animateWave);
}
