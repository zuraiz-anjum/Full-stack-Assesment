import { Component } from "react";

// Must be a class component -- React has no hook-based error boundary API.
// `fallback` is a function: (error, reset) => JSX.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      const reset = () => this.setState({ error: null }, this.props.onReset);
      return this.props.fallback(this.state.error, reset);
    }
    return this.props.children;
  }
}
