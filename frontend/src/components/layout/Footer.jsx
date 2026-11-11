function Footer() {
  return (
    <footer className="footer">
      <p>
        MetroNotify — <span>Group 7</span> · Built for community
        transparency · <span>IT Project 2024</span>
      </p>
      <p style={{ marginTop: "6px", fontSize: "11px", opacity: 0.85 }}>
        This student prototype uses Firebase Authentication and a Firebase Firestore database
        through a Flask backend. It is not an official municipal emergency service.
      </p>
    </footer>
  );
}

export default Footer;