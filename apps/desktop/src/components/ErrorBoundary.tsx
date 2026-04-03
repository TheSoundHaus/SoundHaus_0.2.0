import { Component, type ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-bg-primary p-8">
                    <div className="glass-panel rounded-2xl p-8 max-w-md text-center">
                        <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
                        <p className="text-sm text-text-secondary mb-4">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <pre className="text-xs text-text-tertiary bg-bg-primary/60 rounded-lg p-3 overflow-auto max-h-40 text-left mb-4">
                            {this.state.error?.stack}
                        </pre>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false, error: null })
                                window.location.hash = '#/'
                            }}
                            className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm font-medium
                                       hover:bg-accent/30 transition-colors"
                        >
                            Return to Login
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}

export default ErrorBoundary
