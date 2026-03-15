const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(#fbf6ef, #f6f1e8)",
    color: "#1d1d1f",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans TC', sans-serif",
    paddingBottom: 92
  },

  topWrap: { padding: "14px 16px 8px" },
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 22, margin: 0, letterSpacing: 0.2, fontWeight: 1000 },
  sub: { color: "rgba(0,0,0,0.55)", fontSize: 12, marginTop: 6, lineHeight: 1.25 },

  card: {
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    WebkitBackdropFilter: "blur(10px)",
    backdropFilter: "blur(10px)"
  },

  btn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 700
  },
  btnPrimary: {
    padding: "12px 16px",
    borderRadius: 16,
    border: "none",
    color: "white",
    background: "linear-gradient(90deg,#6b5cff,#8b7bff)",
    cursor: "pointer",
    fontWeight: 900
  },
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    fontWeight: 800,
    color: "rgba(0,0,0,0.75)"
  },

  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    outline: "none",
    fontSize: 14
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    outline: "none",
    fontSize: 14
  },

  chip: (active) => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(107,92,255,0.12)" : "rgba(255,255,255,0.6)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    color: active ? "#5b4bff" : "rgba(0,0,0,0.70)"
  }),
  segmentWrap: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  sectionTitleRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 1000 },

  nav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    background: "rgba(255,255,255,0.82)",
    borderTop: "1px solid rgba(0,0,0,0.06)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    alignItems: "center",
    padding: "10px 10px",
    zIndex: 50
  },
  navBtn: (active) => ({
    userSelect: "none",
    cursor: "pointer",
    textAlign: "center",
    padding: "8px 6px",
    borderRadius: 16,
    marginInline: 6,
    border: active ? "1px solid rgba(107,92,255,0.25)" : "1px solid rgba(0,0,0,0.06)",
    background: active ? "rgba(107,92,255,0.10)" : "rgba(255,255,255,0.40)",
    color: active ? "#5b4bff" : "rgba(0,0,0,0.68)"
  }),
  navIcon: { fontSize: 18, fontWeight: 1000, lineHeight: 1 },
  navText: { marginTop: 4, fontSize: 11, fontWeight: 900 },

  label: {
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 6,
    color: "rgba(0,0,0,0.65)"
  },

  fabAdd: {
    position: "fixed",
    right: 16,
    bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
    width: 58,
    height: 58,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(90deg,#6b5cff,#8b7bff)",
    color: "#fff",
    fontSize: 30,
    fontWeight: 1000,
    lineHeight: 1,
    boxShadow: "0 10px 24px rgba(107,92,255,0.35)",
    zIndex: 60,
    cursor: "pointer"
  },
};

export { styles };
