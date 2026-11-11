function HeroStat({ number, label }) {
  return (
    <div className="hero-stat" role="listitem">
      <span className="num">{number}</span>
      <span className="lbl">{label}</span>
    </div>
  );
}

export default HeroStat;