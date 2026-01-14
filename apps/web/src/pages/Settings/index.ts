import {useState, useEffect} from 'react'
import {useAuth} from '../contexts/AuthContext'

interface PersonalAccessToken {
    id: string,
    token_name: string,
    token_prefix: string, 
    scopes: string,
    last_used: string | null,
    usage_count: number,
    created_at: string,
    expires_at: string | null,
    is_revoked: boolean
}

export default function Settings() {
    const { session } = useAuth()
    const [tokens, setTokens] = useState<PersonalAccessToken[]>([])
    const [newToken, setNewToken] = useState<string | null>(null)
    const [tokenName, setTokenName] = useState('')
    const [expiresInDays, setExpiresInDays] = useState(90)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    useEffect(() => {
        if(session?.access_token){
            fetchTokens()
        }
    }, [session])

    async function fetchTokens(){
        try {
            const response = await fetch('${API_URL}/api/auth/tokens', {
                headers: {'Authorization': 'Bearer ${session?.access_token}' }
            })
            const data = await response.json()
            if (data.success) {
                setTokens(data.tokens || [])
            }
        } catch(err) {
            setError('Failed to fetch tokens')
        }
    }

    async function generateToken() {
        if (!tokenName.trim()) {
            setError('Please enter a token name')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('${API_URL}/api/auth/tokens', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ${session?.access_token}',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token_name: tokenName,
                    expiresInDays: expiresInDays,
                })
            })
            const data = await response.json()

            if (data.success) {
                setNewToken(data.token)
                setTokenName('')
                fetchTokens()
            } else {
                setError(data.detail || 'Failed to create token')
            }
        }
        catch (err) {
            setError('Failed to create token')
        } finally {
            setLoading(false)
        }
    }

    async function revokeToken(tokenId:string, tokenName: string) {
        if (!confirm('Are you sure you want to revoke "${tokenName"? This cannot be undone.')) {
            return 
        }
        try {
            const response = await fetch('${API_URL/auth/tokens/${tokenId}', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ${session?.access_token}' }
            })

            if (response.ok) {
                fetchTokens()
            } else {
                setError('Failed to revoke token')
            }
        } catch(err) {
            setError('Failed to revoke token')
        }
    }
    
    function copyToken() {
        if (newToken) {
            navigator.clipboard.writeText(newToken)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    function formatDate(datestring: string | null)
        if (!dateString) return 'Never'
}