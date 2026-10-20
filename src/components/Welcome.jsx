import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// A short tour, shown once on each device (and again from the menu).
const STEPS = [
  {
    icon: '👋',
    title: 'Welcome!',
    text: 'This app shows how much money is left each month, after your expenses. You can share it with your partner and both see changes as they happen.',
    points: ['🏠 Home: what’s left this month, for each of you', '‹ › Arrows at the top switch months'],
  },
  {
    icon: '💸',
    title: 'Log a spend in seconds',
    text: 'For things you buy bit by bit, like food or petrol, set a spending budget. Then each time you spend:',
    points: ['Tap ＋ Log a spend on Home', 'Pick the budget, type what and how much', 'See straight away what’s left'],
  },
  {
    icon: '📋',
    title: 'Everything has its place',
    text: 'Use the tabs at the bottom:',
    points: [
      '📋 Expenses: your bills, in groups (like Home, Car, Kids)',
      '🐷 Savings: money put aside, month by month',
      'Tap anything to see or change it',
      'Deleting always asks twice, and goes to the bin for 7 days',
    ],
  },
];

export default function Welcome({ onDone }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  return createPortal(
    <div className="welcome" role="dialog" aria-modal="true" aria-label="How the app works">
      <div className="welcome-card">
        <div className="welcome-icon" aria-hidden="true">
          {s.icon}
        </div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <ul>
          {s.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="welcome-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="welcome-actions">
          {step > 0 ? (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button className="btn ghost" onClick={onDone}>
              Skip
            </button>
          )}
          <button className="btn primary" onClick={() => (last ? onDone() : setStep(step + 1))} autoFocus>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
