'use client';

import { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
  duration?: number; // total animation duration in ms
}

export function SplashScreen({ onComplete, duration = 2800 }: SplashScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 500;
    const height = 250;
    canvas.width = width;
    canvas.height = height;

    // Much denser letter patterns (9x13 grid per letter)
    const letterPatterns: Record<string, number[][]> = {
      'O': [
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,0],
        [1,1,1,0,0,0,1,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,0,0,0,0,0,1,1],
        [1,1,1,0,0,0,1,1,1],
        [0,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,0,0],
      ],
      'T': [
        [1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
        [0,0,0,1,1,1,0,0,0],
      ]
    };

    class Particle {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      letterIndex: number;
      activated: boolean;
      noiseOffset: number;
      noiseOffset2: number;
      size: number;
      delay: number;
      baseSize: number;

      constructor(startX: number, startY: number, targetX: number, targetY: number, letterIndex: number, delay: number) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.letterIndex = letterIndex;
        this.activated = false;
        this.noiseOffset = Math.random() * 1000;
        this.noiseOffset2 = Math.random() * 1000;
        this.baseSize = 2.5 + Math.random() * 1.5;
        this.size = this.baseSize;
        this.delay = delay;
      }

      update(frameCount: number, progress: number) {
        // Activate based on timing
        if (!this.activated && frameCount > this.delay) {
          this.activated = true;
        }

        if (!this.activated) {
          // Gentle floating swirl before activation
          const t = frameCount * 0.015;
          const angle = Math.sin(t + this.noiseOffset) * Math.PI * 0.5;
          const angle2 = Math.cos(t * 0.7 + this.noiseOffset2) * Math.PI * 0.3;
          this.x += Math.cos(angle + angle2) * 1.2;
          this.y += Math.sin(angle - angle2) * 1.2;
          this.x = Math.max(20, Math.min(width - 20, this.x));
          this.y = Math.max(20, Math.min(height - 20, this.y));
          // Gentle pulsing size
          this.size = this.baseSize * (0.8 + 0.4 * Math.sin(t * 2 + this.noiseOffset));
          return;
        }

        // Soft spring physics - easing toward target
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Gentler spring constant for fluid motion
        const springK = 0.045;
        this.vx += dx * springK;
        this.vy += dy * springK;

        // Organic wiggle that decreases as particle settles
        const wiggleStrength = Math.min(1, dist / 50) * 0.4;
        const t = frameCount * 0.08;
        this.vx += Math.sin(t + this.noiseOffset) * wiggleStrength;
        this.vy += Math.cos(t * 1.1 + this.noiseOffset2) * wiggleStrength;

        // Smooth damping
        this.vx *= 0.92;
        this.vy *= 0.92;

        this.x += this.vx;
        this.y += this.vy;

        // Subtle breathing when settled
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed < 0.5) {
          this.size = this.baseSize * (0.95 + 0.1 * Math.sin(frameCount * 0.05 + this.noiseOffset));
        } else {
          this.size = this.baseSize;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const excitement = Math.min(1, speed / 4);

        // Warm golden-orange palette with smooth transitions
        const r = Math.round(255 - excitement * 20);
        const g = Math.round(175 - excitement * 35);
        const b = Math.round(90 + excitement * 30);
        const alpha = 0.85 + excitement * 0.15;

        // Soft glow - always present but stronger when moving
        const glowAlpha = 0.08 + excitement * 0.15;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
        ctx.fill();

        // Main particle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();

        // Bright center highlight
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 200, ${0.3 + excitement * 0.2})`;
        ctx.fill();
      }
    }

    // Initialize particles
    const particles: Particle[] = [];
    const letters = ['O', 'T', 'T', 'O'];
    const letterWidth = 9;
    const letterHeight = 13;
    const dotSpacing = 6;
    const letterSpacing = 12;
    const totalWidth = letters.length * letterWidth * dotSpacing + (letters.length - 1) * letterSpacing;
    const startX = (width - totalWidth) / 2;
    const startY = (height - letterHeight * dotSpacing) / 2;

    for (let letterIdx = 0; letterIdx < letters.length; letterIdx++) {
      const letter = letters[letterIdx];
      const pattern = letterPatterns[letter];
      const offsetX = startX + letterIdx * (letterWidth * dotSpacing + letterSpacing);
      // Stagger delay per letter - more time between letters for fluid cascade
      const letterDelay = letterIdx * 18;

      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < pattern[row].length; col++) {
          if (pattern[row][col] === 1) {
            const targetX = offsetX + col * dotSpacing;
            const targetY = startY + row * dotSpacing;
            // Start positions scattered around canvas edges
            const side = Math.floor(Math.random() * 4);
            let startPosX: number, startPosY: number;
            if (side === 0) { // top
              startPosX = Math.random() * width;
              startPosY = -20 - Math.random() * 50;
            } else if (side === 1) { // right
              startPosX = width + 20 + Math.random() * 50;
              startPosY = Math.random() * height;
            } else if (side === 2) { // bottom
              startPosX = Math.random() * width;
              startPosY = height + 20 + Math.random() * 50;
            } else { // left
              startPosX = -20 - Math.random() * 50;
              startPosY = Math.random() * height;
            }
            // Stagger particles within each letter for wave effect
            const particleDelay = letterDelay + (row * 0.5) + Math.random() * 3;

            particles.push(new Particle(startPosX, startPosY, targetX, targetY, letterIdx, particleDelay));
          }
        }
      }
    }

    // Animation
    let frameCount = 0;
    let animationId: number;
    const startTime = Date.now();
    const totalFrames = Math.floor(duration / (1000 / 60)); // ~60fps

    const animate = () => {
      frameCount++;
      const progress = Math.min(1, frameCount / totalFrames);

      // Dark background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // Update and draw all particles
      for (const p of particles) {
        p.update(frameCount, progress);
        p.draw(ctx);
      }

      // End animation after duration
      if (Date.now() - startTime >= duration) {
        // Hold final frame briefly then complete
        setTimeout(() => {
          setIsComplete(true);
          onComplete?.();
        }, 200);
        return;
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [duration, onComplete]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a] transition-opacity duration-300 ${isComplete ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <canvas
        ref={canvasRef}
        className="max-w-full"
        style={{ width: '500px', height: '250px' }}
      />
    </div>
  );
}
