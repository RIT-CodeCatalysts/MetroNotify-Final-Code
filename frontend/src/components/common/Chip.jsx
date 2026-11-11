function Chip({
  children,
  active = false,
  onClick,
}) {
  return (
    <button
      className={`chip ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default Chip;