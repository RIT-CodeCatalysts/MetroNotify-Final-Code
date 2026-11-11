/** Only administrator-published Firestore alerts are displayed. */
export default function AlertCard({ alert }) {
  return (
    <article className="alert-item">
      <div className="alert-item-top">
        <div className={`alert-stripe ${alert.stripe}`} />
        <div className="alert-body">
          <div className="alert-main">
            <div className={`alert-type ${alert.typeClass}`}>{alert.type}</div>
            <h3>{alert.title}</h3>
            <div className="alert-meta">
              <span>{alert.time}</span>
              <span>{alert.location}</span>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>Municipal alert</span>
            </div>
          </div>
          <div className="alert-right">
            <span className={`severity-badge ${alert.severityClass}`}>{alert.severity}</span>
            <span className="eta-tag">{alert.eta}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
