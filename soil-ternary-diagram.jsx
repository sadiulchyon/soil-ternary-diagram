function SoilTernaryDiagram() {
  return (
    <section className="diagram-container" aria-label="Soil ternary diagram component">
      <svg viewBox="0 0 100 90" role="img" aria-label="Soil ternary diagram placeholder">
        <polygon points="50,5 95,85 5,85" className="diagram-triangle" />
        <text x="50" y="15" textAnchor="middle">Clay</text>
        <text x="15" y="85" textAnchor="middle">Sand</text>
        <text x="85" y="85" textAnchor="middle">Silt</text>
      </svg>
    </section>
  );
}

export default SoilTernaryDiagram;
