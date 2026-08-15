import confetti from "canvas-confetti";

export function triggerMilestoneConfetti(tier: number) {
  if (tier === 5) {
    // Checkpoint 1 ($1,000)
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ["#00f0ff", "#a855f7", "#fbbf24"],
    });
  } else if (tier === 10) {
    // Checkpoint 2 ($32,000)
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#fbbf24", "#f59e0b", "#00f0ff", "#10b981"],
    });
  } else if (tier === 15) {
    // Grand Champion ($1,000,000)!
    const duration = 3.5 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 7,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#00f0ff", "#a855f7", "#fbbf24", "#f43f5e", "#10b981"],
      });
      confetti({
        particleCount: 7,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#00f0ff", "#a855f7", "#fbbf24", "#f43f5e", "#10b981"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }
}
