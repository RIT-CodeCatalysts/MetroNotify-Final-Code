function Card({ title, icon, rightContent, children, className = "", style }) {
  return (
    <div className={`card ${className}`} style={style}>
      <div className="card-header">
        <div className="card-title">
          {icon}
          {title}
        </div>

        {rightContent}
      </div>

      <div className="card-body">
        {children}
      </div>
    </div>
  );
}

export default Card;