(function () {
  const canvas = document.getElementById("fxCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, DPR;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const PALETTES = [
    ["rgba(99,102,241,0.35)", "rgba(56,189,248,0.0)"],
    ["rgba(56,189,248,0.30)", "rgba(99,102,241,0.0)"],
    ["rgba(100,116,139,0.28)", "rgba(34,211,238,0.0)"],
    ["rgba(34,211,238,0.25)", "rgba(100,116,139,0.0)"]
  ];

  class Ribbon {
    constructor(index) {
      this.index = index;
      this.amplitude = 60 + Math.random() * 70;
      this.wavelength = 0.0025 + Math.random() * 0.002;
      this.speed = 0.15 + Math.random() * 0.25;
      this.yBase = 0.25 + index * 0.18;
      this.phase = Math.random() * Math.PI * 2;
      this.thickness = 90 + Math.random() * 120;
      this.colors = PALETTES[index % PALETTES.length];
      this.driftSpeed = (Math.random() - 0.5) * 0.0004;
    }

    update() {
      this.phase += this.speed * 0.002;
      this.yBase += this.driftSpeed;
    }

    draw(ctx) {
      const centerY = H * this.yBase;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      const step = 12;
      for (let x = 0; x <= W + step; x += step) {
        const y =
          centerY +
          Math.sin(x * this.wavelength + this.phase) * this.amplitude +
          Math.sin(x * this.wavelength * 2.3 + this.phase * 1.7) * (this.amplitude * 0.3);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H + 400);
      ctx.lineTo(0, H + 400);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, centerY - this.thickness, 0, centerY + this.thickness);
      grad.addColorStop(0, this.colors[1]);
      grad.addColorStop(0.5, this.colors[0]);
      grad.addColorStop(1, this.colors[1]);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  class Particle {
    constructor() {
      this.reset(true);
    }
    reset(initial) {
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : H + 20;
      this.r = 1 + Math.random() * 2.4;
      this.speedY = 0.15 + Math.random() * 0.35;
      this.drift = (Math.random() - 0.5) * 0.25;
      this.alpha = 0.15 + Math.random() * 0.35;
      this.hue = Math.random() > 0.5 ? "56,189,248" : "165,180,252";
      this.twinkleSpeed = 0.5 + Math.random() * 1.5;
      this.twinklePhase = Math.random() * Math.PI * 2;
    }
    update() {
      this.y -= this.speedY;
      this.x += this.drift;
      if (this.y < -20) this.reset(false);
    }
    draw(ctx, t) {
      const flicker = 0.6 + 0.4 * Math.sin(t * 0.001 * this.twinkleSpeed + this.twinklePhase);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${this.hue},${this.alpha * flicker})`;
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const ribbons = [0, 1, 2, 3].map((i) => new Ribbon(i));
  const particles = Array.from({ length: 70 }, () => new Particle());

  function frame(t) {
    ctx.clearRect(0, 0, W, H);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0c0e13");
    bgGrad.addColorStop(1, "#090a0e");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ribbons.forEach((r) => {
      r.update();
      r.draw(ctx);
    });

    particles.forEach((p) => {
      p.update();
      p.draw(ctx, t);
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
