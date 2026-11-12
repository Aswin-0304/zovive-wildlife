import { useState } from 'react';

export default function ForestOfficerArrival() {
  const [replay, setReplay] = useState(0);

  return <section className="officer-arrival" aria-label="Cinematic forest officer arrival scene">
    <div className="arrival-render" key={replay}>
      <div className="arrival-swing"><img className="arrival-ranger" src="/images/forest-officer-root-swing.png" alt="A forest officer swings from a natural banyan root" /></div>
      <span className="arrival-ground-light" aria-hidden="true" />
    </div>
    <div className="arrival-caption"><i/> FIELD OFFICER ARRIVING <span>·</span> NORTH CANOPY</div>
    <button type="button" className="arrival-replay" onClick={() => setReplay((value) => value + 1)} aria-label="Replay forest officer arrival">↻</button>
  </section>;
}
