// ui/ErreurBoundary.tsx — Attrape les erreurs React pour éviter l'écran blanc
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { erreur: Error | null }

export class ErreurBoundary extends Component<Props, State> {
  state: State = { erreur: null };
  static getDerivedStateFromError(e: Error) { return { erreur: e }; }
  render() {
    if (this.state.erreur) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", color: "#e44", background: "#111", height: "100vh" }}>
          <h2>Erreur</h2>
          <pre>{this.state.erreur.message}</pre>
          <pre style={{ fontSize: 11, marginTop: 16, opacity: 0.6 }}>{this.state.erreur.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
